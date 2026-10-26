const origin = `http://127.0.0.1:${process.env.PORT || 3000}`;

try {
  const response = await fetch(origin, { signal: AbortSignal.timeout(3000) });
  if (!response.ok) throw new Error("Static site is unhealthy");
  await response.arrayBuffer();
} catch {
  process.exitCode = 1;
}
