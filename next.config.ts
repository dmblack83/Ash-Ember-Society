import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
