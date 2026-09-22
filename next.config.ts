import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Expose VAPID_PUBLIC_KEY to the browser bundle at build time.
  // Using the env block instead of the NEXT_PUBLIC_ prefix convention.
  env: {
    VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY,
  },
};

export default nextConfig;
