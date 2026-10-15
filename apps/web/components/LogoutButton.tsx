import { LogOut } from "lucide-react";
import { logoutAction } from "@/lib/actions/auth";
import { he } from "@/lib/strings";

export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <button
        type="submit"
        aria-label={he.library.signOut}
        title={he.library.signOut}
        className="grid h-[38px] w-[38px] place-items-center rounded-xl text-muted-foreground hover:bg-card hover:text-foreground"
      >
        <LogOut className="h-5 w-5" />
      </button>
    </form>
  );
}
