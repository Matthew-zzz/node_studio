# Development workflow

- Keep the Next.js frontend and Node.js backend in one Docker application, described by `Dockerfile` and `compose.yaml`.
- After authorized changes, run the relevant checks, push to `Matthew-zzz/node_studio`, then rebuild and update with `SOURCE_REVISION="$(git rev-parse HEAD)" docker compose up -d --build --wait`.
- Use Docker Compose commands directly. Do not introduce `.sh` installers, deployment timers, or a separate API supervisor.
- Preserve the `portal-data` volume when updating. Do not use `docker compose down -v` for an existing installation.
- Never claim a container was updated without checking the Docker API and application health. If the environment denies Docker access, finish and push the implementation, verify the image in CI, and report the remaining deployment limitation.
- Keep credentials in runtime configuration or the data volume. Do not commit `.env` or generated access files.
- Keep role and client ownership checks on the server. The public demo must stay separate from real authentication.
