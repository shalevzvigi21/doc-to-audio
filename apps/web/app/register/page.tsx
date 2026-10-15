import { AuthForm } from "@/components/AuthForm";
import { AuthShell } from "@/components/AuthShell";
import { registerAction } from "@/lib/actions/auth";
import { he } from "@/lib/strings";

export const metadata = { title: he.meta.register };

export default function Page() {
  return (
    <AuthShell>
      <AuthForm mode="register" action={registerAction} />
    </AuthShell>
  );
}
