import { defineField, defineType } from "sanity";

/** Reusable per-document SEO / social metadata overrides. */
export const seo = defineType({
  name: "seo",
  title: "SEO & Social",
  type: "object",
  options: { collapsible: true, collapsed: true },
  fields: [
    defineField({
      name: "metaTitle",
      title: "Meta title",
      type: "string",
      description: "Overrides the page <title>. ~60 chars.",
      validation: (r) => r.max(70).warning("Over ~70 chars gets truncated in results"),
    }),
    defineField({
      name: "metaDescription",
      title: "Meta description",
      type: "text",
      rows: 3,
      description: "Search + social snippet override. ~155 chars. Falls back to the excerpt.",
      validation: (r) => r.max(180).warning("Over ~160 chars gets truncated in results"),
    }),
    defineField({
      name: "ogImage",
      title: "Social share image",
      type: "image",
      description: "1200×630 recommended (Open Graph / Twitter card). Falls back to the cover image.",
    }),
    defineField({
      name: "canonical",
      title: "Canonical URL",
      type: "url",
      description:
        "Only set to point search engines at a different original source (e.g. syndicated posts). Normal posts derive their canonical from channel + slug.",
      validation: (r) => r.uri({ scheme: ["http", "https"] }),
    }),
    defineField({
      name: "noIndex",
      title: "Hide from search engines",
      type: "boolean",
      initialValue: false,
    }),
  ],
});
