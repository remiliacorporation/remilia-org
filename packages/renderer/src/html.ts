export const esc = (s: string): string =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

export function safeHref(value: string): string {
  const normalized = value.replace(/[\u0000-\u0020\u007f]/g, "");
  return /^(?:https?:|mailto:|tel:)/i.test(normalized) ||
    !/^[a-z][a-z0-9+.-]*:/i.test(normalized)
    ? value
    : "#";
}
