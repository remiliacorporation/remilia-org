import { defineArrayMember, defineField, defineType } from "sanity";
import { ImagesIcon } from "@sanity/icons/Images";

/**
 * Photo album — first-class, not a blog attachment. Referenced from events
 * and embeddable in posts; renders as a gallery page with ImageGallery/
 * ImageObject JSON-LD (the ".com photos surface in search" requirement).
 */
export const album = defineType({
  name: "album",
  title: "Album",
  type: "document",
  icon: ImagesIcon,
  fields: [
    defineField({ name: "title", type: "string", validation: (r) => r.required() }),
    defineField({
      name: "slug",
      type: "slug",
      options: { source: "title", maxLength: 96 },
      validation: (r) => r.required(),
    }),
    defineField({ name: "date", type: "date" }),
    defineField({
      name: "event",
      title: "Event",
      type: "reference",
      to: [{ type: "event" }],
      description: "Optional — standalone shoots (lookbooks) have no event.",
    }),
    defineField({
      name: "description",
      type: "text",
      rows: 2,
      description: "Album page meta description + gallery intro.",
    }),
    defineField({
      name: "images",
      type: "array",
      of: [
        defineArrayMember({
          type: "image",
          options: { hotspot: true },
          fields: [
            {
              name: "alt",
              type: "string",
              title: "Alt text",
              description: "Required — this is what makes photos legible to search and LLMs.",
            },
            { name: "caption", type: "string", title: "Caption" },
            { name: "credit", type: "string", title: "Credit" },
          ],
          validation: (r) =>
            r.custom((img?: { alt?: string; asset?: unknown }) =>
              img?.asset && !img.alt ? "Alt text is required on album photos" : true,
            ),
        }),
      ],
      validation: (r) => r.min(1).error("An album needs at least one photo"),
    }),
    defineField({ name: "seo", type: "seo" }),
  ],
  orderings: [
    { title: "Date, newest first", name: "dateDesc", by: [{ field: "date", direction: "desc" }] },
  ],
  preview: {
    select: { title: "title", subtitle: "date", media: "images.0" },
  },
});
