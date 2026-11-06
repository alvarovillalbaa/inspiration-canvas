import { randomUUID } from "node:crypto";
import { lstatSync, mkdirSync, unlinkSync, writeFileSync, type Stats } from "node:fs";
import path from "node:path";
import { deflateSync } from "node:zlib";

import { expect, test, type Locator, type Page } from "@playwright/test";

const ORIGIN = "http://127.0.0.1:3100";
const EXPECTED_CROP = { x: 0.01, y: 0.01, width: 0.95, height: 0.95 };

// Same authored RGBA PNG construction as the existing metadata fixture. No
// private file, remote image, browser state or server record is seeded.
function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function pngChunk(type: string, data: Buffer): Buffer {
  const name = Buffer.from(type, "ascii"), length = Buffer.alloc(4), checksum = Buffer.alloc(4);
  length.writeUInt32BE(data.length); checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}
function authoredPng(): Buffer {
  const width = 32, height = 24, header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  const pixels = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = y * (1 + width * 4) + 1 + x * 4;
    pixels[offset] = x < width / 2 ? 220 : 35; pixels[offset + 1] = Math.round(y * 255 / (height - 1));
    pixels[offset + 2] = 170; pixels[offset + 3] = 255;
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header), pngChunk("IDAT", deflateSync(pixels)), pngChunk("IEND", Buffer.alloc(0))]);
}
function mediaItem(page: Page, id: string) {
  return page.getByTestId("media-item").and(page.locator(`[data-media-id="${id}"]`));
}
async function expectLocalMode(page: Page) {
  await expect(page.getByText("Local PostgreSQL", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save temporary canvas", exact: true })).toHaveCount(0);
}
async function openAction(page: Page, item: Locator, name: "Info" | "Crop" | "Comments") {
  if (await item.getAttribute("aria-pressed") !== "true") await item.click();
  await expect(item).toHaveAttribute("aria-pressed", "true");
  await item.getByRole("button", { name: "Media actions", exact: true }).click();
  await page.getByRole("menuitem", { name, exact: true }).click();
}
async function createMetadataValue(page: Page, panel: Locator, field: "Category" | "Tags", value: string) {
  const input = panel.getByRole("combobox", { name: field, exact: true });
  await input.click(); await input.fill(value);
  await page.getByRole("option", { name: `Create “${value}”`, exact: true }).click();
  await input.press("Escape");
  if (field === "Tags") await expect(panel.getByRole("button", { name: `Remove ${value} from tags`, exact: true })).toBeVisible();
  else await expect(input).toHaveValue(value);
}
function matchesResponse(pathname: string, method: string) {
  return (response: import("@playwright/test").Response) => new URL(response.url()).origin === ORIGIN
    && new URL(response.url()).pathname === pathname && response.request().method() === method;
}
async function assertImage(item: Locator) {
  await expect.poll(() => item.getByTestId("media-image").evaluate((element) => {
    const image = element as HTMLImageElement;
    return [image.complete, image.naturalWidth, image.naturalHeight];
  })).toEqual([true, 32, 24]);
}
function diagnosticText(value: string, maximum: number): string {
  const clean = value.replace(/(?:https?|wss?|file|blob|data):[^\s<>"']+/gi, "[redacted-url]")
    .replace(/[\u0000-\u001f\u007f]/g, " ");
  let text = "", bytes = 0;
  for (const character of clean) {
    const size = Buffer.byteLength(character);
    if (bytes + size > maximum) break;
    text += character; bytes += size;
  }
  return text;
}
function responseBodyShape(value: unknown) {
  const type = (entry: unknown) => entry === null ? "null" : Array.isArray(entry) ? "array" : typeof entry;
  const object = value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
  const media = object?.media;
  return {
    type: type(value), keys: object ? Object.keys(object).sort().slice(0, 8).map((key) => diagnosticText(key, 32)) : [],
    mediaType: type(media), mediaKeys: media !== null && typeof media === "object" && !Array.isArray(media)
      ? Object.keys(media).sort().slice(0, 8).map((key) => diagnosticText(key, 32)) : [],
  };
}
function ownedPositionBatch(request: import("@playwright/test").Request, ownId: string | null): boolean {
  if (!ownId || !request.postData() || request.postData()!.length > 1024) return false;
  try {
    const input = request.postDataJSON() as Record<string, unknown>;
    if (!input || Object.keys(input).sort().join(",") !== "updates" || !Array.isArray(input.updates) || input.updates.length !== 1) return false;
    const update = input.updates[0] as Record<string, unknown>;
    if (!update || update.id !== ownId || Object.keys(update).sort().join(",") !== "id,patch") return false;
    const patch = update.patch as Record<string, unknown>;
    return !!patch && Object.keys(patch).sort().join(",") === "x,y" &&
      typeof patch.x === "number" && Number.isFinite(patch.x) && typeof patch.y === "number" && Number.isFinite(patch.y);
  } catch { return false; }
}

test("local PostgreSQL preserves uploaded metadata and crop across reload and deletes only the authored item", async ({ context, page }, testInfo) => {
  const narrow = testInfo.project.name === "narrow-chromium";
  const suffix = randomUUID(), fileName = `local-postgres-${suffix}.png`;
  const title = `Local persisted ${suffix}`, category = `Local category ${suffix}`, tag = `warm, muted ${suffix}`;
  const comment = `An authored PostgreSQL comment ${suffix}\nSpaces + minus - and zero 0 stay in this note.`;
  const unexpected: string[] = [], pageErrors: string[] = [], httpErrors: string[] = [];
  const pngPath = testInfo.outputPath(fileName);
  let pngIdentity: Stats | null = null;
  let ownId: string | null = null, writes = 0, reads = 0, developmentWebSockets = 0;
  let persisted = false, commentPersisted = false, removed = false, cleanupError: string | null = null;
  let stage = "prepare-authored-png", primaryError: string | null = null;
  let uploadControl: { visible: boolean; enabled: boolean; box: { x: number; y: number; width: number; height: number } | null; viewport: { width: number; height: number } | null } | null = null;
  let positionBatches = 0;
  let holdCommentRead = false, staleReadHeld = false, staleReadDelivered = false;
  let commentGetRequests = 0, heldCommentReadOrdinal = 0;
  let releaseCommentRead: (() => void) | undefined;
  const commentReadGate = new Promise<void>((resolve) => { releaseCommentRead = resolve; });
  let restoredComments: { rows: number; authoredRowMatches: boolean; selected: string | null; closeButtons: number; noteInputs: number; textMatches: number } | null = null;
  let uploadObservation: { status: number; contentType: string; bodyShape: ReturnType<typeof responseBodyShape> | null } | null = null;
  const requestDiagnostics: Array<{ method: string; path: string; queryKeys: string[]; queryKeyCount: number; originClass: string }> = [];
  const record = (list: string[], value: string) => { if (list.length < 16) list.push(diagnosticText(value, 160)); };
  function recordRequest(method: string, url: URL) {
    if (requestDiagnostics.length >= 3) return;
    const keys = [...new Set(url.searchParams.keys())];
    requestDiagnostics.push({ method: diagnosticText(method, 12), path: diagnosticText(url.pathname, 128),
      queryKeys: keys.slice(0, 4).map((key) => diagnosticText(key, 24)), queryKeyCount: keys.length,
      originClass: url.origin === ORIGIN ? "same-origin" : ["http:", "https:"].includes(url.protocol) ? "cross-origin" : "other-scheme" });
  }
  context.on("weberror", (event) => record(pageErrors, `${event.error().name}: ${event.error().message}`));
  context.on("response", (response) => {
    const url = new URL(response.url());
    if (url.origin === ORIGIN && response.status() >= 400) record(httpErrors, `${response.status()} ${response.request().method()} ${url.pathname}`);
  });
  await context.routeWebSocket("**/*", (route) => {
    const url = new URL(route.url());
    if (url.protocol === "ws:" && url.host === "127.0.0.1:3100" && url.pathname === "/_next/webpack-hmr"
      && !url.username && !url.password && !url.hash && url.search.length <= 256) {
      developmentWebSockets++; route.connectToServer(); return;
    }
    record(unexpected, "Unexpected WebSocket"); recordRequest("WEBSOCKET", url); route.close();
  });
  await context.route("**/*", async (route) => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    const staticRead = url.pathname.startsWith("/_next/static/") || url.pathname === "/favicon.ico";
    // Next 16.2.9's observed App Router refresh reads only this root resource.
    const rootFlightRead = method === "GET" && url.pathname === "/" && [...url.searchParams].length === 1
      && url.searchParams.has("_rsc") && /^[A-Za-z0-9_-]{0,64}$/.test(url.searchParams.get("_rsc") || "");
    if (url.origin !== ORIGIN || url.username || url.password || url.hash || (url.search && ((!staticRead && !rootFlightRead) || url.search.length > 256))) {
      record(unexpected, "Unexpected request origin or query"); recordRequest(method, url); await route.abort("blockedbyclient"); return;
    }
    const read = ["GET", "HEAD"].includes(method);
    const asset = url.pathname === "/" || url.pathname === "/favicon.ico" || url.pathname.startsWith("/_next/static/")
      || /^\/__nextjs_font\/[a-z0-9-]+\.woff2$/.test(url.pathname) || url.pathname.startsWith("/api/uploads/");
    const ownMedia = ownId !== null && url.pathname === `/api/media/${ownId}`;
    const ownComments = ownId !== null && url.pathname === `/api/media/${ownId}/comments`;
    const positionBatch = method === "PATCH" && url.pathname === "/api/media/batch" && ownedPositionBatch(request, ownId);
    if ((read && (asset || url.pathname === "/api/canvas" || ownMedia || ownComments))
      || (method === "POST" && url.pathname === "/api/upload") || (ownMedia && ["PATCH", "DELETE"].includes(method))
      || (ownComments && method === "POST") || positionBatch) {
      if (positionBatch) positionBatches++;
      if (read) reads++; else writes++;
      if (ownComments && method === "GET") commentGetRequests++;
      if (ownComments && method === "GET" && holdCommentRead) {
        holdCommentRead = false;
        heldCommentReadOrdinal = commentGetRequests;
        // Delay an actual empty server response across the real POST. Preserve
        // its status, headers and body; no fabricated backend result is used.
        const response = await route.fetch({ timeout: 10_000, maxRedirects: 0, maxRetries: 0 });
        expect(response.ok()).toBe(true);
        expect(await response.json()).toEqual({ comments: [] });
        staleReadHeld = true;
        await commentReadGate;
        await route.fulfill({ response });
        staleReadDelivered = true;
        return;
      }
      await route.continue(); return;
    }
    record(unexpected, `Unexpected local request ${method} ${url.pathname}`); recordRequest(method, url); await route.abort("blockedbyclient");
  });

  try {
    mkdirSync(path.dirname(pngPath), { recursive: true });
    writeFileSync(pngPath, authoredPng(), { flag: "wx" }); pngIdentity = lstatSync(pngPath);
    stage = "navigate-local-canvas";
    await page.goto("/", { waitUntil: "load" }); await expectLocalMode(page);
    stage = "open-file-chooser";
    const uploadButton = page.getByRole("button", { name: "Upload", exact: true });
    uploadControl = { visible: await uploadButton.isVisible(), enabled: await uploadButton.isEnabled(),
      box: await uploadButton.boundingBox(), viewport: page.viewportSize() };
    if (narrow) {
      expect(uploadControl.box).not.toBeNull();
      expect(uploadControl.box!.x).toBeGreaterThanOrEqual(0);
      expect(uploadControl.box!.x + uploadControl.box!.width).toBeLessThanOrEqual(390);
      expect(uploadControl.box!.y + uploadControl.box!.height).toBeLessThanOrEqual(844);
    }
    const chooser = await Promise.all([page.waitForEvent("filechooser"), uploadButton.click()]);
    stage = "upload-authored-file";
    const [uploadResponse] = await Promise.all([
      page.waitForResponse(matchesResponse("/api/upload", "POST")),
      chooser[0].setFiles(pngPath),
    ]);
    stage = "read-upload-response";
    uploadObservation = { status: uploadResponse.status(), contentType: diagnosticText(uploadResponse.headers()["content-type"] || "", 128), bodyShape: null };
    let uploaded: { media: { id: string; fileName: string } } | undefined, uploadParseError: unknown;
    try {
      uploaded = await uploadResponse.json() as { media: { id: string; fileName: string } };
      uploadObservation.bodyShape = responseBodyShape(uploaded);
    } catch (error) { uploadParseError = error; }
    if (uploaded?.media?.fileName === fileName && typeof uploaded.media.id === "string"
      && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uploaded.media.id)) ownId = uploaded.media.id;
    stage = "assert-upload-contract";
    expect(uploadResponse.status()).toBe(201);
    if (uploadParseError) throw uploadParseError;
    expect(uploaded!.media.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(uploaded!.media.fileName).toBe(fileName);
    let item = mediaItem(page, ownId!);
    stage = "fit-uploaded-image";
    await expect(item).toHaveCount(1); await page.getByRole("button", { name: "Fit view", exact: true }).click();
    await expect(item).toBeVisible(); await assertImage(item);

    stage = "edit-info";
    await openAction(page, item, "Info");
    const panel = page.getByRole("complementary", { name: "Media info", exact: true });
    await panel.getByRole("textbox", { name: "Title", exact: true }).fill(title);
    await createMetadataValue(page, panel, "Category", category);
    await createMetadataValue(page, panel, "Tags", tag);
    stage = "save-info";
    const [savedInfo] = await Promise.all([
      page.waitForResponse(matchesResponse(`/api/media/${ownId}`, "PATCH")),
      panel.getByRole("button", { name: "Save info", exact: true }).click(),
    ]);
    expect(savedInfo.ok()).toBe(true);
    await expect(item).toHaveAccessibleName(title);
    await panel.getByRole("button", { name: "Close info", exact: true }).click();
    await expect(panel).toHaveCount(0);
    await page.getByRole("button", { name: "Fit view", exact: true }).click();

    if (!narrow) {
      stage = "add-comment";
      holdCommentRead = true;
      await openAction(page, item, "Comments");
      await expect.poll(() => staleReadHeld).toBe(true);
      const note = item.getByPlaceholder("Add a note...", { exact: true });
      await note.click();
      // Browser keyboard events expose nested-card and global shortcut bugs
      // that programmatic fill cannot exercise.
      await note.pressSequentially(comment.split("\n")[0]);
      await note.press("Enter");
      await note.pressSequentially(comment.split("\n")[1]);
      await note.press("ControlOrMeta+a");
      expect(await note.evaluate((element) => {
        const input = element as HTMLTextAreaElement;
        return [input.selectionStart, input.selectionEnd];
      })).toEqual([0, comment.length]);
      await note.press("ArrowRight");
      await expect(note).toHaveValue(comment);
      const [added] = await Promise.all([
        page.waitForResponse(matchesResponse(`/api/media/${ownId}/comments`, "POST")),
        item.getByRole("button", { name: "Add comment", exact: true }).click(),
      ]);
      expect(added.status()).toBe(201);
      expect(await added.json()).toMatchObject({ comment: { mediaItemId: ownId, body: comment } });
      const commentBody = item.getByTestId("media-comment-body");
      await expect(commentBody).toBeVisible();
      expect(await commentBody.textContent()).toBe(comment);
      stage = "release-pre-write-comment-read";
      // A newer read would invalidate the held read independently of POST and
      // make the write-race regression meaningless.
      expect(commentGetRequests).toBe(heldCommentReadOrdinal);
      const delivered = page.waitForResponse(matchesResponse(`/api/media/${ownId}/comments`, "GET"));
      releaseCommentRead!();
      expect(await (await delivered).finished()).toBeNull();
      await expect.poll(() => staleReadDelivered).toBe(true);
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      await expect(commentBody).toBeVisible();
      expect(await commentBody.textContent()).toBe(comment);
      await item.getByRole("button", { name: "Close comments", exact: true }).click();
    }
    stage = "crop-image";
    await openAction(page, item, "Crop");
    const crop = page.getByRole("dialog", { name: "Crop image", exact: true });
    await expect.poll(() => crop.getByTestId("crop-preview-image").evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBe(32);
    await crop.getByRole("button", { name: "Resize crop from right", exact: true }).press("Shift+ArrowLeft");
    await crop.getByRole("button", { name: "Resize crop from bottom", exact: true }).press("Shift+ArrowUp");
    await crop.getByRole("button", { name: "Move crop", exact: true }).press("ArrowRight");
    await crop.getByRole("button", { name: "Move crop", exact: true }).press("ArrowDown");
    await expect(crop.getByRole("status")).toContainText("Left 1%, top 1% · width 95%, height 95%");
    stage = "save-crop";
    const [savedCrop] = await Promise.all([
      page.waitForResponse(matchesResponse(`/api/media/${ownId}`, "PATCH")),
      crop.getByRole("button", { name: "Save crop", exact: true }).click(),
    ]);
    expect(savedCrop.ok()).toBe(true); await expect(crop).toBeHidden();
    await expect(item.getByTestId("media-crop-viewport")).toHaveAttribute("data-cropped", "true");

    stage = "reload-persistence";
    const [reloaded] = await Promise.all([page.waitForResponse(matchesResponse("/api/canvas", "GET")), page.reload({ waitUntil: "load" })]);
    expect(reloaded.ok()).toBe(true);
    const snapshot = await reloaded.json() as { persistence: string; mediaItems: Array<Record<string, unknown>> };
    expect(snapshot.persistence).toBe("local");
    const row = snapshot.mediaItems.find((entry) => entry.id === ownId);
    expect(row).toMatchObject({ fileName, title, category, tagsJson: [tag], storageDriver: "local" });
    expect(row?.cropJson).toEqual(EXPECTED_CROP);
    await expectLocalMode(page); await page.getByRole("button", { name: "Fit view", exact: true }).click();
    item = mediaItem(page, ownId!); await expect(item).toHaveAccessibleName(title); await assertImage(item);
    await expect(item.getByTestId("media-crop-viewport")).toHaveAttribute("data-cropped", "true");
    stage = "verify-restored-info";
    await openAction(page, item, "Info");
    const restoredPanel = page.getByRole("complementary", { name: "Media info", exact: true });
    await expect(restoredPanel.getByRole("textbox", { name: "Title", exact: true })).toHaveValue(title);
    await expect(restoredPanel.getByRole("combobox", { name: "Category", exact: true })).toHaveValue(category);
    await expect(restoredPanel.getByRole("button", { name: `Remove ${tag} from tags`, exact: true })).toBeVisible();
    await restoredPanel.getByRole("button", { name: "Close info", exact: true }).click();
    if (!narrow) {
      stage = "verify-restored-comment";
      const [comments] = await Promise.all([
        page.waitForResponse(matchesResponse(`/api/media/${ownId}/comments`, "GET")), openAction(page, item, "Comments"),
      ]);
      expect(comments.ok()).toBe(true);
      const loadedComments = await comments.json() as { comments: Array<{ mediaItemId: string; body: string }> };
      restoredComments = { rows: loadedComments.comments.length,
        authoredRowMatches: loadedComments.comments.some((entry) => entry.mediaItemId === ownId && entry.body === comment),
        selected: await item.getAttribute("aria-pressed"),
        closeButtons: await item.getByRole("button", { name: "Close comments", exact: true }).count(),
        noteInputs: await item.getByPlaceholder("Add a note...", { exact: true }).count(),
        textMatches: await item.getByTestId("media-comment-body").count() };
      expect(restoredComments.authoredRowMatches).toBe(true);
      await expect(item.getByTestId("media-comment-body")).toBeVisible();
      expect(await item.getByTestId("media-comment-body").textContent()).toBe(comment);
      commentPersisted = true;
    }
    stage = "verify-layout";
    if (narrow) expect(await page.evaluate(() => ({ width: innerWidth, overflow: document.documentElement.scrollWidth > innerWidth })))
      .toEqual({ width: 390, overflow: false });
    persisted = true;
    stage = "completed";
  } catch (error) {
    primaryError = diagnosticText(error instanceof Error ? `${error.name}: ${error.message}` : String(error), 4096);
    throw error;
  } finally {
    releaseCommentRead!();
    // Only the identity returned by this test's actual upload may be deleted.
    if (ownId) {
      try {
        const close = page.getByRole("button", { name: "Close info", exact: true });
        if (await close.isVisible()) await close.click();
        const crop = page.getByRole("dialog", { name: "Crop image", exact: true });
        if (await crop.isVisible()) await page.keyboard.press("Escape");
        const item = mediaItem(page, ownId);
        if (await item.count()) {
          if (await item.getAttribute("aria-pressed") !== "true") await item.click();
          await expect(item).toHaveAttribute("aria-pressed", "true");
          await page.getByRole("button", { name: "Delete selected", exact: true }).click();
          const dialog = page.getByRole("alertdialog", { name: "Delete selected media?", exact: true });
          const [deleted] = await Promise.all([
            page.waitForResponse(matchesResponse(`/api/media/${ownId}`, "DELETE")),
            dialog.getByRole("button", { name: "Delete", exact: true }).click(),
          ]);
          expect(deleted.ok()).toBe(true); await expect(item).toHaveCount(0);
        }
        const [loaded] = await Promise.all([page.waitForResponse(matchesResponse("/api/canvas", "GET")), page.reload({ waitUntil: "load" })]);
        expect(loaded.ok()).toBe(true);
        const data = await loaded.json() as { persistence: string; mediaItems: Array<{ id: string }> };
        expect(data.persistence).toBe("local"); expect(data.mediaItems.some((entry) => entry.id === ownId)).toBe(false);
        await expect(mediaItem(page, ownId)).toHaveCount(0); await expectLocalMode(page); removed = true;
      } catch (error) { cleanupError = error instanceof Error ? error.message.slice(0, 500) : "Owned item cleanup failed"; }
    }
    if (pngIdentity) {
      try {
        const current = lstatSync(pngPath);
        if (!current.isFile() || current.isSymbolicLink() || current.dev !== pngIdentity.dev || current.ino !== pngIdentity.ino
          || current.uid !== pngIdentity.uid || current.size !== pngIdentity.size) throw new Error("Authored upload fixture identity changed");
        unlinkSync(pngPath);
      } catch { cleanupError ||= "Owned PNG fixture cleanup failed"; }
    }
    await new Promise<void>((resolve) => setImmediate(resolve));
    const boundary = { kind: "local-postgres-boundary", schemaVersion: 1, project: testInfo.project.name,
      mediaId: ownId, persisted, commentPersisted, removed, reads, writes, developmentWebSockets,
      unexpected, pageErrors, httpErrors, cleanupError, stage, primaryError, uploadObservation, requestDiagnostics, uploadControl, positionBatches, restoredComments,
      staleReadHeld, staleReadDelivered, heldCommentReadOrdinal, commentGetRequests };
    const body = Buffer.from(JSON.stringify(boundary));
    expect.soft(body.length).toBeLessThanOrEqual(16 * 1024);
    if (body.length <= 16 * 1024) {
      try { await testInfo.attach("local-postgres-boundary", { body, contentType: "application/json" }); }
      catch (error) { expect.soft(false, diagnosticText(`Boundary attachment failed: ${String(error)}`, 500)).toBe(true); }
    }
    expect.soft(unexpected).toEqual([]); expect.soft(pageErrors).toEqual([]); expect.soft(httpErrors).toEqual([]);
    expect.soft(cleanupError).toBeNull(); expect.soft(removed).toBe(true);
  }
});
