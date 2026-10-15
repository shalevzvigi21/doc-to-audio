import { BrandMark, Equalizer } from "@/components/Brand";
import { he } from "@/lib/strings";

/** Login/register layout: dark brand panel next to the form. */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto grid min-h-screen max-w-[980px] items-center gap-6 px-4 py-6 md:grid-cols-[1.1fr_1fr]">
      <section className="relative flex min-h-[260px] flex-col justify-between gap-8 overflow-hidden rounded-[32px] bg-[hsl(229_22%_10%)] p-7 text-[hsl(228_22%_95%)] md:min-h-[460px] md:p-10 dark:bg-card dark:text-foreground">
        <div className="flex items-center gap-2.5 text-[19px] font-extrabold tracking-tight">
          <BrandMark onDark />
          {he.app.title}
        </div>
        <Equalizer count={34} peak={120} className="h-[70px] gap-1.5 md:h-[120px]" barClassName="w-[7px]" />
        <div>
          <h1 className="text-balance text-[clamp(32px,5vw,48px)] font-extrabold leading-[1.08] tracking-[-0.03em]">
            {he.brand.heroLine1}
            <br />
            <em className="not-italic text-primary">{he.brand.heroLine2}</em>
          </h1>
          <p className="mt-3.5 max-w-[30ch] opacity-70">{he.brand.heroSub}</p>
        </div>
      </section>
      <div className="flex justify-center">{children}</div>
    </main>
  );
}
