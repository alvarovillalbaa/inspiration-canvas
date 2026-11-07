#!/usr/bin/env python3
"""One provider-free, source-pinned unit/static CI packet; never an app runtime."""
import base64
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import selectors
import shutil
import signal
import stat
import subprocess
import sys
import tempfile
import time
import traceback
import uuid
import zlib

BRANCH = "qa/supabase-generation-20261107-2"
REPOSITORY = "alvarovillalbaa/inspiration-canvas"
PRIOR_PATH = "docs/results/2026/11-07/supabase-generation-attempt-1.json"
PRIOR_BYTES = 320234
PRIOR_SHA = "031cd7f272bb5fd1a20595524e4e1d21e0cee434361132892808dc3ab977f950"
PRIOR_SOURCE = "a62f7e9541df4ab1919bd1662be7708e0190e042"
PNPM_URL = "https://github.com/pnpm/pnpm/releases/download/v10.24.0/pnpm-linux-x64"
PNPM_BYTES = 65768111
PNPM_SHA = "985824ae016db3c7bbd7b39dcb4e6f5740b11cce79f5c43d5e5e640768fd4806"
PACKAGE_SHA = "16810cbc86e64990b64b6a895ccd05cf5b580de6e2780cface890cfc0e9c3b61"
LOCK_SHA = "aa7cb0896ea76a4a31342f397f58ae1718b1de770b4cedb7832a85fcb6a00123"
# Literal Vitest fullName values and whole authored-file hashes, reviewed from source.
TESTS = {
    "tests/unit/supabase-generation-runs.test.ts": {
        "sha256": "1ca2296fa3e4bc457c88c6f4a03db7314f7d6d2692a5fd1549d5a22b1d3e5c88",
        "cases": [
            "Supabase generation run repository creates the local DTO from owned canvas and all ordered parents without exposing an owner field",
            "Supabase generation run repository accepts exactly the four existing generation statuses",
            "Supabase generation run repository rejects invalid create shapes and duplicate or insufficient parents before querying",
            "Supabase generation run repository returns null for missing or foreign canvases without inserting a run",
            "Supabase generation run repository rejects any missing foreign or different-canvas parent instead of filtering it out",
            "Supabase generation run repository reads only the requested owned run and its owned canvas",
            "Supabase generation run repository rejects malformed stored parent selections without silently dropping entries",
            "Supabase generation run repository rejects unknown stored statuses and malformed basic run fields",
            "Supabase generation run repository rejects empty overlong and NUL identifiers before reading or writing",
            "Supabase generation run repository rejects identity ownership canvas parent and timestamp patch fields before a write",
            "Supabase generation run repository updates allowed fields and can record failure after a parent is deleted",
            "Supabase generation run repository accepts only an owned same-canvas result and allows clearing it explicitly",
            "Supabase generation run repository does not update missing foreign or newly inaccessible runs",
            "Supabase generation run repository treats empty and undefined-only patches as owned reads without timestamp writes",
            "Supabase generation run repository rejects invalid mutable values before any query",
            "Supabase generation run repository propagates lookup insert and update errors without partial fake-store writes",
            "Supabase generation run repository captures caller inputs and patches before asynchronous ownership lookups",
            "Supabase generation run repository does not follow a run retargeted to another canvas before its update",
            "Supabase generation run repository matches and snapshots the expected status before ownership lookups",
            "Supabase generation run repository returns null on a status mismatch without a fallback or completed-run overwrite",
            "Supabase generation run repository preserves a competing completion that wins between the read and conditional update"
        ]
    },
    "tests/unit/supabase-child-generation.test.ts": {
        "sha256": "7f3c5ba6187964e9671c3f3c8e5f6b06289d8a18bb94fde0c96d0380db073d91",
        "cases": [
            "request-bound Supabase child generation creates complete child metadata with authenticated storage and fresh same-canvas parents",
            "request-bound Supabase child generation uses the supplied prompt and configured Blob without selecting a local storage fallback",
            "request-bound Supabase child generation rejects duplicate parents and malformed input before auth or side effects",
            "request-bound Supabase child generation refuses a caller actor ID that differs from the authenticated client's user",
            "request-bound Supabase child generation refuses an unavailable canvas or any foreign parent without filtering it out",
            "request-bound Supabase child generation snapshots the requested identities before awaits so caller mutation cannot change the run",
            "request-bound Supabase child generation rechecks parent existence after model work before writing any storage object",
            "request-bound Supabase child generation retains the original object if ownership disappears before thumbnail or media publication",
            "request-bound Supabase child generation rejects unsupported oversized mismatched and undecodable model images before storage",
            "request-bound Supabase child generation records finite credential and model failures with running-only CAS and no raw provider detail",
            "request-bound Supabase child generation does not generate when the pending-to-running CAS outcome cannot be confirmed",
            "request-bound Supabase child generation retains an unacknowledged storage write and does not insert retry or delete",
            "request-bound Supabase child generation reconciles a lost media insertion response using only the predetermined exact child",
            "request-bound Supabase child generation leaves a missing or differently edited child unconfirmed without another insert",
            "request-bound Supabase child generation confirms a lost completion ACK only when the owned run and exact child both match",
            "request-bound Supabase child generation returns uncertainty without a failed overwrite when completion may arrive after its readback",
            "request-bound Supabase child generation does not overwrite a competing complete state while recording a pre-storage failure",
            "request-bound Supabase child generation reports an uncertain run creation without creating a replacement or starting generation",
            "request-bound Supabase child generation refuses a request already aborted before auth persistence or model work",
            "request-bound Supabase child generation passes one combined 45 second request deadline and zero retries to both model helpers",
            "request-bound Supabase child generation observes caller cancellation after the prompt without starting the image model",
            "request-bound Supabase child generation observes the shared deadline after an image response before metadata or storage",
            "request-bound Supabase child generation retains an in-flight storage result after deadline without starting thumbnail or media writes",
            "request-bound Supabase child generation does not start completion after an observed deadline during the media insertion ACK",
            "request-bound Supabase child generation recovers an already-complete exact receipt by readback after cancellation during its ACK"
        ]
    },
    "tests/unit/supabase-child-routes.test.ts": {
        "sha256": "239b9e2b08ddddd622fb64be9b66cafa7ffb92f5ae45828fcc88d564bd42677c",
        "cases": [
            "authenticated child-generation route boundaries returns 200 only for the awaited completed Supabase result",
            "authenticated child-generation route boundaries authenticates before parsing a generation body",
            "authenticated child-generation route boundaries refuses malformed JSON without creating or dispatching work",
            "authenticated child-generation route boundaries refuses fewer than two parents before the coordinator",
            "authenticated child-generation route boundaries derives the actor and client from authentication rather than request fields",
            "authenticated child-generation route boundaries returns an invalid-request refusal without local fallback",
            "authenticated child-generation route boundaries keeps missing and foreign scope behind the same 404",
            "authenticated child-generation route boundaries reports missing AI credentials without dispatching a workflow",
            "authenticated child-generation route boundaries retains the known run ID for an unconfirmed write and never regenerates",
            "authenticated child-generation route boundaries reports a definite coordinator failure separately from uncertainty",
            "authenticated child-generation route boundaries does not expose an unexpected provider error or fall back to local work",
            "authenticated child-generation route boundaries reads a saved run only with the verified actor and request client",
            "authenticated child-generation route boundaries never asks the global engine when an owned-run lookup returns missing",
            "authenticated child-generation route boundaries keeps status lookup errors private and never probes the local repository",
            "authenticated child-generation route boundaries denies unauthenticated status requests before any run lookup",
            "authenticated child-generation route boundaries refuses unsupported Supabase event streaming only after owned lookup",
            "authenticated child-generation route boundaries does not reveal whether a foreign run has an event stream",
            "authenticated child-generation route boundaries denies unauthenticated events before the workflow engine",
            "authenticated child-generation route boundaries keeps event lookup failures private without engine fallback",
            "authenticated child-generation route boundaries retains the local queued-generation contract behind local admission",
            "authenticated child-generation route boundaries permits workflow status only after the request is admitted as local",
            "authenticated child-generation route boundaries retains the local saved-run fallback without using it for Supabase",
            "authenticated child-generation route boundaries retains the local SSE format behind local admission"
        ]
    },
    "tests/unit/supabase-child-ai.test.ts": {
        "sha256": "fd85a1588375101b9d2318161c4dc260922af13a6cde6906f982169c68cc6739",
        "cases": [
            "child generation SDK request policy passes the exact caller deadline and zero retries to prompt generation",
            "child generation SDK request policy passes the exact caller deadline and zero retries to image generation",
            "child generation SDK request policy preserves the existing local callers' unspecified SDK policy",
            "child generation SDK request policy refuses prompt generation without credentials before any SDK call",
            "child generation SDK request policy refuses image generation without credentials before any SDK call",
            "child generation SDK request policy keeps the disabled-AI gate even when credentials are available",
            "child generation SDK request policy propagates SDK rejection without invoking generation again"
        ]
    }
}
EXPECTED_COUNTS = {
    "tests/unit/supabase-generation-runs.test.ts": 21,
    "tests/unit/supabase-child-generation.test.ts": 25,
    "tests/unit/supabase-child-routes.test.ts": 23,
    "tests/unit/supabase-child-ai.test.ts": 7
}
EXPECTED_CASES = 76
AI_TEST = "tests/unit/supabase-child-ai.test.ts"
RUN_TESTS = {AI_TEST: TESTS[AI_TEST]}
FRESH_CASES = 7
SCOPED = ["lib/db/supabase-repository.ts", "lib/workflows/supabase-child-generation.ts", "lib/ai/service.ts",
          "app/api/generate-child/route.ts", "app/api/workflows/runs/[runId]/route.ts",
          "app/api/workflows/runs/[runId]/events/route.ts", "components/canvas/inspiration-canvas.tsx", *TESTS]
