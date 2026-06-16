import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { CreateFolderResponse } from "@doc-to-audio/types";
import { prisma } from "../lib/prisma.js";
import { requireUser, notFound, badRequest } from "../lib/http.js";

const createFolderSchema = z.object({
  name: z.string().min(1, "Folder name is required").max(255),
  parentId: z.string().cuid().nullish(),
});

const foldersRoutes: FastifyPluginAsync = async (fastify) => {
  /** POST /folders — create a folder, optionally nested under a parent. */
  fastify.post("/folders", async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;

    const parsed = createFolderSchema.safeParse(request.body);
    if (!parsed.success) {
      return badRequest(reply, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const parentId = parsed.data.parentId ?? null;
    if (parentId) {
      const parent = await prisma.folder.findFirst({
        where: { id: parentId, userId: user.id },
      });
      if (!parent) return badRequest(reply, "Parent folder not found");
    }

    const folder = await prisma.folder.create({
      data: { name: parsed.data.name, userId: user.id, parentId },
    });

    const body: CreateFolderResponse = {
      folder: {
        id: folder.id,
        name: folder.name,
        userId: folder.userId,
        parentId: folder.parentId,
        createdAt: folder.createdAt.toISOString(),
      },
    };
    return reply.code(201).send(body);
  });

  /**
   * DELETE /folders/:id — recursively delete a folder and its descendants.
   * The schema's onDelete: Cascade handles children + files, but we verify
   * ownership first.
   */
  fastify.delete<{ Params: { id: string } }>("/folders/:id", async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;

    const folder = await prisma.folder.findFirst({
      where: { id: request.params.id, userId: user.id },
    });
    if (!folder) return notFound(reply, "Folder not found");

    await prisma.folder.delete({ where: { id: folder.id } });

    return reply.send({ success: true });
  });
};

export default foldersRoutes;
