import { describe, expect, it } from "vitest";

import { validateUploadFile } from "@/lib/media";

function makeFile(bytes: number[], type: string, name = "upload.bin"): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

describe("media validation", () => {
  it("sniffs png uploads without relying on the declared MIME type", async () => {
    const file = makeFile(
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00],
      "application/octet-stream",
      "reference.png",
    );

    await expect(validateUploadFile(file)).resolves.toMatchObject({
      mimeType: "image/png",
      safeName: "reference.png",
    });
  });

  it("sniffs webp uploads", async () => {
    const file = makeFile(
      [
        0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42,
        0x50,
      ],
      "application/octet-stream",
      "texture.webp",
    );

    await expect(validateUploadFile(file)).resolves.toMatchObject({
      mimeType: "image/webp",
    });
  });

  it("sniffs mp4 uploads when video uploads are enabled", async () => {
    const file = makeFile(
      [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d],
      "application/octet-stream",
      "motion.mp4",
    );

    await expect(validateUploadFile(file)).resolves.toMatchObject({
      mimeType: "video/mp4",
    });
  });

  it("rejects unsupported file types", async () => {
    const file = makeFile([0x68, 0x65, 0x6c, 0x6c, 0x6f], "text/plain", "note.txt");

    await expect(validateUploadFile(file)).rejects.toThrow("Unsupported file type");
  });
});
