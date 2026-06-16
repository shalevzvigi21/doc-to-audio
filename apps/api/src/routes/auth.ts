import type { FastifyPluginAsync } from "fastify";
import bcrypt from "bcrypt";
import { z } from "zod";
import type { AuthResponse } from "@doc-to-audio/types";
import { prisma } from "../lib/prisma.js";
import { signToken } from "../lib/jwt.js";

/**
 * A valid bcrypt hash compared against when the user does not exist, so login
 * timing does not reveal whether an email is registered.
 */
const DUMMY_HASH = bcrypt.hashSync("doc-to-audio-placeholder", 12);

const credentialsSchema = z.object({
  email: z.string().email("A valid email is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const authRoutes: FastifyPluginAsync = async (fastify) => {
  /** POST /auth/register — create a user, return a JWT. */
  fastify.post("/auth/register", async (request, reply) => {
    const parsed = credentialsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: parsed.error.issues[0]?.message ?? "Invalid input",
      });
    }

    const email = parsed.data.email.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return reply.code(409).send({
        statusCode: 409,
        error: "Conflict",
        message: "An account with that email already exists",
      });
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const user = await prisma.user.create({
      data: { email, passwordHash },
    });

    const token = signToken({ sub: user.id, email: user.email });
    const body: AuthResponse = {
      token,
      user: {
        id: user.id,
        email: user.email,
        createdAt: user.createdAt.toISOString(),
      },
    };
    return reply.code(201).send(body);
  });

  /** POST /auth/login — verify credentials, return a JWT. */
  fastify.post("/auth/login", async (request, reply) => {
    const parsed = credentialsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: parsed.error.issues[0]?.message ?? "Invalid input",
      });
    }

    const email = parsed.data.email.toLowerCase();
    const user = await prisma.user.findUnique({ where: { email } });

    // Always run a compare to keep timing roughly constant even when the
    // user does not exist.
    const hash = user?.passwordHash ?? DUMMY_HASH;
    const valid = await bcrypt.compare(parsed.data.password, hash);

    if (!user || !valid) {
      return reply.code(401).send({
        statusCode: 401,
        error: "Unauthorized",
        message: "Invalid email or password",
      });
    }

    const token = signToken({ sub: user.id, email: user.email });
    const body: AuthResponse = {
      token,
      user: {
        id: user.id,
        email: user.email,
        createdAt: user.createdAt.toISOString(),
      },
    };
    return reply.send(body);
  });
};

export default authRoutes;
