const port = process.env.PORTAL_PORT || "3000";
try {
  for (const path of ["/api/portal/health", "/"]) {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, { signal: AbortSignal.timeout(3000) });
    if (!response.ok) throw new Error("Unhealthy application");
    await response.arrayBuffer();
  }
} catch { process.exitCode = 1; }

export {};
