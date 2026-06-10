"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/* Listens for AE_NAVIGATE messages the service worker posts when a push
   notification is tapped, and performs an in-place client-side route change.
   Replaces the SW's previous client.navigate(), which forced a full reload
   and is unreliable inside installed iOS PWAs (WebKit). Renders nothing. */
export function ServiceWorkerNavigator() {
  const router = useRouter();

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    const onMessage = (event: MessageEvent) => {
      const d = event.data as { type?: string; url?: string } | null;
      if (d && d.type === "AE_NAVIGATE" && typeof d.url === "string") {
        router.push(d.url);
      }
    };

    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [router]);

  return null;
}
