import type { FastifyPluginAsync } from "fastify";
import bcrypt from "bcrypt";
import { z } from "zod";
import type { AuthResponse, PendingApprovalResponse } from "@doc-to-audio/types";
import { config } from "../config.js";
import { prisma } from "../lib/prisma.js";
import { connection } from "../lib/redis.js";
import { signToken } from "../lib/jwt.js";
import {
  clientUserAgent,
  deviceFromUserAgent,
  mayUseApp,
  recordLogin,
  signDecisionToken,
} from "../lib/approval.js";
import { newRequestEmail, sendMail } from "../lib/mailer.js";

/**
 * A valid bcrypt hash compared against when the user does not exist, so login
 * timing does not reveal whether an email is registered.
 */
const DUMMY_HASH = bcrypt.hashSync("doc-to-audio-placeholder", 12);

const credentialsSchema = z.object({
  email: z.string().email("A valid email is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const REGISTRATIONS_PER_HOUR = 10;

/**
 * At most 10 sign-ups per hour in total, so nobody can flood the admin's inbox. The limit is global,
 * not per IP: every request reaches this API from the web app's servers, so client IPs are not visible.
 */
async function registrationAllowed(): Promise<boolean> {
  try {
    const key = "reg:global:hour";
    const n = await connection.incr(key);
    if (n === 1) await connection.expire(key, 3600);
    return n <= REGISTRATIONS_PER_HOUR;
  } catch {
    return true; // Redis trouble must not block sign-ups
  }
}

const authRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * POST /auth/register
   * - Normal install: create the user and return a JWT.
   * - Approval enabled: everyone is created PENDING, gets NO token (202), and the admin is
   *   emailed approve/reject links.
   */
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

    // Counted only for real new sign-ups (not duplicates), so repeating a known address cannot burn the quota.
    if (config.approvalRequired && !(await registrationAllowed())) {
      return reply.code(429).send({
        statusCode: 429,
        error: "Too Many Requests",
        message: "Too many sign-up attempts. Please try again later.",
      });
    }

    // Registering never grants admin rights. Even the owner's own address starts PENDING: the approve
    // link goes to that mailbox, and approving it (see decideUser) is what makes the account admin.
    const pending = config.approvalRequired;
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const user = await prisma.user.create({
      data: { email, passwordHash, status: pending ? "PENDING" : "APPROVED" },
    });

    if (pending) {
      const ua = clientUserAgent(request.headers);
      const mail = newRequestEmail({
        email: user.email,
        when: user.createdAt,
        device: deviceFromUserAgent(ua),
        approveUrl: `${config.apiPublicUrl}/admin/decision?token=${encodeURIComponent(signDecisionToken(user.id, "approve"))}`,
        rejectUrl: `${config.apiPublicUrl}/admin/decision?token=${encodeURIComponent(signDecisionToken(user.id, "reject"))}`,
        adminUrl: `${config.webPublicUrl}/admin`,
      });
      // A mail failure never blocks the sign-up: the request is always visible on the admin screen.
      await sendMail(config.adminEmail, mail.subject, mail.html);
      const body: PendingApprovalResponse = { status: "PENDING" };
      return reply.code(202).send(body);
    }

    await recordLogin(user.id, clientUserAgent(request.headers));
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

  /** POST /auth/login — verify credentials, return a JWT (or 403 while the account awaits approval). */
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

    // Only someone who proved they know the password learns the approval state.
    if (!mayUseApp(user)) {
      const rejected = user.status === "REJECTED";
      return reply.code(403).send({
        statusCode: 403,
        error: "Forbidden",
        code: rejected ? "REJECTED" : "PENDING_APPROVAL",
        message: rejected ? "This account was not approved" : "Your account is waiting for approval",
      });
    }

    await recordLogin(user.id, clientUserAgent(request.headers));
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
