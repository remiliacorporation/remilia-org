import { defineCliConfig } from "sanity/cli";

export default defineCliConfig({
  api: { projectId: "8x9419lh", dataset: "production" },
  studioHost: "remilia",
  deployment: {
    appId: "mlaa7zq1rrxtpsqrehwrwfiw",
    autoUpdates: true,
  },
});
