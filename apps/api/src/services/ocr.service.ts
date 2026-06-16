import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import tesseract from "node-tesseract-ocr";
import sharp from "sharp";
import { fromPath } from "pdf2pic";

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
const PDF_OPTIONS = {
  density: 300,
  format: "png" as const,
  saveFilename: "page",
  width: 2480,
  height: 3508,
  preserveAspectRatio: true,
};

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
 * Extract text from a document via OCR.
 *
 * 1. PDFs are rasterised page-by-page to PNG (300 DPI); other inputs are
 *    treated as a single image.
 * 2. Each page image is cleaned with sharp (grayscale/normalize/threshold).
 * 3. Tesseract recognises Hebrew + English text per page.
 * 4. All pages are concatenated into one string.
 */
export async function extractText(
  filePath: string,
  onProgress?: (fraction: number) => void | Promise<void>,
): Promise<string> {
  const workDir = await mkdtemp(path.join(tmpdir(), "doc2audio-ocr-"));

  try {
    const ext = path.extname(filePath).toLowerCase();
    const pageImages =
      ext === ".pdf"
        ? await pdfToImageBuffers(filePath, workDir)
        : [await readFile(filePath)];

    if (pageImages.length === 0) {
      throw new Error(`No pages could be rendered from ${path.basename(filePath)}`);
    }

    // Process pages in parallel batches — Tesseract runs as a subprocess so
    // multiple instances can overlap. Order is preserved by index.
    const PAGE_CONCURRENCY = 3;
    const pageTexts = new Array<string>(pageImages.length);
    let completed = 0;

    for (let start = 0; start < pageImages.length; start += PAGE_CONCURRENCY) {
      const batchIndices = Array.from(
        { length: Math.min(PAGE_CONCURRENCY, pageImages.length - start) },
        (_, j) => start + j,
      );
      await Promise.all(
        batchIndices.map(async (i) => {
          const processed = await preprocess(pageImages[i]);
          const pagePath = path.join(workDir, `clean-${i}.png`);
          await writeFile(pagePath, processed);
          const text = await tesseract.recognize(pagePath, TESSERACT_CONFIG);
          pageTexts[i] = text.trim();
          completed++;
          await onProgress?.(completed / pageImages.length);
        }),
      );
    }

    return cleanOcrText(pageTexts.join("\n\n"));
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
