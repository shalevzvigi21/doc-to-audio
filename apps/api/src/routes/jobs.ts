import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type {
  CreateJobResponse,
  JobStatusResponse,
  UpdatePositionBody,
} from "@doc-to-audio/types";
import { prisma } from "../lib/prisma.js";
import { conversionQueue } from "../queue/conversionQueue.js";
import { config } from "../config.js";
import { requireUser, notFound, badRequest } from "../lib/http.js";

const createJobSchema = z.object({
  fileId: z.string().cuid("A valid fileId is required"),
  provider: z.enum(["gemini", "azure"]).optional().default("gemini"),
});

const positionSchema = z.object({
  lastPosition: z.number().min(0, "Position must be non-negative"),
});

const jobsRoutes: FastifyPluginAsync = async (fastify) => {
  /** POST /jobs — enqueue audio generation for a file. */
  fastify.post("/jobs", async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;

    const parsed = createJobSchema.safeParse(request.body);
    if (!parsed.success) {
      return badRequest(reply, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const { provider } = parsed.data;
    if (provider === "azure" && !config.azureConfigured) {
      return badRequest(reply, "Azure TTS is not configured on the server");
    }

    const file = await prisma.file.findFirst({
      where: { id: parsed.data.fileId, userId: user.id },
      include: { audioJob: true },
    });
    if (!file) return notFound(reply, "File not found");

    // Create (or reuse) the AudioJob row, reset it for reprocessing.
    const audioJob = await prisma.audioJob.upsert({
      where: { fileId: file.id },
      create: { fileId: file.id },
      update: { audioPath: null, duration: null, progress: 0 },
    });

    await prisma.file.update({
      where: { id: file.id },
      data: { status: "PENDING" },
    });

    // Remove any existing BullMQ job with this ID (failed, completed, etc.)
    // before re-adding. BullMQ deduplication silently drops add() calls when
    // the same jobId already exists — including in the "failed" set — which
    // would leave the file stuck in PENDING forever.
    const existingBullJob = await conversionQueue.getJob(audioJob.id);
    if (existingBullJob) {
      await existingBullJob.remove().catch(() => undefined);
    }

    // Do NOT pin the BullMQ job to audioJob.id. If the previous job couldn't
    // be removed (stalled/active state), using the same jobId would cause BullMQ
    // to silently drop the add() call, leaving the file stuck in PENDING forever.
    await conversionQueue.add("convert", { fileId: file.id, userId: user.id, provider });

    const body: CreateJobResponse = {
      jobId: audioJob.id,
      fileId: file.id,
      status: "PENDING",
    };
    return reply.code(202).send(body);
  });

  /** GET /jobs/:id — current status + audio path for a job. */
  fastify.get<{ Params: { id: string } }>("/jobs/:id", async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;

    const job = await prisma.audioJob.findFirst({
      where: { id: request.params.id, file: { userId: user.id } },
      include: { file: true },
    });
    if (!job) return notFound(reply, "Job not found");

    const body: JobStatusResponse = {
      id: job.id,
      fileId: job.fileId,
      fileName: job.file.name,
      mimeType: job.file.mimeType,
      status: job.file.status,
      audioPath: job.audioPath,
      duration: job.duration,
      progress: job.progress,
      lastPosition: job.lastPosition,
    };
    return reply.send(body);
  });

  /** PATCH /jobs/:id/position — persist the listener's playback position. */
  fastify.patch<{ Params: { id: string }; Body: UpdatePositionBody }>(
    "/jobs/:id/position",
    async (request, reply) => {
      const user = requireUser(request, reply);
      if (!user) return;

      const parsed = positionSchema.safeParse(request.body);
      if (!parsed.success) {
        return badRequest(reply, parsed.error.issues[0]?.message ?? "Invalid input");
      }

      const job = await prisma.audioJob.findFirst({
        where: { id: request.params.id, file: { userId: user.id } },
      });
      if (!job) return notFound(reply, "Job not found");

      const updated = await prisma.audioJob.update({
        where: { id: job.id },
        data: { lastPosition: parsed.data.lastPosition },
      });

      return reply.send({ id: updated.id, lastPosition: updated.lastPosition });
    },
  );
};

export default jobsRoutes;
