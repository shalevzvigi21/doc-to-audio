"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { CreateJobResponse, TtsProvider } from "@doc-to-audio/types";
import { apiFetch, ApiError } from "../api";
import { API_INTERNAL_URL, getToken } from "../session";
import type { ActionResult } from "./types";

/** Upload a document (multipart) into an optional folder. */
export async function uploadFileAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Please choose a file to upload" };
  }

  const token = getToken();
  if (!token) return { error: "Not authenticated" };

  // `displayName` arrives as a plain UTF-8 string field sent by the browser
  // before the file part — browsers always encode string fields as UTF-8,
  // unlike Content-Disposition filenames which can corrupt Hebrew/non-ASCII.
  const displayNameRaw = formData.get("displayName");
  const displayName =
    typeof displayNameRaw === "string" && displayNameRaw.trim()
      ? displayNameRaw.trim()
      : file.name;

  const forward = new FormData();
  const folderId = formData.get("folderId");
  if (folderId && typeof folderId === "string") forward.append("folderId", folderId);
  forward.append("file", file, "upload");

  const encodedName = encodeURIComponent(displayName);

  try {
    const res = await fetch(`${API_INTERNAL_URL}/files/upload?displayName=${encodedName}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: forward,
      cache: "no-store",
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      return { error: data.message ?? "Upload failed" };
    }
  } catch {
    return { error: "Upload failed — could not reach the server" };
  }

  revalidatePath("/library");
  return { success: true };
}

/** Create a folder, optionally nested under `parentId`. */
export async function createFolderAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const name = String(formData.get("name") ?? "").trim();
  const parentId = formData.get("parentId");
  if (!name) return { error: "Folder name is required" };

  try {
    await apiFetch("/folders", {
      method: "POST",
      body: JSON.stringify({
        name,
        parentId: parentId && typeof parentId === "string" ? parentId : null,
      }),
    });
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : "Could not create folder" };
  }

  revalidatePath("/library");
  return { success: true };
}

/** Rename a file. */
export async function renameFileAction(fileId: string, name: string): Promise<ActionResult> {
  try {
    await apiFetch(`/files/${fileId}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    });
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : "Could not rename file" };
  }
  revalidatePath("/library");
  return { success: true };
}

/** Move a file to a different folder (or to the root when folderId is null). */
export async function moveFileAction(fileId: string, folderId: string | null): Promise<ActionResult> {
  try {
    await apiFetch(`/files/${fileId}`, {
      method: "PATCH",
      body: JSON.stringify({ folderId }),
    });
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : "Could not move file" };
  }
  revalidatePath("/library");
  return { success: true };
}

/** Delete a file (and its audio). */
export async function deleteFileAction(fileId: string): Promise<ActionResult> {
  try {
    await apiFetch(`/files/${fileId}`, { method: "DELETE" });
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : "Could not delete file" };
  }
  revalidatePath("/library");
  return { success: true };
}

/** Recursively delete a folder. */
export async function deleteFolderAction(folderId: string): Promise<ActionResult> {
  try {
    await apiFetch(`/folders/${folderId}`, { method: "DELETE" });
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : "Could not delete folder" };
  }
  revalidatePath("/library");
  return { success: true };
}

/**
 * Enqueue audio generation for a file, then send the user to the player page
 * which polls until the job is DONE.
 */
export async function createJobAction(
  fileId: string,
  provider: TtsProvider = "gemini",
  reconstructColumns = false,
): Promise<ActionResult> {
  let job: CreateJobResponse;
  try {
    job = await apiFetch<CreateJobResponse>("/jobs", {
      method: "POST",
      body: JSON.stringify({ fileId, provider, reconstructColumns }),
    });
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : "Could not start conversion" };
  }
  revalidatePath("/library");
  redirect(`/player/${job.jobId}`);
}

/**
 * Enqueue audio generation for a file WITHOUT redirecting — used for batch
 * operations like "convert all in folder".
 */
export async function queueFileAction(
  fileId: string,
  provider: TtsProvider = "gemini",
  reconstructColumns = false,
): Promise<ActionResult> {
  try {
    await apiFetch("/jobs", {
      method: "POST",
      body: JSON.stringify({ fileId, provider, reconstructColumns }),
    });
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : "Could not start conversion" };
  }
  revalidatePath("/library");
  return { success: true };
}

/**
 * Queue all supplied file IDs for conversion. Returns the number of successes
 * and failures.
 */
export async function convertFilesAction(
  fileIds: string[],
  provider: TtsProvider = "gemini",
  reconstructColumns = false,
): Promise<{ queued: number; failed: number }> {
  let queued = 0;
  let failed = 0;
  for (const fileId of fileIds) {
    const result = await queueFileAction(fileId, provider, reconstructColumns);
    if (result.success) queued++;
    else failed++;
  }
  revalidatePath("/library");
  return { queued, failed };
}

/** Persist the listener's last playback position. */
export async function savePositionAction(jobId: string, lastPosition: number): Promise<void> {
  try {
    await apiFetch(`/jobs/${jobId}/position`, {
      method: "PATCH",
      body: JSON.stringify({ lastPosition }),
    });
  } catch {
    /* position saving is best-effort */
  }
}
