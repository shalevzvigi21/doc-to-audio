import { createReadStream, createWriteStream } from "node:fs";
import { stat, unlink, mkdir, mkdtemp, writeFile, rename } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Readable } from "node:stream";
import {
  S3Client,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { config } from "../config.js";

let _s3: S3Client | null = null;

function getS3(): S3Client {
  if (!_s3) {
    _s3 = new S3Client({
      region: "auto",
      endpoint: `https://${config.r2AccountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.r2AccessKeyId,
        secretAccessKey: config.r2SecretAccessKey,
      },
    });
  }
  return _s3;
}

export interface UploadResult {
  /** Value to persist in the DB (R2 key or absolute local path). */
  storedPath: string;
}

/**
 * Save an uploaded multipart file to storage.
 *
 * Strategy: stream to a local temp file first (so we can check truncation),
 * then either upload to R2 or move to the final local directory.
 *
 * @param stream   The raw multipart file stream
 * @param userId   Owning user id (used to namespace the key/path)
 * @param storedName  Already-sanitized filename (e.g. "1234-doc.pdf")
 * @param contentType MIME type
 * @returns { storedPath } to persist in the files table, plus whether the
 *          upload was truncated (exceeded size limit).
 */
export async function saveUploadedFile(
  stream: NodeJS.ReadableStream & { truncated?: boolean },
  userId: string,
  storedName: string,
  contentType: string,
): Promise<{ storedPath: string; truncated: boolean }> {
  // Always buffer to a temp file so we can check the truncated flag.
  const tmpDir = await mkdtemp(path.join(tmpdir(), "doc2audio-up-"));
  const tmpPath = path.join(tmpDir, storedName);

  await pipeline(stream, createWriteStream(tmpPath));
  const truncated = (stream as { truncated?: boolean }).truncated ?? false;

  if (truncated) {
    await unlink(tmpPath).catch(() => undefined);
    return { storedPath: "", truncated: true };
  }

  if (config.r2Configured) {
    const key = `uploads/${userId}/${storedName}`;
    const upload = new Upload({
      client: getS3(),
      params: {
        Bucket: config.r2Bucket,
        Key: key,
        Body: createReadStream(tmpPath),
        ContentType: contentType,
      },
    });
    await upload.done();
    await unlink(tmpPath).catch(() => undefined);
    return { storedPath: key, truncated: false };
  } else {
    const userDir = path.join(config.uploadDir, userId);
    await mkdir(userDir, { recursive: true });
    const finalPath = path.join(userDir, storedName);
    await rename(tmpPath, finalPath);
    return { storedPath: finalPath, truncated: false };
  }
}

/**
 * Upload a local file (already on disk) to storage and return the stored path/key.
 * Used by the conversion worker to move the finished MP3 into persistent storage.
 */
export async function uploadLocalFile(
  localPath: string,
  key: string,
  contentType: string,
): Promise<string> {
  if (config.r2Configured) {
    const upload = new Upload({
      client: getS3(),
      params: {
        Bucket: config.r2Bucket,
        Key: key,
        Body: createReadStream(localPath),
        ContentType: contentType,
      },
    });
    await upload.done();
    return key;
  } else {
    const finalPath = path.isAbsolute(key) ? key : path.join(config.uploadDir, key);
    await mkdir(path.dirname(finalPath), { recursive: true });
    await rename(localPath, finalPath);
    return finalPath;
  }
}

/**
 * Download a stored file to a temporary local path. Caller is responsible for
 * deleting the file (and its parent tmpdir) when done.
 */
export async function downloadToTemp(storedPath: string, ext: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "doc2audio-dl-"));
  const tmpPath = path.join(dir, `file${ext}`);

  if (config.r2Configured) {
    const res = await getS3().send(new GetObjectCommand({ Bucket: config.r2Bucket, Key: storedPath }));
    const chunks: Buffer[] = [];
    for await (const chunk of res.Body as AsyncIterable<Uint8Array>) {
      chunks.push(Buffer.from(chunk));
    }
    await writeFile(tmpPath, Buffer.concat(chunks));
  } else {
    // Local: storedPath is already an absolute path — just symlink/copy it.
    const buf = await import("node:fs/promises").then((m) => m.readFile(storedPath));
    await writeFile(tmpPath, buf);
  }

  return tmpPath;
}

export interface StreamResult {
  stream: Readable;
  totalSize: number;
  contentLength: number;
}

/**
 * Get a readable stream for a stored file with optional byte-range support
 * (for HTTP 206 partial content / audio seeking).
 */
export async function getStorageStream(
  storedPath: string,
  range?: { start: number; end: number },
): Promise<StreamResult> {
  if (config.r2Configured) {
    const head = await getS3().send(
      new HeadObjectCommand({ Bucket: config.r2Bucket, Key: storedPath }),
    );
    const totalSize = head.ContentLength ?? 0;
    const rangeHeader = range ? `bytes=${range.start}-${range.end}` : undefined;
    const res = await getS3().send(
      new GetObjectCommand({ Bucket: config.r2Bucket, Key: storedPath, Range: rangeHeader }),
    );
    const contentLength = range ? range.end - range.start + 1 : totalSize;
    return { stream: res.Body as unknown as Readable, totalSize, contentLength };
  } else {
    const fileStat = await stat(storedPath);
    const totalSize = fileStat.size;
    const contentLength = range ? range.end - range.start + 1 : totalSize;
    const stream = createReadStream(storedPath, range ? { start: range.start, end: range.end } : undefined);
    return { stream, totalSize, contentLength };
  }
}

/** Delete a stored file. Best-effort — never throws. */
export async function deleteFromStorage(storedPath: string): Promise<void> {
  try {
    if (config.r2Configured) {
      await getS3().send(new DeleteObjectCommand({ Bucket: config.r2Bucket, Key: storedPath }));
    } else {
      await unlink(storedPath);
    }
  } catch {
    /* best-effort */
  }
}
