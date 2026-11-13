import { defineArrayMember, defineField, defineType } from "sanity";
import {
  CodeDecorator,
  FootnoteInline,
  LinkAnnotation,
  LinkHrefInput,
  NoteContentInput,
  NoteQuoteStyle,
  NoteTextStyle,
} from "../../studio/portableText";

/**
 * A footnote sits in the text as one inline object: the editor treats it as
 * an atom, and its number comes from its place in the text
 * (packages/renderer/src/footnotes.ts). Nobody types a number.
 */
export const footnote = defineType({
  name: "footnote",
  title: "Footnote",
  type: "object",
  components: { inlineBlock: FootnoteInline },
  options: { modal: { type: "dialog", width: 1 } },
  fields: [
    defineField({
      name: "content",
      title: "Note",
      type: "footnoteContent",
    }),
    defineField({
      name: "text",
      title: "Note text (old format)",
      type: "text",
      rows: 4,
      description:
        "An imported note keeps its text here, and the site shows it until Note above has text. To add a quote or a note inside this note, move the text into Note and clear this box.",
      hidden: ({ parent }) =>
        typeof (parent as { text?: unknown } | undefined)?.text !== "string",
    }),
    // A number pinned on an imported note. The site still honors it; new
    // notes take their number from their place in the text.
    defineField({ name: "n", type: "number", hidden: true }),
    defineField({
      name: "image",
      type: "image",
      hidden: true,
      options: { hotspot: false },
      fields: [
        { name: "alt", type: "string", title: "Alt text" },
        { name: "caption", type: "string", title: "Caption" },
      ],
    }),
  ],
  preview: {
    select: { text: "text", content: "content" },
    prepare: () => ({ title: "Footnote" }),
  },
});

/** What a footnote says: paragraphs and block quotes, and notes of its own. */
export const footnoteContent = defineType({
  name: "footnoteContent",
  title: "Note",
  type: "array",
  components: { input: NoteContentInput },
  of: [
    defineArrayMember({
      type: "block",
      styles: [
        { title: "Normal", value: "normal", component: NoteTextStyle },
        { title: "Quote", value: "blockquote", component: NoteQuoteStyle },
      ],
      lists: [],
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
      of: [defineArrayMember({ type: "footnote" })],
    }),
  ],
});
