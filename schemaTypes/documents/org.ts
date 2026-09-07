import { defineArrayMember, defineField, defineType } from "sanity";
import { CaseIcon } from "@sanity/icons/Case";

export const org = defineType({
  name: "org",
  title: "Organization",
  type: "document",
  icon: CaseIcon,
  fields: [
    defineField({
      name: "name",
      title: "Public name",
      type: "string",
      validation: (r) => r.required(),
    }),
    defineField({ name: "legalName", title: "Legal name", type: "string" }),
    defineField({
      name: "logo",
      type: "image",
      description: "Square, ≥112px — Organization JSON-LD logo.",
    }),
    defineField({
      name: "sameAs",
      title: "sameAs URLs",
      type: "array",
      of: [defineArrayMember({ type: "url" })],
      description:
        "Canonical entity links: wiki.remilia.org article, Wikipedia, X, GitHub, … The strongest entity-resolution signal there is.",
      validation: (r) => r.unique(),
    }),
    defineField({
      name: "contactEmail",
      title: "Contact email",
      type: "string",
      validation: (r) => r.email(),
    }),
    defineField({
      name: "address",
      title: "Address",
      type: "object",
      options: { collapsible: true, collapsed: true },
      description:
        "PostalAddress for Organization JSON-LD — agent-readiness checks verify business legitimacy against it.",
      fields: [
        defineField({ name: "streetAddress", title: "Street", type: "string" }),
        defineField({ name: "addressLocality", title: "City", type: "string" }),
        defineField({
          name: "addressRegion",
          title: "Region / state",
          type: "string",
        }),
        defineField({
          name: "postalCode",
          title: "Postal code",
          type: "string",
        }),
        defineField({
          name: "addressCountry",
          title: "Country",
          type: "string",
        }),
      ],
    }),
  ],
  preview: { select: { title: "name", subtitle: "legalName" } },
});
