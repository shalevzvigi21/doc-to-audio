"use server";

import { revalidatePath } from "next/cache";
import { apiFetch, ApiError } from "../api";
import { he } from "../strings";
import type { ActionResult } from "./types";

/** Save (and verify with OpenAI) the signed-in user's OpenAI API key. */
export async function saveOpenAIKeyAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const apiKey = String(formData.get("apiKey") ?? "").trim();
  if (!apiKey) return { error: he.openaiKey.errEmpty };
  try {
    await apiFetch("/me/openai-key", { method: "PUT", body: JSON.stringify({ apiKey }) });
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.code === "OPENAI_KEY_INVALID") return { error: he.openaiKey.errInvalid, code: err.code };
      if (err.code === "OPENAI_UNREACHABLE") return { error: he.openaiKey.errUnreachable, code: err.code };
      if (err.status === 400) return { error: he.openaiKey.errFormat };
    }
    return { error: he.openaiKey.errGeneric };
  }
  revalidatePath("/library");
  return { success: true };
}

/** Remove the saved key. */
export async function removeOpenAIKeyAction(): Promise<ActionResult> {
  try {
    await apiFetch("/me/openai-key", { method: "DELETE" });
  } catch {
    return { error: he.openaiKey.errGeneric };
  }
  revalidatePath("/library");
  return { success: true };
}
