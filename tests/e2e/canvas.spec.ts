import { expect, test } from "@playwright/test";

const MOCK_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64",
);

async function uploadMockImage(page: import("@playwright/test").Page, name: string) {
  await expect(page.getByText("Untitled inspiration canvas")).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByRole("button", { name: "Upload" })).toBeVisible();
  const uploadResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/upload") && response.request().method() === "POST",
  );
  await page.getByTestId("media-upload-input").setInputFiles({
    name,
    mimeType: "image/png",
    buffer: MOCK_PNG,
  });
  const uploadResponse = await uploadResponsePromise;
  const uploadBody = await uploadResponse.text();
  expect(uploadResponse.ok(), uploadBody).toBeTruthy();
  const item = page.getByTestId("media-item").last();
  await expect(item).toBeVisible({ timeout: 10_000 });
  return item;
}

async function zoomValue(page: import("@playwright/test").Page) {
  const text = await page.locator("text=/\\d+%/").first().textContent();
  return Number(text?.replace("%", "") || 0);
}

test("loads the canvas and exposes offline AI behavior", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Inspiration Canvas")).toBeVisible();
  await expect(page.getByRole("button", { name: "Upload" })).toBeVisible();
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
  const dragPersisted = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/media/batch") &&
      response.request().method() === "PATCH",
  );
  await page.mouse.move(beforeDrag!.x + beforeDrag!.width / 2, beforeDrag!.y + beforeDrag!.height / 2);
  await page.mouse.down();
  await page.mouse.move(beforeDrag!.x + beforeDrag!.width / 2 + 80, beforeDrag!.y + beforeDrag!.height / 2 + 40, {
    steps: 8,
  });
  await page.mouse.up();
  expect((await dragPersisted).ok()).toBeTruthy();
  const afterDrag = await item.boundingBox();
  expect(afterDrag?.x).toBeGreaterThan((beforeDrag?.x || 0) + 20);

  const beforeResize = await item.boundingBox();
  expect(beforeResize).not.toBeNull();
  const resizePersisted = page.waitForResponse(
    (response) =>
      /\/api\/media\/(?!batch$)[^/]+$/.test(response.url()) &&
      response.request().method() === "PATCH",
  );
  const resizeHandle = page.locator(".resize-handle-bottom-right").last();
  const handleBox = await resizeHandle.boundingBox();
  expect(handleBox).not.toBeNull();
  await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox!.x + handleBox!.width / 2 + 70, handleBox!.y + handleBox!.height / 2 + 40, {
    steps: 8,
  });
  await page.mouse.up();
  const resizeResponse = await resizePersisted;
  expect(
    resizeResponse.ok(),
    `${resizeResponse.status()} ${await resizeResponse.text()}`,
  ).toBeTruthy();
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

  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Crop metadata" }).click();
  const cropDialog = page.getByRole("dialog", { name: "Crop metadata" });
  await cropDialog.getByLabel("x").fill("0.10");
  await cropDialog.getByLabel("y").fill("0.10");
  await cropDialog.getByLabel("width").fill("0.80");
  await cropDialog.getByLabel("height").fill("0.80");
  const cropResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/media/${mediaId}`) &&
      response.request().method() === "PATCH",
  );
  await page.getByRole("button", { name: "Save crop" }).click();
  const cropResponse = await cropResponsePromise;
  expect(cropResponse.ok(), `${cropResponse.status()} ${await cropResponse.text()}`).toBeTruthy();
  await expect(item.getByTestId("media-crop-viewport")).toHaveAttribute("data-cropped", "true");
  const persistedCropResponse = await page.request.get(`/api/media/${mediaId}`);
  expect(persistedCropResponse.ok()).toBeTruthy();
  const persistedCrop = (await persistedCropResponse.json()) as {
    media: { cropJson: { x: number; y: number; width: number; height: number } };
  };
  expect(persistedCrop.media.cropJson).toEqual({
    x: 0.1,
    y: 0.1,
    width: 0.8,
    height: 0.8,
  });

  await page.getByRole("button", { name: "More actions" }).click();
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

  const tasteResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/taste-brief") &&
      response.request().method() === "POST",
  );
  await page.getByLabel("Generate taste text").click();
  expect((await tasteResponse).status()).toBe(402);
  await expect(page.getByText("AI analysis requires Vercel AI Gateway credentials.")).toBeVisible();
});

test("multi-select enables taste and child media actions", async ({ page }) => {
  await page.goto("/");
  await uploadMockImage(page, `multi-a-${Date.now()}.png`);
  await uploadMockImage(page, `multi-b-${Date.now()}.png`);

  await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");

  await expect(page.getByLabel("Generate taste text")).toBeEnabled();
  await expect(page.getByLabel("Generate child media")).toBeEnabled();
});
