import { defineArrayMember, defineField, defineType } from "sanity";
import { CalendarIcon } from "@sanity/icons";

/** Events (.com). Drives Event structured data — rich results a blog post never gets. */
export const event = defineType({
  name: "event",
  title: "Event",
  type: "document",
  icon: CalendarIcon,
  fields: [
    defineField({ name: "title", type: "string", validation: (r) => r.required() }),
    defineField({
      name: "slug",
      type: "slug",
      options: { source: "title", maxLength: 96 },
      validation: (r) => r.required(),
    }),
    defineField({
      name: "startsAt",
      title: "Starts at",
      type: "datetime",
      description: "Required — Event JSON-LD needs startDate.",
      validation: (r) => r.required(),
    }),
    defineField({
      name: "endsAt",
      title: "Ends at",
      type: "datetime",
      validation: (r) =>
        r.custom((endsAt, context) => {
          const startsAt = context.document?.startsAt as string | undefined;
          if (startsAt && endsAt && new Date(endsAt) < new Date(startsAt))
            return "Ends before it starts";
          return true;
        }),
    }),
    defineField({
      name: "locationName",
      title: "Location / venue",
      type: "string",
      description: "Physical venue, or “Online”. Feeds Event JSON-LD location.",
      validation: (r) =>
        r
          .custom((v) => (v ? true : "Add a venue (or “Online”) — Event rich results want a location"))
          .warning(),
    }),
    defineField({ name: "url", title: "Event / ticket URL", type: "url" }),
    defineField({
      name: "image",
      type: "image",
      options: { hotspot: true },
      fields: [{ name: "alt", type: "string", title: "Alt text" }],
      validation: (r) =>
        r.custom((img?: { alt?: string; asset?: unknown }) =>
          img?.asset && !img.alt ? "Alt text is required on the event image" : true,
        ),
    }),
    defineField({
      name: "summary",
      type: "text",
      rows: 3,
      description: "Meta description + index listing.",
      validation: (r) => r.required().max(300),
    }),
    defineField({ name: "body", type: "blockContent" }),
    defineField({
      name: "albums",
      title: "Photo albums",
      type: "array",
      of: [defineArrayMember({ type: "reference", to: [{ type: "album" }] })],
      description: "Albums render inline on the event page.",
    }),
    defineField({ name: "seo", type: "seo" }),
  ],
  orderings: [
    {
      title: "Date, newest first",
      name: "dateDesc",
      by: [{ field: "startsAt", direction: "desc" }],
    },
  ],
  preview: {
    select: { title: "title", subtitle: "startsAt", media: "image" },
  },
});
