#!/usr/bin/env python3
"""Verify the PostgreSQL implementation in one disposable public CI job."""
import base64
import hashlib
import http.client
import json
import os
from pathlib import Path
import re
import shutil
import signal
import socket
import subprocess
import tempfile
import time

repo = Path.cwd()
source = os.environ["SOURCE_COMMIT"]
work_deadline = time.monotonic() + 900
assert re.fullmatch(r"[0-9a-f]{40}", source)
assert subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip() == source
assert os.environ.get("POSTGRES_PUBLIC_REPOSITORY") == "true"
assert os.environ.get("CI") == "true"
fixture_url = "postgresql://postgres:authored-ci-only@127.0.0.1:5432/inspiration_canvas_checks"
assert os.environ.get("DATABASE_URL") == fixture_url
assert os.environ.get("INSPIRATION_CANVAS_DISPOSABLE_DATABASE") == "true"
paths = subprocess.check_output(["git", "ls-files", "-z"]).decode().split("\0")[:-1]


def digest(data):
    return hashlib.sha256(data).hexdigest()


def vector():
    return {name: digest(os.readlink(repo / name).encode() if (repo / name).is_symlink()
                         else (repo / name).read_bytes()) for name in paths}


def importer(text):
    # The root importer's scalar specifier/version pairs; no YAML execution.
    section = text.split("\n  .:\n", 1)[1].split("\npackages:", 1)[0]
    result = {}
    for match in re.finditer(r"^      (.+):\n        specifier: (.+)\n        version: (.+)$", section, re.M):
        name, specifier, version = match.groups()
        result[name.strip("'\"")] = (specifier, version)
    assert len(result) > 50
    return result


def without_database_peers(value):
    # Compare retained package/peer versions while allowing only the explicitly
    # removed adapters and the newly added PostgreSQL peer bindings to differ.
    database_peers = {"@libsql/client", "@neondatabase/serverless", "drizzle-orm", "pg", "@types/pg"}
    output, index = "", 0
    while index < len(value):
        if value[index] != "(":
            output += value[index]; index += 1; continue
        depth, end = 1, index + 1
        while depth and end < len(value):
            depth += (value[end] == "(") - (value[end] == ")")
            end += 1
        assert depth == 0, "Malformed dependency peer context"
        nested = value[index + 1:end - 1]
        if not any(nested.startswith(name + "@") for name in database_peers):
            output += "(" + without_database_peers(nested) + ")"
        index = end
    return output


before = vector()
preexisting = {}
for entry in Path("/proc").iterdir():
    if entry.name.isdigit():
        try:
            if entry.stat().st_uid != os.getuid():
                continue
            preexisting[entry.name] = (entry / "stat").read_text().rsplit(") ", 1)[1].split()[19]
        except (FileNotFoundError, ProcessLookupError, PermissionError):
            pass
root = Path(tempfile.mkdtemp(prefix="canvas-pg-"))
root_identity = (root.stat().st_dev, root.stat().st_ino, root.stat().st_uid)
app = root / "app"
app.mkdir()
report = {"sourceCommit": source, "startedAt": time.time(), "commands": [],
          "scope": "real disposable PostgreSQL, authored local app journeys, scoped static checks; no hosted Supabase/RLS/provider proof"}
groups, selected = [], []
server = None
server_out = server_err = None
database_marked = False
status = 1
lock = None
env = os.environ.copy()
env.update({"CI": "true", "npm_config_cache": str(root / "npm-cache"), "XDG_CACHE_HOME": str(root / "cache"),
    "CANVAS_POSTGRES_BROWSER_REPORT": str(root / "playwright.json"), "CANVAS_POSTGRES_BROWSER_OUTPUT": str(root / "browser-results"),
    "PLAYWRIGHT_BROWSERS_PATH": str(root / "browsers"), "TMPDIR": str(root / "tmp"),
    "NEXT_TELEMETRY_DISABLED": "1", "DO_NOT_TRACK": "1", "LOCAL_PERSISTENCE_ENABLED": "true",
    "DATABASE_URL": fixture_url, "UPLOAD_DIR": str(root / "uploads"), "STORAGE_DRIVER": "local",
    "ENABLE_AI": "false", "ENABLE_EVE_DEV": "false", "ENABLE_BLOB_STORAGE": "false",
    **{key: "" for key in ["VERCEL", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY",
        "SUPABASE_SERVICE_ROLE_KEY", "AI_GATEWAY_API_KEY", "VERCEL_OIDC_TOKEN", "BLOB_READ_WRITE_TOKEN", "OPENAI_API_KEY", "ANTHROPIC_API_KEY"]}})
