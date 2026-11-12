(function () {
  "use strict";

  document.documentElement.classList.remove("no-js");
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------------------------------------------------------------- data
  // RoboTwin 2.0 success rates (%), Table "Success rates on RoboTwin 2.0".
  var ROBOTWIN = [
    { name: "π<sub>0.5</sub>", type: "vla", pt: true, clean: 70.7, random: 46.6, avg: 58.7 },
    { name: "X-VLA", type: "vla", pt: true, clean: 67.9, random: 20.9, avg: 44.4 },
    { name: "FastWAM", type: "wam", pt: false, clean: 79.4, random: 3.2, avg: 41.3 },
    { name: "LingBot-VA", type: "wam", pt: true, clean: 75.8, random: 38.4, avg: 57.1 },
    { name: "InternVLA-A1.5", type: "wam", pt: false, clean: 67.8, random: 40.1, avg: 54.0 },
    { name: "OpenWAM", type: "wam", pt: false, clean: 86.8, random: 3.9, avg: 45.0 },
    { name: "UniVLA", type: "lam", pt: true, clean: 48.6, random: 5.6, avg: 27.1 },
    { name: "UniT", type: "lam", pt: false, clean: 47.5, random: 7.2, avg: 27.4 },
    { name: "RotVLA", type: "lam", pt: true, clean: 74.4, random: 28.0, avg: 51.2 },
    { name: "SALA (ours)", type: "ours", pt: false, clean: 80.2, random: 48.6, avg: 66.4 }
  ];
  var TYPE_COLOR = { vla: "var(--vla)", wam: "var(--wam)", lam: "var(--lam)", ours: "var(--ours)" };

  // Real-world success rates (%), 20 trials per task.
  var REAL_TASKS = ["Gear\nassembly", "Bimanual\npouring", "Flower\ninsertion", "Spoon\nscooping", "Average"];
  var REAL = [
    { name: "Vanilla VLA", color: "var(--gray2)", vals: [40, 25, 20, 25, 27.5] },
    { name: "GR00T N1.7", color: "var(--gray)", vals: [45, 50, 30, 40, 41.25] },
    { name: "SALA (ours)", color: "var(--ours)", vals: [75, 80, 55, 80, 72.5], ours: true }
  ];

  // Downstream tasks: description, success criterion, demonstrations used in post-training.
  var TASKS = [
    {
      img: "static/images/real_task_0.jpg",
      goal: "The robot picks up three loose gears and assembles them onto the corresponding pegs of a base plate.",
      success: "All three gears are fully seated on the correct pegs with adjacent teeth engaged and remain in place after release.",
      robot: [1466, 9.0], human: [2715, 12.0]
    },
    {
      img: "static/images/real_task_1.jpg",
      goal: "The robot transfers pills from a source cup into a receiving cup with both hands: one hand holds the receiving cup steady while the other lifts and tilts the source cup.",
      success: "All pills are transferred without visible spillage, and both cups are placed upright and released.",
      robot: [474, 2.2], human: [2466, 13.4]
    },
    {
      img: "static/images/real_task_2.jpg",
      goal: "The robot grasps a single flower by its stem, lifts it from a holder, and inserts the stem into a vase.",
      success: "The stem is inside the vase and the flower remains supported by the upright vase after release.",
      robot: [793, 7.3], human: [2117, 10.6]
    },
    {
      img: "static/images/real_task_3.jpg",
      goal: "The robot picks up a spoon from its holder, scoops rice from a bowl, and pours a spoonful into a target cup. This task requires tool use.",
      success: "A spoonful of rice is deposited into the target cup without visible spillage, and the spoon is returned to its holder and released.",
      robot: [491, 4.0], human: [1973, 7.9]
    }
  ];

  var RETRIEVAL = [
    {
      src: "static/images/retrieval_human_unseen.jpg", w: 2070, h: 1621,
      alt: "Retrieval for human clips of tasks absent from the robot data.",
      cap: "Human queries from the pre-training videos, of tasks <b>absent from the robot data</b>. The reconstruction-only tokenizer returns unrelated robot clips; SALA returns semantically related behaviors&nbsp;&mdash; e.g., a human sweeping the floor retrieves the robot sweeping trash into a dustpan. Each clip is labeled with its task (italic) and the atomic action of its active hand."
    },
    {
      src: "static/images/retrieval_human_shared.jpg", w: 2070, h: 1067,
      alt: "Retrieval for human clips of tasks shared with the robot data.",
      cap: "Real world, <b>shared tasks</b>: human queries and Sharpa North clips. ✓/✗ mark whether the task and verb match the query. Human and robot videos differ in viewpoint, embodiment, and background, so reconstruction alone is close to random."
    },
    {
      src: "static/images/retrieval_robotwin.jpg", w: 2070, h: 1067,
      alt: "Retrieval on RoboTwin 2.0 from ARX-X5 queries to Aloha-AgileX clips.",
      cap: "RoboTwin 2.0: ARX-X5 queries and Aloha-AgileX clips. ✓/✗ mark whether the atomic action matches the query. Alignment raises same-atomic-action retrieval from 41.3% to 78.2%, with gains in all 47 tasks."
    }
  ];

  // Tokenizer ablations on RoboTwin 2.0 (%).
  var ABLATION = [
    { name: "SALA (full)", clean: 80.2, random: 48.6, ours: true },
    { name: "w/o alignment", clean: 75.5, random: 36.8 },
    { name: "w/o stop-gradient", clean: 73.5, random: 46.8 }
  ];

  // ---------------------------------------------------------------- helpers
  function el(tag, cls, html) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (html != null) node.innerHTML = html;
    return node;
  }
  function fmt(v) { return (Math.round(v * 100) / 100).toString(); }
  function whenVisible(node, cb) {
    if (!("IntersectionObserver" in window)) { cb(); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { io.disconnect(); cb(); }
      });
    }, { threshold: 0.25 });
    io.observe(node);
  }
  function bindSeg(container, attr, onChange) {
    var btns = container.querySelectorAll("[" + attr + "]");
    btns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        btns.forEach(function (b) {
          var on = b === btn;
          b.classList.toggle("is-active", on);
          b.setAttribute("aria-selected", on ? "true" : "false");
        });
        onChange(btn.getAttribute(attr));
      });
    });
  }

  // ---------------------------------------------------------------- top bar & nav
  var topbar = document.getElementById("topbar");
  function onScroll() { topbar.classList.toggle("is-scrolled", window.scrollY > 8); }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  var navLinks = Array.prototype.slice.call(document.querySelectorAll(".nav a"));
  var sections = navLinks.map(function (a) { return document.querySelector(a.getAttribute("href")); });
  if ("IntersectionObserver" in window) {
    var navIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var i = sections.indexOf(e.target);
        navLinks.forEach(function (a, j) { a.classList.toggle("is-active", i === j); });
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    sections.forEach(function (s) { if (s) navIO.observe(s); });
  }

  // ---------------------------------------------------------------- reveal
  var reveals = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !reduceMotion) {
    var revIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("is-visible"); revIO.unobserve(e.target); }
      });
    }, { threshold: 0.08, rootMargin: "0px 0px -40px 0px" });
    reveals.forEach(function (r) { revIO.observe(r); });
  } else {
    reveals.forEach(function (r) { r.classList.add("is-visible"); });
  }

  // ---------------------------------------------------------------- stat count-up
  document.querySelectorAll("[data-count]").forEach(function (node) {
    var target = parseFloat(node.getAttribute("data-count"));
    var decimals = parseInt(node.getAttribute("data-decimals") || "0", 10);
    var render = function (v) {
      node.textContent = v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    };
    if (reduceMotion) { render(target); return; }
    render(0);
    whenVisible(node, function () {
      var t0 = performance.now(), dur = 1200;
      (function step(now) {
        var p = Math.min(1, (now - t0) / dur);
        render(target * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(step);
      })(t0);
    });
  });

  // ---------------------------------------------------------------- RoboTwin chart
  var rtChart = document.getElementById("robotwin-chart");
  if (rtChart) {
    var rows = ROBOTWIN.map(function (d) {
      var row = el("div", "hbar" + (d.type === "ours" ? " is-ours" : ""));
      var name = el("div", "hbar-name", d.name + (d.pt ? ' <span class="pt-key" title="starts from official pre-trained weights">PT</span>' : ""));
      var track = el("div", "hbar-track");
      var fill = el("div", "hbar-fill");
      fill.style.background = TYPE_COLOR[d.type];
      track.appendChild(fill);
      var val = el("div", "hbar-val");
      row.appendChild(name); row.appendChild(track); row.appendChild(val);
      rtChart.appendChild(row);
      return { d: d, row: row, fill: fill, val: val };
    });
    var rowH = 29;
    rtChart.style.position = "relative";
    rtChart.style.height = rows.length * rowH + "px";
    rows.forEach(function (r) { r.row.style.position = "absolute"; r.row.style.left = 0; r.row.style.right = 0; r.row.style.top = 0; });

    var drawRT = function (metric, animate) {
      var sorted = rows.slice().sort(function (a, b) { return b.d[metric] - a.d[metric]; });
      sorted.forEach(function (r, i) {
        r.row.style.transform = "translateY(" + i * rowH + "px)";
        r.fill.style.width = animate === false ? "0%" : r.d[metric] + "%";
        r.val.textContent = r.d[metric].toFixed(1);
      });
    };
    var currentRT = "avg";
    drawRT(currentRT, false);
    whenVisible(rtChart, function () { drawRT(currentRT); });
    bindSeg(rtChart.closest(".panel"), "data-metric", function (m) { currentRT = m; drawRT(m); });
  }

  // ---------------------------------------------------------------- real-world chart
  var realChart = document.getElementById("real-chart");
  if (realChart) {
    var bars = [];
    REAL_TASKS.forEach(function (label, t) {
      var group = el("div", "vgroup" + (t === REAL_TASKS.length - 1 ? " is-avg" : ""));
      var wrap = el("div", "vgroup-bars");
      REAL.forEach(function (m) {
        var bar = el("div", "vbar" + (m.ours ? " is-ours" : ""), "<span>" + fmt(m.vals[t]) + "</span>");
        bar.style.background = m.color;
        bar.title = m.name + ": " + fmt(m.vals[t]) + "%";
        wrap.appendChild(bar);
        bars.push({ node: bar, v: m.vals[t] });
      });
      group.appendChild(wrap);
      group.appendChild(el("div", "vgroup-label", label.replace("\n", "<br>")));
      realChart.appendChild(group);
    });
    whenVisible(realChart, function () {
      bars.forEach(function (b) { b.node.style.height = b.v + "%"; });
    });
  }

  // ---------------------------------------------------------------- task tabs
  var strip = document.getElementById("task-strip");
  var meta = document.getElementById("task-meta");
  if (strip && meta) {
    var imgs = TASKS.map(function (t, i) {
      var img = new Image();
      img.src = t.img;
      img.alt = "";
      img.loading = "lazy";
      img.setAttribute("data-zoom", "");
      strip.appendChild(img);
      return img;
    });
    var showTask = function (i) {
      var t = TASKS[i];
      imgs.forEach(function (img, j) { img.classList.toggle("is-active", i === j); });
      meta.innerHTML =
        "<div><h4>Task</h4><p>" + t.goal + "</p><h4>Success criterion</h4><p>" + t.success + "</p></div>" +
        '<div><h4>Post-training demonstrations</h4><div class="task-demos">' +
        '<div class="demo-chip robot"><b>' + t.robot[0].toLocaleString("en-US") + "</b><span>teleoperated · " + t.robot[1].toFixed(1) + " h</span></div>" +
        '<div class="demo-chip human"><b>' + t.human[0].toLocaleString("en-US") + "</b><span>human demos · " + t.human[1].toFixed(1) + " h</span></div>" +
        "</div></div>";
    };
    showTask(0);
    bindSeg(document.querySelector(".task-tabs"), "data-task", function (i) { showTask(parseInt(i, 10)); });
  }

  // ---------------------------------------------------------------- retrieval tabs
  var retrImg = document.getElementById("retr-img");
  var retrCap = document.getElementById("retr-cap");
  if (retrImg && retrCap) {
    var showRetr = function (i) {
      var r = RETRIEVAL[i];
      retrImg.style.opacity = "0.25";
      var pre = new Image();
      pre.onload = function () {
        retrImg.src = r.src; retrImg.width = r.w; retrImg.height = r.h; retrImg.alt = r.alt;
        retrImg.style.opacity = "1";
      };
      pre.src = r.src;
      retrCap.innerHTML = r.cap;
    };
    retrImg.style.transition = "opacity 0.3s ease";
    retrCap.innerHTML = RETRIEVAL[0].cap;
    bindSeg(document.getElementById("retrieval"), "data-retr", function (i) { showRetr(parseInt(i, 10)); });
  }

  // ---------------------------------------------------------------- ablation chart
  var abl = document.getElementById("ablation-chart");
  if (abl) {
    var fills = [];
    ABLATION.forEach(function (a) {
      var row = el("div", "abl-row" + (a.ours ? " is-ours" : ""));
      row.appendChild(el("div", "abl-name", a.name));
      var barsWrap = el("div", "abl-bars");
      [["Clean", a.clean], ["Random", a.random]].forEach(function (p) {
        var bar = el("div", "abl-bar");
        bar.appendChild(el("span", null, p[0]));
        var track = el("div", "abl-track");
        var fill = el("div", "abl-fill");
        track.appendChild(fill);
        bar.appendChild(track);
        bar.appendChild(el("b", null, p[1].toFixed(1)));
        barsWrap.appendChild(bar);
        fills.push({ node: fill, v: p[1] });
      });
      row.appendChild(barsWrap);
      abl.appendChild(row);
    });
    whenVisible(abl, function () { fills.forEach(function (f) { f.node.style.width = f.v + "%"; }); });
  }

  // ---------------------------------------------------------------- lightbox
  var lb = document.getElementById("lightbox");
  var lbImg = lb.querySelector("img");
  var openLB = function (src, alt) {
    lbImg.src = src; lbImg.alt = alt || "";
    lb.hidden = false;
    requestAnimationFrame(function () { lb.classList.add("is-open"); });
    document.body.style.overflow = "hidden";
  };
  var closeLB = function () {
    lb.classList.remove("is-open");
    document.body.style.overflow = "";
    setTimeout(function () { lb.hidden = true; lbImg.removeAttribute("src"); }, 220);
  };
  document.addEventListener("click", function (e) {
    var t = e.target;
    if (t.matches && t.matches("img[data-zoom]")) { openLB(t.currentSrc || t.src, t.alt); }
  });
  lb.addEventListener("click", closeLB);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !lb.hidden) closeLB(); });

  // ---------------------------------------------------------------- soon links & copy
  document.querySelectorAll("a.is-soon").forEach(function (a) {
    a.addEventListener("click", function (e) { e.preventDefault(); });
    a.title = "Coming soon";
  });

  document.querySelectorAll("[data-copy]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var text = document.querySelector(btn.getAttribute("data-copy")).innerText;
      var label = btn.querySelector("span");
      var done = function () {
        btn.classList.add("is-done"); label.textContent = "Copied";
        setTimeout(function () { btn.classList.remove("is-done"); label.textContent = "Copy"; }, 1600);
      };
      var fallback = function () {
        var ta = document.createElement("textarea");
        ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.select();
        try { if (document.execCommand("copy")) done(); } finally { document.body.removeChild(ta); }
      };
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(done, fallback);
      } else {
        fallback();
      }
    });
  });
})();
