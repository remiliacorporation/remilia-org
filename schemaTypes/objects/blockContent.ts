import { defineArrayMember, defineType } from "sanity";
import {
  CodeDecorator,
  DividerBlock,
  H2Style,
  H3Style,
  H4Style,
  ImageBlock,
  LinkAnnotation,
  LinkHrefInput,
  QuoteStyle,
  VideoBlock,
} from "../../studio/portableText";
import { hasOldFootnotes } from "../../packages/renderer/src/footnotes";

export const blockContent = defineType({
  name: "blockContent",
  title: "Body",
  type: "array",
  // A note in the old shape (a mark on an empty span) is deleted by the
  // editor's first keystroke in its paragraph. The text stays locked until
  // the footnote migration has moved the post's notes
  // (hosts/maintenance/migrate-footnotes.ts).
  readOnly: ({ value }) => hasOldFootnotes(value),
  of: [
    defineArrayMember({
      type: "block",
      styles: [
        { title: "Normal", value: "normal" },
        { title: "H2", value: "h2", component: H2Style },
        { title: "H3", value: "h3", component: H3Style },
        { title: "H4", value: "h4", component: H4Style },
        { title: "Quote", value: "blockquote", component: QuoteStyle },
      ],
      lists: [
        { title: "Bullet", value: "bullet" },
        { title: "Numbered", value: "number" },
      ],
      marks: {
        decorators: [
          { title: "Strong", value: "strong" },
          { title: "Emphasis", value: "em" },
          { title: "Code", value: "code", component: CodeDecorator },
        ],
        annotations: [
          {
            name: "link",
            type: "object",
            title: "Link",
            components: { annotation: LinkAnnotation },
            fields: [
              {
                name: "href",
                type: "url",
                title: "URL",
                components: { input: LinkHrefInput },
                validation: (r) =>
                  r.uri({
                    allowRelative: true,
                    scheme: ["http", "https", "mailto", "tel"],
                  }),
              },
            ],
          },
        ],
      },
      // Footnotes are inline objects (schemaTypes/objects/footnote.ts).
      of: [defineArrayMember({ type: "footnote" })],
    }),
    defineArrayMember({
      name: "divider",
      type: "object",
      title: "Divider",
      components: { block: DividerBlock },
      fields: [
        { name: "kind", type: "string", initialValue: "hr", readOnly: true, hidden: true },
      ],
      preview: { prepare: () => ({ title: "Divider" }) },
    }),
    defineArrayMember({
      name: "video",
      type: "object",
      title: "Video",
      components: { block: VideoBlock },
      fields: [
        {
          name: "file",
          type: "file",
          title: "Video file",
          options: { accept: "video/*" },
          validation: (r) => r.required(),
        },
        { name: "caption", type: "string", title: "Caption" },
        {
          name: "poster",
          type: "image",
          title: "Poster frame",
          description: "Optional still shown before playback.",
        },
      ],
      preview: {
        select: { title: "caption", media: "poster", filename: "file.asset.originalFilename" },
        prepare: ({ title, media, filename }) => ({
          title: title ?? filename ?? "Video",
          media,
        }),
      },
    }),
    defineArrayMember({
      type: "image",
      options: { hotspot: true },
      components: { block: ImageBlock },
      fields: [
        {
          name: "alt",
          type: "string",
          title: "Alt text",
          description:
            "Required — describes the image for screen readers, search, and LLMs.",
        },
        { name: "caption", type: "string", title: "Caption" },
      ],
      validation: (r) =>
        r.custom((img?: { alt?: string; asset?: unknown }) =>
          img?.asset && !img.alt ? "Alt text is required on body images" : true,
        ),
    }),
  ],
});