(root / "tmp").mkdir()


def stream(data):
    complete = len(data) <= 4_000_000
    data = data[:4_000_000]
    return {"bytes": len(data), "sha256": digest(data), "base64": base64.b64encode(data).decode(), "complete": complete}


def file_stream(path):
    with path.open("rb") as handle:
        return stream(handle.read(4_000_001))


def run(argv, timeout=120, accepted=(0,)):
    timeout = min(timeout, max(1, work_deadline - time.monotonic()))
    started = time.time()
    out_path = root / f"command-{len(report['commands'])}.stdout"
    err_path = root / f"command-{len(report['commands'])}.stderr"
    with out_path.open("wb") as out, err_path.open("wb") as err:
        proc = subprocess.Popen(argv, cwd=app, env=env, stdout=out, stderr=err, start_new_session=True)
        groups.append(proc.pid)
        timed_out = False
        while proc.poll() is None:
            if time.time() - started >= timeout or out_path.stat().st_size + err_path.stat().st_size > 4_000_000:
                timed_out = True
                os.killpg(proc.pid, signal.SIGTERM)
                try:
                    proc.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    os.killpg(proc.pid, signal.SIGKILL); proc.wait(timeout=10)
                break
            time.sleep(0.1)
        proc.wait(timeout=10)
    report["commands"].append({"argv": argv, "exitCode": proc.returncode, "timedOut": timed_out,
        "seconds": round(time.time() - started, 3), "stdout": file_stream(out_path), "stderr": file_stream(err_path)})
    assert all(digest((app / name).read_bytes()) == before[name] for name in selected if name != "pnpm-lock.yaml"), "Export source changed"
    if proc.returncode not in accepted or timed_out:
        raise RuntimeError("Focused command failed: " + " ".join(argv))
    return base64.b64decode(report["commands"][-1]["stdout"]["base64"])


pnpm = ["npm", "exec", "--yes", "--package=pnpm@10.24.0", "--", "pnpm"]


def database_guard(operation):
    # This task's fixed CI service database only. Never force-disconnect users.
    code = r'''
import pg from 'pg';
const pool = new pg.Pool({connectionString:'postgresql://postgres:authored-ci-only@127.0.0.1:5432/postgres', max:1});
try {
 const row=(await pool.query("SELECT shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=$1",['inspiration_canvas_checks'])).rows[0];
 if (process.argv[1]==='mark') {
   if(!row || row.marker!==null)throw Error('CI database was not fresh');
   await pool.query("COMMENT ON DATABASE inspiration_canvas_checks IS 'inspiration-canvas-postgres-ci-v1'");
 } else {
   if(row?.marker!=='inspiration-canvas-postgres-ci-v1')throw Error('CI database ownership marker mismatch');
   const active=(await pool.query('SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=$1',['inspiration_canvas_checks'])).rows[0].count;
   if(active!==0)throw Error('CI database still has active clients');
   await pool.query('DROP DATABASE inspiration_canvas_checks');
 }
 console.log(JSON.stringify({operation:process.argv[1],database:'inspiration_canvas_checks',marker:'inspiration-canvas-postgres-ci-v1',passed:true}));
} finally {await pool.end();}
'''
    return run(["node", "--input-type=module", "-e", code, operation], 30)


