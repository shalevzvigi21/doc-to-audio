import "server-only";
import { API_INTERNAL_URL, getToken } from "./session";
import type { FileTree } from "@doc-to-audio/types";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    /** Machine-readable code from the API, e.g. "GEMINI_KEY_MISSING". */
    public code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface ApiOptions extends RequestInit {
  /** When true, attach the user's Bearer token from the cookie. */
  auth?: boolean;
}

/**
 * Server-side fetch wrapper around the API. Adds the Bearer token from the
 * httpOnly cookie and normalises error handling.
 */
export async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { auth = true, headers, ...rest } = options;

  const finalHeaders = new Headers(headers);
  if (auth) {
    const token = getToken();
    if (token) finalHeaders.set("Authorization", `Bearer ${token}`);
  }
  if (!finalHeaders.has("Content-Type") && rest.body && typeof rest.body === "string") {
    finalHeaders.set("Content-Type", "application/json");
  }

  const res = await fetch(`${API_INTERNAL_URL}${path}`, {
    ...rest,
    headers: finalHeaders,
    cache: "no-store",
  });

  if (!res.ok) {
    let message = res.statusText;
    let code: string | undefined;
    try {
      const data = (await res.json()) as { message?: string; code?: string };
      if (data?.message) message = data.message;
      code = data?.code;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, message, code);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Fetch the current user's folder + file tree. */
export function getFileTree(): Promise<FileTree> {
  return apiFetch<FileTree>("/files");
}
