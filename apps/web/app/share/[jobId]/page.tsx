import Link from "next/link";
import { Brand } from "@/components/Brand";
import { SharePlayer } from "@/components/SharePlayer";
import { ThemeToggle } from "@/components/ThemeToggle";
import { he } from "@/lib/strings";

export default function SharePage({ params }: { params: { jobId: string } }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-[620px] flex-col px-4 pb-10">
      <header className="flex items-center justify-between py-3.5">
        <Brand href="/" />
        <ThemeToggle />
      </header>

      <main className="flex flex-1 flex-col justify-center gap-6 py-6">
        <div className="rounded-[32px] border bg-card p-6 sm:p-8">
          <h1 className="text-balance text-2xl font-extrabold tracking-tight">{he.share.heading}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{he.app.description}</p>
          <SharePlayer jobId={params.jobId} />
        </div>

        <p className="text-center text-sm text-muted-foreground">
          {he.share.cta}{" "}
          <Link href="/register" className="font-semibold text-primary underline-offset-4 hover:underline">
            {he.share.ctaLink}
          </Link>
        </p>
      </main>
    </div>
  );
}
