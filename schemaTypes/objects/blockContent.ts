import { defineArrayMember, defineType } from "sanity";

export const blockContent = defineType({
  name: "blockContent",
  title: "Body",
  type: "array",
  of: [
    defineArrayMember({
      type: "block",
      styles: [
        { title: "Normal", value: "normal" },
        { title: "H2", value: "h2" },
        { title: "H3", value: "h3" },
        { title: "H4", value: "h4" },
        { title: "Quote", value: "blockquote" },
      ],
      lists: [
        { title: "Bullet", value: "bullet" },
        { title: "Numbered", value: "number" },
      ],
      marks: {
        decorators: [
          { title: "Strong", value: "strong" },
          { title: "Emphasis", value: "em" },
          { title: "Code", value: "code" },
        ],
        annotations: [
          {
            name: "link",
            type: "object",
            title: "Link",
            fields: [
              {
                name: "href",
                type: "url",
                title: "URL",
                validation: (r) =>
                  r.uri({
                    allowRelative: true,
                    scheme: ["http", "https", "mailto", "tel"],
                  }),
              },
            ],
          },
          {
            name: "footnote",
            type: "object",
            title: "Footnote",
            fields: [
              {
                name: "text",
                type: "text",
                title: "Footnote text",
                rows: 3,
              },
              {
                name: "n",
                type: "number",
                title: "Source note number",
                description:
                  "Optional: the note's number in the source document. Pins the rendered ref/id (fn-N) so in-note [N] references resolve to it; when absent, notes are numbered by position.",
              },
              {
                name: "image",
                type: "image",
                title: "Note image",
                description:
                  "For notes whose body is an image — rendered inside the note alongside any text.",
                options: { hotspot: false },
                fields: [
                  { name: "alt", type: "string", title: "Alt text" },
                  { name: "caption", type: "string", title: "Caption" },
                ],
              },
            ],
          },
        ],
      },
    }),
    defineArrayMember({
      name: "divider",
      type: "object",
      title: "Divider",
      fields: [
        { name: "kind", type: "string", initialValue: "hr", readOnly: true, hidden: true },
      ],
      preview: { prepare: () => ({ title: "Divider" }) },
    }),
    defineArrayMember({
      name: "video",
      type: "object",
      title: "Video",
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