LINT_INPUTS = [AI_TEST]
STREAM_LIMIT, ZIP_LIMIT, ALL_ZIP_LIMIT, REPORT_LIMIT = 524288, 131072, 524288, 1500000
repo = Path.cwd().resolve()
source = os.environ["SOURCE_COMMIT"]
assert re.fullmatch(r"[0-9a-f]{40}", source)
assert os.environ.get("CI") == os.environ.get("GITHUB_ACTIONS") == "true"
assert os.environ.get("SUPABASE_GENERATION_PUBLIC_REPOSITORY") == "true"
assert os.environ.get("GITHUB_REPOSITORY") == REPOSITORY
assert os.environ.get("GITHUB_EVENT_NAME") == "create" and os.environ.get("GITHUB_REF") == "refs/heads/" + BRANCH
event = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_bytes())
assert event["ref"] == BRANCH and event["ref_type"] == "branch" and event["repository"]["private"] is False
assert os.uname().sysname == "Linux" and os.uname().machine == "x86_64"
assert all(re.fullmatch(r"[0-9a-f]{64}", v["sha256"]) and v["cases"] and len(v["cases"]) == len(set(v["cases"])) for v in TESTS.values()), "Unreviewed test manifest"
assert {name: len(item["cases"]) for name, item in TESTS.items()} == EXPECTED_COUNTS and sum(EXPECTED_COUNTS.values()) == EXPECTED_CASES
assert len(RUN_TESTS) == 1 and len(RUN_TESTS[AI_TEST]["cases"]) == FRESH_CASES
work_end = time.monotonic() + 1020
original_home = os.environ["HOME"]
assert Path(original_home).is_absolute() and Path(original_home).is_dir()


