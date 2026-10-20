import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  ...(process.env.NODE_ENV === "development" ? {
    async rewrites() {
      return [{ source: "/api/portal/:path*", destination: "http://127.0.0.1:3158/api/portal/:path*" }];
    },
  } : { output: "export" }),
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
