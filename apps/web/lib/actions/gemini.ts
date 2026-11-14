"use server";

import { revalidatePath } from "next/cache";
import { apiFetch, ApiError } from "../api";
import { he } from "../strings";
import type { ActionResult } from "./types";

/** Save (and verify with Google) the signed-in user's Gemini API key. */
export async function saveGeminiKeyAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const apiKey = String(formData.get("apiKey") ?? "").trim();
  if (!apiKey) return { error: he.gemini.errEmpty };
  try {
    await apiFetch("/me/gemini-key", { method: "PUT", body: JSON.stringify({ apiKey }) });
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.code === "GEMINI_KEY_INVALID") return { error: he.gemini.errInvalid, code: err.code };
      if (err.code === "GEMINI_UNREACHABLE") return { error: he.gemini.errUnreachable, code: err.code };
      if (err.status === 400) return { error: he.gemini.errFormat };
    }
    return { error: he.gemini.errGeneric };
  }
  revalidatePath("/library");
  return { success: true };
}

/** Remove the saved key. */
export async function removeGeminiKeyAction(): Promise<ActionResult> {
  try {
    await apiFetch("/me/gemini-key", { method: "DELETE" });
  } catch {
    return { error: he.gemini.errGeneric };
  }
  revalidatePath("/library");
  return { success: true };
}
