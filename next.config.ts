import type { NextConfig } from "next";
import { withEve } from "eve/next";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  serverExternalPackages: ["@vercel/oidc", "sharp"],
};

const workflowConfig = withWorkflow(nextConfig);
const enableEve =
  process.env.NODE_ENV !== "development" || process.env.ENABLE_EVE_DEV === "true";

export default enableEve ? withEve(workflowConfig) : workflowConfig;
