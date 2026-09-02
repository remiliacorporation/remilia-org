import { defineConfig } from "sanity";
import { structureTool } from "sanity/structure";
import { visionTool } from "@sanity/vision";
import { schemaTypes } from "./schemaTypes";
import { structure } from "./structure";

export default defineConfig({
  name: "remilia",
  title: "Remilia",
  projectId: "8x9419lh",
  dataset: "production",
  plugins: [structureTool({ structure }), visionTool()],
  schema: {
    types: schemaTypes,
    templates: (prev) => [
      ...prev,
      {
        id: "post-by-channel",
        title: "Post in channel",
        schemaType: "post",
        parameters: [{ name: "channel", title: "Channel", type: "string" }],
        value: (params: { channel: string }) => ({ channel: params.channel }),
      },
    ],
  },
  document: {

    newDocumentOptions: (prev) => prev.filter((t) => t.templateId !== "org"),
  },
});