def sha(data):
    return hashlib.sha256(data).hexdigest()


def git(*args):
    return subprocess.check_output(["git", *args], cwd=repo, timeout=10)


def vector():
    head, index = {}, {}
    for row in git("ls-tree", "-rz", "--full-tree", "HEAD").split(b"\0"):
        if not row:
            continue
        fields, raw_name = row.split(b"\t", 1)
        mode, kind, blob = fields.decode().split(); name = raw_name.decode()
        assert kind == "blob" and mode in ["100644", "100755", "120000"]
        p = repo / name; info = p.lstat()
        for ancestor in p.parents:
            if ancestor == repo:
                break
            assert ancestor.is_dir() and not ancestor.is_symlink()
        assert stat.S_ISLNK(info.st_mode) if mode == "120000" else stat.S_ISREG(info.st_mode) and not p.is_symlink()
        data = os.fsencode(os.readlink(p)) if mode == "120000" else p.read_bytes()
        assert hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest() == blob
        if mode != "120000":
            assert bool(info.st_mode & 0o111) == (mode == "100755")
        head[name] = {"mode": mode, "blob": blob, "bytes": len(data), "sha256": sha(data)}
    for row in git("ls-files", "--stage", "-z").split(b"\0"):
        if row:
            fields, name = row.split(b"\t", 1); mode, blob, stage = fields.decode().split()
            assert stage == "0"; index[name.decode()] = {"mode": mode, "blob": blob}
    assert index == {n: {"mode": v["mode"], "blob": v["blob"]} for n, v in head.items()}
    assert not git("status", "--porcelain", "--untracked-files=all", "--ignored")
    return head


assert git("rev-parse", "HEAD").decode().strip() == source
before = vector()
assert before["package.json"]["sha256"] == PACKAGE_SHA and before["pnpm-lock.yaml"]["sha256"] == LOCK_SHA
assert all(before[p]["sha256"] == item["sha256"] for p, item in TESTS.items())
prior_bytes = (repo / PRIOR_PATH).read_bytes()
assert len(prior_bytes) == PRIOR_BYTES and sha(prior_bytes) == PRIOR_SHA
prior = json.loads(prior_bytes)
assert prior["sourceCommit"] == PRIOR_SOURCE and prior["passed"] is False and prior["interrupted"] is False
assert prior["expectedCases"] == EXPECTED_CASES and prior["expectedFileCounts"] == EXPECTED_COUNTS
assert prior["originalHomePreserved"] is True and prior["credentialEnvironmentInherited"] is False
prior_commands = prior["commands"]
assert len(prior_commands) == 7 and [item["exitCode"] for item in prior_commands] == [0, 0, 0, 0, 0, 0, 2]
assert len({item["pid"] for item in prior_commands}) == 7
prior_streams = []
for item in prior_commands:
    assert all(item[key] is True for key in ["reaped", "groupAbsent", "descriptorsClosed", "pipesEOF"])
    assert not any(item[key] for key in ["timedOut", "termSent", "killSent"])
    for name in ["stdout", "stderr"]:
        assert item[name]["eof"] is True; prior_streams.append(item[name])
prior_streams.append(prior["unitJson"])
assert len(prior_streams) == prior["originalCaptureCount"] == 15
assert sum(item["compressedBytes"] for item in prior_streams) <= ALL_ZIP_LIMIT
prior_decoded_bytes = 0
for item in prior_streams:
    assert item["complete"] is True and item["retained"] is True and item["encoding"] == "gzip-base64"
    packed = base64.b64decode(item["data"], validate=True)
    assert base64.b64encode(packed).decode() == item["data"] and len(packed) == item["compressedBytes"] <= ZIP_LIMIT
    decoder = zlib.decompressobj(31); original = decoder.decompress(packed, STREAM_LIMIT + 1)
    assert len(original) <= STREAM_LIMIT and decoder.eof and not decoder.unused_data and not decoder.unconsumed_tail
    assert len(original) == item["bytes"] == item["observedBytes"] and sha(original) == item["sha256"] == item["observedSha256"]
    prior_decoded_bytes += len(original)
    if item is prior["unitJson"]:
        assert json.loads(original) == prior["unitResults"]
assert prior_decoded_bytes == 32899
prior_unit = prior["unitResults"]
assert prior_unit["success"] is True and prior_unit["numTotalTests"] == prior_unit["numPassedTests"] == EXPECTED_CASES
assert all(prior_unit[key] == 0 for key in ["numFailedTests", "numPendingTests", "numTodoTests", "numFailedTestSuites", "numPendingTestSuites"])
assert prior_unit["numPassedTestSuites"] == prior_unit["numTotalTestSuites"]
assert len(prior_unit["testResults"]) == 4
old_app = Path(prior_commands[4]["argv"][1]).parents[2]
assert prior_commands[4]["argv"][1] == str(old_app / "node_modules/vitest/vitest.mjs")
assert prior_commands[5]["argv"][1] == str(old_app / "node_modules/eslint/bin/eslint.js") and prior_commands[5]["argv"][2:] == ["--no-cache", *SCOPED]
assert prior_commands[6]["argv"][1] == str(old_app / "node_modules/typescript/bin/tsc")
assert prior_commands[6]["argv"][2:] == ["--noEmit", "-p", str(old_app / ".generation-checks/tsconfig.json")]
prior_pairs = set()
for result in prior_unit["testResults"]:
    name = str(Path(result["name"]).relative_to(old_app)); assert name in TESTS and result["status"] == "passed"
    for case in result["assertionResults"]:
        key = (name, case["fullName"])
        assert key not in prior_pairs and case["status"] == "passed" and case["failureMessages"] == []
        prior_pairs.add(key)
