import { defineConfig } from "sanity";
import { structureTool } from "sanity/structure";
import { visionTool } from "@sanity/vision";
import { schemaTypes } from "./schemaTypes";
import { DEFAULT_AUTHORS } from "./schemaTypes/documents/post";
import { defaultDocumentNode, structure } from "./structure";
import { SettingsField } from "./studio/postInput";
import "./studio/editor.css";

export default defineConfig({
  name: "remilia",
  title: "Remilia",
  projectId: "8x9419lh",
  dataset: "production",
  plugins: [structureTool({ structure, defaultDocumentNode }), visionTool()],
  schema: {
    types: schemaTypes,
    templates: (prev) => [
      ...prev,
      {
        id: "post-by-channel",
        title: "Post in channel",
        schemaType: "post",
        parameters: [{ name: "channel", title: "Channel", type: "string" }],
        value: (params: { channel: string }) => ({
          channel: params.channel,
          authors: DEFAULT_AUTHORS,
        }),
      },
    ],
  },
  form: {
    components: {
      field: SettingsField,
    },
  },
  document: {
    newDocumentOptions: (prev) => prev.filter((t) => t.templateId !== "org"),
  },
});
