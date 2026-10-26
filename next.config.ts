import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  reactStrictMode: true,
  poweredByHeader: false,
  images: { unoptimized: true },
  // Optional mode for CI environments that allow threads but restrict child processes.
  ...(process.env.NEXT_BUILD_WORKER_THREADS === "1" ? {
    experimental: {
      workerThreads: true,
      webpackBuildWorker: false,
      useTypeScriptCli: false,
      cpus: 2,
    },
  } : {}),
};

export default nextConfig;
