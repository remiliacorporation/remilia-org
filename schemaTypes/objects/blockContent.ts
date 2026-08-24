import { defineArrayMember, defineType } from "sanity";

/**
 * Rich text used for body copy across documents. Presentation-neutral:
 * each render app maps these blocks to its own components/chrome.
 *
 * Ghost "Koenig" card objects (embed, gallery, code, callout, …) get added
 * here only after the export audit shows which cards actually occur —
 * see BLOG-MIGRATION.md §4 in remilia-site.
 */
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
                  r.uri({ allowRelative: true, scheme: ["http", "https", "mailto", "tel"] }),
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
            ],
          },
        ],
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
          description: "Required — describes the image for screen readers, search, and LLMs.",
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
