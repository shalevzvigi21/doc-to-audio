/** Shared result shapes for server actions (kept out of "use server" files). */

export interface AuthFormState {
  error?: string;
}

export interface ActionResult {
  error?: string;
  success?: boolean;
}
