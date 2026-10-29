import { deflateSync } from "node:zlib";

import { expect, test as base, type Locator, type Page } from "@playwright/test";

// Authored acceptance source only: browser/CI execution still requires approval.
// Playwright owns each disposable anonymous context; fixtures never seed app state.
const STATE_KEY = "inspiration-canvas:temporary-state";
type Metadata = { category: string | null; subcategory: string | null; tagsJson: string[] };
type UploadedImage = { id: string; item: Locator };
type Field = "Category" | "Subcategory" | "Tags";
const EMPTY_METADATA: Metadata = { category: null, subcategory: null, tagsJson: [] };

const test = base.extend<{ blockWrites: void }>({
  blockWrites: [async ({ context }, use, testInfo) => {
    const blockedWrites: string[] = [];
    // Block before navigation, including unexpected authenticated/API regressions.
    await context.route("**/*", async route => {
      const request = route.request();
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) {
        blockedWrites.push(`${request.method()} ${new URL(request.url()).pathname}`);
        await route.abort("blockedbyclient");
      } else await route.continue();
    });
    try {
      await use();
    } finally {
      await testInfo.attach("blocked-network-writes", {
        body: Buffer.from(JSON.stringify(blockedWrites)), contentType: "application/json",
      });
      expect(blockedWrites, "Anonymous metadata editing must issue no network writes.").toEqual([]);
    }
  }, { auto: true }],
});

test.use({ storageState: { cookies: [], origins: [] }, serviceWorkers: "block" });

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
  const width = 32, height = 24;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 6; // RGBA8; each row uses PNG filter 0.
  const pixels = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = y * (1 + width * 4) + 1 + x * 4;
      pixels[offset] = x < width / 2 ? 220 : 35;
      pixels[offset + 1] = Math.round(y * 255 / (height - 1));
      pixels[offset + 2] = 170;
      pixels[offset + 3] = 255;
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header), pngChunk("IDAT", deflateSync(pixels)), pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

async function activate(target: Locator, touch = false) {
  if (touch) await target.tap();
  else await target.click();
}

async function startCanvas(page: Page, touch = false) {
  await page.goto("/");
  await expect(page.getByText("Untitled inspiration canvas", { exact: true })).toBeVisible();
  await activate(page.getByRole("button", { name: "Keep temporary", exact: true }), touch);
  await expect(page.getByRole("button", { name: "Upload", exact: true })).toBeVisible();
}

async function uploadImages(page: Page, names: string[], touch = false): Promise<UploadedImage[]> {
  const before = await page.getByTestId("media-item").count();
  await page.getByTestId("media-upload-input").setInputFiles(names.map(name => ({
    name: `${name}.png`, mimeType: "image/png", buffer: authoredPng(),
  })));
  await expect(page.getByTestId("media-item")).toHaveCount(before + names.length);
  const uploaded: UploadedImage[] = [];
  for (let index = 0; index < names.length; index++) {
    const id = await page.getByTestId("media-item").nth(before + index).getAttribute("data-media-id");
    expect(id).toMatch(/^temp-/);
    uploaded.push({ id: id!, item: page.getByTestId("media-item").and(page.locator(`[data-media-id="${id}"]`)) });
  }
  await activate(page.getByRole("button", { name: "Fit view", exact: true }), touch);
  for (const { item } of uploaded) await expect(item).toBeVisible();
  return uploaded;
}

function infoPanel(page: Page) {
  return page.locator("aside").filter({ has: page.getByRole("button", { name: "Close info", exact: true }) });
}

async function openInfo(page: Page, image: UploadedImage, touch = false, contextMenu = false) {
  if (contextMenu) {
    // Batch uploads overlap by 32 canvas pixels; the first item's top-left remains exposed.
    await image.item.click({ button: "right", position: { x: 8, y: 8 } });
  } else {
    await activate(image.item, touch);
    await activate(image.item.getByRole("button", { name: "Media actions", exact: true }), touch);
  }
  await activate(page.getByRole("menuitem", { name: "Info", exact: true }), touch);
  const panel = infoPanel(page);
  await expect(panel).toBeVisible();
  for (const name of ["Category", "Subcategory", "Tags"] as const) {
    await expect(panel.getByRole("combobox", { name, exact: true })).toBeVisible();
  }
  return panel;
}

