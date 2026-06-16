"use server";

import { redirect } from "next/navigation";
import type { AuthResponse } from "@doc-to-audio/types";
import { API_INTERNAL_URL, setAuthCookie, clearAuthCookie } from "../session";
import type { AuthFormState } from "./types";

async function authenticate(
  endpoint: "login" | "register",
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Email and password are required" };
  }

  let res: Response;
  try {
    res = await fetch(`${API_INTERNAL_URL}/auth/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
    });
  } catch {
    return { error: "Could not reach the server. Please try again." };
  }

  if (!res.ok) {
    let message = endpoint === "login" ? "Invalid email or password" : "Registration failed";
    try {
      const data = (await res.json()) as { message?: string };
      if (data?.message) message = data.message;
    } catch {
      /* ignore */
    }
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
  if (result.error) return result;
  redirect("/library");
}

/** Server action: register, set cookie, redirect to the library. */
export async function registerAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const result = await authenticate("register", formData);
  if (result.error) return result;
  redirect("/library");
}

/** Server action: clear the cookie and return to login. */
export async function logoutAction(): Promise<void> {
  clearAuthCookie();
  redirect("/login");
}
