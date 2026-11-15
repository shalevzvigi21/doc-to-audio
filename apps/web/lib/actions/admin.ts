"use server";

import { revalidatePath } from "next/cache";
import { apiFetch, ApiError } from "../api";

/** Approve or reject an account from the admin screen. Returns an error message, or undefined on success. */
export async function decideUserAction(userId: string, action: "approve" | "reject"): Promise<string | undefined> {
  try {
    await apiFetch(`/admin/users/${encodeURIComponent(userId)}/decision`, {
      method: "POST",
      body: JSON.stringify({ action }),
    });
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) return "אין לך הרשאה לפעולה הזו";
    if (err instanceof ApiError && err.status === 404) return "המשתמש לא נמצא";
    return "הפעולה נכשלה. נסו שוב.";
  }
  revalidatePath("/admin");
  return undefined;
}
