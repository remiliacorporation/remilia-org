import type { StructureResolver } from "sanity/structure";
import {
  DocumentTextIcon,
  CalendarIcon,
  ImagesIcon,
  UserIcon,
  TagIcon,
  CaseIcon,
} from "@sanity/icons";

/**
 * Three desks, one per channel — editors see their channel, not a random
 * post pile. Events/Albums live under Studio (.com owns them).
 */
export const structure: StructureResolver = (S) =>
  S.list()
    .title("Content")
    .items([
      S.listItem()
        .title("Press — remilia.org")
        .icon(DocumentTextIcon)
        .child(
          S.documentTypeList("post")
            .title("Press posts")
            .filter('_type == "post" && channel == "press"')
            .initialValueTemplates([
              S.initialValueTemplateItem("post-by-channel", { channel: "press" }),
            ]),
        ),
      S.listItem()
        .title("Studio — remilia.com")
        .icon(ImagesIcon)
        .child(
          S.list()
            .title("Studio")
            .items([
              S.listItem()
                .title("Journal posts")
                .icon(DocumentTextIcon)
                .child(
                  S.documentTypeList("post")
                    .title("Journal posts")
                    .filter('_type == "post" && channel == "studio"')
                    .initialValueTemplates([
                      S.initialValueTemplateItem("post-by-channel", { channel: "studio" }),
                    ]),
                ),
              S.documentTypeListItem("event").title("Events").icon(CalendarIcon),
              S.documentTypeListItem("album").title("Albums").icon(ImagesIcon),
            ]),
        ),
      S.listItem()
        .title("Devblog — remilia.net")
        .icon(DocumentTextIcon)
        .child(
          S.documentTypeList("post")
            .title("Devblog posts")
            .filter('_type == "post" && channel == "devblog"')
            .initialValueTemplates([
              S.initialValueTemplateItem("post-by-channel", { channel: "devblog" }),
            ]),
        ),
      S.divider(),
      S.documentTypeListItem("author").title("Authors").icon(UserIcon),
      S.documentTypeListItem("tag").title("Tags").icon(TagIcon),
      S.divider(),
      S.listItem()
        .title("Organization")
        .icon(CaseIcon)
        .child(S.document().schemaType("org").documentId("org")),
    ]);
