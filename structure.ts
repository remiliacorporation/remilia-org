import type { StructureResolver } from "sanity/structure";
import { DocumentTextIcon } from "@sanity/icons/DocumentText";
import { ImagesIcon } from "@sanity/icons/Images";
import { UserIcon } from "@sanity/icons/User";
import { TagIcon } from "@sanity/icons/Tag";
import { CaseIcon } from "@sanity/icons/Case";
import { BookIcon } from "@sanity/icons/Book";
import { EarthGlobeIcon } from "@sanity/icons/EarthGlobe";
import { BoltIcon } from "@sanity/icons/Bolt";
import type { Channel } from "./lib/access";
import { SectionCheatsheet } from "./structure/cheatsheet";

function sectionList(
  S: Parameters<StructureResolver>[0],
  title: string,
  channel: Channel,
) {
  // Stable pane id → URLs like …/structure/pressRemiliaOrg stay consistent.
  const id = `${channel}Remilia`;
  return S.listItem()
    .title(title)
    .id(id)
    .icon(DocumentTextIcon)
    .child(
      // documentList (not documentTypeList) — filtered lists are reliable this way.
      S.documentList()
        .id(`${id}List`)
        .title(title)
        .schemaType("post")
        .filter('_type == "post" && channel == $channel')
        .params({ channel })
        .defaultOrdering([{ field: "publishedAt", direction: "desc" }])
        .initialValueTemplates([
          S.initialValueTemplateItem("post-by-channel", { channel }),
        ]),
    );
}

/**
 * Desks by host (Org / Com / Net) with section filters — keeps soft-lock
 * seats sane. Events/Albums live under Com (.com owns them).
 */
export const structure: StructureResolver = (S) =>
  S.list()
    .title("Content")
    .items([
      S.listItem()
        .title("Org — remilia.org")
        .icon(EarthGlobeIcon)
        .child(
          S.list()
            .title("Org — remilia.org")
            .items([
              sectionList(S, "Updates", "updates"),
              sectionList(S, "Press", "press"),
              sectionList(S, "Thought", "thought"),
              sectionList(S, "Archive", "archive"),
            ]),
        ),
      S.listItem()
        .title("Com — remilia.com")
        .icon(ImagesIcon)
        .child(
          S.list()
            .title("Com — remilia.com")
            .items([
              sectionList(S, "News", "news"),
              sectionList(S, "Events", "events"),
              S.documentTypeListItem("album").title("Albums").icon(ImagesIcon),
            ]),
        ),
      S.listItem()
        .title("Net — remilia.net")
        .icon(BoltIcon)
        .child(
          S.list()
            .title("Net — remilia.net")
            .items([
              sectionList(S, "Dev updates", "dev-updates"),
              sectionList(S, "Dev blog", "dev-blog"),
            ]),
        ),
      S.divider(),
      S.listItem()
        .title("Section cheatsheet")
        .icon(BookIcon)
        .child(S.component(SectionCheatsheet).title("Section cheatsheet")),
      S.divider(),
      S.documentTypeListItem("author").title("Authors").icon(UserIcon),
      S.documentTypeListItem("tag").title("Tags").icon(TagIcon),
      S.divider(),
      S.listItem()
        .title("Organization")
        .icon(CaseIcon)
        .child(S.document().schemaType("org").documentId("org")),
    ]);
