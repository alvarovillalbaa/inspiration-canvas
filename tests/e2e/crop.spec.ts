import { deflateSync } from "node:zlib";

import { expect, test, type CDPSession, type Locator, type Page } from "@playwright/test";

// Source-only acceptance until an owner approves browser/CI execution. Every test
// uses Playwright's disposable context, authored pixels, and anonymous local storage.
const STATE_KEY = "inspiration-canvas:temporary-state";
const IMAGE_WIDTH = 240;
const IMAGE_HEIGHT = 120;
type Crop = { x: number; y: number; width: number; height: number };
const FULL: Crop = { x: 0, y: 0, width: 1, height: 1 };

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const name = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4), checksum = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function authoredPng(): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(IMAGE_WIDTH, 0); header.writeUInt32BE(IMAGE_HEIGHT, 4);
  header[8] = 8; header[9] = 6; // 8-bit RGBA, standard compression/filter, no interlace.
  const stride = 1 + IMAGE_WIDTH * 4;
  const pixels = Buffer.alloc(IMAGE_HEIGHT * stride);
  for (let y = 0; y < IMAGE_HEIGHT; y++) {
    for (let x = 0; x < IMAGE_WIDTH; x++) {
      const offset = y * stride + 1 + x * 4; // Each row starts with PNG filter 0.
      pixels[offset] = x < IMAGE_WIDTH / 2 ? 225 : 35;
      pixels[offset + 1] = Math.round(y * 255 / (IMAGE_HEIGHT - 1));
      pixels[offset + 2] = x < IMAGE_WIDTH / 2 ? 55 : 215;
      pixels[offset + 3] = 255;
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header), pngChunk("IDAT", deflateSync(pixels)), pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

test.use({ storageState: { cookies: [], origins: [] }, serviceWorkers: "block" });

async function uploadFixture(page: Page) {
  const blockedWrites: string[] = [];
  // A regression into authenticated/server upload must fail without issuing writes.
  await page.context().route("**/*", async route => {
    const request = route.request();
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) {
      blockedWrites.push(`${request.method()} ${new URL(request.url()).pathname}`);
      await route.abort("blockedbyclient");
    } else await route.continue();
  });
  await page.goto("/");
  await expect(page.getByText("Untitled inspiration canvas", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Keep temporary", exact: true }).click();
  await expect(page.getByRole("button", { name: "Upload", exact: true })).toBeVisible();
  await page.getByTestId("media-upload-input").setInputFiles({
    name: "authored-crop-240x120.png", mimeType: "image/png", buffer: authoredPng(),
  });
  const item = page.getByTestId("media-item");
  await expect(item).toHaveCount(1);
  await expect(item).toBeVisible();
  const id = await item.getAttribute("data-media-id");
  expect(id).toMatch(/^temp-/);
  await page.getByRole("button", { name: "Fit view", exact: true }).click();
  return { item, id: id!, blockedWrites };
}

async function openCrop(page: Page, item: Locator): Promise<Locator> {
  await item.click();
  await item.getByRole("button", { name: "Media actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Crop", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Crop image", exact: true });
  await expect(dialog.getByRole("button", { name: "Resize crop from right", exact: true })).toBeEnabled();
  await expect.poll(() => dialog.getByTestId("crop-preview-image").evaluate(element => {
    const image = element as HTMLImageElement;
    return [image.naturalWidth, image.naturalHeight];
  })).toEqual([IMAGE_WIDTH, IMAGE_HEIGHT]);
  return dialog;
}

async function selectedCrop(dialog: Locator): Promise<Crop> {
  return dialog.evaluate(element => {
    const image = element.querySelector('[data-testid="crop-preview-image"]')!.getBoundingClientRect();
    const selection = element.querySelector('[data-testid="crop-selection"]')!.getBoundingClientRect();
    return { x: (selection.x - image.x) / image.width, y: (selection.y - image.y) / image.height,
      width: selection.width / image.width, height: selection.height / image.height };
  });
}

function expectCrop(actual: Crop, expected: Crop) {
  for (const key of ["x", "y", "width", "height"] as const) expect(actual[key]).toBeCloseTo(expected[key], 3);
}

async function persistedCrop(page: Page, id: string): Promise<Crop | null> {
  return page.evaluate(({ key, id }) => {
    const state = JSON.parse(localStorage.getItem(key)!);
    const item = state.mediaItems.find((entry: { id: string }) => entry.id === id);
    if (!item) throw new Error("The disposable image was not persisted.");
    return item.cropJson;
  }, { key: STATE_KEY, id });
}

async function mouseResizeRight(page: Page, dialog: Locator, delta: number) {
  const target = dialog.getByRole("button", { name: "Resize crop from right", exact: true });
  await target.scrollIntoViewIfNeeded();
  await target.click({ trial: true });
  const image = await dialog.getByTestId("crop-preview-image").boundingBox();
  const handle = await target.boundingBox();
  expect(image).not.toBeNull(); expect(handle).not.toBeNull();
  const x = handle!.x + handle!.width / 2, y = handle!.y + handle!.height / 2;
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x + image!.width * delta, y, { steps: 8 });
  await page.mouse.up();
}

async function assertRenderedCrop(item: Locator, crop: Crop) {
  await expect(item.getByTestId("media-crop-viewport")).toHaveAttribute("data-cropped", "true");
  await expect(async () => {
    const geometry = await item.getByTestId("media-image").evaluate(element => {
      const image = element as HTMLImageElement;
      const rect = (node: Element) => {
        const box = node.getBoundingClientRect();
        return { x: box.x, y: box.y, width: box.width, height: box.height };
      };
      return { image: rect(image), viewport: rect(image.parentElement!),
        frame: rect(image.closest('[data-testid="media-crop-viewport"]')!),
        naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight };
    });
    expect([geometry.naturalWidth, geometry.naturalHeight]).toEqual([IMAGE_WIDTH, IMAGE_HEIGHT]);
    const { image, viewport, frame } = geometry;
    expect(image.width).toBeGreaterThan(0); expect(image.height).toBeGreaterThan(0);
    // Independent DOM geometry, not the app's style helper. The old object-cover
    // layout maps a half-width selection into the whole frame and fails these ratios.
    expect(image.width / image.height).toBeCloseTo(IMAGE_WIDTH / IMAGE_HEIGHT, 2);
    expect(viewport.width / viewport.height).toBeCloseTo(IMAGE_WIDTH * crop.width / (IMAGE_HEIGHT * crop.height), 2);
    expectCrop({ x: (viewport.x - image.x) / image.width, y: (viewport.y - image.y) / image.height,
      width: viewport.width / image.width, height: viewport.height / image.height }, crop);
    expect(viewport.x).toBeGreaterThanOrEqual(frame.x - 1);
    expect(viewport.y).toBeGreaterThanOrEqual(frame.y - 1);
    expect(viewport.x + viewport.width).toBeLessThanOrEqual(frame.x + frame.width + 1);
    expect(viewport.y + viewport.height).toBeLessThanOrEqual(frame.y + frame.height + 1);
    expect(Math.min(Math.abs(frame.width - viewport.width), Math.abs(frame.height - viewport.height))).toBeLessThan(1.5);
  }).toPass({ timeout: 5_000 });
}

async function saveCrop(page: Page, dialog: Locator, item: Locator, id: string, expected: Crop) {
  await dialog.getByRole("button", { name: "Save crop", exact: true }).click();
  await expect(dialog).toBeHidden();
  const saved = await persistedCrop(page, id);
  expect(saved).not.toBeNull(); expectCrop(saved!, expected);
  await assertRenderedCrop(item, saved!);
  return saved!;
}

test.describe("anonymous crop desktop", () => {
  test.use({ viewport: { width: 1440, height: 1000 }, isMobile: false, hasTouch: false });

  test("mouse resize and keyboard Move preserve saved pixel geometry after reload", async ({ page }) => {
    const { item, id, blockedWrites } = await uploadFixture(page);
    const dialog = await openCrop(page, item);
    await mouseResizeRight(page, dialog, -0.5);
    expectCrop(await selectedCrop(dialog), { ...FULL, width: 0.5 });
    const move = dialog.getByRole("button", { name: "Move crop", exact: true });
    await move.press("ArrowRight"); await move.press("Shift+ArrowRight");
    await expect(move).toBeFocused();
    const selection = await selectedCrop(dialog);
    expectCrop(selection, { ...FULL, x: 0.06, width: 0.5 });
    const saved = await saveCrop(page, dialog, item, id, selection);
    await page.reload();
    await expect(item).toBeVisible();
    expectCrop((await persistedCrop(page, id))!, saved);
    await assertRenderedCrop(item, saved);
    const reopened = await openCrop(page, item);
    expectCrop(await selectedCrop(reopened), saved);
    await reopened.getByRole("button", { name: "Cancel", exact: true }).click();
    expect(blockedWrites).toEqual([]);
  });

  test("Cancel discards selection changes and Reset persists only after Save", async ({ page }) => {
    const { item, id, blockedWrites } = await uploadFixture(page);
    let dialog = await openCrop(page, item);
    await dialog.getByRole("button", { name: "Resize crop from right", exact: true }).press("Shift+ArrowLeft");
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    expect(await persistedCrop(page, id)).toBeNull();
    await expect(item.getByTestId("media-crop-viewport")).toHaveAttribute("data-cropped", "false");
    dialog = await openCrop(page, item);
    expectCrop(await selectedCrop(dialog), FULL);
    await mouseResizeRight(page, dialog, -0.5);
    const saved = await saveCrop(page, dialog, item, id, await selectedCrop(dialog));
    dialog = await openCrop(page, item);
    await dialog.getByRole("button", { name: "Reset crop", exact: true }).click();
    expectCrop(await selectedCrop(dialog), FULL);
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    expectCrop((await persistedCrop(page, id))!, saved);
    dialog = await openCrop(page, item);
    expectCrop(await selectedCrop(dialog), saved);
    await dialog.getByRole("button", { name: "Reset crop", exact: true }).click();
    await saveCrop(page, dialog, item, id, FULL);
    await page.reload();
    await expect(item).toBeVisible();
    expectCrop((await persistedCrop(page, id))!, FULL);
    await assertRenderedCrop(item, FULL);
    expect(blockedWrites).toEqual([]);
  });

  test("a local save failure retains the selection and permits retry", async ({ page }) => {
    const { item, id, blockedWrites } = await uploadFixture(page);
    const dialog = await openCrop(page, item);
    await mouseResizeRight(page, dialog, -0.5);
    const selection = await selectedCrop(dialog);
    const durableBefore = await page.evaluate(key => localStorage.getItem(key), STATE_KEY);
    // Only this context and the owned temporary-state key are faulted; no app hook.
    const restore = await page.evaluateHandle(key => {
      const descriptor = Object.getOwnPropertyDescriptor(Storage.prototype, "setItem")!;
      Object.defineProperty(Storage.prototype, "setItem", { ...descriptor, value: function (this: Storage, name: string, value: string) {
        if (this === window.localStorage && name === key) throw new DOMException("Crop acceptance: temporary storage is full.", "QuotaExceededError");
        return descriptor.value.call(this, name, value);
      } });
      return () => { Object.defineProperty(Storage.prototype, "setItem", descriptor); };
    }, STATE_KEY);
    try {
      await dialog.getByRole("button", { name: "Save crop", exact: true }).click();
      await expect(dialog.getByRole("alert")).toContainText("Crop not saved");
      await expect(dialog.getByRole("alert")).toContainText("Crop acceptance: temporary storage is full.");
      await expect(dialog.getByRole("button", { name: "Save crop", exact: true })).toBeEnabled();
      expectCrop(await selectedCrop(dialog), selection);
      expect(await page.evaluate(key => localStorage.getItem(key), STATE_KEY)).toBe(durableBefore);
      expect(await persistedCrop(page, id)).toBeNull();
      await expect(item.getByTestId("media-crop-viewport")).toHaveAttribute("data-cropped", "false");
    } finally {
      await restore.evaluate(restoreStorage => restoreStorage());
      await restore.dispose();
    }
    await saveCrop(page, dialog, item, id, selection);
    expect(blockedWrites).toEqual([]);
  });
});

type DeliveredPoint = {
  x: number; y: number; pointerId: number; pointerType: string; trusted: boolean; primary: boolean;
  preview: { x: number; y: number; width: number; height: number };
};

async function touchDrag(page: Page, session: CDPSession, target: Locator, dxFraction: number, dyFraction: number) {
  await target.scrollIntoViewIfNeeded();
  await target.click({ trial: true });
  const plannedPreview = await target.evaluate(element => {
    const rect = element.closest('[role="dialog"]')!.querySelector('[data-testid="crop-preview-image"]')!.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
  expect(plannedPreview.width).toBeGreaterThan(0); expect(plannedPreview.height).toBeGreaterThan(0);
  const dx = dxFraction * plannedPreview.width, dy = dyFraction * plannedPreview.height;
  const box = await target.boundingBox();
  expect(box).not.toBeNull();
  const x = box!.x + box!.width / 2, y = box!.y + box!.height / 2;
  const label = await target.getAttribute("aria-label") || await target.innerText();
  const capture = await target.evaluateHandle(element => {
    const preview = element.closest('[role="dialog"]')!.querySelector('[data-testid="crop-preview-image"]')!;
    const values: { down: DeliveredPoint | null; up: DeliveredPoint | null; cancelled: boolean } = { down: null, up: null, cancelled: false };
    const point = (event: PointerEvent): DeliveredPoint => {
      const rect = preview.getBoundingClientRect();
      return { x: event.clientX, y: event.clientY, pointerId: event.pointerId, pointerType: event.pointerType, trusted: event.isTrusted, primary: event.isPrimary,
        preview: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } };
    };
    const listener = (event: PointerEvent) => {
      if (!event.isTrusted || event.pointerType !== "touch" || !event.isPrimary) return;
      if (event.type === "pointerdown" && values.down === null && event.target instanceof Node && element.contains(event.target)) values.down = point(event);
      else if (values.down?.pointerId === event.pointerId) {
        if (event.type === "pointerup") values.up = point(event);
        if (event.type === "pointercancel") values.cancelled = true;
      }
    };
    for (const type of ["pointerdown", "pointerup", "pointercancel"]) document.addEventListener(type, listener as EventListener, true);
    return { values, dispose: () => {
      for (const type of ["pointerdown", "pointerup", "pointercancel"]) document.removeEventListener(type, listener as EventListener, true);
    } };
  });
  const point = (x: number, y: number) => [{ x, y, id: 1, radiusX: 1, radiusY: 1, force: 1 }];
  let touching = false;
  try {
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: point(x, y) });
    touching = true;
    for (let step = 1; step <= 8; step++) {
      await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: point(x + dx * step / 8, y + dy * step / 8) });
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
    }
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    touching = false;
    await expect.poll(() => capture.evaluate(capture => capture.values.up !== null || capture.values.cancelled)).toBe(true);
    const delivered = await capture.evaluate(capture => capture.values);
    expect(delivered.cancelled).toBe(false);
    expect(delivered.down).not.toBeNull(); expect(delivered.up).not.toBeNull();
    const down = delivered.down!, up = delivered.up!;
    expect(up.pointerId).toBe(down.pointerId);
    const actualDx = up.x - down.x, actualDy = up.y - down.y;
    for (const error of [down.x - x, down.y - y, up.x - (x + dx), up.y - (y + dy), actualDx - dx, actualDy - dy]) expect(Math.abs(error)).toBeLessThanOrEqual(1);
    // The opening animation and scrolling must finish before planning input;
    // diagnose any later layout shift instead of weakening crop assertions.
    for (const endpoint of [down, up]) {
      for (const key of ["x", "y", "width", "height"] as const) expect(endpoint.preview[key]).toBeCloseTo(plannedPreview[key], 3);
    }
    expect(down.preview.width).toBeGreaterThan(0); expect(down.preview.height).toBeGreaterThan(0);
    return { dx: actualDx, dy: actualDy, preview: down.preview };
  } finally {
    if (touching) await session.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] }).catch(() => {});
    const delivered = await capture.evaluate(capture => capture.values).catch(() => null);
    console.log("crop-touch-input", JSON.stringify({ target: label, requested: { x, y, dx, dy, dxFraction, dyFraction }, plannedPreview, delivered,
      delta: delivered?.down && delivered.up ? { dx: delivered.up.x - delivered.down.x, dy: delivered.up.y - delivered.down.y } : null }));
    await capture.evaluate(capture => capture.dispose()).catch(() => {});
    await capture.dispose();
  }
}

