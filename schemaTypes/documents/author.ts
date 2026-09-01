import { defineField, defineType } from "sanity";
import { UserIcon } from "@sanity/icons/User";

export const author = defineType({
  name: "author",
  title: "Author",
  type: "document",
  icon: UserIcon,
  fields: [
    defineField({ name: "name", type: "string", validation: (r) => r.required() }),
    defineField({
      name: "slug",
      type: "slug",
      options: { source: "name", maxLength: 96 },
      validation: (r) => r.required(),
    }),
    defineField({ name: "bio", type: "text", rows: 3 }),
    defineField({
      name: "image",
      type: "image",
      options: { hotspot: true },
      fields: [{ name: "alt", type: "string", title: "Alt text" }],
    }),
    defineField({
      name: "url",
      title: "Website / social",
      type: "url",
      description: "Feeds JSON-LD author.url / sameAs — helps entity resolution.",
      validation: (r) => r.uri({ scheme: ["http", "https"] }),
    }),
  ],
  preview: { select: { title: "name", media: "image" } },
});

