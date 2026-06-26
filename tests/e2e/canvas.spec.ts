import { expect, test } from "@playwright/test";

const MOCK_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64",
);

async function uploadMockImage(page: import("@playwright/test").Page, name: string) {
  await expect(page.getByText("Untitled inspiration canvas")).toBeVisible({
    timeout: 10_000,
  });
  await dismissTemporaryDialog(page);
  await expect(page.getByRole("button", { name: "Upload", exact: true })).toBeVisible();
  await page.getByTestId("media-upload-input").setInputFiles({
    name,
    mimeType: "image/png",
    buffer: MOCK_PNG,
  });
  const item = page.getByTestId("media-item").last();
  await expect(item).toBeVisible({ timeout: 10_000 });
  return item;
}

async function dismissTemporaryDialog(page: import("@playwright/test").Page) {
  const keepTemporary = page.getByRole("button", { name: "Keep temporary" });
  if (await keepTemporary.isVisible().catch(() => false)) {
    await keepTemporary.click();
  }
}

async function zoomValue(page: import("@playwright/test").Page) {
  const text = await page.locator("text=/\\d+%/").first().textContent();
  return Number(text?.replace("%", "") || 0);
}

test("loads the canvas and exposes offline AI behavior", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Untitled inspiration canvas")).toBeVisible();
  await dismissTemporaryDialog(page);
  await expect(page.getByRole("button", { name: "Upload", exact: true })).toBeVisible();
  await expect(page.getByLabel("Generate taste text")).toBeDisabled();
  await expect(page.getByLabel("Generate child media")).toBeDisabled();
});

test("uploads media, edits it, comments, previews, and degrades AI clearly", async ({
  page,
}) => {
  await page.goto("/");
  const item = await uploadMockImage(page, `mock-${Date.now()}.png`);

  const beforeDrag = await item.boundingBox();
  expect(beforeDrag).not.toBeNull();
  await page.mouse.move(beforeDrag!.x + beforeDrag!.width / 2, beforeDrag!.y + beforeDrag!.height / 2);
  await page.mouse.down();
  await page.mouse.move(beforeDrag!.x + beforeDrag!.width / 2 + 80, beforeDrag!.y + beforeDrag!.height / 2 + 40, {
    steps: 8,
  });
  await page.mouse.up();
  const afterDrag = await item.boundingBox();
  expect(afterDrag?.x).toBeGreaterThan((beforeDrag?.x || 0) + 20);

  const beforeResize = await item.boundingBox();
  expect(beforeResize).not.toBeNull();
  const resizeHandle = page.locator(".resize-handle-bottom-right").last();
  const handleBox = await resizeHandle.boundingBox();
  expect(handleBox).not.toBeNull();
  await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox!.x + handleBox!.width / 2 + 70, handleBox!.y + handleBox!.height / 2 + 40, {
    steps: 8,
  });
  await page.mouse.up();
  const afterResize = await item.boundingBox();
  expect(afterResize?.width).toBeGreaterThan((beforeResize?.width || 0) + 20);

  const beforeZoom = await zoomValue(page);
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect.poll(() => zoomValue(page)).toBeGreaterThan(beforeZoom);
  const afterZoomIn = await zoomValue(page);
  await page.getByRole("button", { name: "Zoom out" }).click();
  await expect.poll(() => zoomValue(page)).toBeLessThan(afterZoomIn);

  await item.click();
  await expect(page.getByLabel("Generate taste text")).toBeEnabled();
  const mediaId = await item.getAttribute("data-media-id");
  expect(mediaId).toBeTruthy();

  await item.getByRole("button", { name: "Media actions" }).click();
  await page.getByRole("menuitem", { name: "Crop" }).click();
  const cropDialog = page.getByRole("dialog", { name: "Crop metadata" });
  await cropDialog.getByLabel("x").fill("0.10");
  await cropDialog.getByLabel("y").fill("0.10");
  await cropDialog.getByLabel("width").fill("0.80");
  await cropDialog.getByLabel("height").fill("0.80");
  await page.getByRole("button", { name: "Save crop" }).click();
  await expect(item.getByTestId("media-crop-viewport")).toHaveAttribute("data-cropped", "true");

  await item.getByRole("button", { name: "Media actions" }).click();
  await page.getByRole("menuitem", { name: "Comments" }).click();
  await page.getByPlaceholder("Add a note about why this reference matters...").fill("Strong contrast and compact composition.");
  await page.getByRole("button", { name: "Add comment" }).click();
  await expect(page.getByText("Strong contrast and compact composition.")).toBeVisible();
  await page.keyboard.press("Escape");

  await item.dblclick();
  await expect(page.getByRole("button", { name: "Close preview" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Close preview" })).toBeHidden();
  await item.click();
  await expect(page.getByLabel("Generate taste text")).toBeEnabled();

  await page.getByLabel("Generate taste text").click();
  await expect(page.getByText("Sign in to save this temporary canvas before using AI actions.")).toBeVisible();
});

test("multi-select enables taste and child media actions", async ({ page }) => {
  await page.goto("/");
  await uploadMockImage(page, `multi-a-${Date.now()}.png`);
  await uploadMockImage(page, `multi-b-${Date.now()}.png`);

  await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");

  await expect(page.getByLabel("Generate taste text")).toBeEnabled();
  await expect(page.getByLabel("Generate child media")).toBeEnabled();
});
