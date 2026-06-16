import type { FastifyReply, FastifyRequest } from "fastify";
import type { AuthUser } from "../plugins/auth.js";

/**
 * Returns the authenticated user or sends a 401 and returns null.
 * Use after the global auth hook — this is a type-narrowing convenience.
 */
export function requireUser(request: FastifyRequest, reply: FastifyReply): AuthUser | null {
  if (!request.user) {
    void reply.code(401).send({
      statusCode: 401,
      error: "Unauthorized",
      message: "Authentication required",
    });
    return null;
  }
  return request.user;
}

export function notFound(reply: FastifyReply, message = "Resource not found") {
  return reply.code(404).send({ statusCode: 404, error: "Not Found", message });
}

export function badRequest(reply: FastifyReply, message: string) {
  return reply.code(400).send({ statusCode: 400, error: "Bad Request", message });
}
