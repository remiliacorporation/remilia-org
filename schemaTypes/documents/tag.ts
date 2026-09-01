import { defineField, defineType } from "sanity";
import { TagIcon } from "@sanity/icons/Tag";

export const tag = defineType({
  name: "tag",
  title: "Tag",
  type: "document",
  icon: TagIcon,
  fields: [
    defineField({ name: "name", type: "string", validation: (r) => r.required() }),
    defineField({
      name: "slug",
      type: "slug",
      options: { source: "name", maxLength: 96 },
      validation: (r) => r.required(),
    }),
    defineField({
      name: "description",
      type: "text",
      rows: 2,
      description: "Tag page meta description — without it tag pages are thin/duplicate content.",
    }),
  ],
  preview: { select: { title: "name", subtitle: "slug.current" } },
});

