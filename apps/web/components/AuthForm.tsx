"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-2xl">
          {isLogin ? he.auth.signInTitle : he.auth.registerTitle}
        </CardTitle>
        <CardDescription>
          {isLogin ? he.auth.signInDescription : he.auth.registerDescription}
        </CardDescription>
      </CardHeader>
      <form action={formAction}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">{he.auth.emailLabel}</Label>
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
          <div className="space-y-2">
            <Label htmlFor="password">{he.auth.passwordLabel}</Label>
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
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <SubmitButton label={isLogin ? he.auth.signInButton : he.auth.createAccountButton} />
          <p className="text-sm text-muted-foreground">
            {isLogin ? he.auth.noAccountPrompt : he.auth.haveAccountPrompt}
            <Link
              href={isLogin ? "/register" : "/login"}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              {isLogin ? he.auth.signUpLink : he.auth.signInLink}
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
