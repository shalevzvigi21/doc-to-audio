"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AuthFormState } from "@/lib/actions/types";
import { he } from "@/lib/strings";

type Action = (prev: AuthFormState, formData: FormData) => Promise<AuthFormState>;

interface AuthFormProps {
  mode: "login" | "register";
  action: Action;
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? he.auth.pleaseWait : label}
    </Button>
  );
}

export function AuthForm({ mode, action }: AuthFormProps) {
  const [state, formAction] = useFormState(action, {});
  const isLogin = mode === "login";

  return (
    <form action={formAction} className="w-full max-w-sm rounded-[28px] border bg-card p-7 sm:p-8">
      <h2 className="text-[26px] font-extrabold tracking-tight">
        {isLogin ? he.auth.signInTitle : he.auth.registerTitle}
      </h2>
      <p className="mb-6 mt-1 text-muted-foreground">
        {isLogin ? he.auth.signInDescription : he.auth.registerDescription}
      </p>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-[13px] font-normal text-muted-foreground">
            {he.auth.emailLabel}
          </Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder={he.auth.emailPlaceholder}
            dir="ltr"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password" className="text-[13px] font-normal text-muted-foreground">
            {he.auth.passwordLabel}
          </Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete={isLogin ? "current-password" : "new-password"}
            placeholder={he.auth.passwordPlaceholder}
            dir="ltr"
            minLength={8}
            required
          />
        </div>
        {state.error ? (
          <p className="text-sm font-medium text-destructive" role="alert">
            {state.error}
          </p>
        ) : null}
        <SubmitButton label={isLogin ? he.auth.signInButton : he.auth.createAccountButton} />
      </div>

      <p className="mt-5 text-center text-sm text-muted-foreground">
        {isLogin ? he.auth.noAccountPrompt : he.auth.haveAccountPrompt}
        <Link
          href={isLogin ? "/register" : "/login"}
          className="font-semibold text-primary underline-offset-4 hover:underline"
        >
          {isLogin ? he.auth.signUpLink : he.auth.signInLink}
        </Link>
      </p>
    </form>
  );
}