assert prior_pairs == {(name, title) for name, entry in TESTS.items() for title in entry["cases"]}
assert prior["testManifest"][AI_TEST]["sha256"] == "06ec0ea28a8cb8e73f4f859186c5a5e45743c538c61cea1deb2291e9f53b3352"
for name, item in TESTS.items():
    assert prior["testManifest"][name]["cases"] == item["cases"]
    if name != AI_TEST:
        assert prior["testManifest"][name] == item
prior_export = prior["sourceExport"]["inputs"]
assert len(prior_export) == prior["sourceExport"]["files"] == 141 and sum(x["bytes"] for x in prior_export.values()) == prior["sourceExport"]["bytes"] == 1260336
assert before[AI_TEST]["mode"] == prior_export[AI_TEST]["mode"] == "100644"
assert all(before.get(name) == item for name, item in prior_export.items() if name != AI_TEST)
assert all(prior_export[name]["sha256"] == item["sha256"] for name, item in prior["testManifest"].items())
prior_vector = sha(json.dumps(prior["sourceFiles"], sort_keys=True, separators=(",", ":")).encode())
assert prior_vector == "31045c1981f03996fb69ea772d0f0254af55015cb917727ad2c543f2d161c204"
assert [item["label"] for item in prior["guards"]] == ["before-export", "after-install", "after-cleanup-barrier", "after-scratch-cleanup"]
assert all(item["unchanged"] is True and item["files"] == 1084 and item["bytes"] == 9511943 and item["vectorSha256"] == prior_vector for item in prior["guards"])
assert prior["processCleanup"]["passed"] is True and prior["processCleanup"]["owned"] == prior["processCleanup"]["uncertainPids"] == []
assert all(prior["processCleanup"][key] is True for key in ["allReaped", "allPipeEOF", "groupsAbsent"])
assert prior["trackedChildrenFinal"] == [{"pid": item["pid"], "reaped": True, "exitCode": item["exitCode"], "descriptorsClosed": True} for item in prior_commands]
assert prior["scratchIdentityMatches"] is True and prior["scratchRemoved"] is True and prior["cleanupSignals"] == []
carried_lint = [name for name in SCOPED if name != AI_TEST]
assert len(carried_lint) == 10 and all(before[name] == prior_export[name] for name in carried_lint)
previous_acceptance = {"receipt": PRIOR_PATH, "bytes": PRIOR_BYTES, "sha256": PRIOR_SHA, "sourceCommit": PRIOR_SOURCE,
    "overallPassed": False, "unitPassed": True, "historicalUnitCases": 76, "carriedUnitCases": 69,
    "carriedManifest": {name: entry for name, entry in prior["testManifest"].items() if name != AI_TEST},
    "carriedLintInputs": carried_lint, "historicalAICasesNotCarried": 7, "typecheckCarried": False,
    "originalCapturesVerified": 15, "decodedCaptureBytes": prior_decoded_bytes,
    "unchangedExportInputs": 140, "changedExportInputs": {AI_TEST: {"accepted": prior_export[AI_TEST], "current": before[AI_TEST],
        "reason": "Complete typed MediaItem fixture replaces the incomplete cast; all seven literal identities remain exact"}},
    "carriedUnitCasesReexecuted": 0, "changedAIIdentitiesReexecuted": 7,
    "limit": "No current 76-case invocation: 69 historical identities plus 7 fresh identities across editions; the first 76-unit invocation passed inside an overall failed packet"}
parent = Path(os.environ["RUNNER_TEMP"]).resolve(strict=True)
assert parent.is_dir() and parent.stat().st_uid == os.getuid()
os.umask(0o077)
root = Path(tempfile.mkdtemp(prefix="canvas-supabase-generation-", dir=parent))
identity = root.stat(); nonce = uuid.uuid4().hex
(root / ".owner").write_text(nonce)
marker_identity = (root / ".owner").stat()
for name in ["app", "tools", "tmp", "cache", "config", "data", "state", "store", "outputs", "bin"]:
    (root / name).mkdir(mode=0o700)
app = root / "app"
for name in ["npm-user", "npm-global"]:
    (root / name).write_text("")
node = str(Path(shutil.which("node")).resolve(strict=True))
env = {"PATH": str(Path(node).parent) + ":/usr/bin:/bin", "HOME": original_home, "CI": "true", "LANG": "C.UTF-8", "TZ": "UTC",
       "NO_COLOR": "1", "TMPDIR": str(root / "tmp"), "TMP": str(root / "tmp"), "TEMP": str(root / "tmp"),
       "XDG_CACHE_HOME": str(root / "cache"), "XDG_CONFIG_HOME": str(root / "config"), "XDG_DATA_HOME": str(root / "data"),
       "XDG_STATE_HOME": str(root / "state"), "PNPM_HOME": str(root / "bin"), "NODE_COMPILE_CACHE": str(root / "cache/node"),
       "npm_config_userconfig": str(root / "npm-user"), "npm_config_globalconfig": str(root / "npm-global"),
       "npm_config_cache": str(root / "cache/npm"), "npm_config_registry": "https://registry.npmjs.org/",
       "npm_config_audit": "false", "npm_config_fund": "false", "npm_config_update_notifier": "false",
       "GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_GLOBAL": "/dev/null", "GIT_TERMINAL_PROMPT": "0", "GIT_OPTIONAL_LOCKS": "0",
       "ENABLE_AI": "false", "ENABLE_EVE_DEV": "false", "ENABLE_BLOB_STORAGE": "false", "LOCAL_PERSISTENCE_ENABLED": "false",
       "NEXT_TELEMETRY_DISABLED": "1", "DO_NOT_TRACK": "1", "PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD": "1"}
