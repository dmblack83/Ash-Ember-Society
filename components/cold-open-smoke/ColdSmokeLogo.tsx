"use client";

import { trackReliability } from "@/lib/telemetry/reliability";

/*
 * Just the cold-smoke logo <img>, extracted into a client component
 * so it can carry an onError handler that fires telemetry. Leaves
 * the rest of ColdOpenSmoke as a server component.
 */
export function ColdSmokeLogo() {
  return (
    <img
      className="cold-smoke-logo"
      src="/cold-smoke-logo.webp"
      alt=""
      width={220}
      height={220}
      onError={() => {
        trackReliability({
          bucket:  "ios_webkit",
          subtype: "splash_fail",
          cause:   "img_onerror",
          detail:  "/cold-smoke-logo.webp",
        });
      }}
    />
  );
}
