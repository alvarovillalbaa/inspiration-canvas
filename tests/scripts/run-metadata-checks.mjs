import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { gzipSync } from "node:zlib";

const SEAL = "docs/results/2026/11-04/metadata-checks-source.json";
const OLD = "docs/results/2026/10-29/metadata-controls-inventory.json";
const OLD_HASH = "115d3b0d38806c0ca05024a6f02d13ed04cd8fc54326e7dcd3ac90eb1662906e";
const OLD_BLOB = "8bd3d3b5ebfa9dff8a95000c91ef88e26697da31";
const CONFIG = ".metadata-v2.playwright.config.ts";
const ACTIVE = ".github/workflows/metadata-checks-v2.yml";
const GENERATED = ["node_modules", ".next", "next-env.d.ts", "app/.well-known/workflow", ".eve", ".output"];
const STREAM_LIMIT = 524288, REPORT_LIMIT = 262144;
const hash = (bytes, algorithm = "sha256") => createHash(algorithm).update(bytes).digest("hex");
const blob = bytes => hash(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes]), "sha1");
const need = (value, message) => { if (!value) throw new Error(message); };
const errorCode = error => /^[a-z0-9_]+$/.test(error?.message ?? "") ? error.message : "controller_error";
const sourceCommit = process.argv[3];
need(process.argv.length === 4 && process.argv[2] === "--source-commit" && /^[a-f0-9]{40}$/.test(sourceCommit ?? ""), "source_pin_required");
need(process.version === "v24.21.0" && process.platform === "linux" && process.env.GITHUB_ACTIONS === "true"
  && process.env.GITHUB_REPOSITORY === "alvarovillalbaa/inspiration-canvas" && process.env.GITHUB_EVENT_NAME === "create"
  && process.env.GITHUB_REF === "refs/heads/qa/metadata-combobox-20261104"
  && process.env.METADATA_PUBLIC_REPOSITORY === "true" && process.env.METADATA_CREATED_REF_TYPE === "branch", "approved_public_ci_required");
const repo = fs.realpathSync(process.cwd()), parent = fs.realpathSync(process.env.RUNNER_TEMP ?? "");
need(path.isAbsolute(parent) && fs.statSync(parent).isDirectory(), "runner_temp_invalid");
const root = fs.mkdtempSync(path.join(parent, "metadata-checks-")), identity = fs.lstatSync(root), nonce = randomUUID();
fs.writeFileSync(path.join(root, "owner"), nonce, { flag: "wx", mode: 0o600 });
for (const name of ["tmp", "cache", "config", "pnpm", "corepack", "browsers", "output", "uploads"]) fs.mkdirSync(path.join(root, name), { mode: 0o700 });
for (const name of ["npm-user", "npm-global"]) fs.writeFileSync(path.join(root, name), "", { flag: "wx", mode: 0o600 });
const outputParent = path.join(root, "output"), outputDirectory = path.join(outputParent, "results"), reportPath = path.join(root, "playwright.json");
const outputIdentity = fs.lstatSync(outputParent);
const env = { PATH: process.env.PATH, HOME: process.env.HOME, LANG: "C.UTF-8", TZ: "UTC", CI: "true", NO_COLOR: "1",
  TMPDIR: path.join(root, "tmp"), TMP: path.join(root, "tmp"), TEMP: path.join(root, "tmp"),
  XDG_CACHE_HOME: path.join(root, "cache"), XDG_CONFIG_HOME: path.join(root, "config"),
  NODE_COMPILE_CACHE: path.join(root, "cache", "node"), COREPACK_HOME: path.join(root, "corepack"),
  COREPACK_ENABLE_DOWNLOAD_PROMPT: "0", PNPM_HOME: path.join(root, "pnpm"),
  npm_config_userconfig: path.join(root, "npm-user"), npm_config_globalconfig: path.join(root, "npm-global"),
  npm_config_cache: path.join(root, "cache", "npm"), npm_config_registry: "https://registry.npmjs.org/",
  npm_config_audit: "false", npm_config_fund: "false", npm_config_update_notifier: "false",
  PLAYWRIGHT_BROWSERS_PATH: path.join(root, "browsers"), DEBIAN_FRONTEND: "noninteractive",
  NEXT_TELEMETRY_DISABLED: "1", DO_NOT_TRACK: "1", ENABLE_AI: "false", ENABLE_EVE_DEV: "false",
  ENABLE_BLOB_STORAGE: "false", STORAGE_DRIVER: "local", DATABASE_URL: `file:${path.join(root, "unexpected.db")}`,
  UPLOAD_DIR: path.join(root, "uploads"), NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "", SUPABASE_SERVICE_ROLE_KEY: "", BLOB_READ_WRITE_TOKEN: "",
  AI_GATEWAY_API_KEY: "", VERCEL_OIDC_TOKEN: "", OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "",
  GOOGLE_GENERATIVE_AI_API_KEY: "", GOOGLE_API_KEY: "" };
