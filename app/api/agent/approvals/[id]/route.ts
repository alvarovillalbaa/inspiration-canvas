import { NextResponse } from "next/server";

import {
  createGenerationRun,
  createTasteBrief,
  getAgentApproval,
  updateGenerationRun,
  updateAgentApprovalStatus,
  updateMediaItem,
  updateMediaItemsBatch,
} from "@/lib/db/repository";
import { mediaPatchSchema } from "@/lib/ai/schemas";
import { startChildGenerationRun } from "@/lib/workflows/start";

type ApprovalRouteContext = { params: Promise<{ id: string }> };

async function executeApprovedTool(approvalId: string) {
  const approval = await getAgentApproval(approvalId);
  if (!approval) return null;
  if (approval.status !== "pending") return { approval, result: null };

  const payload = approval.payloadJson;
  let result: unknown = null;

  if (approval.toolName === "updateMediaMetadata") {
    const mediaId = String(payload.mediaId || "");
    const patch = mediaPatchSchema
      .pick({
        tagsJson: true,
        category: true,
        subcategory: true,
        description: true,
      })
      .parse(payload.metadata || {});
    result = await updateMediaItem(mediaId, patch);
  } else if (approval.toolName === "createTasteBrief") {
    result = await createTasteBrief(
      String(payload.canvasId || approval.canvasId || ""),
      Array.isArray(payload.mediaIds)
        ? payload.mediaIds.map(String)
        : approval.mediaItemIdsJson,
      String(payload.text || ""),
    );
  } else if (approval.toolName === "generateChildMedia") {
    const run = await createGenerationRun({
      canvasId: String(payload.canvasId || approval.canvasId || ""),
      mediaIds: Array.isArray(payload.mediaIds)
        ? payload.mediaIds.map(String)
        : approval.mediaItemIdsJson,
      prompt: String(payload.prompt || ""),
      status: "pending",
    });
    await startChildGenerationRun(run.id).catch(async (error: unknown) => {
      await updateGenerationRun(run.id, {
        status: "failed",
        error:
          error instanceof Error
            ? error.message
            : "Child media generation failed to start.",
      });
    });
    result = run;
  } else if (approval.toolName === "autoArrangeMedia") {
    const positions = Array.isArray(payload.positions) ? payload.positions : [];
    result = await updateMediaItemsBatch(
      positions
        .filter(
          (position): position is { id: string; x: number; y: number } =>
            typeof position?.id === "string" &&
            typeof position?.x === "number" &&
            typeof position?.y === "number",
        )
        .map((position) => ({
          id: position.id,
          patch: { x: position.x, y: position.y },
        })),
    );
  }

  const updated = await updateAgentApprovalStatus(approval.id, "approved");
  return { approval: updated, result };
}

export async function GET(
  _request: Request,
  context: ApprovalRouteContext,
) {
  const { id } = await context.params;
  const approval = await getAgentApproval(id);
  if (!approval) return NextResponse.json({ error: "Approval not found." }, { status: 404 });
  return NextResponse.json({ approval });
}

export async function POST(
  request: Request,
  context: ApprovalRouteContext,
) {
  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { approved?: boolean };
  if (!body.approved) {
    const approval = await updateAgentApprovalStatus(id, "denied");
    if (!approval) {
      return NextResponse.json({ error: "Approval not found." }, { status: 404 });
    }
    return NextResponse.json({ approval, result: null });
  }

  const executed = await executeApprovedTool(id);
  if (!executed) {
    return NextResponse.json({ error: "Approval not found." }, { status: 404 });
  }
  return NextResponse.json(executed);
}