test.describe("anonymous crop mobile touch", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("touch resize and drag Move preserve selected pixels at 390 by 844", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "Trusted CDP touch acceptance requires the owned Chromium runner.");
    const { item, id, blockedWrites } = await uploadFixture(page);
    const dialog = await openCrop(page, item);
    const events = await page.evaluateHandle(() => {
      const values: { type: string; trusted: boolean }[] = [];
      const listener = (event: PointerEvent) => {
        if (event.target instanceof Element && event.target.closest('[role="dialog"]')) values.push({ type: event.pointerType, trusted: event.isTrusted });
      };
      document.addEventListener("pointerdown", listener, true);
      return { values, dispose: () => document.removeEventListener("pointerdown", listener, true) };
    });
    // This is browser-emulated touch, not user Chrome, a physical phone, or a native picker.
    // https://playwright.dev/docs/api/class-browsercontext#browser-context-new-cdp-session
    const session = await page.context().newCDPSession(page);
    try {
      const resize = await touchDrag(page, session, dialog.getByRole("button", { name: "Resize crop from right", exact: true }), -0.5, 0);
      const expectedResize = { ...FULL, width: 1 + resize.dx / resize.preview.width };
      expectCrop(await selectedCrop(dialog), expectedResize);
      const movement = await touchDrag(page, session, dialog.getByRole("button", { name: "Drag to move crop", exact: true }), 0.08, 0);
      const expectedMove = { ...expectedResize,
        x: Math.max(0, Math.min(1 - expectedResize.width, movement.dx / movement.preview.width)),
        y: Math.max(0, Math.min(1 - expectedResize.height, movement.dy / movement.preview.height)) };
      const selection = await selectedCrop(dialog);
      expectCrop(selection, expectedMove);
      const received = await events.evaluate(events => events.values);
      expect(received.length).toBeGreaterThanOrEqual(2);
      expect(received.every(event => event.type === "touch" && event.trusted)).toBe(true);
      const saved = await saveCrop(page, dialog, item, id, selection);
      await page.reload();
      await expect(item).toBeVisible();
      expectCrop((await persistedCrop(page, id))!, saved);
      await assertRenderedCrop(item, saved);
      expect(await page.evaluate(() => ({ width: innerWidth, overflow: document.documentElement.scrollWidth > innerWidth }))).toEqual({ width: 390, overflow: false });
      expect(blockedWrites).toEqual([]);
    } finally {
      await events.evaluate(events => events.dispose()).catch(() => {});
      await events.dispose();
      await session.detach();
    }
  });
});
