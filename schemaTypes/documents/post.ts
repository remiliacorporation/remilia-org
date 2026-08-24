import { defineArrayMember, defineField, defineType } from "sanity";
import { DocumentTextIcon } from "@sanity/icons";
import { CHANNELS, canEditChannel, type Channel } from "../../lib/access";

const CHANNEL_PATH: Record<Channel, string> = {
  press: "remilia.org/press",
  studio: "remilia.com/a/studio",
  devblog: "remilia.net/blog",
};

/**
 * One post type for all three blogs. `channel` decides the host; the
 * canonical URL is always derived from channel + slug — editors never pick
 * a URL by hand.
 */
export const post = defineType({
  name: "post",
  title: "Post",
  type: "document",
  icon: DocumentTextIcon,
  readOnly: ({ currentUser, document }) =>
    !canEditChannel(currentUser, document?.channel as Channel | undefined),
  fields: [
    defineField({
      name: "channel",
      title: "Channel",
      type: "string",
      options: { list: CHANNELS, layout: "radio" },
      description:
        "Which site publishes this post. Sets the canonical URL — cannot be a matter of taste per-post.",
      validation: (r) => r.required(),
    }),
    defineField({ name: "title", type: "string", validation: (r) => r.required() }),
    defineField({
      name: "slug",
      type: "slug",
      description: "Drives the URL. Ghost imports preserve the original slug exactly (301 map).",
      options: { source: "title", maxLength: 96 },
      validation: (r) =>
        r.required().custom(async (slug, context) => {
          if (!slug?.current) return "Required";
          if (!/^[a-z0-9-]+$/.test(slug.current))
            return "Lowercase letters, numbers, and hyphens only";
          const client = context.getClient({ apiVersion: "2026-02-01" });
          const id = context.document?._id?.replace(/^drafts\./, "");
          const channel = context.document?.channel;
          const clash = await client.fetch(
            `count(*[_type == "post" && slug.current == $slug && channel == $channel && !(_id in [$id, "drafts." + $id])])`,
            { slug: slug.current, channel: channel ?? null, id: id ?? "" },
          );
          return clash === 0 || "Another post in this channel already uses this slug";
        }),
    }),
    defineField({
      name: "publishedAt",
      title: "Published at",
      type: "datetime",
      description: "Feeds <time>, RSS, sitemap lastmod, and Article JSON-LD datePublished.",
      validation: (r) => r.required(),
    }),
    defineField({
      name: "excerpt",
      type: "text",
      rows: 3,
      description:
        "Required. Meta description, RSS summary, index listing, and llms.txt line. ~155 chars.",
      validation: (r) =>
        r.required().max(300).warning("Over ~160 chars gets truncated in search results"),
    }),
    defineField({
      name: "authors",
      title: "Authors",
      type: "array",
      of: [defineArrayMember({ type: "reference", to: [{ type: "author" }] })],
      description: "Bylines feed Article JSON-LD author entities.",
    }),
    defineField({
      name: "tags",
      title: "Tags",
      type: "array",
      of: [defineArrayMember({ type: "reference", to: [{ type: "tag" }] })],
      validation: (r) => r.unique(),
    }),
    defineField({ name: "featured", title: "Featured", type: "boolean", initialValue: false }),
    defineField({
      name: "coverImage",
      type: "image",
      options: { hotspot: true },
      fields: [
        {
          name: "alt",
          type: "string",
          title: "Alt text",
          description: "Required when a cover image is set.",
        },
      ],
      validation: (r) =>
        r.custom((img?: { alt?: string; asset?: unknown }) =>
          img?.asset && !img.alt ? "Alt text is required on the cover image" : true,
        ),
    }),
    defineField({ name: "body", type: "blockContent", validation: (r) => r.required() }),
    defineField({ name: "seo", type: "seo" }),
    defineField({
      name: "migration",
      title: "Migration metadata",
      type: "object",
      options: { collapsible: true, collapsed: true },
      description: "Provenance from the Ghost import; drives the 301 map. Safe to ignore when authoring.",
      fields: [
        defineField({ name: "source", type: "string", readOnly: true }),
        defineField({ name: "ghostId", title: "Ghost ID", type: "string", readOnly: true }),
        defineField({ name: "legacyUrl", title: "Legacy URL", type: "url", readOnly: true }),
      ],
    }),
  ],
  orderings: [
    {
      title: "Published, newest first",
      name: "publishedDesc",
      by: [{ field: "publishedAt", direction: "desc" }],
    },
  ],
  preview: {
    select: { title: "title", channel: "channel", slug: "slug.current", media: "coverImage" },
    prepare({ title, channel, slug, media }) {
      const base = CHANNEL_PATH[channel as Channel];
      return { title, subtitle: base && slug ? `${base}/${slug}` : "no channel set", media };
    },
  },
});
