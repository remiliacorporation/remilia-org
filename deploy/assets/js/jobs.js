(function () {
  var BOARD =
    "https://api.ashbyhq.com/posting-api/job-board/remilia?includeCompensation=true";
  var ASHBY = "https://jobs.ashbyhq.com/remilia";
  var table = document.getElementById("jobs-table");
  var fxTable = document.querySelector(".layer-fx .jobs-board");
  var root = document.querySelector(".layer-base");
  if (!table || !root) return;

  var COLS = [
    {
      key: "office",
      label: "Office",
      chips: [
        ["us", "US"],
        ["kr", "KR"],
      ],
    },
    {
      key: "domain",
      label: "Domain",
      chips: [
        ["Eng", "Eng"],
        ["Design", "Design"],
        ["Ops", "Ops"],
      ],
    },
    {
      key: "track",
      label: "Role",
      chips: [
        ["IC", "IC"],
        ["Manager", "Manager"],
      ],
    },
    {
      key: "level",
      label: "Levels",
      chips: [
        ["Entry", "Entry"],
        ["Career", "Career"],
        ["Senior", "Senior"],
      ],
    },
  ];
  var picked = { office: "", domain: "", track: "", level: "" };
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
      '<a class="inline outlink" rel="external noopener noreferrer" href="' +
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
  function groupOf(j) {
    var d = ((j.department || "") + " " + (j.title || "")).toLowerCase();
    if (/product|design/.test(d)) return "Design";
    if (/tech|engineer/.test(d)) return "Eng";
    return "Ops";
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
    if (/\bii\b|\biii\b|regular|mid[- ]?level/.test(s)) add("Career");
    if (/advanced|senior|staff|principal/.test(s)) add("Senior");
    if (!tags.length) add("Career");
    return ["Entry", "Career", "Senior"].filter(function (x) {
      return tags.indexOf(x) >= 0;
    });
  }
  function trackOf(j) {
    var s = [j.title, j.department, j.team].join(" ").toLowerCase();
    return /\bmanager\b|director|head of|\bvp\b|chief/.test(s)
      ? "Manager"
      : "IC";
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
      group: groupOf(j),
      title: j.title || "",
      track: trackOf(j),
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
      : '<caption><h2 id="open-positions"><a href="#open-positions">OPEN POSITIONS</a></h2></caption>';
  }
  function chipRow(col) {
    return (
      '<div class="jobs-chips">' +
      col.chips
        .map(function (c, i) {
          var on = picked[col.key] === c[0];
          return (
            (i ? '<span class="jobs-slash"> / </span>' : "") +
            '<button type="button" class="jobs-chip' +
            (on ? " on" : "") +
            '" aria-pressed="' +
            on +
            '" data-col="' +
            col.key +
            '" data-val="' +
            c[0] +
            '">' +
            (on ? "[x] " : "[_] ") +
            c[1] +
            "</button>"
          );
        })
        .join("") +
      "</div>"
    );
  }
  function html(fx) {
    var out =
      caption(fx) +
      '<tr class="jobs-cols">' +
      COLS.map(function (c) {
        return (
          '<th><div class="jobs-label">' +
          c.label +
          "</div>" +
          chipRow(c) +
          "</th>"
        );
      }).join("") +
      "</tr>";
    if (!rows.length) {
      return (
        out +
        '<tr><td class="text" colspan="4">No open positions right now. Check ' +
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
          '<a class="job-go outlink" rel="external noopener noreferrer" href="' +
          esc(j.url) +
          '">';
        var cells = [
          ["office", j.chip, j.chip && picked.office === j.chip, j.office],
          ["domain", j.group, picked.domain === j.group, j.domain],
          ["track", j.track, picked.track === j.track, j.title],
          [
            "level",
            j.levels.join(" "),
            j.levels.indexOf(picked.level) >= 0,
            j.levels.join(" • "),
          ],
        ];
        out +=
          "<tr>" +
          cells
            .map(function (c) {
              return (
                '<td class="' +
                (c[2] ? "hit" : "") +
                '" data-' +
                c[0] +
                '="' +
                esc(c[1]) +
                '">' +
                go +
                esc(c[3]) +
                "</a></td>"
              );
            })
            .join("") +
          "</tr>";
      });
    return out;
  }
  function syncOffices() {
    document.querySelectorAll(".office-card").forEach(function (c) {
      var on =
        picked.office !== "" && c.getAttribute("data-office") === picked.office;
      c.classList.toggle("is-on", on);
      if (c.hasAttribute("aria-pressed"))
        c.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }
  function paint() {
    table.innerHTML = html(false);
    if (fxTable) fxTable.innerHTML = html(true);
    syncOffices();
  }
  function toggle(col, id) {
    picked[col] = picked[col] === id ? "" : id;
    var focused = table.contains(document.activeElement);
    paint();
    if (focused)
      table
        .querySelector('[data-col="' + col + '"][data-val="' + id + '"]')
        ?.focus();
  }
  function preview(chip, on) {
    var col = chip.getAttribute("data-col");
    var val = chip.getAttribute("data-val");
    var sel =
      ".jobs-board td" +
      (col === "level" ? '[data-level~="' : "[data-" + col + '="') +
      val +
      '"]';
    document.querySelectorAll(sel).forEach(function (td) {
      td.classList.toggle("preview", on);
    });
  }
  function crossing(e, sel) {
    var el = e.target.closest(sel);
    return el && !(e.relatedTarget && el.contains(e.relatedTarget)) ? el : null;
  }

  root.addEventListener("click", function (e) {
    var chip = e.target.closest(".jobs-chip");
    if (chip)
      return toggle(
        chip.getAttribute("data-col"),
        chip.getAttribute("data-val"),
      );
    var card = e.target.closest(".office-card");
    if (card) toggle("office", card.getAttribute("data-office"));
  });
  root.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    var card = e.target.closest(".office-card");
    if (!card) return;
    e.preventDefault();
    toggle("office", card.getAttribute("data-office"));
  });
  root.addEventListener("mouseover", function (e) {
    var chip = crossing(e, ".jobs-chip");
    if (chip) preview(chip, true);
  });
  root.addEventListener("mouseout", function (e) {
    var chip = crossing(e, ".jobs-chip");
    if (chip) preview(chip, false);
  });
  root.addEventListener("focusin", function (e) {
    var chip = e.target.closest(".jobs-chip");
    if (chip) preview(chip, true);
  });
  root.addEventListener("focusout", function (e) {
    var chip = e.target.closest(".jobs-chip");
    if (chip) preview(chip, false);
  });

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
      );
      paint();
    })
    .catch(function () {
      var body =
        '<tr><td class="text" colspan="4">Could not load openings. ' +
        ashbyA("View on Ashby") +
        ".</td></tr>";
      table.innerHTML = caption(false) + body;
      if (fxTable) fxTable.innerHTML = caption(true) + body;
      syncOffices();
    });
})();
