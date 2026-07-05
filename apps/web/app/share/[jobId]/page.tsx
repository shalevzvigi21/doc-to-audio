import Link from "next/link";
import { BookOpen, Volume2 } from "lucide-react";
import { he } from "@/lib/strings";

export default function SharePage({ params }: { params: { jobId: string } }) {
  const audioSrc = `/api/audio/public/${params.jobId}`;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-background p-6">
      {/* Branding */}
      <div className="flex items-center gap-2.5 text-primary">
        <BookOpen className="h-6 w-6" />
        <span className="text-lg font-bold tracking-tight">{he.app.title}</span>
      </div>

      {/* Player card */}
      <div className="w-full max-w-md space-y-5 rounded-2xl border bg-card p-8 shadow-md">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Volume2 className="h-7 w-7 text-primary" />
          </div>
          <p className="text-base font-semibold">שיתפו איתכם הקלטה</p>
          <p className="text-sm text-muted-foreground">{he.app.description}</p>
        </div>

        {/* Native audio player */}
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <audio controls src={audioSrc} className="w-full" preload="metadata" />
      </div>

      {/* CTA */}
      <p className="text-center text-sm text-muted-foreground">
        רוצים להמיר את המסמכים שלכם לאודיו?{" "}
        <Link href="/register" className="font-medium text-primary underline-offset-4 hover:underline">
          הצטרפו בחינם
        </Link>
      </p>
    </div>
  );
}
