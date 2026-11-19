export const THEME_JS = `(() => {
  var root = document.documentElement;
  // Before the first paint. A stored choice wins over the system setting;
  // with none stored, the stylesheet follows prefers-color-scheme. Hue is
  // the section's, baked on <html>, so a stored color cannot flash over it.
  try {
    var s = localStorage.getItem("remilia-scheme");
    // A baked data-scheme is that host's pin. A stored choice applies only
    // where the page left the scheme off, so the first paint follows the
    // reader until they use Dark.
    if (!root.hasAttribute("data-scheme") && (s === "light" || s === "dark"))
      root.setAttribute("data-scheme", s);
  } catch (e) {}
  document.addEventListener("DOMContentLoaded", function () {
    var buttons = document.querySelectorAll(".scheme");
    if (!buttons.length) return;
    var stored = null;
    try { stored = localStorage.getItem("remilia-scheme"); } catch (e) {}
    var mq = matchMedia("(prefers-color-scheme: dark)");
    var dark = function () {
      return stored === "dark" || (stored !== "light" && mq.matches);
    };
    var paint = function () {
      var on = dark() ? "true" : "false";
      for (var i = 0; i < buttons.length; i++)
        buttons[i].setAttribute("aria-pressed", on);
    };
    paint();
    var choose = function (v) {
      stored = v;
      try { localStorage.setItem("remilia-scheme", v); } catch (e) {}
      root.setAttribute("data-scheme", v);
      paint();
    };
    for (var i = 0; i < buttons.length; i++)
      buttons[i].addEventListener("click", function () {
        choose(dark() ? "light" : "dark");
      });
    if (mq.addEventListener)
      mq.addEventListener("change", function () {
        if (stored !== "light" && stored !== "dark") paint();
      });
  });
})();
`;
