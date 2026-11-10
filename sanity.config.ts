import { defineConfig } from "sanity";
import { structureTool } from "sanity/structure";
import { visionTool } from "@sanity/vision";
import {
  defineDocuments,
  defineLocations,
  presentationTool,
} from "sanity/presentation";
import { schemaTypes } from "./schemaTypes";
import { structure } from "./structure";
import { SettingsField } from "./studio/postInput";
import { PresentationHeader } from "./studio/presentationHeader";
import { CHANNELS } from "./lib/access";
import { CHANNEL_BASEPATH } from "./packages/seo/src/urls";
import "./studio/editor.css";
import "./studio/presentation.css";

// The visual-editing preview server (`pnpm dev:preview`). A deployed Studio
// needs SANITY_STUDIO_PREVIEW_URL pointing at a hosted preview.
const PREVIEW_URL =
  process.env.SANITY_STUDIO_PREVIEW_URL || "http://localhost:3334";

export default defineConfig({
  name: "remilia",
  title: "Remilia",
  projectId: "8x9419lh",
  dataset: "production",
  plugins: [
    structureTool({ structure }),
    presentationTool({
      title: "Visual editor",
      previewUrl: { initial: PREVIEW_URL },
      resolve: {
        mainDocuments: defineDocuments(
          CHANNELS.map(({ value }) => ({
            route: `${CHANNEL_BASEPATH[value]}/:slug`,
            filter: `_type == "post" && channel == "${value}" && slug.current == $slug`,
          })),
        ),
        locations: {
          post: defineLocations({
            select: { title: "title", slug: "slug.current", channel: "channel" },
            resolve: (doc) => {
              const base =
                doc?.channel && doc.channel in CHANNEL_BASEPATH
                  ? CHANNEL_BASEPATH[doc.channel as keyof typeof CHANNEL_BASEPATH]
                  : undefined;
              if (!base || !doc?.slug) return null;
              return {
                locations: [
                  { title: doc.title || "Untitled", href: `${base}/${doc.slug}` },
                  { title: "Section index", href: `${base}/` },
                ],
              };
            },
          }),
        },
      },
      components: { unstable_header: { component: PresentationHeader } },
    }),
    visionTool(),
  ],
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
  form: {
    components: {
      field: SettingsField,
    },
  },
  document: {
    newDocumentOptions: (prev) => prev.filter((t) => t.templateId !== "org"),
  },
});
