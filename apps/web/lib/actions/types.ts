/** Shared result shapes for server actions (kept out of "use server" files). */

export interface AuthFormState {
  error?: string;
}

export interface ActionResult {
  error?: string;
  /** Machine-readable error code from the API, when there is one. */
  code?: string;
  success?: boolean;
}
