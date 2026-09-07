(function () {
  document.addEventListener("click", function (event) {
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
