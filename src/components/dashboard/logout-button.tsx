"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

export function LogoutButton() {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  async function handleLogout() {
    setIsPending(true);

    try {
      await authClient.signOut();
      router.push("/login");
      router.refresh();
    } catch {
      setIsPending(false);
    }
  }

  return (
    <Button variant="destructive" onClick={handleLogout} disabled={isPending}>
      {isPending && <Loader2 className="animate-spin" />}
      {isPending ? "Signing out..." : "Sign out"}
    </Button>
  );
}
