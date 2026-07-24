import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@kawabunga/types",
    "@kawabunga/utils",
    "@kawabunga/db",
    "@kawabunga/auth",
    "@kawabunga/engine",
    "@kawabunga/ui",
  ],
  images: {
    qualities: [75, 90],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
};

export default nextConfig;
