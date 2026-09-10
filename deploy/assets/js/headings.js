(function () {
  document.addEventListener("click", function (event) {
    var language = event.target.closest(".language-switcher a[data-locale]");
    if (
      language &&
      !event.defaultPrevented &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.shiftKey &&
      !event.altKey
    ) {
      var url = new URL(language.href);
      url.searchParams.delete("lang");
      document.cookie =
        "remilia_locale=" +
        encodeURIComponent(language.dataset.locale) +
        "; Path=/; Max-Age=31536000; SameSite=Lax; Secure";
      event.preventDefault();
      location.assign(url.href);
      return;
    }

    var link = event.target.closest('a[href^="#"]');
    if (!link || link.hash.length < 2) return;
    var target;
    try {
      target = document.getElementById(decodeURIComponent(link.hash.slice(1)));
    } catch {
      return;
    }
    if (!target) return;
    if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
  });
})();