try:
    selected = [name for name in paths if name.startswith(("app/", "components/", "hooks/", "lib/", "agent/", "workflows/", "public/", "tests/unit/", "tests/integration/", "tests/e2e/local-postgres"))
        or name in {"package.json", "pnpm-lock.yaml", "tsconfig.json", "vitest.config.ts", "vitest.postgres.config.ts", "playwright.postgres.config.ts", "eslint.config.mjs", "next.config.ts", "postcss.config.mjs", "scripts/db-push.ts", "scripts/db-seed.ts"}]
    for name in selected:
        assert not (repo / name).is_symlink(), name
        destination = app / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(repo / name, destination)
    report["export"] = {"files": len(selected), "bytes": sum((app / name).stat().st_size for name in selected), "sha256": {name: before[name] for name in selected}}
    old_importer = importer((app / "pnpm-lock.yaml").read_text())
    run(pnpm + ["install", "--lockfile-only", "--no-frozen-lockfile", "--ignore-scripts", "--store-dir", str(root / "store")], 240)
    lock = (app / "pnpm-lock.yaml").read_bytes()
    new_importer = importer(lock.decode())
    removed = {"@libsql/client", "@neondatabase/serverless", "drizzle-orm", "drizzle-kit"}
    assert set(old_importer) - set(new_importer) == removed
    assert set(new_importer) - set(old_importer) == {"pg", "@types/pg"}
    peer_changes = {}
    for name in set(old_importer) & set(new_importer):
        old_spec, old_version = old_importer[name]
        new_spec, new_version = new_importer[name]
        assert old_spec == new_spec, "Unrelated dependency specifier changed: " + name
        if old_version != new_version:
            assert name == "eve" and without_database_peers(old_version) == without_database_peers(new_version), "Unrelated dependency version changed: " + name
            peer_changes[name] = {"before": old_version, "after": new_version}
    graph_nodes = [key.lstrip("'\"") for key in re.findall(r"^  (.+):$", lock.decode(), re.M)]
    assert not any(key.startswith(("@libsql/", "@neondatabase/serverless@", "drizzle-orm@", "drizzle-kit@")) for key in graph_nodes), "Removed adapter still has a resolved package node"
    report["generatedLock"] = {"bytes": len(lock), "sha256": digest(lock), "retainedDirectDependencies": len(set(old_importer) & set(new_importer)), "removed": sorted(removed), "added": ["pg", "@types/pg"], "databasePeerChanges": peer_changes}
    run(pnpm + ["install", "--frozen-lockfile", "--ignore-scripts", "--store-dir", str(root / "store")], 240)
    database_guard("mark")
    database_marked = True
    run(pnpm + ["exec", "vitest", "run", "tests/unit/local-persistence.test.ts", "tests/unit/persistence-mode.test.ts", "tests/unit/temporary-import.test.ts", "tests/unit/temporary-transfer.test.ts", "tests/unit/temporary-transfer-receipt.test.ts", "--reporter=json", "--outputFile=unit-results.json"], accepted=(0, 1))
    report["unit"] = json.loads((app / "unit-results.json").read_text())
    assert report["commands"][-1]["exitCode"] == 0, "Unit CLI did not exit successfully"
    assert report["unit"]["success"] and report["unit"]["numPassedTests"] == 55 and report["unit"]["numPendingTests"] == 0
    run(pnpm + ["exec", "vitest", "run", "--config", "vitest.postgres.config.ts", "--reporter=json", "--outputFile=postgres-results.json"], accepted=(0, 1))
    report["postgres"] = json.loads((app / "postgres-results.json").read_text())
    assert report["commands"][-1]["exitCode"] == 0, "PostgreSQL CLI did not exit successfully"
    assert report["postgres"]["success"] and report["postgres"]["numPassedTests"] == 16 and report["postgres"]["numPendingTests"] == 0
    changed = subprocess.check_output(["git", "diff", "--name-only", "49ffc0794b8d5163e11ade4419e2a816c46d938d", source], cwd=repo, text=True).splitlines()
    scoped = [name for name in changed if name.endswith((".ts", ".tsx")) and name in selected]
    run(pnpm + ["exec", "eslint", *scoped])
    (app / "tsconfig.postgres-checks.json").write_text(json.dumps({"extends": "./tsconfig.json", "include": scoped, "exclude": ["node_modules"], "compilerOptions": {"incremental": False, "plugins": []}}))
    run(pnpm + ["exec", "tsc", "--noEmit", "-p", "tsconfig.postgres-checks.json"])
    run(pnpm + ["exec", "playwright", "install", "chromium", "--only-shell"], 180)
    probe = socket.socket(); probe.bind(("127.0.0.1", 3100)); probe.close()
    server_out = (root / "server.stdout").open("wb"); server_err = (root / "server.stderr").open("wb")
    server = subprocess.Popen(pnpm + ["exec", "next", "dev", "--webpack", "--hostname", "127.0.0.1", "--port", "3100"], cwd=app, env=env, stdout=server_out, stderr=server_err, start_new_session=True)
    groups.append(server.pid)
    deadline = min(time.monotonic() + 120, work_deadline)
    while True:
        assert server.poll() is None, "Owned Next server exited"
        try:
            connection = http.client.HTTPConnection("127.0.0.1", 3100, timeout=10)
            connection.request("GET", "/api/canvas")
            response = connection.getresponse(); data = response.read(); connection.close()
            if response.status == 200 and json.loads(data)["persistence"] == "local":
                report["localApiReady"] = True
                break
        except (OSError, ValueError, KeyError):
            pass
        if time.monotonic() >= deadline:
            raise RuntimeError("Owned local API readiness expired")
        time.sleep(0.2)
    run(pnpm + ["exec", "playwright", "test", "--config", "playwright.postgres.config.ts"], 330, accepted=(0, 1))
    report["browser"] = json.loads((root / "playwright.json").read_text())
    assert report["commands"][-1]["exitCode"] == 0, "Browser CLI did not exit successfully"
    assert report["browser"]["stats"]["expected"] == 2 and not report["browser"]["errors"] and all(report["browser"]["stats"][key] == 0 for key in ["unexpected", "flaky", "skipped"])
    status = 0
