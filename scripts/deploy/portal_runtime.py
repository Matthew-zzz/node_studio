#!/usr/bin/env python3
"""Supervise the API at the same verified source revision as the static site."""

import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import signal
import subprocess
import tarfile
import tempfile
import time
from urllib.request import ProxyHandler, build_opener

REPOSITORY = "https://github.com/Matthew-zzz/node_studio.git"
REQUIRED = ("server/main.ts", "server/package.json", "src/features/portal/model/types.ts", "src/features/portal/model/access.ts", "src/features/payments/model/payment.ts")
PREFIXES = ("server/", "src/features/portal/model/", "src/features/payments/model/")
SHA = re.compile(r"[a-f0-9]{40}")


def extract_source(raw, destination):
    with tarfile.open(fileobj=io.BytesIO(raw)) as archive:
        members = archive.getmembers()
        if len(members) > 1000 or sum(member.size for member in members) > 16 * 1024**2:
            raise ValueError("API source exceeds limits")
        for member in members:
            path = PurePosixPath(member.name)
            if (path.is_absolute() or ".." in path.parts or not (member.isfile() or member.isdir())
                    or member.isfile() and not member.name.startswith(PREFIXES)):
                raise ValueError("Unsafe API archive")
        archive.extractall(destination, filter="data")
    if not all((destination / name).is_file() for name in REQUIRED):
        raise ValueError("API source is incomplete")


def prepare(state, sha):
    if not SHA.fullmatch(sha):
        raise ValueError("Invalid source revision")
    release = state / "releases" / sha
    if all((release / name).is_file() for name in REQUIRED):
        return release
    cache = state / "source.git"
    if not cache.exists():
        subprocess.run(["git", "init", "--bare", str(cache)], check=True, capture_output=True, timeout=30)
    subprocess.run(["git", "--git-dir", str(cache), "fetch", "--depth=1", "--no-tags", REPOSITORY, sha], check=True, capture_output=True, timeout=150)
    raw = subprocess.run(["git", "--git-dir", str(cache), "archive", "--format=tar", sha, "server", "src/features/portal/model", "src/features/payments/model"], check=True, capture_output=True, timeout=30).stdout
    release.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=release.parent) as temporary:
        pending = Path(temporary) / "source"
        pending.mkdir()
        extract_source(raw, pending)
        os.replace(pending, release)
    return release


def desired(manifest):
    data = json.loads(manifest.read_text())
    sha = data.get("source_sha", "")
    if data.get("repository") != "Matthew-zzz/node_studio" or not SHA.fullmatch(sha):
        raise ValueError("Wrong frontend deployment identity")
    return sha


def healthy(port):
    try:
        with build_opener(ProxyHandler({})).open(f"http://127.0.0.1:{port}/api/portal/health", timeout=2) as response:
            data = json.load(response)
            return response.status == 200 and data.get("service") == "node-studio-portal"
    except (OSError, ValueError):
        return False


def stop(child):
    if child and child.poll() is None:
        child.terminate()
        try:
            child.wait(timeout=35)
        except subprocess.TimeoutExpired:
            child.kill()
            child.wait(timeout=5)


def supervise():
    state = Path(os.environ.get("PORTAL_STATE_DIR", "/var/lib/node-studio-portal"))
    manifest = Path("/var/www/node-studio.ru/current/deployment.json")
    node = "/usr/local/lib/node-studio-portal/node"
    port = int(os.environ.get("PORTAL_PORT", "3158"))
    state.mkdir(parents=True, exist_ok=True)
    child = None
    active = None
    stopping = False

    def shutdown(_signal, _frame):
        nonlocal stopping
        stopping = True

    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)
    try:
        while not stopping:
            try:
                sha = desired(manifest)
                if sha != active or child is None or child.poll() is not None:
                    release = prepare(state, sha)
                    previous = active
                    stop(child)
                    child = subprocess.Popen([node, "server/main.ts"], cwd=release)
                    for _ in range(40):
                        if stopping or child.poll() is not None or healthy(port):
                            break
                        time.sleep(.25)
                    if not stopping and child.poll() is None and healthy(port):
                        active = sha
                        (state / "active.json").write_text(json.dumps({"source_sha": sha}) + "\n")
                        print(f"Portal API active: {sha}", flush=True)
                    else:
                        stop(child)
                        child = None
                        if previous and previous != sha:
                            child = subprocess.Popen([node, "server/main.ts"], cwd=state / "releases" / previous)
                        raise RuntimeError("API health check failed; previous revision restored")
            except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as error:
                print(f"Portal update pending ({type(error).__name__}); retrying.", flush=True)
            for _ in range(30):
                if stopping:
                    break
                time.sleep(1)
    finally:
        stop(child)


if __name__ == "__main__":
    os.umask(0o077)
    supervise()
