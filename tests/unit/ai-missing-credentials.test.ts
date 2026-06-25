import { describe, expect, it } from "vitest";

import { MissingAICredentialsError, assertAiAvailable } from "@/lib/ai/service";

function restoreEnv(name: string, value: string | undefined) {
  if (value == null) delete process.env[name];
  else process.env[name] = value;
}

describe("AI credential behavior", () => {
  it("throws a clear error when AI Gateway credentials are absent", () => {
    const oldKey = process.env.AI_GATEWAY_API_KEY;
    const oldOidc = process.env.VERCEL_OIDC_TOKEN;
    const oldEnable = process.env.ENABLE_AI;
    delete process.env.AI_GATEWAY_API_KEY;
    delete process.env.VERCEL_OIDC_TOKEN;
    process.env.ENABLE_AI = "true";
    expect(() => assertAiAvailable()).toThrow(MissingAICredentialsError);
    restoreEnv("AI_GATEWAY_API_KEY", oldKey);
    restoreEnv("VERCEL_OIDC_TOKEN", oldOidc);
    restoreEnv("ENABLE_AI", oldEnable);
  });
});
