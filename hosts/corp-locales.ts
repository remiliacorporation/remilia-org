const ORIGIN = "https://remilia.org";

export type CorpLocale = "en" | "kr" | "jp" | "cn";

const LOCALES: Record<
  CorpLocale,
  { prefix: string; hreflang: string; og: string; label: string; navLabel: string }
> = {
  en: {
    prefix: "",
    hreflang: "en",
    og: "en_US",
    label: "EN",
    navLabel: "Language",
  },
  kr: {
    prefix: "/kr",
    hreflang: "ko",
    og: "ko_KR",
    label: "한국어",
    navLabel: "언어",
  },
  jp: {
    prefix: "/jp",
    hreflang: "ja",
    og: "ja_JP",
    label: "日本語",
    navLabel: "言語",
  },
  cn: {
    prefix: "/cn",
    hreflang: "zh-Hans",
    og: "zh_CN",
    label: "中文",
    navLabel: "语言",
  },
};

const ORDER: CorpLocale[] = ["en", "kr", "jp", "cn"];
const PAGE_FILES = new Map([
  ["index.html", "/"],
  ["about/index.html", "/about"],
  ["careers/index.html", "/careers"],
  ["contact/index.html", "/contact"],
]);

function pageFor(relativeFile: string): { locale: CorpLocale; route: string } | undefined {
  const normalized = relativeFile.replaceAll("\\", "/");
  const first = normalized.split("/", 1)[0] as CorpLocale;
  const locale = first in LOCALES && first !== "en" ? first : "en";
  const page = locale === "en" ? normalized : normalized.slice(first.length + 1);
  const route = PAGE_FILES.get(page);
  return route ? { locale, route } : undefined;
}

function localePath(locale: CorpLocale, route: string): string {
  const prefix = LOCALES[locale].prefix;
  return route === "/" ? `${prefix}/` || "/" : `${prefix}${route}`;
}

function localeHead(locale: CorpLocale, route: string): string {
  const alternates = ORDER.map(
    (candidate) =>
      `    <link rel="alternate" hreflang="${LOCALES[candidate].hreflang}" href="${ORIGIN}${localePath(candidate, route)}" />`,
  );
  alternates.push(
    `    <link rel="alternate" hreflang="x-default" href="${ORIGIN}${localePath("en", route)}" />`,
  );

  const ogAlternates = ORDER.filter((candidate) => candidate !== locale).map(
    (candidate) =>
      `    <meta property="og:locale:alternate" content="${LOCALES[candidate].og}" />`,
  );

  return [
    `    <meta property="og:locale" content="${LOCALES[locale].og}" />`,
    ...ogAlternates,
    ...alternates,
  ].join("\n");
}

function languageSwitcher(locale: CorpLocale, route: string): string {
  const links = ORDER.map((candidate) => {
    const data = LOCALES[candidate];
    if (candidate === locale)
      return `<span lang="${data.hreflang}" aria-current="page">${data.label}</span>`;
    return `<a lang="${data.hreflang}" data-locale="${candidate}" href="${localePath(candidate, route)}?lang=${candidate}">${data.label}</a>`;
  }).join('<span aria-hidden="true"> / </span>');

  return `    <nav class="language-switcher" aria-label="${LOCALES[locale].navLabel}">${links}</nav>`;
}

/** Adds the locale metadata and switcher shared by every corporate page. */
export function localizeCorpChrome(html: string, relativeFile: string): string {
  const page = pageFor(relativeFile);
  if (!page) return html;
  return html
    .replace(/\s*<\/head>/, `\n${localeHead(page.locale, page.route)}\n  </head>`)
    .replace(/\s*<\/body>/, `\n${languageSwitcher(page.locale, page.route)}\n  </body>`);
}
