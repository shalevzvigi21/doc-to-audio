import "server-only";
import { API_INTERNAL_URL, getToken } from "./session";
import type { FileTree } from "@doc-to-audio/types";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
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
    try {
      const data = (await res.json()) as { message?: string };
      if (data?.message) message = data.message;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Fetch the current user's folder + file tree. */
export function getFileTree(): Promise<FileTree> {
  return apiFetch<FileTree>("/files");
}
