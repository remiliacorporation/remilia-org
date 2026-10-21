(function () {
  var BOARD =
    "https://api.ashbyhq.com/posting-api/job-board/remilia?includeCompensation=true";
  var ASHBY = "https://jobs.ashbyhq.com/remilia";
  var table = document.getElementById("jobs-table");
  var fxTable = document.querySelector(".layer-fx .jobs-board");
  if (!table) return;
  var office = table.getAttribute("data-office");
  var heading = table.caption ? table.caption.outerHTML : "";
  var wrap = document.querySelector(".layer-wrap");
  var SCROLL = "careers-scroll";

  // Switching office keeps the reader where they were on the page.
  document.addEventListener("click", function (e) {
    if (!wrap || !e.target.closest(".office-card")) return;
    try {
      sessionStorage.setItem(SCROLL, String(wrap.scrollTop));
    } catch (_) {}
  });
  var top = null;
  try {
    top = sessionStorage.getItem(SCROLL);
    sessionStorage.removeItem(SCROLL);
  } catch (_) {}
  // Runs again once the openings load, since the page is shorter until then.
  // A page too short to reach the old position gets just enough end space.
  function restore() {
    var main = document.getElementById("content");
    if (!wrap || !top || !main) return;
    main.style.paddingBottom = "";
    var short = +top - (wrap.scrollHeight - wrap.clientHeight);
    if (short > 0)
      main.style.paddingBottom =
        parseFloat(getComputedStyle(main).paddingBottom) + short + "px";
    wrap.scrollTo({ top: +top, behavior: "instant" });
  }
  restore();

  var COPY = {
    en: {
      empty: "No open positions right now. Check ",
      failed: "Could not load openings. ",
      view: "View on Ashby",
    },
    ko: {
      empty: "현재 채용 중인 포지션이 없습니다. 다음을 확인하세요: ",
      failed: "채용 공고를 불러오지 못했습니다. ",
      view: "Ashby에서 보기",
    },
    ja: {
      empty: "現在募集中のポジションはありません。こちらをご確認ください：",
      failed: "募集ポジションを読み込めませんでした。",
      view: "Ashbyで見る",
    },
    "zh-Hans": {
      empty: "目前没有开放职位。请查看：",
      failed: "无法加载开放职位。",
      view: "在 Ashby 上查看",
    },
  };
  var copy = COPY[document.documentElement.lang] || COPY.en;

  var rows = [];

  function esc(s) {
    return String(s || "").replace(/[&<>"']/g, function (c) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[c];
    });
  }
  function ashbyA(label) {
    return (
      '<a class="inline" rel="external noopener noreferrer" href="' +
      ASHBY +
      '">' +
      label +
      "</a>"
    );
  }
  function postal(addr) {
    if (!addr) return {};
    return addr.postalAddress || addr;
  }
  function officeOf(location, addr) {
    var a = postal(addr);
    var s = [location, a.addressLocality, a.addressRegion, a.addressCountry]
      .join(" ")
      .toLowerCase();
    if (/seoul|hongdae|korea|한국|서울/.test(s))
      return { name: "Hongdae, Seoul", chip: "kr" };
    if (/irvine|orange county|\boc\b|california/.test(s))
      return { name: "Irvine, CA", chip: "us" };
    return { name: location || a.addressLocality || "—", chip: "" };
  }
  function levelsOf(j) {
    var title = (j.title || "").toLowerCase();
    if (/intern/.test(title) || /intern/i.test(j.employmentType || ""))
      return ["Entry"];
    var blob = [];
    ((j.compensation && j.compensation.compensationTiers) || []).forEach(
      function (tier) {
        blob.push(tier.title, tier.additionalInformation);
      },
    );
    var s = blob.filter(Boolean).join(" ").toLowerCase();
    var tags = [];
    function add(x) {
      if (tags.indexOf(x) < 0) tags.push(x);
    }
    s.replace(/l\s*(\d+)/g, function (_, n) {
      n = +n;
      if (n <= 20) add("Entry");
      else if (n <= 40) add("Career");
      else add("Senior");
      return _;
    });
    if (/entry[- ]?level|associate|junior/.test(s)) add("Entry");
    if (/\bii\b|\biii\b|regular|\bmid\b/.test(s)) add("Career");
    if (/advanced|senior|staff|principal/.test(s)) add("Senior");
    if (!tags.length) add("Career");
    return ["Entry", "Career", "Senior"].filter(function (x) {
      return tags.indexOf(x) >= 0;
    });
  }
  function places(j) {
    var raw = [{ location: j.location, address: j.address }].concat(
      j.secondaryLocations || [],
    );
    var seen = {};
    var out = [];
    raw.forEach(function (p) {
      var o = officeOf(p.location, p.address);
      var k = o.chip || o.name;
      if (seen[k]) return;
      seen[k] = 1;
      out.push(o);
    });
    return out;
  }
  function rowsFrom(j) {
    var shared = {
      domain: j.department || "Open",
      title: j.title || "",
      levels: levelsOf(j),
      url: j.jobUrl || j.applyUrl || ASHBY + "/" + j.id,
    };
    return places(j).map(function (o) {
      return Object.assign({ office: o.name, chip: o.chip }, shared);
    });
  }
  function addSeoulMirrors(list) {
    var haveKr = {};
    list.forEach(function (j) {
      if (j.chip === "kr") haveKr[j.title] = 1;
    });
    return list.concat(
      list
        .filter(function (j) {
          return (
            j.chip !== "kr" &&
            /^(UX\/UI Designer|Software Engineer)$/i.test(j.title) &&
            !haveKr[j.title]
          );
        })
        .map(function (j) {
          return Object.assign({}, j, {
            office: "Seoul, KR",
            chip: "kr",
            levels:
              j.levels.indexOf("Senior") < 0
                ? j.levels.concat(["Senior"])
                : j.levels.slice(),
          });
        }),
    );
  }
  function caption(fx) {
    return fx
      ? '<caption><a tabindex="-1" href="#open-positions">OPEN POSITIONS</a></caption>'
      : heading;
  }
  function html(fx) {
    var out = caption(fx);
    if (!rows.length) {
      return (
        out +
        '<tr><td class="text" colspan="3">' +
        copy.empty +
        ashbyA("jobs.ashbyhq.com/remilia") +
        ".</td></tr>"
      );
    }
    rows
      .slice()
      .sort(function (a, b) {
        return a.title.localeCompare(b.title);
      })
      .forEach(function (j) {
        var go =
          '<a class="job-go" rel="external noopener noreferrer" href="' +
          esc(j.url) +
          '">';
        var cells = [j.domain, j.title, j.levels.join(" • ")];
        out +=
          "<tr>" +
          cells
            .map(function (c) {
              return "<td>" + go + esc(c) + "</a></td>";
            })
            .join("") +
          "</tr>";
      });
    return out;
  }
  function paint() {
    table.innerHTML = html(false);
    if (fxTable) fxTable.innerHTML = html(true);
  }

  fetch(BOARD)
    .then(function (r) {
      if (!r.ok) throw new Error("Job board unavailable");
      return r.json();
    })
    .then(function (data) {
      rows = addSeoulMirrors(
        ((data && data.jobs) || [])
          .filter(function (j) {
            return j.isListed !== false;
          })
          .reduce(function (acc, j) {
            return acc.concat(rowsFrom(j));
          }, []),
      ).filter(function (j) {
        return !office || !j.chip || j.chip === office;
      });
      paint();
      restore();
    })
    .catch(function () {
      var body =
        '<tr><td class="text" colspan="3">' +
        copy.failed +
        ashbyA(copy.view) +
        ".</td></tr>";
      table.innerHTML = caption(false) + body;
      if (fxTable) fxTable.innerHTML = caption(true) + body;
      restore();
    });
})();
