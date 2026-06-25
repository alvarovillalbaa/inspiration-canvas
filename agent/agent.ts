import type { LanguageModel } from "ai";
import { defineAgent } from "eve";

export default defineAgent({
  description:
    "Curator Agent for the inspiration canvas. It analyzes selected references, proposes design language, clusters media, suggests metadata, and prepares approved mutations.",
  model: (process.env.AI_TEXT_MODEL || "openai/gpt-5.4") as unknown as LanguageModel,
  modelContextWindowTokens: 128000,
  modelOptions: {
    providerOptions: {
      gateway: {
        tags: ["agent:curator"],
      },
    },
  },
});

