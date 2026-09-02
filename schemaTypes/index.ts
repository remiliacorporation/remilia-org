import { post } from "./documents/post";
import { author } from "./documents/author";
import { tag } from "./documents/tag";
import { event } from "./documents/event";
import { album } from "./documents/album";
import { org } from "./documents/org";
import { seo } from "./objects/seo";
import { blockContent } from "./objects/blockContent";

export const schemaTypes = [

  post,
  author,
  tag,
  event,
  album,
  org,

  seo,
  blockContent,
];

