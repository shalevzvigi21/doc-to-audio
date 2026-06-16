import { AuthForm } from "@/components/AuthForm";
import { loginAction } from "@/lib/actions/auth";
import { he } from "@/lib/strings";

export const metadata = { title: he.meta.login };

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <AuthForm mode="login" action={loginAction} />
    </main>
  );
}
