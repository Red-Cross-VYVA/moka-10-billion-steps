import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: [],
  outputFileTracingRoot: path.join(process.cwd(), "../.."),
};

export default nextConfig;
