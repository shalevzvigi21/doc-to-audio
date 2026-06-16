import { redirect } from "next/navigation";
import { getToken } from "@/lib/session";

export default function HomePage() {
  // Send signed-in users to their library, everyone else to login.
  if (getToken()) redirect("/library");
  redirect("/login");
}
