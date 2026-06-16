import { AuthForm } from "@/components/AuthForm";
import { registerAction } from "@/lib/actions/auth";
import { he } from "@/lib/strings";

export const metadata = { title: he.meta.register };

export default function RegisterPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <AuthForm mode="register" action={registerAction} />
    </main>
  );
}
