#!/usr/bin/env python3
"""Publish verified static exports and activate them atomically on the web host."""

import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import tarfile
import tempfile
from datetime import datetime, timezone


REPOSITORY = "Matthew-zzz/node_studio"
ORIGIN = "https://node-studio.ru"
BRANCH = "production"
ENTRYPOINTS = (
    "index.html", "404.html", "robots.txt", "sitemap.xml",
    "projects/anime-love/index.html", "projects/autoparts/index.html",
    "projects/vectra/index.html",
)
SHA = re.compile(r"[0-9a-f]{40}")


def run(*args, cwd=None, env=None):
    result = subprocess.run(
        args, cwd=cwd, env=env, check=True, stdout=subprocess.PIPE,
        stderr=subprocess.PIPE, timeout=180,
    )
    return result.stdout.decode().strip()


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def inventory(directory):
    files = {}
    for path in sorted(directory.rglob("*")):
        relative = path.relative_to(directory).as_posix()
        if path.is_symlink() or ".git" in path.relative_to(directory).parts:
            raise ValueError(f"Unsafe export entry: {relative}")
        if path.is_file() and relative != "deployment.json":
            files[relative] = digest(path)
        elif not path.is_file() and not path.is_dir():
            raise ValueError(f"Unsupported export entry: {relative}")
    if not all(name in files for name in ENTRYPOINTS):
        raise ValueError("Export is missing a required page or SEO file")
    if not any(name.startswith("_next/static/") for name in files):
        raise ValueError("Export is missing Next.js static resources")
    return files


def publish(repository, directory, source_sha):
    """Use a separate Git index; never change the source checkout or force-push."""
    repository, directory = repository.resolve(), directory.resolve()
    if not SHA.fullmatch(source_sha):
        raise ValueError("Invalid source commit")
    if run("git", "rev-parse", "HEAD", cwd=repository) != source_sha:
        raise ValueError("Checkout does not match the requested source commit")
    remote_main = run("git", "ls-remote", "origin", "refs/heads/main", cwd=repository)
    if remote_main.split()[0] != source_sha:
        print("A newer main commit exists; skipping this obsolete build.")
        return None
    manifest = {
        "repository": REPOSITORY, "source_sha": source_sha, "origin": ORIGIN,
        "built_at": datetime.now(timezone.utc).isoformat(),
        "files": inventory(directory),
    }
    (directory / "deployment.json").write_text(json.dumps(manifest, indent=2) + "\n")
    parent_ref = run("git", "ls-remote", "origin", f"refs/heads/{BRANCH}", cwd=repository)
    parent = parent_ref.split()[0] if parent_ref else None
    if parent:
        run("git", "fetch", "--depth=1", "--no-tags", "origin", f"refs/heads/{BRANCH}", cwd=repository)
    git_dir = run("git", "rev-parse", "--absolute-git-dir", cwd=repository)
    with tempfile.TemporaryDirectory() as temporary:
        environment = dict(os.environ, GIT_INDEX_FILE=f"{temporary}/index")
        git = ("git", f"--git-dir={git_dir}", f"--work-tree={directory}")
        run(*git, "read-tree", "--empty", cwd=directory, env=environment)
        run(*git, "add", "--all", "--force", ".", cwd=directory, env=environment)
        tree = run(*git, "write-tree", cwd=directory, env=environment)
        parents = ("-p", parent) if parent else ()
        commit = run(
            *git, "-c", "user.name=github-actions[bot]",
            "-c", "user.email=41898282+github-actions[bot]@users.noreply.github.com",
            "commit-tree", tree, *parents, "-m", f"Deploy {source_sha}",
            cwd=directory, env=environment,
        )
    # Recheck after preparing the snapshot, since main may have advanced meanwhile.
    if run("git", "ls-remote", "origin", "refs/heads/main", cwd=repository).split()[0] != source_sha:
        print("A newer main commit exists; skipping this obsolete build.")
        return None
    run("git", "push", "origin", f"{commit}:refs/heads/{BRANCH}", cwd=repository)
    print(f"Published {source_sha} as {BRANCH} commit {commit}")
    return commit


def extract(archive, destination):
    """Only extract plain files/directories, with bounded size and no links."""
    with tarfile.open(archive) as bundle:
        members = bundle.getmembers()
        if len(members) > 10000 or sum(item.size for item in members) > 1024**3:
            raise ValueError("Static archive exceeds deployment limits")
        seen = set()
        for item in members:
            path = PurePosixPath(item.name)
            if (path.is_absolute() or ".." in path.parts or ".git" in path.parts
                    or not (item.isfile() or item.isdir()) or path in seen):
                raise ValueError(f"Unsafe archive entry: {item.name}")
            seen.add(path)
        bundle.extractall(destination, filter="data")
    for path in destination.rglob("*"):
        path.chmod(0o755 if path.is_dir() else 0o644)
    destination.chmod(0o755)


def validate(directory):
    manifest = json.loads((directory / "deployment.json").read_text())
    if (manifest.get("repository") != REPOSITORY or manifest.get("origin") != ORIGIN
            or not SHA.fullmatch(manifest.get("source_sha", ""))):
        raise ValueError("Deployment identity does not match this site")
    if inventory(directory) != manifest.get("files"):
        raise ValueError("Deployment file checksums do not match")
    return manifest


