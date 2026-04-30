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
};

export default nextConfig;
