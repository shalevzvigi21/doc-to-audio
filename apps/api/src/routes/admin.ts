import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AdminDayPoint, AdminSummary, AdminUserRow, MeProfile } from "@doc-to-audio/types";
import { config } from "../config.js";
import { prisma } from "../lib/prisma.js";
import { requireUser } from "../lib/http.js";
import { getUserAccess, verifyDecisionToken } from "../lib/approval.js";
import { decideUser } from "../lib/decide.js";

const DAY_MS = 86_400_000;

/** The signed-in admin's id, or null after sending 401/403. */
async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<string | null> {
  const user = requireUser(request, reply);
  if (!user) return null;
  const access = await getUserAccess(user.id);
  if (!access?.isAdmin) {
    void reply.code(403).send({ statusCode: 403, error: "Forbidden", message: "Admin only" });
    return null;
  }
  return user.id;
}

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

/* --------------------------- HTML for the email link --------------------------- */

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function page(title: string, body: string): string {
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title>
<style>body{font-family:system-ui,Arial,sans-serif;background:#edeef3;color:#14161f;margin:0;display:grid;min-height:100dvh;place-items:center;padding:16px}
.card{background:#fff;border-radius:24px;padding:28px;max-width:420px;width:100%;box-shadow:0 10px 30px rgba(0,0,0,.08);text-align:center}
h1{font-size:22px;margin:0 0 10px}p{color:#555;line-height:1.6}b{direction:ltr;unicode-bidi:isolate}
button{margin-top:14px;min-height:52px;padding:0 28px;border:0;border-radius:14px;font:inherit;font-weight:700;color:#fff;cursor:pointer;width:100%}
.ok{background:#12805c}.no{background:#c0314b}a{color:#f2501f}</style></head><body><main class="card">${body}</main></body></html>`;
}

const adminRoutes: FastifyPluginAsync = async (fastify) => {
  // The decision page posts a classic HTML form.
  fastify.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string" }, (_req, body, done) => {
    done(null, Object.fromEntries(new URLSearchParams(body as string)));
  });

  /** GET /me/profile — who am I (lets the web app show the Admin link). */
  fastify.get("/me/profile", async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const access = await getUserAccess(user.id);
    const body: MeProfile = { id: user.id, email: user.email, isAdmin: Boolean(access?.isAdmin) };
    return reply.send(body);
  });

  /* ------------------------------- analytics ------------------------------- */

  /** GET /admin/summary — headline numbers. */
  fastify.get("/admin/summary", async (request, reply) => {
    if (!(await requireAdmin(request, reply))) return;
    const now = Date.now();
    const since = (days: number) => new Date(now - days * DAY_MS);

    const [byStatus, newThisWeek, activeDay, activeWeek, activeMonth, documentsConverted, audio] = await Promise.all([
      prisma.user.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.user.count({ where: { createdAt: { gte: since(7) } } }),
      prisma.loginEvent.findMany({ where: { at: { gte: since(1) } }, distinct: ["userId"], select: { userId: true } }),
      prisma.loginEvent.findMany({ where: { at: { gte: since(7) } }, distinct: ["userId"], select: { userId: true } }),
      prisma.loginEvent.findMany({ where: { at: { gte: since(30) } }, distinct: ["userId"], select: { userId: true } }),
      prisma.file.count({ where: { status: "DONE" } }),
      prisma.audioJob.aggregate({ _sum: { duration: true }, where: { file: { status: "DONE" } } }),
    ]);
    const count = (s: string) => byStatus.find((r) => r.status === s)?._count._all ?? 0;
    const body: AdminSummary = {
      totalUsers: count("PENDING") + count("APPROVED") + count("REJECTED"),
      pendingUsers: count("PENDING"),
      approvedUsers: count("APPROVED"),
      rejectedUsers: count("REJECTED"),
      newThisWeek,
      activeDay: activeDay.length,
      activeWeek: activeWeek.length,
      activeMonth: activeMonth.length,
      documentsConverted,
      audioHours: Math.round(((audio._sum.duration ?? 0) / 3600) * 10) / 10,
    };
    return reply.send(body);
  });

  /** GET /admin/timeseries?days=30 — sign-ups and logins per UTC day. */
  fastify.get<{ Querystring: { days?: string } }>("/admin/timeseries", async (request, reply) => {
    if (!(await requireAdmin(request, reply))) return;
    const days = Math.min(Math.max(Number(request.query.days) || 30, 7), 90);
    const start = new Date(Date.now() - (days - 1) * DAY_MS);
    start.setUTCHours(0, 0, 0, 0);

    const [users, logins] = await Promise.all([
      prisma.user.findMany({ where: { createdAt: { gte: start } }, select: { createdAt: true } }),
      prisma.loginEvent.findMany({ where: { at: { gte: start } }, select: { at: true } }),
    ]);
    const points = new Map<string, AdminDayPoint>();
    for (let i = 0; i < days; i++) {
      const key = dayKey(new Date(start.getTime() + i * DAY_MS));
      points.set(key, { day: key, signups: 0, logins: 0 });
    }
    for (const u of users) {
      const p = points.get(dayKey(u.createdAt));
      if (p) p.signups++;
    }
    for (const l of logins) {
      const p = points.get(dayKey(l.at));
      if (p) p.logins++;
    }
    return reply.send([...points.values()]);
  });

  /** GET /admin/users — every account with its activity. */
  fastify.get<{ Querystring: { status?: string } }>("/admin/users", async (request, reply) => {
    if (!(await requireAdmin(request, reply))) return;
    const status = ["PENDING", "APPROVED", "REJECTED"].includes(request.query.status ?? "")
      ? (request.query.status as "PENDING" | "APPROVED" | "REJECTED")
      : undefined;

    const [users, done] = await Promise.all([
      prisma.user.findMany({
        where: status ? { status } : undefined,
        orderBy: { createdAt: "desc" },
        select: {
          id: true, email: true, status: true, isAdmin: true, createdAt: true, lastLoginAt: true, loginCount: true,
          _count: { select: { files: true } },
        },
      }),
      prisma.file.findMany({ where: { status: "DONE" }, select: { userId: true, audioJob: { select: { duration: true } } } }),
    ]);
    const seconds = new Map<string, number>();
    for (const f of done) seconds.set(f.userId, (seconds.get(f.userId) ?? 0) + (f.audioJob?.duration ?? 0));

    const rows: AdminUserRow[] = users.map((u) => ({
      id: u.id,
      email: u.email,
      status: u.status,
      isAdmin: u.isAdmin,
      createdAt: u.createdAt.toISOString(),
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      loginCount: u.loginCount,
      documents: u._count.files,
      audioMinutes: Math.round((seconds.get(u.id) ?? 0) / 60),
    }));
    return reply.send(rows);
  });

  /** POST /admin/users/:id/decision — approve or reject from the admin screen. */
  fastify.post<{ Params: { id: string } }>("/admin/users/:id/decision", async (request, reply) => {
    if (!(await requireAdmin(request, reply))) return;
    const parsed = z.object({ action: z.enum(["approve", "reject"]) }).safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ statusCode: 400, error: "Bad Request", message: "action must be approve or reject" });
    }
    const result = await decideUser(request.params.id, parsed.data.action);
    if (!result) return reply.code(404).send({ statusCode: 404, error: "Not Found", message: "User not found" });
    return reply.send(result);
  });

  /* -------------------------- links inside the email -------------------------- */

  /**
   * GET /admin/decision?token=… shows a confirmation page. It changes NOTHING: mail scanners and
   * link previewers open GET links automatically, so the action only happens on the POST below.
   */
  fastify.get<{ Querystring: { token?: string } }>("/admin/decision", async (request, reply) => {
    const claims = request.query.token ? verifyDecisionToken(request.query.token) : null;
    reply.header("cache-control", "no-store").type("text/html; charset=utf-8");
    if (!claims) {
      return reply.code(400).send(page("קישור לא תקין", `<h1>הקישור לא תקין או שפג תוקפו</h1><p>אפשר לטפל בבקשות במסך הניהול.</p><p><a href="${esc(config.webPublicUrl)}/admin">למסך הניהול</a></p>`));
    }
    const user = await prisma.user.findUnique({ where: { id: claims.userId }, select: { email: true, status: true } });
    if (!user) {
      return reply.code(404).send(page("לא נמצא", `<h1>המשתמש לא נמצא</h1>`));
    }
    if (user.status !== "PENDING") {
      return reply.send(page("כבר טופל", `<h1>הבקשה כבר טופלה</h1><p><b>${esc(user.email)}</b></p><p><a href="${esc(config.webPublicUrl)}/admin">למסך הניהול</a></p>`));
    }
    const approve = claims.action === "approve";
    return reply.send(
      page(
        approve ? "אישור גישה" : "דחיית בקשה",
        `<h1>${approve ? "לאשר גישה?" : "לדחות את הבקשה?"}</h1><p><b>${esc(user.email)}</b></p>
         <form method="post" action="/admin/decision"><input type="hidden" name="token" value="${esc(request.query.token ?? "")}">
         <button class="${approve ? "ok" : "no"}" type="submit">${approve ? "כן, לאשר" : "כן, לדחות"}</button></form>`,
      ),
    );
  });

  /** POST /admin/decision (form post from the page above) performs the action. */
  fastify.post("/admin/decision", async (request, reply) => {
    const token = (request.body as { token?: string } | undefined)?.token ?? "";
    const claims = verifyDecisionToken(token);
    reply.header("cache-control", "no-store").type("text/html; charset=utf-8");
    if (!claims) {
      return reply.code(400).send(page("קישור לא תקין", `<h1>הקישור לא תקין או שפג תוקפו</h1>`));
    }
    const result = await decideUser(claims.userId, claims.action, { onlyIfPending: true });
    if (!result) return reply.code(404).send(page("לא נמצא", `<h1>המשתמש לא נמצא</h1>`));
    if (result.skipped) {
      return reply.send(page("כבר טופל", `<h1>הבקשה כבר טופלה</h1><p><b>${esc(result.email)}</b></p><p><a href="${esc(config.webPublicUrl)}/admin">למסך הניהול</a></p>`));
    }
    const approved = result.status === "APPROVED";
    return reply.send(
      page(
        approved ? "הגישה אושרה" : "הבקשה נדחתה",
        `<h1>${approved ? "הגישה אושרה" : "הבקשה נדחתה"}</h1><p><b>${esc(result.email)}</b></p>
         <p>${approved ? "נשלח אליו מייל עם קישור לכניסה." : "נשלחה לו הודעה."}</p>
         <p><a href="${esc(config.webPublicUrl)}/admin">למסך הניהול</a></p>`,
      ),
    );
  });
};

export default adminRoutes;
