import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir, totalmem } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import tesseract from "node-tesseract-ocr";
import sharp from "sharp";
import { fromPath } from "pdf2pic";
import mammoth from "mammoth";

const execFileAsync = promisify(execFile);

/** The container's memory limit (cgroup v2/v1) or the machine's RAM, whichever is smaller. */
function memoryLimitBytes(): number {
  let limit = totalmem();
  for (const file of ["/sys/fs/cgroup/memory.max", "/sys/fs/cgroup/memory/memory.limit_in_bytes"]) {
    try {
      const n = Number(readFileSync(file, "utf8").trim());
      if (Number.isFinite(n) && n > 0) limit = Math.min(limit, n);
    } catch {
      /* not in a cgroup */
    }
  }
  return limit;
}

/**
 * Small hosts (Render's free plan has 512 MB) crash when every page of a scanned PDF is
 * rendered at once and several Tesseract processes run in parallel; the server restarts and
 * the same job is re-delivered, so the file sits at 0% forever. On small hosts we read one
 * page at a time at a slightly lower resolution. Override with OCR_PAGE_CONCURRENCY.
 */
const LOW_MEMORY = process.env.OCR_LOW_MEMORY
  ? process.env.OCR_LOW_MEMORY !== "0"
  : memoryLimitBytes() <= 1.5 * 1024 ** 3;
const PAGE_CONCURRENCY = Number(process.env.OCR_PAGE_CONCURRENCY) || (LOW_MEMORY ? 1 : 3);
if (LOW_MEMORY) {
  sharp.cache(false);
  sharp.concurrency(1);
  process.env.OMP_THREAD_LIMIT ??= "1"; // one Tesseract thread per process
}

/** Extensions read directly as UTF-8 text — no OCR involved. */
const PLAIN_TEXT_EXTENSIONS = new Set([".txt", ".md"]);

/** Tesseract options: Hebrew + English, LSTM engine (oem 1), uniform block (psm 6). */
const TESSERACT_CONFIG = {
  lang: "heb+eng",
  oem: 1,
  psm: 6,
} as const;

/**
 * pdf2pic conversion settings — render each page at high resolution as PNG.
 *
 * `density` alone does NOT control pdf2pic's output size (it defaults to a tiny
 * ~768x512 thumbnail, which destroys OCR accuracy). Explicit width/height with
 * preserveAspectRatio forces a crisp ~300 DPI A4-sized render.
 */
const PDF_OPTIONS = LOW_MEMORY
  ? { density: 220, format: "png" as const, saveFilename: "page", width: 1819, height: 2573, preserveAspectRatio: true }
  : { density: 300, format: "png" as const, saveFilename: "page", width: 2480, height: 3508, preserveAspectRatio: true };

type PdfPageResult = { buffer?: Buffer; base64?: string; path?: string };

async function pageResultToBuffer(page: PdfPageResult): Promise<Buffer | null> {
  if (page.buffer) return page.buffer;
  if (page.base64) return Buffer.from(page.base64, "base64");
  if (page.path) return readFile(page.path);
  return null;
}

/** Number of pages in a PDF via Ghostscript (already needed by pdf2pic), or 0 if it cannot be read. */
async function pdfPageCount(filePath: string): Promise<number> {
  const psPath = filePath.replace(/\\/g, "/").replace(/([()])/g, "\\$1");
  for (const bin of ["gs", "gswin64c", "gswin32c"]) {
    try {
      const { stdout } = await execFileAsync(
        bin,
        ["-q", "-dNODISPLAY", "-dNOSAFER", "-dNOPAUSE", "-dBATCH", "-c", `(${psPath}) (r) file runpdfbegin pdfpagecount = quit`],
        { timeout: 60_000 },
      );
      const n = Number.parseInt(stdout.trim(), 10);
      if (Number.isFinite(n) && n > 0) return n;
    } catch {
      /* try the next binary name */
    }
  }
  return 0;
}

/**
 * Render every page of a PDF to a PNG buffer. Works across pdf2pic response
 * shapes (buffer / base64 / saved path).
 */
async function pdfToImageBuffers(filePath: string, workDir: string): Promise<Buffer[]> {
  const convert = fromPath(filePath, { ...PDF_OPTIONS, savePath: workDir });
  // -1 converts all pages; request raw buffers to avoid extra disk round-trips.
  const pages = (await convert.bulk(-1, { responseType: "buffer" })) as unknown as Array<{
    buffer?: Buffer;
    base64?: string;
    path?: string;
  }>;

  const buffers: Buffer[] = [];
  for (const page of pages) {
    if (page.buffer) {
      buffers.push(page.buffer);
    } else if (page.base64) {
      buffers.push(Buffer.from(page.base64, "base64"));
    } else if (page.path) {
      buffers.push(await readFile(page.path));
    }
  }
  return buffers;
}

/**
 * Pre-process an image for OCR: grayscale + contrast normalization.
 *
 * We deliberately do NOT apply a fixed threshold here. Hard binarization at a
 * fixed level (e.g. 128) mangles visually similar Hebrew glyphs (ר/ד, ה/ת,
 * ב/כ); Tesseract's own adaptive (Otsu) binarization handles Hebrew far
 * better. Returns a PNG buffer.
 */