const report = { schemaVersion: "inspiration.metadata-checks.v2", sourceCommit, status: "failed", startedAtUtc: new Date().toISOString(),
  runtime: { node: process.version, platform: process.platform, architecture: process.arch },
  limits: { workSeconds: 780, cleanupSeconds: 60, finalStdoutSeconds: 2, jobMinutes: 15, streamBytes: STREAM_LIMIT,
    reportBytes: REPORT_LIMIT, playwrightReportBytes: 1048576, playwrightGzipBytes: 131072, termToKillSeconds: 3, drainAfterKillSeconds: 3 },
  scope: { file: "tests/e2e/metadata.spec.ts", cases: 8, desktop: 6, narrowTouch: 2, workers: 1, retries: 0,
    caseTimeoutMs: 45000, globalTimeoutMs: 420000, serverStartupTimeoutMs: 120000, port: 3100 },
  commands: [], guards: [], generated: [], errors: [],
  proofLimits: ["Full application browser checks use authored PNGs and fresh anonymous browser contexts; no crop cases, accounts, AI or live database.",
    "The unchanged test fixture blocks non-read HTTP methods; it does not establish loopback-only reads or WebSocket isolation.",
    "Playwright owns its web server/browser contexts. Normal runner exit, original process-group absence and port closure are observed; escaped descendant sessions are not independently inventoried.",
    "Userspace deadlines do not interrupt blocked kernel filesystem calls. Executable hashes do not inventory dynamic libraries."] };