async function closeInfo(page: Page, touch = false) {
  await activate(infoPanel(page).getByRole("button", { name: "Close info", exact: true }), touch);
  await expect(infoPanel(page)).toHaveCount(0);
}

async function persistedMetadata(page: Page, id: string): Promise<Metadata> {
  return page.evaluate(({ key, id }) => {
    const state = JSON.parse(localStorage.getItem(key)!);
    const item = state.mediaItems.find((entry: { id: string }) => entry.id === id);
    if (!item) throw new Error("The authored temporary image was not persisted.");
    return { category: item.category, subcategory: item.subcategory, tagsJson: item.tagsJson };
  }, { key: STATE_KEY, id });
}

async function expectMetadataDraft(panel: Locator, expected: Metadata) {
  await expect(panel.getByRole("combobox", { name: "Category", exact: true })).toHaveValue(expected.category ?? "");
  await expect(panel.getByRole("combobox", { name: "Subcategory", exact: true })).toHaveValue(expected.subcategory ?? "");
  await expect(panel.getByRole("button", { name: /^Remove .+ from tags$/ })).toHaveCount(expected.tagsJson.length);
  for (const tag of expected.tagsJson) {
    await expect(panel.getByRole("button", { name: `Remove ${tag} from tags`, exact: true })).toHaveCount(1);
  }
}

async function expectNarrowPage(page: Page) {
  expect(await page.evaluate(() => ({
    viewport: innerWidth,
    documentOverflow: document.documentElement.scrollWidth > innerWidth,
    bodyOverflow: document.body.scrollWidth > innerWidth,
  }))).toEqual({ viewport: 390, documentOverflow: false, bodyOverflow: false });
}

async function expectUsableNarrowPopup(page: Page) {
  const listbox = page.getByRole("listbox");
  await expect(listbox).toBeVisible();
  const box = await listbox.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThan(40);
  expect(box!.height).toBeGreaterThan(0);
  expect(box!.x).toBeGreaterThanOrEqual(-1);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box!.y).toBeGreaterThanOrEqual(-1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
  await expectNarrowPage(page);
}

async function createValue(page: Page, panel: Locator, field: Field, value: string, touch = false) {
  const input = panel.getByRole("combobox", { name: field, exact: true });
  await activate(input, touch);
  await input.fill(value);
  const option = page.getByRole("option", { name: `Create “${value.trim()}”`, exact: true });
  await expect(option).toBeVisible();
  if (touch) await expectUsableNarrowPopup(page);
  await activate(option, touch);
  if (field === "Tags") {
    await expect(panel.getByRole("button", { name: `Remove ${value.trim()} from tags`, exact: true })).toHaveCount(1);
    await input.press("Escape");
  } else await expect(input).toHaveValue(value.trim());
}

async function chooseExisting(page: Page, panel: Locator, field: Field, value: string, touch = false) {
  const input = panel.getByRole("combobox", { name: field, exact: true });
  await activate(input, touch);
  await input.fill(value);
  const option = page.getByRole("option", { name: value, exact: true });
  await expect(option).toBeVisible();
  await expect(page.getByRole("option", { name: `Create “${value}”`, exact: true })).toHaveCount(0);
  if (touch) await expectUsableNarrowPopup(page);
  await activate(option, touch);
  if (field === "Tags") await input.press("Escape");
  else await expect(input).toHaveValue(value);
}

