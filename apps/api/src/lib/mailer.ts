import { config } from "../config.js";

/**
 * Sends an email by asking the web app (Vercel) to do it. Render's free plan blocks outbound SMTP,
 * Vercel does not, so the Gmail credentials live in the web app and this server only knows the
 * shared NOTIFY_SECRET. Returns false (and logs) on any failure; callers must not depend on it.
 */
export async function sendMail(to: string, subject: string, html: string): Promise<boolean> {
  if (!config.notifySecret) {
    console.warn("[mail] NOTIFY_SECRET is not set; email not sent:", subject);
    return false;
  }
  try {
    const res = await fetch(`${config.webPublicUrl}/api/notify`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-notify-secret": config.notifySecret },
      body: JSON.stringify({ to, subject, html }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      console.error(`[mail] web app answered ${res.status} for "${subject}"`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[mail] could not reach the web app:", (err as Error).message);
    return false;
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const wrap = (inner: string) =>
  `<div dir="rtl" style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:16px;color:#14161f;line-height:1.6">${inner}</div>`;

const button = (href: string, label: string, bg: string) =>
  `<a href="${esc(href)}" style="display:inline-block;padding:12px 22px;margin:6px 6px 6px 0;border-radius:10px;background:${bg};color:#fff;text-decoration:none;font-weight:700">${esc(label)}</a>`;

/** Email to the admin: someone asked for access. */
export function newRequestEmail(p: {
  email: string;
  when: Date;
  device: string;
  approveUrl: string;
  rejectUrl: string;
  adminUrl: string;
}): { subject: string; html: string } {
  const time = p.when.toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" });
  return {
    subject: `בקשת הרשמה חדשה: ${p.email}`,
    html: wrap(`
      <h2 style="margin:0 0 8px">בקשת הרשמה חדשה</h2>
      <p>מישהו ביקש גישה ל"מסמך לאודיו".</p>
      <table style="border-collapse:collapse"><tr><td style="padding:2px 0 2px 14px;color:#6b6f80">אימייל</td><td dir="ltr"><b>${esc(p.email)}</b></td></tr>
      <tr><td style="padding:2px 0 2px 14px;color:#6b6f80">זמן</td><td>${esc(time)}</td></tr>
      <tr><td style="padding:2px 0 2px 14px;color:#6b6f80">מכשיר</td><td>${p.device === "mobile" ? "טלפון" : "מחשב"}</td></tr></table>
      <p style="margin-top:18px">${button(p.approveUrl, "אשר גישה", "#12805c")}${button(p.rejectUrl, "דחה", "#c0314b")}</p>
      <p style="color:#6b6f80;font-size:13px">הלחיצה פותחת דף אישור, ורק שם מתבצעת הפעולה. אפשר גם לנהל את כל הבקשות במסך הניהול: <a href="${esc(p.adminUrl)}">${esc(p.adminUrl)}</a></p>`),
  };
}

/** Email to the applicant after the admin decided. */
export function decisionEmail(approved: boolean, siteUrl: string): { subject: string; html: string } {
  return approved
    ? {
        subject: "הגישה שלך ל\"מסמך לאודיו\" אושרה",
        html: wrap(`<h2 style="margin:0 0 8px">הגישה אושרה</h2><p>אפשר להיכנס עכשיו עם האימייל והסיסמה שבחרת.</p><p>${button(siteUrl, "כניסה לאתר", "#f2501f")}</p>`),
      }
    : {
        subject: "בקשת ההרשמה ל\"מסמך לאודיו\"",
        html: wrap(`<h2 style="margin:0 0 8px">הבקשה לא אושרה</h2><p>בקשת הגישה שלך לא אושרה כרגע.</p>`),
      };
}
