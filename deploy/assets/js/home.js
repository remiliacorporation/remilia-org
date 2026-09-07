(function () {
  var reduce =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var media = window.matchMedia("(prefers-reduced-motion: reduce)");
  var toggle = document.querySelector(".layer-base .motion-toggle");
  function pause(value) {
    document.documentElement.classList.toggle("motion-paused", value);
    toggle.setAttribute("aria-pressed", String(value));
  }
  pause(media.matches);
  toggle.addEventListener("click", function () {
    pause(toggle.getAttribute("aria-pressed") !== "true");
  });
  media.addEventListener("change", function (event) {
    pause(event.matches);
  });
  if (reduce) return;
  document.querySelectorAll(".wiki-float").forEach(function (el) {
    var origin = null,
      moved = false;
    function end() {
      origin = null;
      el.style.cursor = "grab";
    }
    el.addEventListener("pointerdown", function (e) {
      if (e.button !== 0) return;
      var r = el.getBoundingClientRect();
      origin = { x: e.clientX, y: e.clientY, l: r.left, t: r.top };
      moved = false;
      el.setPointerCapture(e.pointerId);
      el.style.cursor = "grabbing";
      e.preventDefault();
    });
    el.addEventListener("pointermove", function (e) {
      if (!origin) return;
      var dx = e.clientX - origin.x,
        dy = e.clientY - origin.y;
      if (dx * dx + dy * dy > 9) moved = true;
      el.style.left = origin.l + dx + "px";
      el.style.top = origin.t + dy + "px";
      el.style.right = el.style.bottom = "auto";
    });
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
    el.addEventListener("click", function (e) {
      if (moved) e.preventDefault();
      moved = false;
    });
  });
})();
