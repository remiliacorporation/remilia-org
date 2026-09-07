import { esc } from "./html";

export interface GalleryImage {
  url: string;
  fullUrl: string;
  alt: string;
  caption?: string;
  credit?: string;
}

export function galleryHtml(title: string, images: GalleryImage[]): string {
  const figures = images
    .map((img, i) => {
      const capParts = [img.caption, img.credit]
        .filter(Boolean)
        .map((s) => esc(s ?? ""));
      const caption = capParts.length
        ? `<figcaption>${capParts.join(" — ")}</figcaption>`
        : "";
      return `<figure>
<a href="${esc(img.fullUrl)}" data-lightbox="${i}" aria-label="${esc(img.alt || img.caption || `View image ${i + 1}`)}"><span class="ht"><span class="ht-map"><img src="${esc(img.url)}" alt="${esc(img.alt)}" loading="lazy"><span class="ht-ink" aria-hidden="true"></span></span></span></a>
${caption}
</figure>`;
    })
    .join("\n");
  return `<section class="gallery" aria-label="${esc(title)}">
${figures}
</section>
<dialog class="lightbox" aria-label="Image viewer"><img alt=""><button type="button" autofocus aria-label="Close">×</button></dialog>`;
}

export const LIGHTBOX_JS = `(() => {
  const dialog = document.querySelector("dialog.lightbox");
  if (!dialog || !dialog.showModal) return;
  const img = dialog.querySelector("img");
  for (const a of document.querySelectorAll("[data-lightbox]")) {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      img.src = a.href;
      img.alt = a.querySelector("img")?.alt ?? "";
      dialog.showModal();
    });
  }
  dialog.querySelector("button").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });
})();
`;
