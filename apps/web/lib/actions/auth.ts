"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { AuthResponse } from "@doc-to-audio/types";
import { API_INTERNAL_URL, setAuthCookie, clearAuthCookie } from "../session";
import { he } from "../strings";
import type { AuthFormState } from "./types";

type AuthOutcome = AuthFormState & { pending?: boolean };

async function authenticate(
  endpoint: "login" | "register",
  formData: FormData,
): Promise<AuthOutcome> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Email and password are required" };
  }

  let res: Response;
  try {
    res = await fetch(`${API_INTERNAL_URL}/auth/${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // The API only sees this server; pass the visitor's browser along so analytics can tell phone from computer.
        "x-client-user-agent": headers().get("user-agent") ?? "",
      },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
    });
  } catch {
    return { error: "Could not reach the server. Please try again." };
  }

  // A new account waits for the owner's approval: no token, no cookie.
  if (res.status === 202) return { pending: true };

  if (!res.ok) {
    let message = endpoint === "login" ? "Invalid email or password" : "Registration failed";
    let code: string | undefined;
    try {
      const data = (await res.json()) as { message?: string; code?: string };
      if (data?.message) message = data.message;
      code = data?.code;
    } catch {
      /* ignore */
    }
    if (res.status === 403 && code === "PENDING_APPROVAL") message = he.auth.pendingLogin;
    else if (res.status === 403 && code === "REJECTED") message = he.auth.rejectedLogin;
    else if (res.status === 429) message = he.auth.tooManySignups;
    return { error: message };
  }

  const data = (await res.json()) as AuthResponse;
  setAuthCookie(data.token);
  return {};
}

/** Server action: log in, set cookie, redirect to the library. */
export async function loginAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const result = await authenticate("login", formData);
  if (result.error) return { error: result.error };
  redirect("/library");
}

/** Server action: register; go to the library, or to the "waiting for approval" page. */
export async function registerAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const result = await authenticate("register", formData);
  if (result.error) return { error: result.error };
  if (result.pending) redirect("/pending");
  redirect("/library");
}

/** Server action: clear the cookie and return to login. */
export async function logoutAction(): Promise<void> {
  clearAuthCookie();
  redirect("/login");
}