const workEnd = Date.now() + 780000;
let cleanupEnd, interrupted = false, manifest, historical, corepack, configIdentity, browserStarted = false, browserRow, parsedReport = false;
const handlers = new Map(["SIGINT", "SIGTERM", "SIGHUP"].map(signal => {
  const handler = () => { interrupted = true; }; process.on(signal, handler); return [signal, handler];
}));
const terminalTimer = setTimeout(() => { process.stderr.write("controller_global_deadline\n"); finish(1); }, Math.max(1, workEnd + 62000 - Date.now()));
function owner() {
  const a = fs.lstatSync(root), marker = path.join(root, "owner");
  need(path.dirname(root) === parent && a.isDirectory() && !a.isSymbolicLink() && a.dev === identity.dev && a.ino === identity.ino
    && !fs.lstatSync(marker).isSymbolicLink() && fs.readFileSync(marker, "utf8") === nonce, "scratch_identity_changed");
}
function read(file, maximum = 16777216) {
  const a = fs.lstatSync(file); need(a.isFile() && !a.isSymbolicLink() && a.size <= maximum, "file_type_or_bound");
  const bytes = fs.readFileSync(file), b = fs.lstatSync(file);
  need(a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs && bytes.length === a.size, "file_changed"); return bytes;
}
function clean(value, maximum = 700) {
  let text = String(value ?? "").replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
  for (const [from, to] of [[root, "[scratch]"], [repo, "[repository]"], [process.env.HOME, "[runner-home]"]]) if (from) text = text.split(from).join(to);
  return Buffer.from(text).subarray(0, maximum).toString("utf8");
}
function absent(pid) { try { process.kill(-pid, 0); return false; } catch (error) { return error.code === "ESRCH" ? true : null; } }
async function run(label, executable, args, seconds, { cleanup = false, quiet = false, exits = [0] } = {}) {
  owner(); need(cleanup || !interrupted, "interrupted_before_command");
  const remaining = (cleanup ? cleanupEnd : workEnd) - Date.now() - 6000; need(remaining > 0, "command_budget_exhausted");
  const child = spawn(executable, args, { cwd: repo, env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
  const parts = [[], []], counts = [0, 0], sizes = [0, 0], hashes = [createHash("sha256"), createHash("sha256")];
  let exitCode = null, signal = null, exited = false, closed = false, reason = null, stopAt = null, term = false, killed = false, captureFinished = false;
  let poll, killTimer, drainTimer, stop;
  await new Promise(resolve => {
    stop = why => {
      if (reason) return; reason = why; stopAt = Date.now(); term = true;
      try { process.kill(-child.pid, "SIGTERM"); } catch {}
      killTimer = setTimeout(() => { killed = true; try { process.kill(-child.pid, "SIGKILL"); } catch {} }, 3000);
      drainTimer = setTimeout(() => { child.stdout.destroy(); child.stderr.destroy(); resolve(); }, 6000);
    };
    [child.stdout, child.stderr].forEach((stream, index) => stream.on("data", chunk => {
      if (captureFinished) return;
      counts[index] += chunk.length; hashes[index].update(chunk);
      const bytes = chunk.subarray(0, Math.max(0, STREAM_LIMIT - sizes[index])); parts[index].push(bytes); sizes[index] += bytes.length;
      if (counts[index] > STREAM_LIMIT) stop("stream_limit");
    }));
    child.once("error", () => { if (child.pid) stop("spawn_failed"); else reason = "spawn_failed"; resolve(); });
    child.once("exit", (value, received) => { exitCode = value; signal = received; exited = true; });
    child.once("close", () => { closed = true; resolve(); });
    const started = Date.now();
    poll = setInterval(() => { if (interrupted && !cleanup) stop("interrupted"); else if (Date.now() - started >= Math.min(seconds * 1000, remaining)) stop("timeout"); }, 25);
  });
  if (child.pid && absent(child.pid) !== true) {
    if (!reason) stop("group_remaining");
    while (absent(child.pid) !== true && Date.now() < stopAt + 6000) await new Promise(resolve => setTimeout(resolve, 25));
  }
  clearInterval(poll); clearTimeout(killTimer); clearTimeout(drainTimer); captureFinished = true;
  const output = parts.map(chunks => Buffer.concat(chunks));
  const row = { label, args: [executable === process.execPath ? "[node]" : executable, ...args.map(value => clean(value, 250))],
    allowedExits: exits, exitCode, signal, stop: reason, spawned: !!child.pid, exitObserved: exited, closeObserved: closed,
    originalProcessGroupAbsent: child.pid ? absent(child.pid) : true, termSent: term, killSent: killed,
    streams: output.map((bytes, index) => ({ name: index ? "stderr" : "stdout", observedBytes: counts[index], capturedBytes: bytes.length,
      observedSha256: hashes[index].digest("hex"), capturedSha256: hash(bytes), complete: closed && counts[index] === bytes.length,
      ...(quiet ? {} : { head: clean(bytes.toString(), 500), tail: clean(bytes.subarray(Math.max(0, bytes.length - 700)).toString(), 700) }) })) };
  report.commands.push(row); if (label === "metadata_browser") browserRow = row;
  need(exits.includes(exitCode) && signal === null && reason === null && exited && closed && row.originalProcessGroupAbsent === true, label + "_failed");
  return output;
}
function parseGit(bytes, index) {
  const entries = new Map();
  for (const record of bytes.toString().split("\0").filter(Boolean)) {
    const tab = record.indexOf("\t"), header = record.slice(0, tab).split(" "), name = record.slice(tab + 1);
    need(tab > 0 && name && !path.isAbsolute(name) && !name.split("/").some(part => !part || part === "." || part === "..") && !entries.has(name), "git_entry_invalid");
    need(index ? header[2] === "0" : header[1] === "blob", "git_entry_type");
    entries.set(name, { mode: header[0], sha: header[index ? 1 : 2] });
  }
  return entries;
}
async function guard(label, cleanup = false) {
  const row = { label, passed: false }; report.guards.push(row); const options = { cleanup, quiet: true };
  need((await run(label + "_head", "git", ["rev-parse", "HEAD"], 10, options))[0].toString().trim() === sourceCommit, "head_changed");
  need(!fs.existsSync(ACTIVE) && !fs.existsSync(CONFIG), "source_contains_active_or_generated_config");
  const raw = read(SEAL, 262144), pinned = (await run(label + "_seal", "git", ["show", "HEAD:" + SEAL], 10, options))[0];
  need(raw.equals(pinned) && (!report.sealSha256 || hash(raw) === report.sealSha256), "seal_changed"); manifest = JSON.parse(raw); report.sealSha256 = hash(raw);
  need(manifest.schemaVersion === 1 && manifest.kind === "inspiration-metadata-checks-source" && manifest.fileCount === manifest.files.length
    && JSON.stringify(manifest.historicalExceptions) === '["AGENTS.md","README.md"]', "seal_scope_invalid");
  const index = parseGit((await run(label + "_index", "git", ["ls-files", "--stage", "-z"], 10, options))[0], true);
  const tree = parseGit((await run(label + "_tree", "git", ["ls-tree", "-r", "-z", "HEAD"], 10, options))[0], false);
  need(tree.size === manifest.trackedFileCount && index.size === tree.size, "tracked_count_changed");
  const expected = new Map(manifest.files.map(entry => [entry.path, entry]));
  need(expected.size === manifest.fileCount && expected.size === 178 && !expected.has(SEAL), "application_input_set_invalid");
  let total = 0, applicationCount = 0;
  for (const [name, item] of tree) {
    const bytes = read(name), mode = fs.lstatSync(name).mode & 0o111 ? "100755" : "100644";
    need(item.mode === mode && item.sha === blob(bytes) && index.get(name)?.sha === item.sha && index.get(name)?.mode === mode, "full_tracked_bytes_or_index_changed");
    if (!name.startsWith(".agents/") && !name.startsWith("docs/results/")) {
      const wanted = expected.get(name); need(wanted && wanted.mode === mode && wanted.gitSha === item.sha && wanted.bytes === bytes.length && wanted.sha256 === hash(bytes), "application_fingerprint_changed"); total += bytes.length; applicationCount++;
    }
  }
  need(applicationCount === expected.size && total === manifest.sourceBytes, "application_input_bytes_changed");
  need((await run(label + "_status", "git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"], 10, options))[0].length === 0, "worktree_not_clean");
  await run(label + "_working", "git", ["-c", "core.filemode=true", "diff", "--no-ext-diff", "--no-textconv", "--quiet", "--exit-code", "HEAD", "--"], 10, options);
  const oldRaw = read(OLD); need(hash(oldRaw) === OLD_HASH && blob(oldRaw) === OLD_BLOB, "historical_inventory_changed"); historical = JSON.parse(oldRaw);
  need(historical.source_files.length === 175 && historical.case_names.length === 8 && new Set(historical.case_names).size === 8
    && JSON.stringify(manifest.testNames) === JSON.stringify(historical.case_names), "historical_scope_changed");
  const changed = historical.source_files.filter(entry => { const bytes = read(entry.path); return entry.bytes !== bytes.length || entry.sha256 !== hash(bytes); }).map(entry => entry.path);
  need(changed.every(name => manifest.historicalExceptions.includes(name)), "historical_source_changed");
  Object.assign(row, { passed: true, inputFiles: expected.size, inputBytes: total, trackedFiles: tree.size, fullIndexMatchesHead: true,
    fullWorkingBytesMatchHead: true, historicalFiles: 175, historicalChanged: changed, historicalInventorySha256: OLD_HASH });
}
function ancestors(file, boundary) {
  need(file.startsWith(boundary + path.sep), "owned_path_escape");
  for (let current = path.dirname(file); current !== boundary; current = path.dirname(current)) {
    const item = fs.lstatSync(current); need(item.isDirectory() && !item.isSymbolicLink(), "owned_ancestor_changed");
  }
}
function captureGenerated() {
  for (const name of GENERATED) if (fs.existsSync(name)) {
    ancestors(path.join(repo, name), repo); const item = fs.lstatSync(name), previous = report.generated.find(entry => entry.path === name);
    need(!item.isSymbolicLink() && (item.isDirectory() || item.isFile()), "generated_type_changed");
    if (previous) need(previous.dev === item.dev && previous.ino === item.ino && previous.directory === item.isDirectory(), "generated_identity_changed");
    else report.generated.push({ path: name, dev: item.dev, ino: item.ino, directory: item.isDirectory(), preAbsent: true });
  }
}
async function generatedPaths(label, cleanup = false) {
  captureGenerated();
  const output = (await run(label + "_ignored", "git", ["status", "--porcelain=v1", "-z", "--ignored=matching", "--untracked-files=normal"], 10, { quiet: true, cleanup }))[0];
  for (const record of output.toString().split("\0").filter(Boolean)) {
    need(record.startsWith("!! "), "unexpected_working_output");
    need(GENERATED.includes(record.slice(3).replace(/\/$/, "")), "unexpected_ignored_output");
  }
}
function removeConfig() {
  if (!configIdentity) { need(!fs.existsSync(CONFIG), "unowned_generated_config"); return; }
  const item = fs.lstatSync(CONFIG), bytes = read(CONFIG, 16384);
  need(item.dev === configIdentity.dev && item.ino === configIdentity.ino && hash(bytes) === configIdentity.sha256, "generated_config_changed");
  fs.unlinkSync(CONFIG); report.generatedConfigRemoved = true; configIdentity = null;
}
function portUnbound() {
  return new Promise((resolve, reject) => {
    const server = net.createServer(); let settled = false;
    const done = (error, value) => { if (settled) return; settled = true; clearTimeout(timer); try { server.close(); } catch {} error ? reject(error) : resolve(value); };
    const timer = setTimeout(() => done(new Error("port_probe_timeout")), 1500);
    server.once("error", error => error.code === "EADDRINUSE" ? done(null, false) : done(new Error("port_probe_failed")));
    server.listen(3100, "127.0.0.1", () => server.close(error => done(error ? new Error("port_probe_close_failed") : null, true)));
  });
}
function createConfig() {
  const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
  const command = `${quote(process.execPath)} ${quote(corepack)} pnpm dev --hostname 127.0.0.1 --port 3100`;
  const text = `import { defineConfig, devices } from '@playwright/test';\nexport default defineConfig({\n`
    + `testDir:'./tests/e2e',testMatch:'**/metadata.spec.ts',forbidOnly:true,fullyParallel:false,workers:1,retries:0,timeout:45000,globalTimeout:420000,expect:{timeout:10000},\n`
    + `reporter:[['list'],['json',{outputFile:${JSON.stringify(reportPath)}}]],outputDir:${JSON.stringify(outputDirectory)},\n`
    + `use:{baseURL:'http://127.0.0.1:3100',trace:'off',screenshot:'off',video:'off',serviceWorkers:'block'},projects:[{name:'chromium',use:{...devices['Desktop Chrome']}}],\n`
    + `webServer:{command:${JSON.stringify(command)},url:'http://127.0.0.1:3100',reuseExistingServer:false,timeout:120000,env:{NODE_ENV:'development',ENABLE_AI:'false',ENABLE_EVE_DEV:'false',ENABLE_BLOB_STORAGE:'false',STORAGE_DRIVER:'local',NEXT_TELEMETRY_DISABLED:'1',NEXT_PUBLIC_SUPABASE_URL:'',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'',NEXT_PUBLIC_SUPABASE_ANON_KEY:'',SUPABASE_SERVICE_ROLE_KEY:'',BLOB_READ_WRITE_TOKEN:'',AI_GATEWAY_API_KEY:'',VERCEL_OIDC_TOKEN:'',OPENAI_API_KEY:'',ANTHROPIC_API_KEY:''}}\n});\n`;
  fs.writeFileSync(CONFIG, text, { flag: "wx", mode: 0o600 }); const item = fs.lstatSync(CONFIG);
  configIdentity = { dev: item.dev, ino: item.ino, sha256: hash(Buffer.from(text)) }; report.generatedConfigSha256 = configIdentity.sha256;
}
function attachmentBytes(attachment) {
  verifyOutputDirectory();
  const values = [];
  if (typeof attachment.body === "string") {
    need(attachment.body.length <= 8192, "attachment_body_limit"); const bytes = Buffer.from(attachment.body, "base64");
    need(bytes.toString("base64") === attachment.body && bytes.length <= 4096, "attachment_body_invalid"); values.push(bytes);
  }
  if (typeof attachment.path === "string") {
    const file = path.resolve(repo, attachment.path); ancestors(file, outputDirectory); values.push(read(file, 4096));
  }
  need(values.length > 0 && values.every(bytes => bytes.equals(values[0])), "attachment_representation_invalid"); return values[0];
}
function verifyOutputDirectory(allowAbsent = false) {
  owner(); const parentItem = fs.lstatSync(outputParent);
  need(parentItem.isDirectory() && !parentItem.isSymbolicLink() && parentItem.dev === outputIdentity.dev && parentItem.ino === outputIdentity.ino, "output_parent_changed");
  let item;
  try { item = fs.lstatSync(outputDirectory); }
  catch (error) { need(error.code === "ENOENT" && allowAbsent, "output_directory_missing"); return false; }
  need(item.isDirectory() && !item.isSymbolicLink() && path.dirname(outputDirectory) === outputParent
    && fs.realpathSync(outputDirectory) === outputDirectory, "output_directory_changed");
  report.playwrightOutput = { frameworkCreatedLeaf: true, directory: true, symlink: false, dev: item.dev, ino: item.ino };
  return true;
}
function parseReport() {
  owner(); const bytes = read(reportPath, 1048576), gzip = gzipSync(bytes);
  report.browser = { raw: { encoding: "gzip-base64", bytes: bytes.length, sha256: hash(bytes), compressedBytes: gzip.length }, cases: [], accepted: false };
  need(gzip.length <= 131072, "playwright_gzip_limit"); report.browser.raw.data = gzip.toString("base64");
  const data = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  need(Array.isArray(data.errors) && Array.isArray(data.suites) && data.stats && typeof data.stats === "object", "playwright_report_shape");
  const cases = [];
  function visit(suite, depth = 0) {
    need(depth < 12 && Array.isArray(suite.suites ?? []) && Array.isArray(suite.specs ?? []), "playwright_suite_shape");
    for (const spec of suite.specs ?? []) {
      need(Array.isArray(spec.tests), "playwright_spec_shape");
      for (const test of spec.tests) {
        need(cases.length < 16 && typeof spec.title === "string" && Array.isArray(test.results), "playwright_case_shape");
        const attempts = test.results.map(result => ({ status: result.status, retry: result.retry, durationMs: result.duration,
          errors: (result.errors ?? []).slice(0, 2).map(error => clean(error.message ?? error.value, 1600)) }));
        const row = { name: spec.title, project: test.projectName, expected: test.expectedStatus, attempts, blockedWrites: null }; cases.push(row);
        if (test.results.length === 1) {
          const attachments = (test.results[0].attachments ?? []).filter(item => item.name === "blocked-network-writes");
          if (attachments.length === 1 && attachments[0].contentType === "application/json") {
            const raw = attachmentBytes(attachments[0]); const writes = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw));
            row.blockedWrites = { bytes: raw.length, sha256: hash(raw), empty: Array.isArray(writes) && writes.length === 0 };
          }
        }
      }
    }
    for (const child of suite.suites ?? []) visit(child, depth + 1);
  }
  visit(data); parsedReport = true;
  Object.assign(report.browser, { cases, stats: { expected: data.stats.expected, unexpected: data.stats.unexpected, flaky: data.stats.flaky,
    skipped: data.stats.skipped, durationMs: data.stats.duration }, globalErrorCount: data.errors.length,
    globalErrors: data.errors.slice(0, 8).map(error => clean(error.message ?? error.value, 1600)) });
  report.browser.normalFrameworkResult = data.errors.length === 0 && cases.length === 8
    && cases.every(item => item.attempts.length === 1 && ["passed", "failed", "timedOut"].includes(item.attempts[0].status));
  const names = cases.map(item => item.name).sort();
  need(JSON.stringify(names) === JSON.stringify([...manifest.testNames].sort()) && new Set(names).size === 8, "playwright_case_set_failed");
  need(data.errors.length === 0 && data.stats.expected === 8 && data.stats.unexpected === 0 && data.stats.flaky === 0 && data.stats.skipped === 0, "playwright_totals_failed");
  need(cases.every(item => item.project === "chromium" && item.expected === "passed" && item.attempts.length === 1
    && item.attempts[0].status === "passed" && item.attempts[0].retry === 0 && item.blockedWrites?.empty === true), "playwright_case_result_failed");
  report.browser.accepted = true;
}
function failureContexts() {
  if (!verifyOutputDirectory(true)) { report.failureContexts = []; return; }
  const contexts = []; let examined = 0;
  function visit(directory) {
    need(++examined <= 128, "diagnostic_directory_limit");
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (contexts.length === 8) return;
      const file = path.join(directory, entry.name); need(!entry.isSymbolicLink(), "diagnostic_symlink");
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile() && entry.name === "error-context.md") {
        ancestors(file, outputDirectory); const a = fs.lstatSync(file), fd = fs.openSync(file, "r"); let bytes;
        try { const buffer = Buffer.alloc(Math.min(a.size, 8192)); const count = fs.readSync(fd, buffer, 0, buffer.length, 0); bytes = buffer.subarray(0, count); } finally { fs.closeSync(fd); }
        const b = fs.lstatSync(file); need(a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs, "diagnostic_file_changed");
        contexts.push({ path: clean(path.relative(outputDirectory, file), 250), bytes: a.size, retainedPrefixBytes: bytes.length,
          prefixSha256: hash(bytes), truncated: bytes.length < a.size, text: clean(bytes.toString(), 8192) });
      }
    }
  }
  visit(outputDirectory); report.failureContexts = contexts;
}
function assertNoServerWrites() {
  need(!fs.existsSync(path.join(root, "unexpected.db")) && !fs.existsSync(path.join(root, "unexpected.db-wal"))
    && !fs.existsSync(path.join(root, "unexpected.db-shm")) && fs.readdirSync(path.join(root, "uploads")).length === 0, "unexpected_database_or_upload_write");
  report.unexpectedDatabaseAbsent = true; report.serverUploadsEmpty = true;
}
async function removeOwned(file, snapshot) {
  const item = fs.lstatSync(file); need(!item.isSymbolicLink() && item.dev === snapshot.dev && item.ino === snapshot.ino, "cleanup_identity_changed");
  let timer;
  try { await Promise.race([fs.promises.rm(file, { recursive: item.isDirectory(), force: false, maxRetries: 0 }),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("cleanup_timeout")), Math.max(1, cleanupEnd - Date.now())); })]); }
  finally { clearTimeout(timer); }
  need(!fs.existsSync(file), "cleanup_path_remaining");
}
try {
  for (const name of [...GENERATED, CONFIG]) need(!fs.existsSync(name), "preexisting_generated_output");
  await guard("before"); await generatedPaths("before");
  report.portUnboundBefore = await portUnbound(); need(report.portUnboundBefore, "port_already_bound");
  const digest = createHash("sha256"); for await (const chunk of fs.createReadStream(process.execPath)) digest.update(chunk); report.runtime.executableSha256 = digest.digest("hex");
  corepack = fs.realpathSync(path.join(path.dirname(process.execPath), "corepack")); report.runtime.corepackCliSha256 = hash(read(corepack));
  await run("prepare_pnpm", process.execPath, [corepack, "prepare", "pnpm@10.24.0", "--activate"], 60);
  report.runtime.pnpm = (await run("pnpm_version", process.execPath, [corepack, "pnpm", "--version"], 15))[0].toString().trim(); need(report.runtime.pnpm === "10.24.0", "pnpm_version_changed");
  await run("install", process.execPath, [corepack, "pnpm", "install", "--frozen-lockfile", "--ignore-scripts", "--store-dir", path.join(root, "pnpm", "store")], 180);
  await generatedPaths("after_install"); await guard("after_install");
  await run("focused_lint", process.execPath, [corepack, "pnpm", "exec", "eslint", "--no-cache", "components/canvas/metadata-combobox.tsx", "tests/e2e/metadata.spec.ts"], 45);
  await generatedPaths("after_lint"); await guard("after_lint");
  await run("install_chromium", process.execPath, [corepack, "pnpm", "exec", "playwright", "install", "--with-deps", "chromium"], 180);
  await generatedPaths("after_chromium"); await guard("after_chromium");
  createConfig(); browserStarted = true;
  await run("metadata_browser", process.execPath, [corepack, "pnpm", "exec", "playwright", "test", "--config", CONFIG, "--project", "chromium"], 550, { exits: [0, 1] });
  removeConfig(); parseReport(); need(browserRow.exitCode === 0, "playwright_exit_failed"); assertNoServerWrites();
  need(Date.now() <= workEnd, "work_deadline_exceeded");
} catch (error) { report.errors.push(errorCode(error)); }
finally {
  cleanupEnd = Math.min(Date.now() + 60000, workEnd + 60000);
  try { removeConfig(); } catch (error) { report.errors.push(errorCode(error)); }
  if (browserStarted && !parsedReport && fs.existsSync(reportPath)) try { parseReport(); } catch (error) { report.errors.push(errorCode(error)); }
  if (report.errors.length) try { failureContexts(); } catch (error) { report.diagnosticError = errorCode(error); }
  try { report.portUnboundAfter = await portUnbound(); } catch (error) { report.errors.push(errorCode(error)); }
  try { assertNoServerWrites(); await generatedPaths("after", true); await guard("after", true); } catch (error) { report.errors.push(errorCode(error)); }
  try {
    owner(); need(report.commands.every(item => !item.spawned || (item.exitObserved && item.closeObserved && item.originalProcessGroupAbsent === true)), "process_cleanup_unverified");
    need(!browserStarted || (browserRow?.stop === null && [0, 1].includes(browserRow.exitCode) && browserRow.signal === null && browserRow.exitObserved && browserRow.closeObserved
      && browserRow.originalProcessGroupAbsent === true && report.browser?.normalFrameworkResult === true && report.portUnboundAfter === true), "browser_cleanup_unverified");
    report.playwrightShutdown = browserStarted ? "normal_runner_close_and_port_unbound" : "not_started";
    for (const entry of [...report.generated].reverse()) {
      const file = path.join(repo, entry.path); ancestors(file, repo); await removeOwned(file, entry); entry.removed = true;
    }
    await guard("after_output_cleanup", true);
    need((await run("final_ignored", "git", ["status", "--porcelain=v1", "-z", "--ignored=matching", "--untracked-files=all"], 10, { cleanup: true, quiet: true }))[0].length === 0, "generated_output_remaining");
    owner(); await removeOwned(root, identity); report.cleanup = "passed";
  } catch (error) { report.cleanup = "unverified"; report.scratchRetained = fs.existsSync(root); report.errors.push(errorCode(error)); }
}
if (Date.now() > cleanupEnd) report.errors.push("cleanup_deadline_exceeded");
report.interrupted = interrupted; if (interrupted) report.errors.push("interrupted"); report.completedAtUtc = new Date().toISOString();
report.status = !report.errors.length && report.browser?.accepted === true && report.cleanup === "passed" ? "passed" : "failed";
let output = JSON.stringify(report);
if (Buffer.byteLength(output) > REPORT_LIMIT) {
  report.status = "failed"; report.errors.push("report_limit"); delete report.failureContexts;
  for (const command of report.commands) for (const stream of command.streams) { delete stream.head; delete stream.tail; }
  if (report.browser?.raw) { delete report.browser.raw.data; report.browser.raw.payloadOmitted = true; }
  output = JSON.stringify(report);
}
need(Buffer.byteLength(output) <= REPORT_LIMIT, "report_limit");
function finish(exit) { clearTimeout(terminalTimer); for (const [signal, handler] of handlers) process.off(signal, handler); process.exit(exit); }
const timer = setTimeout(() => { process.stdout.destroy(); finish(1); }, Math.max(1, Math.min(2000, cleanupEnd + 2000 - Date.now(), workEnd + 62000 - Date.now())));
process.stdout.write(output + "\n", error => { clearTimeout(timer); finish(!error && !interrupted && report.status === "passed"
  && Date.now() <= Math.min(cleanupEnd + 2000, workEnd + 62000) ? 0 : 1); });
