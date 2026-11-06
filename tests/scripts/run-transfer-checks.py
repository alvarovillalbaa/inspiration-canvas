#!/usr/bin/env python3
"""Bounded, provider-free transfer checks in a disposable public CI workspace."""
import base64
import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import tempfile
import time

repo = Path.cwd()
source = os.environ["SOURCE_COMMIT"]
assert len(source) == 40 and all(c in "0123456789abcdef" for c in source)
assert subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip() == source
assert os.environ.get("TRANSFER_PUBLIC_REPOSITORY") == "true"
paths = subprocess.check_output(["git", "ls-files", "-z"]).decode().split("\0")[:-1]


def vector():
    return {name: hashlib.sha256(os.readlink(repo / name).encode() if (repo / name).is_symlink()
                                  else (repo / name).read_bytes()).hexdigest() for name in paths}


before = vector()
root = Path(tempfile.mkdtemp(prefix="canvas-transfer-"))
app = root / "app"
app.mkdir()
report = {"sourceCommit": source, "startedAt": time.time(), "commands": [],
          "scope": "authored unit/mocked API contracts and scoped lint/types; no browser/database/provider acceptance"}
status = 1
groups = []
selected = []
try:
    selected = [name for name in paths if name.startswith(("app/", "components/", "hooks/", "lib/", "agent/", "workflows/", "tests/unit/"))
                or name in {"package.json", "pnpm-lock.yaml", "tsconfig.json", "vitest.config.ts", "eslint.config.mjs"}]
    for name in selected:
        assert not (repo / name).is_symlink(), name
        destination = app / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(repo / name, destination)
    report["export"] = {"files": len(selected), "bytes": sum((app / name).stat().st_size for name in selected),
                        "sha256": {name: before[name] for name in selected}}
    scoped = ["components/canvas/inspiration-canvas.tsx", "lib/canvas/transfer.ts", "lib/canvas/temp-store.ts",
              "lib/api/temporary-import.ts", "lib/db/supabase-repository.ts", "app/api/canvas/[id]/import/route.ts",
              "tests/unit/temporary-transfer.test.ts", "tests/unit/temporary-transfer-receipt.test.ts",
              "tests/unit/temporary-import.test.ts"]
    (app / "tsconfig.transfer.json").write_text(json.dumps({"extends": "./tsconfig.json", "include": scoped,
        "exclude": ["node_modules"], "compilerOptions": {"incremental": False, "plugins": []}}))
    env = os.environ.copy()
    env.update({"CI": "true", "npm_config_cache": str(root / "npm-cache"), "XDG_CACHE_HOME": str(root / "cache"),
                "ENABLE_AI": "false", "ENABLE_EVE_DEV": "false", "NEXT_PUBLIC_SUPABASE_URL": "",
                "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY": "", "SUPABASE_SERVICE_ROLE_KEY": "",
                "AI_GATEWAY_API_KEY": "", "VERCEL_OIDC_TOKEN": "", "BLOB_READ_WRITE_TOKEN": ""})

    def run(argv, timeout):
        started = time.time()
        proc = subprocess.Popen(argv, cwd=app, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
        groups.append(proc.pid)
        timed_out = False
        try:
            out, err = proc.communicate(timeout=timeout)
        except subprocess.TimeoutExpired:
            timed_out = True
            os.killpg(proc.pid, signal.SIGTERM)
            try:
                out, err = proc.communicate(timeout=10)
            except subprocess.TimeoutExpired:
                os.killpg(proc.pid, signal.SIGKILL)
                out, err = proc.communicate(timeout=10)
        assert len(out) + len(err) <= 4_000_000, "Unexpectedly large command output"
        report["commands"].append({"argv": argv, "exitCode": proc.returncode, "timedOut": timed_out,
            "seconds": round(time.time() - started, 3), **{label: {"bytes": len(data),
              "sha256": hashlib.sha256(data).hexdigest(), "base64": base64.b64encode(data).decode()}
              for label, data in (("stdout", out), ("stderr", err))}})
        assert all(hashlib.sha256((app / name).read_bytes()).hexdigest() == before[name] for name in selected), "Export input changed"
        if proc.returncode or timed_out:
            raise RuntimeError("Focused command failed: " + " ".join(argv))

    pnpm = ["npm", "exec", "--yes", "--package=pnpm@10.24.0", "--", "pnpm"]
    run(pnpm + ["install", "--frozen-lockfile", "--ignore-scripts", "--store-dir", str(root / "store")], 300)
    run(pnpm + ["exec", "vitest", "run", "tests/unit/temporary-transfer.test.ts", "tests/unit/temporary-transfer-receipt.test.ts",
                "tests/unit/temporary-import.test.ts", "--reporter=json", "--outputFile=transfer-vitest.json"], 120)
    report["tests"] = json.loads((app / "transfer-vitest.json").read_text())
    assert report["tests"]["success"] is True and report["tests"]["numFailedTests"] == 0
    run(pnpm + ["exec", "eslint", *scoped], 120)
    run(pnpm + ["exec", "tsc", "--noEmit", "-p", "tsconfig.transfer.json"], 120)
    status = 0
except Exception as error:
    report["error"] = str(error)
finally:
    report["sourceUnchanged"] = before == vector()
    def live_owned():
        found = []
        for entry in Path("/proc").iterdir():
            if not entry.name.isdigit():
                continue
            try:
                fields = (entry / "stat").read_text().rsplit(") ", 1)[1].split()
                if entry.stat().st_uid == os.getuid() and int(fields[2]) in groups and fields[0] != "Z":
                    found.append(int(entry.name))
            except (FileNotFoundError, ProcessLookupError, PermissionError):
                pass
        return found
    report["liveOwnedBeforeCleanup"] = live_owned()
    if report["liveOwnedBeforeCleanup"]:
        for group in groups:
            try:
                os.killpg(group, signal.SIGTERM)
            except ProcessLookupError:
                pass
        deadline = time.monotonic() + 5
        while live_owned() and time.monotonic() < deadline:
            time.sleep(0.1)
    report["liveOwnedAfterCleanup"] = live_owned()
    # Only this mkdtemp root is disposable; repository inputs are never cleaned.
    assert root.parent == Path(tempfile.gettempdir()) and root.name.startswith("canvas-transfer-")
    if not report["liveOwnedAfterCleanup"]:
        shutil.rmtree(root)
    report["scratchRemoved"] = not root.exists()
    report["finishedAt"] = time.time()
    report["passed"] = status == 0 and report["sourceUnchanged"] and report["scratchRemoved"]
    print("CANVAS_TRANSFER_RESULT=" + json.dumps(report, separators=(",", ":")), flush=True)
raise SystemExit(0 if report["passed"] else 1)
