"use client";

/* ------------------------------------------------------------------
   IntentLink — Next Link with intent-based prefetch.

   Default `<Link>` auto-prefetches anything in the viewport. For
   long lists (humidor grids of 50+ cards, lounge feeds, shop
   directories) that would prefetch a route per visible item — too
   much work, both client-side and on the origin.

   The previous remedy was `<Link prefetch={false}>`, which fixed
   the over-prefetch but pushed every navigation to a cold start.

   This component is the middle ground: NO viewport auto-prefetch,
   YES prefetch on hover or first touch. Hover gives desktop ~50ms
   head start (mouse-down to click is typically that long); touch
   gives mobile ~50–100ms (touchstart fires before tap).

   Usage:
     <IntentLink href="/humidor/123">…</IntentLink>

   Same prop shape as Next's Link, except `prefetch` is forced to
   false (the whole point) and onMouseEnter/onTouchStart are
   wrapped to call router.prefetch BEFORE invoking any caller-
   supplied handler.
   ------------------------------------------------------------------ */

import Link             from "next/link";
import { useRouter }    from "next/navigation";
import type { ComponentProps, MouseEvent, TouchEvent } from "react";

type IntentLinkProps = Omit<ComponentProps<typeof Link>, "prefetch">;

export function IntentLink({
  href,
  onMouseEnter,
  onTouchStart,
  ...rest
}: IntentLinkProps) {
  const router = useRouter();

  const target = typeof href === "string" ? href : href.toString();

  const handleMouseEnter = (e: MouseEvent<HTMLAnchorElement>) => {
    router.prefetch(target);
    onMouseEnter?.(e);
  };

  const handleTouchStart = (e: TouchEvent<HTMLAnchorElement>) => {
    router.prefetch(target);
    onTouchStart?.(e);
  };

  return (
    <Link
      {...rest}
      href={href}
      prefetch={false}
      onMouseEnter={handleMouseEnter}
      onTouchStart={handleTouchStart}
    />
  );
}
