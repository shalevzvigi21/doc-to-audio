import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import fp from "fastify-plugin";
import { verifyToken } from "../lib/jwt.js";

/** The authenticated principal attached to each request after verification. */
export interface AuthUser {
  id: string;
  email: string;
}

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthUser;
  }
  interface FastifyInstance {
    /** Throws/replies 401 unless a valid Bearer JWT is present. */
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

/** Routes whose path starts with one of these prefixes skip authentication. */
const PUBLIC_PREFIXES = ["/auth/", "/health"];

function isPublic(url: string): boolean {
  // Strip query string before matching.
  const path = url.split("?")[0];
  return PUBLIC_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix));
}

function extractBearer(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token.trim();
}

const authPlugin: FastifyPluginAsync = async (fastify) => {
  // Reusable guard that individual routes can opt into explicitly.
  fastify.decorate(
    "authenticate",
    async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      const token = extractBearer(request.headers.authorization);
      if (!token) {
        await reply.code(401).send({
          statusCode: 401,
          error: "Unauthorized",
          message: "Missing or malformed Authorization header",
        });
        return;
      }
      try {
        const payload = verifyToken(token);
        request.user = { id: payload.sub, email: payload.email };
      } catch {
        await reply.code(401).send({
          statusCode: 401,
          error: "Unauthorized",
          message: "Invalid or expired token",
        });
      }
    },
  );

  // Global guard: every route except the public ones requires a valid JWT.
  fastify.addHook("onRequest", async (request, reply) => {
    if (isPublic(request.url)) return;
    await fastify.authenticate(request, reply);
  });
};

export default fp(authPlugin, { name: "auth" });
