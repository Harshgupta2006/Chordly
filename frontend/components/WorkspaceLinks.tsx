"use client";

import { ReactNode, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clearWorkspaceVisit, markSongEntry } from "@/lib/workspaceNavigation";

interface NavigationLinkProps {
  className: string;
  children: ReactNode;
}

export function WorkspaceHomeLink({ className, children }: NavigationLinkProps) {
  return (
    <Link href="/app#chordly-workspace" className={className} onClick={event => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || window.location.pathname !== "/app") return;
      event.preventDefault();
      clearWorkspaceVisit();
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({ top: 0, behavior: reducedMotion ? "instant" : "smooth" });
      document.getElementById("guitar-heading")?.focus({ preventScroll: true });
    }}>{children}</Link>
  );
}

export function SongBackLink({ className, children }: NavigationLinkProps) {
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => { markSongEntry(); }, [pathname]);
  return (
    <Link href="/app" className={className} onClick={event => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (window.history.state?.chordlySongReturn === true) {
        event.preventDefault();
        router.back();
      }
    }}>{children}</Link>
  );
}
