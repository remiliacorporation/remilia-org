(function () {
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function idFrom(hash) { return hash.length > 1 ? decodeURIComponent(hash.slice(1)) : ''; }
  function go(id) {
    var el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest('a[href^="#"]');
    var id = a && idFrom(a.hash);
    if (!id || !document.getElementById(id)) return;
    e.preventDefault();
    if (history.replaceState) history.replaceState(null, '', a.hash);
    go(id);
  });
  var start = idFrom(location.hash);
  if (start && document.getElementById(start)) requestAnimationFrame(function () { go(start); });
})();
