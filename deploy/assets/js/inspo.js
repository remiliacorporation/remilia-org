(function () {
  var INSPO = [
    { id: 'xanadu', src: '/assets/inspo/xanadu.png', href: 'https://xanadu.com.au/ted/XU/xanastrux.html', label: 'Ted Nelson’s Xanadu' },
    { id: 'semantic', src: '/assets/inspo/semantic-web.png', href: 'http://cogweb.ucla.edu/crp/Media/2001-05-05_SemanticWeb.html', label: 'Tim Berners-Lee’s Semantic Web' },
    { id: 'memex', src: '/assets/inspo/exocortex.png', href: 'https://www.w3.org/History/1945/vbush/vbush-all.shtml', label: 'Vannevar Bush’s Exocortex' },
    { id: 'catalog', src: '/assets/inspo/whole-earth-catalog.jpg', href: 'https://wholeearth.info/p/whole-earth-catalog-fall-1968', label: 'Stewart Brand’s Whole Earth Catalog' },
    { id: 'webs', src: '/assets/inspo/learning-webs.png', href: 'https://fifthestate.anarchistlibraries.net/library/366-fall-2004-learning-webs', label: 'Ivan Illich’s Learning Webs' },
    { id: 'pattern', src: '/assets/inspo/pattern-language.png', href: 'https://patternlanguage.cc/', label: 'Christopher Alexander’s Pattern Language' }
  ];
  var byId = {};
  INSPO.forEach(function (x) { byId[x.id] = x; });
  var imgs = document.querySelectorAll('.inspo-photo');
  var frames = document.querySelectorAll('.inspo-frame');
  if (!imgs.length) return;
  var idx = 0, hover = '', stick = '';
  function active() { return byId[hover] || byId[stick] || INSPO[idx]; }
  function paint() {
    var item = active();
    imgs.forEach(function (img) { img.src = item.src; });
    frames.forEach(function (a) {
      a.href = item.href;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      if (!a.hasAttribute('aria-hidden')) a.setAttribute('aria-label', item.label);
    });
    document.querySelectorAll('.inspo').forEach(function (el) {
      el.classList.toggle('is-on', el.getAttribute('data-inspo') === item.id);
    });
  }
  paint();
  if (!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) {
    setInterval(function () {
      if (hover || stick) return;
      idx = (idx + 1) % INSPO.length;
      paint();
    }, 3000);
  }
  document.querySelectorAll('.layer-base .inspo').forEach(function (btn) {
    var id = btn.getAttribute('data-inspo');
    function setHover(v) { hover = v; paint(); }
    btn.addEventListener('mouseenter', function () { setHover(id); });
    btn.addEventListener('mouseleave', function () { setHover(''); });
    btn.addEventListener('focus', function () { setHover(id); });
    btn.addEventListener('blur', function () { setHover(''); });
    btn.addEventListener('click', function () {
      stick = stick === id ? '' : id;
      if (stick && byId[id]) idx = INSPO.indexOf(byId[id]);
      paint();
    });
  });
})();
