import {
  generateChildImageBytes,
  proposeChildMediaPrompt,
} from "@/lib/ai/service";
import {
  getGenerationRun,
  getMediaItem,
  updateGenerationRun,
} from "@/lib/db/repository";
import { completeChildGeneration } from "@/lib/workflows/media-processing";

export async function runChildGeneration(runId: string): Promise<{ mediaItemId: string }> {
  const run = await getGenerationRun(runId);
  if (!run) throw new Error(`Generation run ${runId} not found.`);
  await updateGenerationRun(run.id, { status: "running" });
  const parents = (
    await Promise.all(run.mediaItemIdsJson.map((mediaId) => getMediaItem(mediaId)))
  ).filter((item) => item != null);
  if (parents.length < 2) throw new Error("At least two parent media items are required.");
  const prompt =
    run.prompt ||
    (await proposeChildMediaPrompt({
      mediaItems: parents,
    }));
  await updateGenerationRun(run.id, { prompt });
  const image = await generateChildImageBytes(prompt);
  const child = await completeChildGeneration({
    run: { ...run, prompt },
    parentItems: parents,
    prompt,
    image,
  });
  return { mediaItemId: child.id };
}

