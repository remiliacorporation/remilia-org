import { type Channel, canonicalFor, eventUrl, indexUrl } from "./urls";

export interface OrgInput {
  name: string;
  legalName?: string;
  logoUrl?: string;
  sameAs?: string[];
  contactEmail?: string;
  address?: {
    streetAddress?: string;
    addressLocality?: string;
    addressRegion?: string;
    postalCode?: string;
    addressCountry?: string;
  };
}

export interface PostInput {
  channel: Channel;
  slug: string;
  title: string;
  excerpt: string;
  publishedAt: string;
  updatedAt?: string;
  coverImageUrl?: string;
  authors?: { name: string; url?: string }[];
  tags?: string[];
}

export interface EventInput {
  slug: string;
  title: string;
  summary: string;
  startsAt: string;
  endsAt?: string;
  locationName?: string;
  url?: string;
  imageUrl?: string;
}

export interface AlbumInput {
  title: string;
  description?: string;
  pageUrl: string;
  images: { url: string; alt: string; caption?: string; credit?: string }[];
}

const ORG_ID = "https://remilia.org/#org";

export function organization(org: OrgInput) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": ORG_ID,
    name: org.name,
    ...(org.legalName && { legalName: org.legalName }),
    ...(org.logoUrl && { logo: org.logoUrl }),
    ...(org.sameAs?.length && { sameAs: org.sameAs }),
    ...(org.contactEmail && {
      email: org.contactEmail,
      contactPoint: {
        "@type": "ContactPoint",
        email: org.contactEmail,
        contactType: "corporate",
      },
    }),
    ...(org.address && { address: { "@type": "PostalAddress", ...org.address } }),
  };
}

export function blogPosting(post: PostInput) {
  const url = canonicalFor(post.channel, post.slug);
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "@id": `${url}#article`,
    mainEntityOfPage: url,
    url,
    headline: post.title,
    description: post.excerpt,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt ?? post.publishedAt,
    ...(post.coverImageUrl && { image: post.coverImageUrl }),
    ...(post.authors?.length && {
      author: post.authors.map((a) => ({
        "@type": "Person",
        name: a.name,
        ...(a.url && { url: a.url }),
      })),
    }),
    ...(post.tags?.length && { keywords: post.tags.join(", ") }),
    publisher: { "@id": ORG_ID },
    isPartOf: { "@type": "Blog", "@id": `${indexUrl(post.channel)}#blog` },
  };
}

export function event(ev: EventInput) {
  const url = eventUrl(ev.slug);
  return {
    "@context": "https://schema.org",
    "@type": "Event",
    "@id": `${url}#event`,
    url,
    name: ev.title,
    description: ev.summary,
    startDate: ev.startsAt,
    ...(ev.endsAt && { endDate: ev.endsAt }),
    ...(ev.locationName && {
      location:
        ev.locationName.toLowerCase() === "online"
          ? { "@type": "VirtualLocation", ...(ev.url && { url: ev.url }) }
          : { "@type": "Place", name: ev.locationName },
    }),
    ...(ev.imageUrl && { image: ev.imageUrl }),
    organizer: { "@id": ORG_ID },
  };
}

export function imageGallery(album: AlbumInput) {
  return {
    "@context": "https://schema.org",
    "@type": "ImageGallery",
    "@id": `${album.pageUrl}#gallery`,
    url: album.pageUrl,
    name: album.title,
    ...(album.description && { description: album.description }),
    image: album.images.map((img) => ({
      "@type": "ImageObject",
      contentUrl: img.url,
      description: img.alt,
      ...(img.caption && { caption: img.caption }),
      ...(img.credit && { creditText: img.credit }),
    })),
    publisher: { "@id": ORG_ID },
  };
}

export const jsonLdScript = (data: object): string => JSON.stringify(data);

