import { createWriteStream } from "node:fs";
import { mkdir, unlink, rm } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { z } from "zod";
import type { FastifyPluginAsync } from "fastify";
import type { FileTree, FolderNode, FileRecord } from "@doc-to-audio/types";
import { prisma } from "../lib/prisma.js";
import { config } from "../config.js";
import { requireUser, notFound, badRequest } from "../lib/http.js";

type DbFile = {
  id: string;
  name: string;
  path: string;
  mimeType: string;
  status: "PENDING" | "PROCESSING" | "DONE" | "ERROR";
  userId: string;
  folderId: string | null;
  createdAt: Date;
  audioJob: {
    id: string;
    fileId: string;
    audioPath: string | null;
    duration: number | null;
    progress: number;
    lastPosition: number;
    createdAt: Date;
    updatedAt: Date;
  } | null;
};

type DbFolder = {
  id: string;
  name: string;
  userId: string;
  parentId: string | null;
  createdAt: Date;
};

function serializeFile(f: DbFile): FileRecord {
  return {
    id: f.id,
    name: f.name,
    path: f.path,
    mimeType: f.mimeType,
    status: f.status,
    userId: f.userId,
    folderId: f.folderId,
    createdAt: f.createdAt.toISOString(),
    audioJob: f.audioJob
      ? {
          id: f.audioJob.id,
          fileId: f.audioJob.fileId,
          audioPath: f.audioJob.audioPath,
          duration: f.audioJob.duration,
          progress: f.audioJob.progress,
          lastPosition: f.audioJob.lastPosition,
          createdAt: f.audioJob.createdAt.toISOString(),
          updatedAt: f.audioJob.updatedAt.toISOString(),
        }
      : null,
  };
}

/** Build a recursive folder tree from flat folder + file lists. */
function buildTree(folders: DbFolder[], files: DbFile[]): FileTree {
  const filesByFolder = new Map<string | null, FileRecord[]>();
  for (const file of files) {
    const key = file.folderId;
    const list = filesByFolder.get(key) ?? [];
    list.push(serializeFile(file));
    filesByFolder.set(key, list);
  }

  const nodeById = new Map<string, FolderNode>();
  for (const folder of folders) {
    nodeById.set(folder.id, {
      id: folder.id,
      name: folder.name,
      userId: folder.userId,
      parentId: folder.parentId,
      createdAt: folder.createdAt.toISOString(),
      children: [],
      files: filesByFolder.get(folder.id) ?? [],
    });
  }

  const roots: FolderNode[] = [];
  for (const folder of folders) {
    const node = nodeById.get(folder.id)!;
    if (folder.parentId && nodeById.has(folder.parentId)) {
      nodeById.get(folder.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return {
    folders: roots,
    files: filesByFolder.get(null) ?? [],
  };
}

const filesRoutes: FastifyPluginAsync = async (fastify) => {
  /** GET /files — full folder + file tree for the current user. */
  fastify.get("/files", async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;

    const [folders, files] = await Promise.all([
      prisma.folder.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "asc" },
      }),
      prisma.file.findMany({
        where: { userId: user.id },
        include: { audioJob: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    const tree = buildTree(folders as DbFolder[], files as DbFile[]);
    return reply.send(tree);
  });

  /** POST /files/upload — multipart upload, persisted to disk + DB. */
  fastify.post("/files/upload", async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;

    const data = await request.file();
    if (!data) {
      return reply
        .code(400)
        .send({ statusCode: 400, error: "Bad Request", message: "No file provided" });
    }

    // Optional folderId provided as a multipart field.
    const folderField = data.fields?.folderId as { value?: string } | undefined;
    const folderId = folderField?.value && folderField.value.length > 0 ? folderField.value : null;

    if (folderId) {
      const folder = await prisma.folder.findFirst({
        where: { id: folderId, userId: user.id },
      });
      if (!folder) {
        return reply
          .code(400)
          .send({ statusCode: 400, error: "Bad Request", message: "Target folder not found" });
      }
    }

    const userDir = path.join(config.uploadDir, user.id);
    await mkdir(userDir, { recursive: true });

    // Prefix with a timestamp to avoid collisions while keeping the original name.
    // Allow any Unicode letter/digit (incl. Hebrew) — only strip characters that
    // are unsafe in a path. (path.basename already removed separators.)
    const safeName = path.basename(data.filename).replace(/[^\p{L}\p{N}._\-() ]/gu, "_");
    const storedName = `${Date.now()}-${safeName}`;
    const absolutePath = path.join(userDir, storedName);

    try {
      await pipeline(data.file, createWriteStream(absolutePath));
    } catch (err) {
      request.log.error(err, "failed writing uploaded file");
      return reply
        .code(500)
        .send({ statusCode: 500, error: "Internal Server Error", message: "Upload failed" });
    }

    if (data.file.truncated) {
      await unlink(absolutePath).catch(() => undefined);
      return reply
        .code(413)
        .send({ statusCode: 413, error: "Payload Too Large", message: "File exceeds size limit" });
    }

    const file = await prisma.file.create({
      data: {
        name: safeName,
        path: absolutePath,
        mimeType: data.mimetype,
        userId: user.id,
        folderId,
      },
      include: { audioJob: true },
    });

    return reply.code(201).send({ file: serializeFile(file as DbFile) });
  });

  const patchFileSchema = z.object({
    name: z
      .string()
      .min(1)
      .max(255)
      .transform((s) => s.replace(/[^\p{L}\p{N}._\-() ]/gu, "_").trim())
      .optional(),
    folderId: z.string().cuid().nullable().optional(),
  });

  /** PATCH /files/:id — rename and/or move a file to a different folder. */
  fastify.patch<{ Params: { id: string } }>("/files/:id", async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;

    const parsed = patchFileSchema.safeParse(request.body);
    if (!parsed.success) {
      return badRequest(reply, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const file = await prisma.file.findFirst({ where: { id: request.params.id, userId: user.id } });
    if (!file) return notFound(reply, "File not found");

    const { name, folderId } = parsed.data;

    if (folderId !== undefined && folderId !== null) {
      const folder = await prisma.folder.findFirst({ where: { id: folderId, userId: user.id } });
      if (!folder) return badRequest(reply, "Target folder not found");
    }

    const data: { name?: string; folderId?: string | null } = {};
    if (name !== undefined) data.name = name;
    if (folderId !== undefined) data.folderId = folderId;

    const updated = await prisma.file.update({
      where: { id: file.id },
      data,
      include: { audioJob: true },
    });

    return reply.send({ file: serializeFile(updated as DbFile) });
  });

  /** DELETE /files/:id — remove the file, its audio job, and on-disk assets. */
  fastify.delete<{ Params: { id: string } }>("/files/:id", async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;

    const file = await prisma.file.findFirst({
      where: { id: request.params.id, userId: user.id },
      include: { audioJob: true },
    });
    if (!file) return notFound(reply, "File not found");

    // Best-effort disk cleanup.
    await unlink(file.path).catch(() => undefined);
    if (file.audioJob?.audioPath) {
      await rm(file.audioJob.audioPath, { force: true }).catch(() => undefined);
    }

    // onDelete: Cascade on AudioJob removes the job row with the file.
    await prisma.file.delete({ where: { id: file.id } });

    return reply.send({ success: true });
  });
};

export default filesRoutes;
