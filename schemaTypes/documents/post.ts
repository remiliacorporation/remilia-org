import { defineArrayMember, defineField, defineType } from "sanity";
import { DocumentTextIcon } from "@sanity/icons/DocumentText";
import {
  CHANNELS,
  CHANNEL_PATH_LABEL,
  canEditChannel,
  type Channel,
} from "../../lib/access";

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
      title: "Section",
      type: "string",
      options: { list: CHANNELS, layout: "radio" },
      description:
        "Which section publishes this post. Sets host + path — see the Section cheatsheet in the desk.",
      validation: (r) => r.required(),
    }),
    defineField({
      name: "title",
      type: "string",
      validation: (r) => r.required(),
    }),
    defineField({
      name: "slug",
      type: "slug",
      description:
        "Drives the URL. Ghost imports preserve the original slug exactly (301 map).",
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
          return (
            clash === 0 || "Another post in this section already uses this slug"
          );
        }),
    }),
    defineField({
      name: "aliases",
      title: "Previous paths",
      type: "array",
      of: [{ type: "string" }],
      description:
        "Old slugs or paths this post used to live at. Each becomes a 301 to the current URL, so renaming a post or moving it between sections never leaves a dead link. Enter a bare slug (old-name) for the same section, or a full path (/press/old-name) after a move.",
      validation: (r) =>
        r.custom((aliases) => {
          for (const alias of aliases ?? []) {
            if (typeof alias !== "string" || !alias.trim())
              return "Aliases cannot be blank";
            if (!/^\/?[a-z0-9\-/]+$/.test(alias))
              return `"${alias}": lowercase letters, numbers, hyphens and slashes only`;
          }
          return true;
        }),
    }),
    defineField({
      name: "publishedAt",
      title: "Published at",
      type: "datetime",
      description:
        "Feeds <time>, RSS, sitemap lastmod, and Article JSON-LD datePublished.",
      validation: (r) => r.required(),
    }),
    defineField({
      name: "excerpt",
      type: "text",
      rows: 3,
      description:
        "Required. Meta description, RSS summary, index listing, and llms.txt line. ~155 chars.",
      validation: (r) =>
        r
          .required()
          .max(300)
          .warning("Over ~160 chars gets truncated in search results"),
    }),
    defineField({
      name: "origin",
      title: "Archive origin",
      type: "string",
      options: {
        list: [
          { title: "First-party (we published it)", value: "first-party" },
          {
            title: "External (coverage / interview elsewhere)",
            value: "external",
          },
        ],
        layout: "radio",
      },
      hidden: ({ document }) => document?.channel !== "archive",
      description:
        "Archive only. External entries cite someone else's piece; our /archive/<slug> is the citing record.",
      validation: (r) =>
        r.custom((origin, ctx) => {
          if (ctx.document?.channel !== "archive") return true;
          return origin ? true : "Archive posts need an origin";
        }),
    }),
    defineField({
      name: "externalUrl",
      title: "External URL",
      type: "url",
      hidden: ({ document }) =>
        document?.channel !== "archive" || document?.origin !== "external",
      description:
        "Original article URL. Becomes the HTML canonical when we are not the publisher.",
      validation: (r) =>
        r.uri({ scheme: ["http", "https"] }).custom((url, ctx) => {
          if (
            ctx.document?.channel !== "archive" ||
            ctx.document?.origin !== "external"
          )
            return true;
          return url ? true : "External archive entries need the original URL";
        }),
    }),
    defineField({
      name: "outlet",
      title: "Outlet",
      type: "string",
      hidden: ({ document }) =>
        document?.channel !== "archive" || document?.origin !== "external",
      description: "Publication name (e.g. The New York Times, Mirror).",
      validation: (r) =>
        r.custom((outlet, ctx) => {
          if (
            ctx.document?.channel !== "archive" ||
            ctx.document?.origin !== "external"
          )
            return true;
          return outlet ? true : "Name the outlet";
        }),
    }),
    defineField({
      name: "commentary",
      title: "Commentary",
      type: "blockContent",
      hidden: ({ document }) =>
        document?.channel !== "archive" || document?.origin !== "external",
      description:
        "Our citing writeup (the original press/blog post). The external article itself lives in Archived page below.",
    }),
    defineField({
      name: "archiveSnapshot",
      title: "Archived page (Firecrawl)",
      type: "text",
      rows: 12,
      hidden: ({ document }) =>
        document?.channel !== "archive" || document?.origin !== "external",
      description:
        "Firecrawl markdown of externalUrl — the third-party article we archived. Not our commentary.",
      readOnly: true,
    }),
    defineField({
      name: "body",
      title: "Body",
      type: "blockContent",
      description:
        "Write here. Bake compiles this to HTML plus `.md` / `.txt` siblings from the same blocks.",
      hidden: ({ document }) =>
        document?.channel === "archive" && document?.origin === "external",
      validation: (r) =>
        r.custom((body, ctx) => {
          const channel = ctx.document?.channel;
          const origin = ctx.document?.origin;
          if (channel === "archive" && origin === "external") {
            return true;
          }
          if (Array.isArray(body) && body.length > 0) return true;
          const md = ctx.document?.markdown;
          if (typeof md === "string" && md.trim()) return true;
          return "Body is required";
        }),
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
    defineField({
      name: "featured",
      title: "Featured",
      type: "boolean",
      initialValue: false,
    }),
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
          img?.asset && !img.alt
            ? "Alt text is required on the cover image"
            : true,
        ),
    }),
    defineField({
      name: "startsAt",
      title: "Event starts",
      type: "datetime",
      hidden: ({ document }) => document?.channel !== "events",
      description: "Events only — optional; used for Event JSON-LD when set.",
    }),
    defineField({
      name: "endsAt",
      title: "Event ends",
      type: "datetime",
      hidden: ({ document }) => document?.channel !== "events",
    }),
    defineField({
      name: "locationName",
      title: "Venue / location",
      type: "string",
      hidden: ({ document }) => document?.channel !== "events",
    }),
    defineField({
      name: "albums",
      title: "Gallery",
      type: "array",
      of: [defineArrayMember({ type: "reference", to: [{ type: "album" }] })],
      hidden: ({ document }) => document?.channel !== "events",
      description:
        "Events only — photo albums embedded on the post (like Ghost galleries).",
    }),
    defineField({
      name: "markdown",
      title: "Imported Markdown",
      type: "text",
      hidden: true,
      description: "Vault import only. Ignored when Body is set.",
    }),
    defineField({ name: "seo", type: "seo" }),
    defineField({
      name: "migration",
      title: "Migration metadata",
      type: "object",
      options: { collapsible: true, collapsed: true },
      description:
        "Provenance from imports; drives the 301 map. Safe to ignore when authoring.",
      fields: [
        defineField({ name: "source", type: "string", readOnly: true }),
        defineField({
          name: "ghostId",
          title: "Ghost ID",
          type: "string",
          readOnly: true,
        }),
        defineField({
          name: "legacyUrl",
          title: "Legacy URL",
          type: "url",
          readOnly: true,
        }),
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
    select: {
      title: "title",
      channel: "channel",
      slug: "slug.current",
      media: "coverImage",
    },
    prepare({ title, channel, slug, media }) {
      const base = CHANNEL_PATH_LABEL[channel as Channel];
      return {
        title,
        subtitle: base && slug ? `${base}/${slug}` : "no section set",
        media,
      };
    },
  },
});
