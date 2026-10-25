# Development workflow

- Keep the Next.js frontend and Node.js backend in one Docker application, described by `Dockerfile` and `compose.yaml`.
- After authorized changes, run the relevant checks, push to `Matthew-zzz/node_studio`, then rebuild and update with `SOURCE_REVISION="$(git rev-parse HEAD)" docker compose up -d --build --wait`.
- Use Docker Compose commands directly. Do not introduce `.sh` installers, deployment timers, or a separate API supervisor.
- Preserve the `portal-data` volume when updating. Do not use `docker compose down -v` for an existing installation.
- Never claim a container was updated without checking the Docker API and application health. If the environment denies Docker access, finish and push the implementation, verify the image in CI, and report the remaining deployment limitation.
- Keep credentials in runtime configuration or the data volume. Do not commit `.env` or generated access files.
- Keep role and client ownership checks on the server. Profile switching requires a successful login to each account and is limited to its authenticated device group. Do not add public role switching, seeded customer records, or demo routes. Test fixtures belong in tests only.
- Payments use the explicitly requested server-backed stub until a real payment provider is selected. Keep its test labels and server-side ownership, quote amount and payment-state checks.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