async function preprocess(image: Buffer): Promise<Buffer> {
  return sharp(image).grayscale().normalize().png().toBuffer();
}

/**
 * Strip common OCR noise so it isn't read aloud: print header/footer URLs
 * (e.g. the Kotar/OpenAthens banner) and bare "n/m" pager lines.
 */
function cleanOcrText(text: string): string {
  // A URL with scheme, OR a scheme-less domain-with-path like
  // "kotar-cet-ac-il.eu1.proxy.openathens.net/KotarApp/..." (2+ dotted labels
  // followed by a slash). Won't match ordinary prose.
  const urlLike = /(https?:\/\/|\b[\w-]+(?:\.[\w-]+){2,}\/)/i;
  return text
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      if (urlLike.test(t)) return false; // header/footer URLs
      if (/\.aspx\b/i.test(t)) return false; // print-export banner
      if (/^\d+\s*\/\s*\d+$/.test(t)) return false; // "3/21" page counter
      return true;
    })
    .join("\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Extract text from a document, **one cleaned string per page**.
 *
 * 1. Plain text (.txt/.md) is read directly; .docx is parsed with mammoth.
 *    Neither goes through OCR.
 * 2. PDFs are rasterised page-by-page to PNG (300 DPI); any other (image)
 *    input is treated as a single image.
 * 3. Each page image is cleaned with sharp (grayscale/normalize/threshold).
 * 4. Tesseract recognises Hebrew + English text per page.
 * 5. Each page's text is noise-filtered with `cleanOcrText` (line-based, so it
 *    is safe to apply per page).
 *
 * Returning per-page text lets the multi-column reconstruction step operate on
 * one page at a time (headlines/columns are a per-page phenomenon). Callers
 * that just want the whole document use `extractText`.
 */
export async function extractTextPages(
  filePath: string,
  onProgress?: (fraction: number) => void | Promise<void>,
): Promise<string[]> {
  const ext = path.extname(filePath).toLowerCase();

  if (PLAIN_TEXT_EXTENSIONS.has(ext)) {
    const text = await readFile(filePath, "utf-8");
    await onProgress?.(1);
    return [text];
  }

  if (ext === ".docx") {
    const { value: text } = await mammoth.extractRawText({ path: filePath });
    await onProgress?.(1);
    return [text];
  }

  const workDir = await mkdtemp(path.join(tmpdir(), "doc2audio-ocr-"));

  try {
    const isPdf = ext === ".pdf";
    // Render PDF pages one at a time (never all at once) so memory stays flat.
    const pageCount = isPdf ? await pdfPageCount(filePath) : 1;

    // Page source: one rendered page image on demand. If the page count could not be read,
    // fall back to rendering the whole PDF in one go (the old behaviour).
    let loadPage: (index: number) => Promise<Buffer>;
    let total = pageCount;
    if (!isPdf) {
      loadPage = () => readFile(filePath);
    } else if (pageCount > 0) {
      const convert = fromPath(filePath, { ...PDF_OPTIONS, savePath: workDir });
      loadPage = async (index) => {
        const res = (await convert(index + 1, { responseType: "buffer" })) as unknown as PdfPageResult;
        const buf = await pageResultToBuffer(res);
        if (!buf) throw new Error(`Page ${index + 1} could not be rendered from ${path.basename(filePath)}`);
        return buf;
      };
    } else {
      const all = await pdfToImageBuffers(filePath, workDir);
      total = all.length;
      loadPage = async (index) => all[index];
    }

    if (total === 0) {
      throw new Error(`No pages could be rendered from ${path.basename(filePath)}`);
    }

    const pageTexts = new Array<string>(total);
    let completed = 0;

    const recognizePage = async (i: number) => {
      const image = await loadPage(i);
      const processed = await preprocess(image);
      const pagePath = path.join(workDir, `clean-${i}.png`);
      await writeFile(pagePath, processed);
      const text = await tesseract.recognize(pagePath, TESSERACT_CONFIG);
      await rm(pagePath, { force: true }).catch(() => undefined);
      pageTexts[i] = cleanOcrText(text.trim());
      completed++;
      await onProgress?.(completed / total);
    };

    // Tesseract runs as a subprocess, so a few pages can overlap on big machines.
    // Order is preserved by index.
    await onProgress?.(0.01); // show that work has started before the first page finishes
    for (let start = 0; start < total; start += PAGE_CONCURRENCY) {
      const batch = Array.from({ length: Math.min(PAGE_CONCURRENCY, total - start) }, (_, j) => start + j);
      await Promise.all(batch.map(recognizePage));
    }

    return pageTexts;
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/**
 * Extract text from a document via OCR as a single concatenated string — the
 * default path used when multi-column reconstruction is not requested.
 */
export async function extractText(
  filePath: string,
  onProgress?: (fraction: number) => void | Promise<void>,
): Promise<string> {
  const pages = await extractTextPages(filePath, onProgress);
  return pages.join("\n\n");
}