except Exception as error:
    report["error"] = str(error)
finally:
    if server is not None:
        alive_before_stop = server.poll() is None
        forced_stop = False
        try:
            os.killpg(server.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        try:
            server.wait(timeout=15)
        except subprocess.TimeoutExpired:
            forced_stop = True
            os.killpg(server.pid, signal.SIGKILL); server.wait(timeout=10)
        server_out.close(); server_err.close()
        report["server"] = {"exitCode": server.returncode, "stdout": file_stream(root / "server.stdout"), "stderr": file_stream(root / "server.stderr"), "intentionalStop": alive_before_stop, "killSent": forced_stop}
        if forced_stop or not alive_before_stop or server.returncode not in [0, -15, 143]:
            status = 1
        port = socket.socket()
        port.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            port.bind(("127.0.0.1", 3100)); report["portReleased"] = True
        except OSError:
            report["portReleased"] = False; status = 1
        finally:
            port.close()
    else:
        if server_out is not None: server_out.close()
        if server_err is not None: server_err.close()
    report["sourceUnchanged"] = before == vector()
    report["databaseRemoved"] = False
    if database_marked:
        try:
            database_guard("drop")
            report["databaseRemoved"] = True
        except Exception as error:
            report["databaseCleanupError"] = str(error)
    live, uncertain = [], []
    for entry in Path("/proc").iterdir():
        if not entry.name.isdigit():
            continue
        try:
            if entry.stat().st_uid != os.getuid():
                continue
            fields = (entry / "stat").read_text().rsplit(") ", 1)[1].split()
            if preexisting.get(entry.name) == fields[19]:
                continue
            cwd = os.readlink(entry / "cwd")
            if entry.stat().st_uid == os.getuid() and fields[0] != "Z" and (int(fields[2]) in groups or cwd.startswith(str(root) + "/")):
                live.append(int(entry.name))
        except (FileNotFoundError, ProcessLookupError):
            pass
        except PermissionError:
            uncertain.append(int(entry.name))
    report["liveOwnedBeforeScratchRemoval"] = live
    report["uncertainNewProcesses"] = uncertain
    current = root.lstat()
    report["scratchIdentityMatches"] = not root.is_symlink() and (current.st_dev, current.st_ino, current.st_uid) == root_identity
    if not live and not uncertain and report["scratchIdentityMatches"]:
        shutil.rmtree(root)
    report["scratchRemoved"] = not root.exists()
    report["finishedAt"] = time.time()
    captures = [item[label] for item in report["commands"] for label in ["stdout", "stderr"]]
    if "server" in report: captures.extend([report["server"]["stdout"], report["server"]["stderr"]])
    report["passed"] = status == 0 and report["sourceUnchanged"] and report["scratchRemoved"] and report["databaseRemoved"] and all(item["complete"] for item in captures)
    if lock is not None:
        encoded = base64.b64encode(lock).decode()
        for index, offset in enumerate(range(0, len(encoded), 24000)):
            print(f"CANVAS_POSTGRES_LOCK_{index:04d}=" + encoded[offset:offset + 24000], flush=True)
    print("CANVAS_POSTGRES_RESULT=" + json.dumps(report, separators=(",", ":")), flush=True)
raise SystemExit(0 if report["passed"] else 1)
