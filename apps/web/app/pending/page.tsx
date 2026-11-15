import Link from "next/link";
import { Hourglass } from "lucide-react";
import { AuthShell } from "@/components/AuthShell";
import { he } from "@/lib/strings";

export const metadata = { title: he.auth.pendingTitle };

/** Shown right after sign-up while the owner has not approved the account yet. */
export default function PendingPage() {
  return (
    <AuthShell>
      <div className="w-full max-w-sm rounded-[28px] border bg-card p-7 text-center sm:p-8">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-soft text-primary">
          <Hourglass className="h-7 w-7" />
        </div>
        <h2 className="text-[24px] font-extrabold tracking-tight">{he.auth.pendingTitle}</h2>
        <p className="mt-2 text-muted-foreground">{he.auth.pendingBody}</p>
        <Link
          href="/login"
          className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-xl bg-secondary font-semibold hover:brightness-95"
        >
          {he.auth.pendingBack}
        </Link>
      </div>
    </AuthShell>
  );
}