report = {"schemaVersion": 1, "sourceCommit": source, "startedAt": time.time(), "passed": False, "commands": [], "guards": [],
          "sourceFiles": before, "testManifest": TESTS, "fullManifestCases": EXPECTED_CASES, "fullManifestFileCounts": EXPECTED_COUNTS,
          "freshManifest": RUN_TESTS, "expectedCases": FRESH_CASES, "expectedFileCounts": {AI_TEST: FRESH_CASES}, "previousAcceptance": previous_acceptance,
          "scope": "Seven fresh authored AI SDK-mock identities plus changed-test lint and full scoped types; 69 historical units/10 lint inputs referenced separately; no real provider/model/DB/server/browser/build",
          "limits": {"workSeconds": 1020, "cleanupSeconds": 90, "jobMinutes": 20, "streamBytes": STREAM_LIMIT, "gzipBytes": ZIP_LIMIT,
                     "allGzipBytes": ALL_ZIP_LIMIT, "reportBytes": REPORT_LIMIT}, "originalHomePreserved": True, "credentialEnvironmentInherited": False,
          "oldTestsExecuted": 0, "oldTestsScope": "Unrelated transfer/PostgreSQL/crop/metadata suites", "errors": [], "proofLimits": ["SDK/storage/auth leaves are authored mocks, not hosted Supabase/RLS/model proof",
          "Registry/tool downloads are setup traffic; unit-process network tripwires are not an OS egress sandbox"]}
export, groups, processes = {}, {}, []
zip_total, interrupted = 0, False


def guard(label):
    current = vector(); assert current == before, "Canonical source changed"
    report["guards"].append({"label": label, "files": len(current), "bytes": sum(x["bytes"] for x in current.values()),
                             "vectorSha256": sha(json.dumps(current, sort_keys=True, separators=(",", ":")).encode()), "unchanged": True})


def exported():
    assert all((app / n).is_file() and not (app / n).is_symlink() and sha((app / n).read_bytes()) == v["sha256"]
               and bool((app / n).stat().st_mode & 0o111) == (v["mode"] == "100755") for n, v in export.items()), "Export input changed"


def proc_info(pid):
    p = Path("/proc") / str(pid); a = (p / "stat").read_text(); fields = a[a.rfind(")") + 2:].split()
    assert len(fields) >= 20
    return {"pid": pid, "startTime": fields[19], "pgid": int(fields[2]), "state": fields[0], "uid": p.stat().st_uid}


baseline = {}
for p in Path("/proc").iterdir():
    if p.name.isdigit():
        try:
            item = proc_info(int(p.name)); baseline[item["pid"]] = item["startTime"]
        except (FileNotFoundError, ProcessLookupError):
            pass


def owned():
    rows, uncertain = [], []
    for p in Path("/proc").iterdir():
        if not p.name.isdigit():
            continue
        try:
            item = proc_info(int(p.name))
            if item["uid"] != os.getuid() or baseline.get(item["pid"]) == item["startTime"] or item["state"] == "Z":
                continue
            cwd = Path(os.readlink(p / "cwd")); exe = Path(os.readlink(p / "exe"))
            original_group = False
            if item["pgid"] in groups:
                try:
                    leader = proc_info(item["pgid"])
                    if leader["startTime"] != groups[item["pgid"]]:
                        uncertain.append(item["pid"]); continue
                    original_group = True
                except (FileNotFoundError, ProcessLookupError):
                    pass
            scoped_path = cwd == root or root in cwd.parents or root in exe.parents
            if original_group or scoped_path:
                assert proc_info(item["pid"])["startTime"] == item["startTime"]; rows.append(item)
            elif item["pgid"] in groups:
                uncertain.append(item["pid"])
        except (FileNotFoundError, ProcessLookupError):
            pass
        except (OSError, ValueError, AssertionError):
            uncertain.append(int(p.name))
    assert len(rows) <= 64 and len(uncertain) <= 64
    return rows, uncertain


def group_gone(pid):
    try:
        os.killpg(pid, 0); return False
    except ProcessLookupError:
        return True


def signal_original_group(pid, signum):
    if group_gone(pid):
        return False
    try:
        leader = proc_info(pid)
        assert leader["uid"] == os.getuid() and leader["startTime"] == groups[pid]
        os.killpg(pid, signum); return True
    except (FileNotFoundError, ProcessLookupError):
        return False


def capture(data, observed, digest, complete):
    global zip_total
    z = gzip.compress(data, mtime=0)
    item = {"encoding": "gzip-base64", "bytes": len(data), "sha256": sha(data), "observedBytes": observed,
            "observedSha256": digest, "complete": complete and observed == len(data)}
    if len(z) <= ZIP_LIMIT and zip_total + len(z) <= ALL_ZIP_LIMIT:
        zip_total += len(z); item.update({"compressedBytes": len(z), "data": base64.b64encode(z).decode(), "retained": True})
    else:
        item.update({"retained": False, "complete": False})
    return item


