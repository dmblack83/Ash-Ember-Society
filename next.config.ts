import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        // User-uploaded photos served from Supabase Storage public buckets
        // (cigar-photos, post-images, avatars, ...).
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "https",
        // YouTube video thumbnails surfaced in Discover Channels and
        // burn-report linked videos.
        hostname: "i.ytimg.com",
      },
      {
        protocol: "https",
        // Landing-page hero image. Served through next/image so the
        // optimizer picks viewport-appropriate variants in WebP/AVIF.
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        // Landing-page philosophy section image. Same reason as Unsplash.
        hostname: "media.istockphoto.com",
      },
    ],
  },
  async redirects() {
    return [
      {
        source:      "/dashboard",
        destination: "/home",
        permanent:   true,
      },
    ];
  },
  async headers() {
    /*
     * Long-lived cache headers on static metadata.
     *
     * Default for /public assets is `public, max-age=0, must-revalidate`,
     * which forces a conditional GET on every page load. For files that
     * change rarely (icons, the manifest, default cigar art, field-guide
     * illustrations), that's pure Edge Request waste.
     *
     * 1 day for the manifest itself (so PWA metadata edits propagate
     * within a day). 30 days for everything else; bumping these files
     * when we ship new ones means renaming or hashing the path.
     */
    const oneDay   = 60 * 60 * 24;
    const oneMonth = oneDay * 30;
    const monthCache = `public, max-age=${oneMonth}, immutable`;

    return [
      {
        // The service worker file itself MUST never be long-cached, or
        // browsers will run a stale SW for up to a year and breakage
        // becomes near-impossible to ship a fix for. Per Google's PWA
        // guidance, no-cache + must-revalidate is the safe default.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "Content-Type",  value: "application/javascript; charset=utf-8" },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [
          { key: "Cache-Control", value: `public, max-age=${oneDay}, must-revalidate` },
        ],
      },
      {
        source: "/icons/:path*",
        headers: [{ key: "Cache-Control", value: monthCache }],
      },
      {
        source: "/field-guide/:path*",
        headers: [{ key: "Cache-Control", value: monthCache }],
      },
      {
        // path-to-regexp doesn't match spaces in source patterns; use the
        // URL-encoded form so the rule applies to the request as the
        // browser actually sends it.
        source: "/Cigar%20Default%20Images/:path*",
        headers: [{ key: "Cache-Control", value: monthCache }],
      },
    ];
  },
};

export default nextConfig;
