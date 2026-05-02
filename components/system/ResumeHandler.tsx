"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

const MIN_INTERVAL_MS = 2000;

export function ResumeHandler() {
  const router = useRouter();

  useEffect(() => {
    let lastResume = 0;
    const supabase = createClient();

    function onResume() {
      const now = Date.now();
      if (now - lastResume < MIN_INTERVAL_MS) return;
      lastResume = now;

      supabase.auth.refreshSession().catch(() => {});
      router.refresh();
    }

    function onVisibility() {
      if (document.visibilityState === "visible") onResume();
    }

    function onPageShow(e: PageTransitionEvent) {
      if (e.persisted || document.visibilityState === "visible") onResume();
    }

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [router]);

  return null;
}
