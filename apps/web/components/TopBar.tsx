import { Brand } from "@/components/Brand";
import { ThemeToggle } from "@/components/ThemeToggle";

/** Page header: brand on one side, page tools on the other. */
export function TopBar({ children }: { children?: React.ReactNode }) {
  return (
    <header className="flex items-center justify-between gap-3 py-3.5">
      <Brand />
      <div className="flex items-center gap-2">
        {children}
        <ThemeToggle />
      </div>
    </header>
  );
}