async function keyboardChooseExisting(page: Page, panel: Locator, field: "Category" | "Subcategory", query: string, value: string) {
  const input = panel.getByRole("combobox", { name: field, exact: true });
  await input.fill(query);
  const option = page.getByRole("option", { name: value, exact: true });
  await expect(option).toBeVisible();
  const id = await option.getAttribute("id");
  expect(id).not.toBeNull();
  await input.press("ArrowDown");
  for (let step = 0; step < 8 && await input.getAttribute("aria-activedescendant") !== id; step++) {
    await input.press("ArrowDown");
  }
  await expect(input).toHaveAttribute("aria-activedescendant", id!);
  await input.press("Enter");
  await expect(input).toHaveValue(value);
  await expect(input).toBeFocused();
}

async function saveInfo(page: Page, id: string, expected: Metadata, touch = false) {
  await activate(infoPanel(page).getByRole("button", { name: "Save info", exact: true }), touch);
  await expect.poll(() => persistedMetadata(page, id)).toEqual(expected);
  await expect(infoPanel(page).getByRole("button", { name: "Save info", exact: true })).toBeEnabled();
  await expect(infoPanel(page).getByText("Info not saved", { exact: true })).toHaveCount(0);
}

async function reloadCanvas(page: Page, count: number, touch = false) {
  await page.reload();
  await expect(page.getByTestId("media-item")).toHaveCount(count);
  await activate(page.getByRole("button", { name: "Fit view", exact: true }), touch);
}