def run(argv, seconds):
    assert not interrupted and time.monotonic() < work_end
    start = time.monotonic(); deadline = min(work_end, start + seconds)
    p = subprocess.Popen(argv, cwd=app, env=env, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
    processes.append(p); groups[p.pid] = proc_info(p.pid)["startTime"]
    row = {"argv": argv, "pid": p.pid, "startTime": groups[p.pid], "timedOut": False, "termSent": False, "killSent": False, "killAttempted": False}
    report["commands"].append(row); sel = selectors.DefaultSelector()
    pipes = {"stdout": {"data": bytearray(), "digest": hashlib.sha256(), "observed": 0, "eof": False},
             "stderr": {"data": bytearray(), "digest": hashlib.sha256(), "observed": 0, "eof": False}}
    for name, pipe in [("stdout", p.stdout), ("stderr", p.stderr)]:
        os.set_blocking(pipe.fileno(), False); sel.register(pipe, selectors.EVENT_READ, name)
    stopped = None
    try:
        while sel.get_map() or p.poll() is None:
            now = time.monotonic(); overflow = any(x["observed"] > STREAM_LIMIT for x in pipes.values())
            if stopped is None and (interrupted or overflow or now >= deadline):
                row["timedOut"] = now >= deadline; stopped = now
                row["termSent"] = signal_original_group(p.pid, signal.SIGTERM)
            if stopped is not None and now >= stopped + 5 and not row["killAttempted"]:
                row["killAttempted"] = True
                row["killSent"] = signal_original_group(p.pid, signal.SIGKILL)
            if stopped is not None and now >= stopped + 6.5:
                break
            for key, _ in sel.select(0.05):
                chunk = os.read(key.fileobj.fileno(), 65536); state = pipes[key.data]
                if not chunk:
                    state["eof"] = True; sel.unregister(key.fileobj); key.fileobj.close(); continue
                state["observed"] += len(chunk); state["digest"].update(chunk)
                state["data"].extend(chunk[:max(0, STREAM_LIMIT - len(state["data"]))])
        try:
            p.wait(timeout=0.2)
        except subprocess.TimeoutExpired:
            pass
    finally:
        sel.close()
        for pipe in [p.stdout, p.stderr]:
            pipe.close()
        row.update({"seconds": round(time.monotonic() - start, 3), "exitCode": p.returncode, "reaped": p.returncode is not None,
                    "groupAbsent": group_gone(p.pid), "descriptorsClosed": p.stdout.closed and p.stderr.closed,
                    "pipesEOF": all(state["eof"] for state in pipes.values())})
        for name, state in pipes.items():
            row[name] = capture(bytes(state["data"]), state["observed"], state["digest"].hexdigest(), state["eof"])
            row[name]["eof"] = state["eof"]
    assert row["exitCode"] == 0 and row["reaped"] and row["groupAbsent"] and row["descriptorsClosed"]
    assert not row["timedOut"] and not row["termSent"] and not row["killSent"]
    assert all(row[n]["complete"] and row[n]["retained"] for n in pipes)
    exported()
    return bytes(pipes["stdout"]["data"])


def stop_handler(_signal, _frame):
    global interrupted
    interrupted = True


def error_location(error):
    return [{"file": Path(item.filename).name, "line": item.lineno, "function": item.name}
            for item in traceback.extract_tb(error.__traceback__)[-8:]]


def reap_tracked():
    result = []
    for p in processes:
        if p.poll() is not None:
            p.wait()
            for pipe in [p.stdout, p.stderr]:
                pipe.close()
        result.append({"pid": p.pid, "reaped": p.returncode is not None, "exitCode": p.returncode,
                       "descriptorsClosed": p.stdout.closed and p.stderr.closed})
    return result


def wait_for_closure(seconds, deadline):
    end = min(time.monotonic() + seconds, deadline)
    while True:
        tracked = reap_tracked(); rows, uncertain = owned()
        if (not rows and not uncertain and all(x["reaped"] for x in tracked) and all(group_gone(pid) for pid in groups)) or time.monotonic() >= end:
            return rows, uncertain, tracked
        time.sleep(min(0.05, max(0, end - time.monotonic())))


def signal_owned_rows(rows, signum):
    for item in rows:
        try:
            current = proc_info(item["pid"])
            assert current["uid"] == os.getuid() and current["startTime"] == item["startTime"]
            fresh, uncertain = owned()
            assert not uncertain and any(x["pid"] == item["pid"] and x["startTime"] == item["startTime"] for x in fresh)
            os.kill(item["pid"], signum)
            report["cleanupSignals"].append({"pid": item["pid"], "startTime": item["startTime"], "signal": signum})
        except (FileNotFoundError, ProcessLookupError):
            pass


for sig in [signal.SIGINT, signal.SIGTERM, signal.SIGHUP]:
    signal.signal(sig, stop_handler)


ok = False
try:
    guard("before-export")
    configs = {"package.json", "pnpm-lock.yaml", "tsconfig.json", "vitest.config.ts", "eslint.config.mjs", "next-env.d.ts"}
    names = [n for n in before if n.startswith(("app/", "components/", "hooks/", "lib/", "agent/", "workflows/")) or n in configs or n in TESTS]
    assert len(names) <= 1500 and sum(before[n]["bytes"] for n in names) <= 32 * 1024 * 1024 and set(SCOPED) <= set(names)
    assert set(names) == set(prior_export), "Changed export membership"
    for name in names:
        assert before[name]["mode"] != "120000"
        for ancestor in (repo / name).parents:
            if ancestor == repo:
                break
            assert not ancestor.is_symlink()
        target = app / name; target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(repo / name, target); target.chmod(0o755 if before[name]["mode"] == "100755" else 0o644); export[name] = before[name]
    report["sourceExport"] = {"inputs": export, "files": len(export), "bytes": sum(v["bytes"] for v in export.values())}
    assert run([node, "--version"], 15).strip() == b"v24.21.0"
    report["node"] = {"version": "24.21.0", "sha256": sha(Path(node).read_bytes()), "testCommandsUseExplicitBinary": True}
    binary = root / "tools/pnpm"; downloader = root / "tools/download-pnpm.py"
    downloader.write_text('''import hashlib,json,signal,sys,time,urllib.parse,urllib.request
from pathlib import Path
url,destination,expected_bytes,expected_sha=sys.argv[1:];expected_bytes=int(expected_bytes)
hosts=[];deadline=time.monotonic()+90
def expired(*_):raise TimeoutError('download deadline')
signal.signal(signal.SIGALRM,expired);signal.setitimer(signal.ITIMER_REAL,90)
class Redirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,request,fp,code,message,headers,new_url):
  u=urllib.parse.urlsplit(new_url)
  assert code in [301,302,303,307,308] and u.scheme=='https' and u.port in [None,443] and not u.username and not u.password and not u.fragment
  assert u.hostname in ['github.com','release-assets.githubusercontent.com','objects.githubusercontent.com'] and len(hosts)<3
  hosts.append(u.hostname);return super().redirect_request(request,fp,code,message,headers,new_url)
try:
 opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),Redirect())
 with opener.open(url,timeout=8) as response,Path(destination).open('xb') as target:
  assert response.status==200;size=0;digest=hashlib.sha256()
  while chunk:=response.read(262144):
   size+=len(chunk);assert size<=expected_bytes and time.monotonic()<deadline
   digest.update(chunk);target.write(chunk)
 assert size==expected_bytes and digest.hexdigest()==expected_sha and time.monotonic()<deadline
 signal.setitimer(signal.ITIMER_REAL,0)
 print(json.dumps({'bytes':size,'sha256':digest.hexdigest(),'redirectHosts':hosts}),flush=True)
except Exception as error:
 print(json.dumps({'error':type(error).__name__,'httpStatus':getattr(error,'code',None) if isinstance(getattr(error,'code',None),int) else None}),flush=True)
 sys.exit(1)
''')
    download = json.loads(run([str(Path(sys.executable).resolve()), str(downloader), PNPM_URL, str(binary), str(PNPM_BYTES), PNPM_SHA], 95))
    info = binary.lstat()
    assert stat.S_ISREG(info.st_mode) and not binary.is_symlink() and info.st_uid == os.getuid() and info.st_size == PNPM_BYTES
    data = binary.read_bytes(); after = binary.lstat()
    assert (info.st_dev, info.st_ino, info.st_size) == (after.st_dev, after.st_ino, after.st_size) and len(data) == PNPM_BYTES and sha(data) == PNPM_SHA
    assert download["bytes"] == PNPM_BYTES and download["sha256"] == PNPM_SHA and len(download["redirectHosts"]) <= 3
    assert all(host in ["github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com"] for host in download["redirectHosts"])
    binary.chmod(0o700)
    assert run([str(binary), "--version"], 15).strip() == b"10.24.0"
    report["pnpm"] = {"version": "10.24.0", "bytes": len(data), "sha256": PNPM_SHA, "asset": PNPM_URL,
                      "digestSource": "https://github.com/pnpm/pnpm/releases/tag/v10.24.0", "redirectHosts": download["redirectHosts"],
                      "downloadChildSeconds": 95, "downloadInternalSeconds": 90, "downloadScriptSha256": sha(downloader.read_bytes())}
    run([str(binary), "install", "--frozen-lockfile", "--ignore-scripts", "--store-dir", str(root / "store")], 300)
    guard("after-install")
    generated = app / ".generation-checks"; generated.mkdir(mode=0o700)
    (generated / "network.mjs").write_text('''import { afterAll } from 'vitest';
import net from 'node:net'; import tls from 'node:tls'; import http from 'node:http'; import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';
let blocked = 0; const deny = () => { blocked++; throw new Error('Unit network boundary denied'); };
globalThis.fetch = deny; net.connect = deny; net.createConnection = deny; net.Socket.prototype.connect = deny;
tls.connect = deny; http.request = deny; http.get = deny; https.request = deny; https.get = deny;
syncBuiltinESMExports(); afterAll(() => { if (blocked !== 0) throw new Error('Unexpected unit network attempt'); });
''')
    (generated / "vitest.mts").write_text("import {defineConfig} from 'vitest/config';\nexport default defineConfig(" + json.dumps({
        "test": {"environment": "node", "include": list(RUN_TESTS), "setupFiles": ["./.generation-checks/network.mjs"],
                 "pool": "threads", "fileParallelism": False, "maxWorkers": 1, "retry": 0, "testTimeout": 10000, "hookTimeout": 10000},
        "resolve": {"alias": {"@": str(app)}}}) + ");\n")
    (generated / "tsconfig.json").write_text(json.dumps({"extends": "../tsconfig.json", "include": ["../" + n for n in SCOPED],
        "exclude": ["../node_modules"], "compilerOptions": {"incremental": False, "plugins": []}}))
    result_file = root / "outputs/vitest.json"
    unit_command_error = None
    try:
        run([node, str(app / "node_modules/vitest/vitest.mjs"), "run", "--config", str(generated / "vitest.mts"),
             "--reporter=json", "--outputFile=" + str(result_file)], 180)
    except Exception as error:
        unit_command_error = type(error).__name__
        report["unitCommandError"] = unit_command_error
    info = result_file.lstat(); assert stat.S_ISREG(info.st_mode) and not result_file.is_symlink() and info.st_uid == os.getuid() and info.st_size <= STREAM_LIMIT
    data = result_file.read_bytes(); report["unitJson"] = capture(data, len(data), sha(data), True); value = json.loads(data)
    report["unitResults"] = value; expected = {(path, title) for path, entry in RUN_TESTS.items() for title in entry["cases"]}; actual = set()
    assert unit_command_error is None, "Unit command failed; original JSON retained"
    assert value["success"] is True and value["numTotalTests"] == value["numPassedTests"] == len(expected)
    assert value["numFailedTests"] == value.get("numPendingTests", 0) == value.get("numTodoTests", 0) == 0
    assert len(expected) == FRESH_CASES and len(value["testResults"]) == 1
    for item in value["testResults"]:
        name = str(Path(item["name"]).resolve().relative_to(app)); assert name in RUN_TESTS and item["status"] == "passed"
        for case in item["assertionResults"]:
            key = (name, case["fullName"]); assert case["status"] == "passed" and not case["failureMessages"] and key not in actual
            actual.add(key)
    assert actual == expected and report["unitJson"]["complete"] and report["unitJson"]["retained"]
    report["freshUnitCasesPassed"] = len(actual)
    run([node, str(app / "node_modules/eslint/bin/eslint.js"), "--no-cache", *LINT_INPUTS], 120)
    run([node, str(app / "node_modules/typescript/bin/tsc"), "--noEmit", "-p", str(generated / "tsconfig.json")], 120)
    guard("after-checks"); ok = True
except Exception as error:
    report["errors"].append(type(error).__name__)
    report["errorLocation"] = error_location(error)
finally:
    cleanup_end = min(time.monotonic() + 90, work_end + 90)
    try:
        rows, uncertain = owned(); report["residualBeforeCleanup"] = {"owned": rows, "uncertainPids": uncertain}
        report["cleanupSignals"] = []
        grace_started = time.monotonic()
        rows, grace_uncertain, tracked = wait_for_closure(2, cleanup_end - 14)
        report["normalGrace"] = {"limitSeconds": 2, "elapsedSeconds": round(time.monotonic() - grace_started, 3),
                                 "ownedAfter": rows, "uncertainPids": grace_uncertain}
        if rows and not grace_uncertain:
            signal_owned_rows(rows, signal.SIGTERM)
        rows, term_uncertain, tracked = wait_for_closure(5, cleanup_end - 8)
        report["afterCleanupTERM"] = {"owned": rows, "uncertainPids": term_uncertain}
        if rows and not term_uncertain:
            signal_owned_rows(rows, signal.SIGKILL)
        final_rows, final_uncertain, tracked = wait_for_closure(5, cleanup_end - 2)
        all_reaped = len(tracked) == len(processes) and all(x["reaped"] and x["descriptorsClosed"] for x in tracked)
        all_eof = len(report["commands"]) == len(processes) and all(c.get("pipesEOF") is True and c.get("descriptorsClosed") is True for c in report["commands"])
        groups_absent = all(group_gone(pid) for pid in groups)
        unknown_observed = any([uncertain, grace_uncertain, term_uncertain, final_uncertain])
        report["processCleanup"] = {"owned": final_rows, "uncertainPids": final_uncertain, "trackedChildren": tracked,
            "allReaped": all_reaped, "allPipeEOF": all_eof, "groupsAbsent": groups_absent,
            "passed": not report["cleanupSignals"] and not unknown_observed and not final_rows and all_reaped and all_eof and groups_absent}
        try:
            exported(); guard("after-cleanup-barrier")
        except Exception as error:
            report["errors"].append("final_guard_" + type(error).__name__)
        marker = root / ".owner"; current = root.lstat()
        identity_ok = (current.st_dev, current.st_ino, current.st_uid) == (identity.st_dev, identity.st_ino, identity.st_uid)
        identity_ok = identity_ok and stat.S_ISDIR(current.st_mode) and stat.S_IMODE(current.st_mode) == 0o700 and root.parent == parent and not root.is_symlink()
        item = marker.lstat()
        identity_ok = identity_ok and stat.S_ISREG(item.st_mode) and stat.S_IMODE(item.st_mode) == 0o600 and not marker.is_symlink()
        identity_ok = identity_ok and (item.st_dev, item.st_ino, item.st_uid) == (marker_identity.st_dev, marker_identity.st_ino, os.getuid()) and marker.read_text() == nonce
        report["scratchIdentityMatches"] = identity_ok
        if identity_ok and not final_rows and not final_uncertain and all_reaped and all_eof and groups_absent:
            shutil.rmtree(root)
        report["scratchRemoved"] = not root.exists(); guard("after-scratch-cleanup")
    except Exception as error:
        report["errors"].append("cleanup_" + type(error).__name__)
        report["cleanupErrorLocation"] = error_location(error)
    finally:
        try:
            report["trackedChildrenFinal"] = reap_tracked()
            if any(not item["reaped"] or not item["descriptorsClosed"] for item in report["trackedChildrenFinal"]):
                report["errors"].append("tracked_child_closure_unverified")
        except Exception as error:
            report["errors"].append("reap_" + type(error).__name__)
    report["finishedAt"] = time.time(); report["interrupted"] = interrupted
    report["originalCaptureCount"] = len(report["commands"]) * 2 + int("unitJson" in report)
    report["passed"] = ok and not report["errors"] and not interrupted and report.get("processCleanup", {}).get("passed") is True and report.get("scratchRemoved") is True
    report["passed"] = report["passed"] and all(c["exitCode"] == 0 and not c["termSent"] and not c["killSent"] and c["stdout"]["complete"] and c["stderr"]["complete"] for c in report["commands"])
    payload = json.dumps(report, separators=(",", ":")).encode()
    if len(payload) > REPORT_LIMIT or time.monotonic() > work_end + 90:
        payload = json.dumps({"sourceCommit": source, "passed": False, "errors": ["report_or_deadline_limit"]}).encode(); report["passed"] = False
    signal.signal(signal.SIGALRM, lambda *_: os._exit(1)); signal.setitimer(signal.ITIMER_REAL, 2)
    pending = memoryview(b"CANVAS_SUPABASE_GENERATION_RESULT=" + payload + b"\n")
    while pending:
        pending = pending[os.write(1, pending):]
    signal.setitimer(signal.ITIMER_REAL, 0)
raise SystemExit(0 if report["passed"] else 1)
