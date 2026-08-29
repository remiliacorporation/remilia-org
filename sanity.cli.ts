import { defineCliConfig } from "sanity/cli";

export default defineCliConfig({
  api: { projectId: "8x9419lh", dataset: "production" },
  studioHost: "remilia",
  autoUpdates: true,
  deployment: {
    appId: "mlaa7zq1rrxtpsqrehwrwfiw",
  },
});