test.describe("anonymous metadata desktop", () => {
  test.use({ viewport: { width: 1440, height: 1000 }, isMobile: false, hasTouch: false });

  test("creates and reuses all three metadata fields only after explicit Save info and reload", async ({ page }) => {
    await startCanvas(page);
    const [source] = await uploadImages(page, ["authored-metadata-source"]);
    let panel = await openInfo(page, source);
    const expected = { category: "Architecture", subcategory: "Courtyards", tagsJson: ["Warm light"] };
    await createValue(page, panel, "Category", expected.category);
    await createValue(page, panel, "Subcategory", expected.subcategory);
    await createValue(page, panel, "Tags", expected.tagsJson[0]);
    await expectMetadataDraft(panel, expected);
    expect(await persistedMetadata(page, source.id)).toEqual(EMPTY_METADATA);
    await saveInfo(page, source.id, expected);
    await closeInfo(page);

    const [target] = await uploadImages(page, ["authored-metadata-target"]);
    panel = await openInfo(page, target);
    await chooseExisting(page, panel, "Category", expected.category);
    await chooseExisting(page, panel, "Subcategory", expected.subcategory);
    await chooseExisting(page, panel, "Tags", expected.tagsJson[0]);
    await expectMetadataDraft(panel, expected);
    expect(await persistedMetadata(page, target.id)).toEqual(EMPTY_METADATA);
    await saveInfo(page, target.id, expected);
    await reloadCanvas(page, 2);
    panel = await openInfo(page, target);
    await expectMetadataDraft(panel, expected);
    expect(await persistedMetadata(page, source.id)).toEqual(expected);
    expect(await persistedMetadata(page, target.id)).toEqual(expected);
  });

  test("filters existing category and subcategory with keyboard selection without autosaving", async ({ page }) => {
    await startCanvas(page);
    const [source] = await uploadImages(page, ["authored-keyboard-source"]);
    let panel = await openInfo(page, source);
    const expected = { category: "Photography", subcategory: "Editorial studies", tagsJson: [] };
    await createValue(page, panel, "Category", expected.category);
    await createValue(page, panel, "Subcategory", expected.subcategory);
    await saveInfo(page, source.id, expected);
    await closeInfo(page);

    const [target] = await uploadImages(page, ["authored-keyboard-target"]);
    panel = await openInfo(page, target);
    await keyboardChooseExisting(page, panel, "Category", "photo", expected.category);
    await keyboardChooseExisting(page, panel, "Subcategory", "editor", expected.subcategory);
    await expectMetadataDraft(panel, expected);
    expect(await persistedMetadata(page, target.id)).toEqual(EMPTY_METADATA);
    expect(await persistedMetadata(page, source.id)).toEqual(expected);
    await saveInfo(page, target.id, expected);
    await reloadCanvas(page, 2);
    await expectMetadataDraft(await openInfo(page, target), expected);
  });

  test("keeps tags case-sensitive and comma-literal while removing and deduplicating selections", async ({ page }) => {
    await startCanvas(page);
    const [image] = await uploadImages(page, ["authored-tag-literals"]);
    const panel = await openInfo(page, image);
    for (const tag of ["Design", "design", "Research, notes"]) await createValue(page, panel, "Tags", tag);
    await expectMetadataDraft(panel, { category: null, subcategory: null, tagsJson: ["Design", "design", "Research, notes"] });

    const tags = panel.getByRole("combobox", { name: "Tags", exact: true });
    await tags.fill("Design");
    await expect(page.getByRole("option", { name: "Design", exact: true })).toBeVisible();
    await expect(page.getByRole("option", { name: "Create “Design”", exact: true })).toHaveCount(0);
    await tags.press("Escape");
    await expect(panel.getByRole("button", { name: "Remove Design from tags", exact: true })).toHaveCount(1);
    // Native keyboard activation must remove only the exact-case chip.
    await panel.getByRole("button", { name: "Remove design from tags", exact: true }).press("Enter");
    const expected = { category: null, subcategory: null, tagsJson: ["Design", "Research, notes"] };
    await expectMetadataDraft(panel, expected);
    expect(await persistedMetadata(page, image.id)).toEqual(EMPTY_METADATA);
    await saveInfo(page, image.id, expected);
    await reloadCanvas(page, 1);
    await expectMetadataDraft(await openInfo(page, image), expected);
    expect(await persistedMetadata(page, image.id)).toEqual(expected);
  });

  test("persists cleared category, subcategory, and tags as null and an empty array", async ({ page }) => {
    await startCanvas(page);
    const [image] = await uploadImages(page, ["authored-cleared-metadata"]);
    let panel = await openInfo(page, image);
    const original = { category: "Print", subcategory: "Posters", tagsJson: ["Type", "Colour"] };
    await createValue(page, panel, "Category", original.category);
    await createValue(page, panel, "Subcategory", original.subcategory);
    for (const tag of original.tagsJson) await createValue(page, panel, "Tags", tag);
    await saveInfo(page, image.id, original);
    await panel.getByRole("button", { name: "Clear category", exact: true }).press("Enter");
    await panel.getByRole("combobox", { name: "Category", exact: true }).press("Escape");
    await panel.getByRole("button", { name: "Clear subcategory", exact: true }).click();
    await panel.getByRole("combobox", { name: "Subcategory", exact: true }).press("Escape");
    for (const tag of original.tagsJson) await panel.getByRole("button", { name: `Remove ${tag} from tags`, exact: true }).click();
    await expectMetadataDraft(panel, EMPTY_METADATA);
    expect(await persistedMetadata(page, image.id)).toEqual(original);
    await saveInfo(page, image.id, EMPTY_METADATA);
    await reloadCanvas(page, 1);
    panel = await openInfo(page, image);
    await expectMetadataDraft(panel, EMPTY_METADATA);
    await expect(panel.getByRole("button", { name: "Clear category", exact: true })).toHaveCount(0);
    await expect(panel.getByRole("button", { name: "Clear subcategory", exact: true })).toHaveCount(0);
    expect(await persistedMetadata(page, image.id)).toEqual(EMPTY_METADATA);
  });

  test("discards canceled searches and unsaved choices when opening another media item", async ({ page }) => {
    await startCanvas(page);
    const [source, target] = await uploadImages(page, ["authored-switch-source", "authored-switch-target"]);
    let panel = await openInfo(page, source, false, true);
    const original = { category: "Saved source", subcategory: "Saved detail", tagsJson: ["Saved tag"] };
    await createValue(page, panel, "Category", original.category);
    await createValue(page, panel, "Subcategory", original.subcategory);
    await createValue(page, panel, "Tags", original.tagsJson[0]);
    await saveInfo(page, source.id, original);
    for (const [field, savedValue] of [["Category", original.category], ["Subcategory", original.subcategory]] as const) {
      const input = panel.getByRole("combobox", { name: field, exact: true });
      // Emptying search is distinct from the explicit Clear metadata button.
      await input.fill("");
      expect(await persistedMetadata(page, source.id)).toEqual(original);
      await input.press("Escape");
      await expect(input).toHaveValue(savedValue);
      await input.fill(`Unselected ${field} search`);
      await expect(page.getByRole("option", { name: `Create “Unselected ${field} search”`, exact: true })).toBeVisible();
      expect(await persistedMetadata(page, source.id)).toEqual(original);
      await input.press("Escape");
      await expect(input).toHaveValue(savedValue);
    }
    await expectMetadataDraft(panel, original);
    await saveInfo(page, source.id, original);
    await createValue(page, panel, "Category", "Unsaved category");
    await createValue(page, panel, "Tags", "Unsaved tag");
    for (const field of ["Subcategory", "Tags"] as const) {
      const input = panel.getByRole("combobox", { name: field, exact: true });
      await input.fill(`Canceled ${field} search`);
      await expect(page.getByRole("option", { name: `Create “Canceled ${field} search”`, exact: true })).toBeVisible();
      await input.press("Escape");
    }
    expect(await persistedMetadata(page, source.id)).toEqual(original);
    await closeInfo(page);
    panel = await openInfo(page, target);
    await expectMetadataDraft(panel, EMPTY_METADATA);
    await expect(panel.getByRole("combobox", { name: "Tags", exact: true })).toHaveValue("");
    await expect(page.getByRole("option")).toHaveCount(0);
    await saveInfo(page, target.id, EMPTY_METADATA);
    expect(await persistedMetadata(page, source.id)).toEqual(original);
    await closeInfo(page);
    panel = await openInfo(page, source, false, true);
    await expectMetadataDraft(panel, original);
    await expect(panel.getByRole("combobox", { name: "Tags", exact: true })).toHaveValue("");
    expect(await persistedMetadata(page, target.id)).toEqual(EMPTY_METADATA);
  });

  test("retains metadata drafts after local storage failure and saves the same draft on retry", async ({ page }) => {
    await startCanvas(page);
    const [image] = await uploadImages(page, ["authored-storage-retry"]);
    const panel = await openInfo(page, image);
    const expected = { category: "Retained category", subcategory: "Retained detail", tagsJson: ["Retained, literal"] };
    await createValue(page, panel, "Category", expected.category);
    await createValue(page, panel, "Subcategory", expected.subcategory);
    await createValue(page, panel, "Tags", expected.tagsJson[0]);
    const durableBefore = await page.evaluate(key => localStorage.getItem(key), STATE_KEY);
    // Fault only this context's temporary-canvas write, then restore in all paths.
    const restore = await page.evaluateHandle(key => {
      const descriptor = Object.getOwnPropertyDescriptor(Storage.prototype, "setItem")!;
      Object.defineProperty(Storage.prototype, "setItem", {
        ...descriptor,
        value: function (this: Storage, name: string, value: string) {
          if (this === window.localStorage && name === key) {
            throw new DOMException("Metadata acceptance: temporary storage is full.", "QuotaExceededError");
          }
          return descriptor.value.call(this, name, value);
        },
      });
      return () => Object.defineProperty(Storage.prototype, "setItem", descriptor);
    }, STATE_KEY);
    try {
      await panel.getByRole("button", { name: "Save info", exact: true }).click();
      await expect(panel.getByText("Info not saved", { exact: true })).toBeVisible();
      await expect(panel.getByText("Metadata acceptance: temporary storage is full.", { exact: true })).toBeVisible();
      await expect(panel.getByRole("button", { name: "Save info", exact: true })).toBeEnabled();
      await expectMetadataDraft(panel, expected);
      expect(await page.evaluate(key => localStorage.getItem(key), STATE_KEY)).toBe(durableBefore);
      expect(await persistedMetadata(page, image.id)).toEqual(EMPTY_METADATA);
    } finally {
      await restore.evaluate(restoreStorage => restoreStorage());
      await restore.dispose();
    }
    await saveInfo(page, image.id, expected);
    await reloadCanvas(page, 1);
    await expectMetadataDraft(await openInfo(page, image), expected);
  });
});

