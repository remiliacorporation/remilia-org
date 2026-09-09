export const THEME_JS = `(() => {
  try {
    var d = document.documentElement;
    var h = localStorage.getItem("remilia-hue");
    var s = localStorage.getItem("remilia-scheme");
    var t = localStorage.getItem("remilia-dots");
    if (h) {
      d.style.setProperty("--hue", h);
      d.setAttribute("data-hue", h);
    }
    if (s === "light" || s === "dark") d.setAttribute("data-scheme", s);
    if (t === "none" || t === "small" || t === "large")
      d.setAttribute("data-dots", t);
  } catch (e) {}
  document.addEventListener("DOMContentLoaded", function () {
    try {
      var d = document.documentElement;
      var dark = document.getElementById("theme-dark");
      var s = localStorage.getItem("remilia-scheme");
      var h = localStorage.getItem("remilia-hue");
      var t = localStorage.getItem("remilia-dots");
      if (dark) {
        var baked = d.getAttribute("data-scheme");
        dark.checked = s
          ? s === "dark"
          : baked
            ? baked === "dark"
            : matchMedia("(prefers-color-scheme: dark)").matches;
        dark.addEventListener("change", function () {
          var v = dark.checked ? "dark" : "light";
          d.setAttribute("data-scheme", v);
          localStorage.setItem("remilia-scheme", v);
        });
      }
      if (h) {
        var r = document.getElementById("theme-hue-" + h);
        if (r) r.checked = true;
      }
      document
        .querySelectorAll('input[name="theme-hue"]')
        .forEach(function (el) {
          el.addEventListener("change", function () {
            if (el.checked) {
              d.style.setProperty("--hue", el.value);
              d.setAttribute("data-hue", el.value);
              localStorage.setItem("remilia-hue", el.value);
            }
          });
        });
      if (t) {
        var r = document.getElementById("theme-dots-" + t);
        if (r) r.checked = true;
      }
      document
        .querySelectorAll('input[name="theme-dots"]')
        .forEach(function (el) {
          el.addEventListener("change", function () {
            if (el.checked) {
              d.setAttribute("data-dots", el.value);
              localStorage.setItem("remilia-dots", el.value);
            }
          });
        });
    } catch (e) {}
  });
})();
`;