def preserve_assets(release, shared):
    for source in (release / "_next/static").rglob("*"):
        target = shared / "_next/static" / source.relative_to(release / "_next/static")
        if source.is_dir():
            target.mkdir(parents=True, exist_ok=True, mode=0o755)
        else:
            target.parent.mkdir(parents=True, exist_ok=True, mode=0o755)
            if target.exists():
                if digest(target) != digest(source):
                    raise ValueError(f"Immutable asset changed: {target.name}")
            else:
                temporary = target.with_name(target.name + ".pending")
                shutil.copyfile(source, temporary)
                temporary.chmod(0o644)
                os.replace(temporary, target)


def point(current, target):
    temporary = current.with_name(".current-pending")
    temporary.unlink(missing_ok=True)
    temporary.symlink_to(target)
    os.replace(temporary, current)


def health(release):
    """Check the real Nginx virtual host, including TLS redirects/certificate."""
    for relative in ("deployment.json", *ENTRYPOINTS):
        if relative == "404.html":
            continue  # Nginx intentionally serves this page only for HTTP 404s.
        route = "/" if relative == "index.html" else "/" + relative.removesuffix("index.html")
        result = subprocess.run(
            ["curl", "--fail", "--silent", "--show-error", "--location",
             "--max-time", "15", "--noproxy", "node-studio.ru",
             "--resolve", "node-studio.ru:80:127.0.0.1",
             "--resolve", "node-studio.ru:443:127.0.0.1",
             f"http://node-studio.ru{route}"],
            check=True, stdout=subprocess.PIPE, timeout=20,
        )
        if hashlib.sha256(result.stdout).hexdigest() != digest(release / relative):
            raise ValueError(f"Nginx returned unexpected content for {route}")


def synchronize(state, webroot, remote=f"https://github.com/{REPOSITORY}.git", check=health):
    state, webroot = state.resolve(), webroot.resolve()
    state.mkdir(parents=True, exist_ok=True)
    with (state / "sync.lock").open("w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        cache = state / "repository.git"
        if not cache.exists():
            run("git", "init", "--bare", str(cache))
        environment = dict(os.environ, GIT_TERMINAL_PROMPT="0")
        run("git", "--git-dir", str(cache), "fetch", "--depth=1", "--no-tags",
            remote, f"+refs/heads/{BRANCH}:refs/heads/{BRANCH}", env=environment)
        revision = run("git", "--git-dir", str(cache), "rev-parse", BRANCH)
        if not SHA.fullmatch(revision):
            raise ValueError("Invalid deployment revision")
        releases = webroot / "releases"
        releases.mkdir(parents=True, exist_ok=True)
        current = webroot / "current"
        release = releases / revision
        if current.is_symlink() and current.resolve() == release and release.is_dir():
            return False
        if current.exists() and not current.is_symlink():
            raise ValueError("current must be a symlink; refusing to replace a directory")
        if not release.exists():
            with tempfile.TemporaryDirectory(dir=releases, prefix=".staging-") as directory:
                staging = Path(directory)
                archive = state / "release.tar"
                try:
                    run("git", "--git-dir", str(cache), "archive", "--format=tar",
                        f"--output={archive}", revision)
                    extract(archive, staging)
                    validate(staging)
                    os.rename(staging, release)
                finally:
                    archive.unlink(missing_ok=True)
        manifest = validate(release)
        preserve_assets(release, webroot / "shared")
        previous = current.readlink() if current.is_symlink() else None
        point(current, release)
        try:
            check(release)
        except Exception:
            if previous is None:
                current.unlink()
            else:
                point(current, previous)
            raise
        print(f"Activated source {manifest['source_sha']} (release {revision})")
        owned = sorted(
            (path for path in releases.iterdir()
             if SHA.fullmatch(path.name) and path.is_dir() and not path.is_symlink()),
            key=lambda path: path.stat().st_mtime, reverse=True,
        )
        protected = {current.resolve()}
        if previous is not None:
            protected.add((current.parent / previous).resolve())
        for old in owned[5:]:
            if old not in protected:
                shutil.rmtree(old)
        return True


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    publisher = commands.add_parser("publish")
    publisher.add_argument("--directory", type=Path, required=True)
    publisher.add_argument("--source-sha", required=True)
    commands.add_parser("sync")
    arguments = parser.parse_args()
    if arguments.command == "publish":
        publish(Path.cwd(), arguments.directory, arguments.source_sha)
    else:
        synchronize(Path("/var/lib/node-studio-deploy"), Path("/var/www/node-studio.ru"))


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        # Command arguments may contain Git's configured credentials; never log them.
        if isinstance(error, ValueError):
            print(f"Deployment failed: {error}")
        elif isinstance(error, subprocess.CalledProcessError):
            print(f"Deployment command failed (exit {error.returncode}). Check GitHub access, the production branch and Nginx logs.")
        else:
            print(f"Deployment failed: {type(error).__name__}. See docs/deployment.md.")
        raise SystemExit(1) from None