test.describe("anonymous metadata narrow touch", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("creates and reuses metadata with narrow touch controls and persists after reload", async ({ page }) => {
    await startCanvas(page, true);
    const [source] = await uploadImages(page, ["authored-touch-source"], true);
    let panel = await openInfo(page, source, true);
    const expected = { category: "Mobile collection", subcategory: "Small-screen references", tagsJson: ["Touch, authored"] };
    await createValue(page, panel, "Category", expected.category, true);
    await createValue(page, panel, "Subcategory", expected.subcategory, true);
    await createValue(page, panel, "Tags", expected.tagsJson[0], true);
    expect(await persistedMetadata(page, source.id)).toEqual(EMPTY_METADATA);
    await saveInfo(page, source.id, expected, true);
    await closeInfo(page, true);

    const [target] = await uploadImages(page, ["authored-touch-target"], true);
    panel = await openInfo(page, target, true);
    await chooseExisting(page, panel, "Category", expected.category, true);
    await chooseExisting(page, panel, "Subcategory", expected.subcategory, true);
    await chooseExisting(page, panel, "Tags", expected.tagsJson[0], true);
    expect(await persistedMetadata(page, target.id)).toEqual(EMPTY_METADATA);
    await expectNarrowPage(page);
    await saveInfo(page, target.id, expected, true);
    await reloadCanvas(page, 2, true);
    panel = await openInfo(page, target, true);
    await expectMetadataDraft(panel, expected);
    await expectNarrowPage(page);
    expect(await persistedMetadata(page, source.id)).toEqual(expected);
    expect(await persistedMetadata(page, target.id)).toEqual(expected);
  });

  test("removes chips and clears fields with usable narrow touch popups and no overflow", async ({ page }) => {
    await startCanvas(page, true);
    const [image] = await uploadImages(page, ["authored-touch-clears"], true);
    let panel = await openInfo(page, image, true);
    const longTag = "ReferenceWithAnAuthoredUnbrokenLabelLongEnoughToExerciseWrappingOnANarrowScreen";
    const original = { category: "Narrow category", subcategory: "Narrow detail", tagsJson: [longTag, "Keep, together"] };
    await createValue(page, panel, "Category", original.category, true);
    await createValue(page, panel, "Subcategory", original.subcategory, true);
    for (const tag of original.tagsJson) await createValue(page, panel, "Tags", tag, true);
    await expectNarrowPage(page);
    await saveInfo(page, image.id, original, true);
    await activate(panel.getByRole("button", { name: `Remove ${longTag} from tags`, exact: true }), true);
    await expect(panel.getByRole("button", { name: "Remove Keep, together from tags", exact: true })).toBeVisible();
    await panel.getByRole("combobox", { name: "Tags", exact: true }).press("Escape");
    await activate(panel.getByRole("button", { name: "Clear category", exact: true }), true);
    await panel.getByRole("combobox", { name: "Category", exact: true }).press("Escape");
    await activate(panel.getByRole("button", { name: "Clear subcategory", exact: true }), true);
    await panel.getByRole("combobox", { name: "Subcategory", exact: true }).press("Escape");
    await activate(panel.getByRole("button", { name: "Remove Keep, together from tags", exact: true }), true);
    await expectMetadataDraft(panel, EMPTY_METADATA);
    await expectNarrowPage(page);
    expect(await persistedMetadata(page, image.id)).toEqual(original);
    await saveInfo(page, image.id, EMPTY_METADATA, true);
    await reloadCanvas(page, 1, true);
    panel = await openInfo(page, image, true);
    await expectMetadataDraft(panel, EMPTY_METADATA);
    await expectNarrowPage(page);
    expect(await persistedMetadata(page, image.id)).toEqual(EMPTY_METADATA);
  });
});
