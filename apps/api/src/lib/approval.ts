import jwt from "jsonwebtoken";
import type { UserStatus } from "@prisma/client";
import { config } from "../config.js";
import { prisma } from "./prisma.js";

/* --------------------------- signed email links --------------------------- */

export type DecisionAction = "approve" | "reject";

interface DecisionClaims {
  purpose: "decision";
  uid: string;
  action: DecisionAction;
}

/**
 * Token inside the approve/reject links sent to the admin. It carries `purpose: "decision"` and
 * `uid` (no `sub`), so it can never be accepted as a login token, and a login token has no
 * `purpose`, so it can never be accepted here.
 */
export function signDecisionToken(userId: string, action: DecisionAction): string {
  const claims: DecisionClaims = { purpose: "decision", uid: userId, action };
  return jwt.sign(claims, config.jwtSecret, { expiresIn: "7d" });
}

export function verifyDecisionToken(token: string): { userId: string; action: DecisionAction } | null {
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    if (typeof decoded === "string") return null;
    const c = decoded as Partial<DecisionClaims>;
    if (c.purpose !== "decision" || !c.uid || (c.action !== "approve" && c.action !== "reject")) return null;
    return { userId: c.uid, action: c.action };
  } catch {
    return null;
  }
}

/* ------------------------------ access cache ------------------------------ */

interface Access {
  status: UserStatus;
  isAdmin: boolean;
}

const CACHE_TTL_MS = 60_000;
const accessCache = new Map<string, { at: number; value: Access | null }>();

/** The user's current approval state, cached for 60 s (cleared right after an admin decision). */
export async function getUserAccess(userId: string): Promise<Access | null> {
  const hit = accessCache.get(userId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { status: true, isAdmin: true } });
  const value = user ? { status: user.status, isAdmin: user.isAdmin } : null;
  accessCache.set(userId, { at: Date.now(), value });
  return value;
}

export function invalidateAccess(userId: string): void {
  accessCache.delete(userId);
}

/** True when this account may use the app under the current settings. */
export function mayUseApp(access: Access): boolean {
  return !config.approvalRequired || access.isAdmin || access.status === "APPROVED";
}

export function isAdminEmail(email: string): boolean {
  return Boolean(config.adminEmail) && email.trim().toLowerCase() === config.adminEmail;
}

/* ----------------------------- small helpers ------------------------------ */

export function deviceFromUserAgent(ua: string | undefined): "mobile" | "desktop" {
  return /Mobi|Android|iPhone|iPad|iPod/i.test(ua ?? "") ? "mobile" : "desktop";
}

/**
 * The visitor's browser, not the web server's: sign-ups and logins arrive from the Next.js server,
 * which forwards the browser's User-Agent in `x-client-user-agent`.
 */
export function clientUserAgent(headers: Record<string, string | string[] | undefined>): string | undefined {
  const forwarded = headers["x-client-user-agent"];
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const direct = headers["user-agent"];
  return value || (Array.isArray(direct) ? direct[0] : direct);
}

/** Record a successful login (counters + one event row). Never throws: analytics must not block signing in. */
export async function recordLogin(userId: string, userAgent: string | undefined): Promise<void> {
  try {
    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { loginCount: { increment: 1 }, lastLoginAt: new Date() } }),
      prisma.loginEvent.create({ data: { userId, device: deviceFromUserAgent(userAgent) } }),
    ]);
  } catch (err) {
    console.error("[analytics] could not record login:", (err as Error).message);
  }
}

/* --------------------------- startup migration --------------------------- */

const MIGRATION_KEY = "approval-migration-v1";

/**
 * Run at server start when approval is enforced.
 *  1. The admin account (if it exists) is made admin + approved, every boot.
 *  2. Once: every other account that was never decided on becomes PENDING (the owner approves
 *     them one by one). Accounts the admin approved have `decidedAt` set and are never touched.
 * If the admin account does not exist yet nothing is demoted, so nobody can be locked out.
 */
export async function ensureApprovalSetup(): Promise<void> {
  if (!config.approvalRequired) return;

  const admin = await prisma.user.findUnique({ where: { email: config.adminEmail } });
  if (!admin) {
    console.warn(`[approval] ADMIN_EMAIL ${config.adminEmail} has no account yet; existing users stay approved until it registers and the server restarts.`);
    return;
  }
  if (!admin.isAdmin || admin.status !== "APPROVED") {
    await prisma.user.update({ where: { id: admin.id }, data: { isAdmin: true, status: "APPROVED" } });
  }
  // Only the configured owner is admin: if ADMIN_EMAIL changed, the previous owner loses admin rights.
  const demoted = await prisma.user.findMany({ where: { isAdmin: true, id: { not: admin.id } }, select: { id: true } });
  if (demoted.length) {
    await prisma.user.updateMany({ where: { id: { in: demoted.map((u) => u.id) } }, data: { isAdmin: false } });
    for (const u of demoted) invalidateAccess(u.id);
    console.log(`[approval] removed admin rights from ${demoted.length} account(s) that no longer match ADMIN_EMAIL.`);
  }

  const done = await prisma.appSetting.findUnique({ where: { key: MIGRATION_KEY } });
  if (done) return;
  const { count } = await prisma.user.updateMany({
    where: { id: { not: admin.id }, isAdmin: false, status: "APPROVED", decidedAt: null },
    data: { status: "PENDING" },
  });
  await prisma.appSetting.create({ data: { key: MIGRATION_KEY, value: new Date().toISOString() } });
  console.log(`[approval] migration done: ${count} existing account(s) now wait for approval.`);
}
