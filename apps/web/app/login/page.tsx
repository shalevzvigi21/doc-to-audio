import { AuthForm } from "@/components/AuthForm";
import { AuthShell } from "@/components/AuthShell";
import { loginAction } from "@/lib/actions/auth";
import { he } from "@/lib/strings";

export const metadata = { title: he.meta.login };

export default function Page() {
  return (
    <AuthShell>
      <AuthForm mode="login" action={loginAction} />
    </AuthShell>
  );
}
