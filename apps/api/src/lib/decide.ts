import { config } from "../config.js";
import { prisma } from "./prisma.js";
import { invalidateAccess, type DecisionAction } from "./approval.js";
import { decisionEmail, sendMail } from "./mailer.js";

/**
 * Apply the admin's decision to an account. Returns null when the user does not exist.
 * The applicant is emailed only when the status actually changes (so a double click on the
 * email link does not send two messages).
 */
export async function decideUser(
  userId: string,
  action: DecisionAction,
  opts: { onlyIfPending?: boolean } = {},
): Promise<{ email: string; status: "APPROVED" | "REJECTED"; changed: boolean; skipped?: boolean } | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, status: true, isAdmin: true } });
  if (!user || user.isAdmin) return null; // the admin account can never be rejected or demoted
  const status = action === "approve" ? "APPROVED" : "REJECTED";
  // Emailed links are single-use in effect: they only act on a request still waiting. An old
  // "approve" link can never undo a later rejection (or the other way round).
  if (opts.onlyIfPending && user.status !== "PENDING") {
    return { email: user.email, status: user.status === "APPROVED" ? "APPROVED" : "REJECTED", changed: false, skipped: true };
  }
  const changed = user.status !== status;
  if (changed) {
    // Approving the configured owner address (only possible via a link sent to that very mailbox)
    // is what grants admin rights: nobody can claim the owner account just by registering it.
    const makeAdmin = action === "approve" && user.email === config.adminEmail;
    await prisma.user.update({ where: { id: userId }, data: { status, decidedAt: new Date(), ...(makeAdmin ? { isAdmin: true } : {}) } });
    invalidateAccess(userId);
    const mail = decisionEmail(status === "APPROVED", config.webPublicUrl);
    void sendMail(user.email, mail.subject, mail.html);
  }
  return { email: user.email, status, changed };
}
