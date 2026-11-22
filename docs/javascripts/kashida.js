// ضبط الأسطر بالكشيدة: في الفقرات المضبوطة على الجانبين (على الشاشات العريضة)
// يُملأ الفراغ الزائد في كل سطر بمدّ الحروف (ـ) بدل توسيع المسافات بين الكلمات،
// ثم يتكفّل الضبط العادي بما يبقى من كسور.
// الكشيدة تُضاف للعرض فقط: لا تدخل في النسخ، والنصّ الأصلي يُستعاد عند تغيّر عرض الصفحة.
(function () {
  var TATWEEL = "ـ";
  // حروف لا تتصل بما بعدها
  var NON_JOINING_AFTER = "اأإآٱدذرزوؤةءى";
  var ALEFS = "اأإآٱ";
  var MARKS = /[ً-ٰٟ]/;
  var LETTER = /[ؠ-يٮ-ۓ]/;
  var MAX_PER_WORD = 4;

  function isJoiner(c) {
    return LETTER.test(c) && NON_JOINING_AFTER.indexOf(c) === -1;
  }

  // مواضع الكشيدة الممكنة في الكلمة، من آخرها إلى أولها (يُفضَّل ما قبل الحرف الأخير)
  function slots(word) {
    var out = [];
    for (var i = 0; i < word.length; i++) {
      if (!isJoiner(word[i])) continue;
      var j = i + 1;
      while (j < word.length && MARKS.test(word[j])) j++;
      if (j >= word.length) break;
      var next = word[j];
      if (!LETTER.test(next) || next === "ء" || next === TATWEEL) continue;
      if (word[i] === "ل" && ALEFS.indexOf(next) !== -1) continue; // لا تُفكّ «لا»
      if (word[j - 1] === TATWEEL) continue;
      out.push(j);
    }
    return out.reverse();
  }

  function stretch(word, count) {
    var s = slots(word);
    if (!s.length || !count) return word;
    var per = {};
    for (var k = 0; k < count; k++) {
      var pos = s[k % s.length];
      per[pos] = (per[pos] || 0) + 1;
    }
    var res = "";
    for (var i = 0; i < word.length; i++) {
      if (per[i]) res += new Array(per[i] + 1).join(TATWEEL);
      res += word[i];
    }
    return res;
  }

  function skip(node) {
    for (var el = node.parentNode; el; el = el.parentNode) {
      if (el.nodeType !== 1) continue;
      var tag = el.tagName;
      if (tag === "SUP" || tag === "CODE" || tag === "PRE") return true;
      if (el.classList && el.classList.contains("footnote-ref")) return true;
      if (tag === "P") return false;
    }
    return false;
  }

  // تغليف كل كلمة عربية في عنصر مستقل حتى يمكن قياسها
  function wrapWords(p) {
    var walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    var spans = [];
    nodes.forEach(function (t) {
      if (skip(t) || !LETTER.test(t.nodeValue)) return;
      var parts = t.nodeValue.split(/(\s+)/);
      var frag = document.createDocumentFragment();
      parts.forEach(function (part) {
        if (part && !/\s/.test(part) && slots(part).length) {
          var sp = document.createElement("span");
          sp.className = "kw";
          sp.textContent = part;
          sp.dataset.w = part;
          frag.appendChild(sp);
          spans.push(sp);
        } else if (part) {
          frag.appendChild(document.createTextNode(part));
        }
      });
      t.parentNode.replaceChild(frag, t);
    });
    return spans;
  }

  // حدود كل سطر في الفقرة، من خلال كل نصوصها
  function lineBoxes(p) {
    var walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    var range = document.createRange();
    var lines = [];
    while (walker.nextNode()) {
      var t = walker.currentNode;
      if (!t.nodeValue.trim()) continue;
      range.selectNodeContents(t);
      var rects = range.getClientRects();
      for (var i = 0; i < rects.length; i++) {
        var r = rects[i];
        if (!r.width) continue;
        var mid = (r.top + r.bottom) / 2;
        var line = null;
        for (var k = 0; k < lines.length; k++) {
          if (Math.abs(lines[k].mid - mid) < r.height / 2) { line = lines[k]; break; }
        }
        if (!line) { line = { mid: mid, left: r.left, right: r.right }; lines.push(line); }
        line.left = Math.min(line.left, r.left);
        line.right = Math.max(line.right, r.right);
      }
    }
    return lines.sort(function (a, b) { return a.mid - b.mid; });
  }

  function lineOf(lines, el) {
    var r = el.getBoundingClientRect();
    var mid = (r.top + r.bottom) / 2;
    for (var k = 0; k < lines.length; k++) {
      if (Math.abs(lines[k].mid - mid) < r.height / 2) return k;
    }
    return -1;
  }

  function tatweelWidth(p) {
    var probe = document.createElement("span");
    probe.textContent = new Array(21).join(TATWEEL);
    probe.style.whiteSpace = "nowrap";
    p.appendChild(probe);
    var w = probe.getBoundingClientRect().width / 20;
    p.removeChild(probe);
    return w;
  }

  // إزالة التغليف والكشائد وإعادة الفقرة كما كانت، دون المساس بعناصرها الأخرى
  function restore(p) {
    p.querySelectorAll("span.kw").forEach(function (sp) {
      sp.parentNode.replaceChild(document.createTextNode(sp.dataset.w), sp);
    });
    p.normalize();
    p.style.textAlign = "";
  }

  function justify(p) {
    restore(p);
    if (getComputedStyle(p).textAlign !== "justify") return;

    var spans = wrapWords(p);
    if (spans.length < 4) { restore(p); return; }

    var startHeight = p.getBoundingClientRect().height;
    p.style.textAlign = "start";
    var tw = tatweelWidth(p);
    var width = p.clientWidth;
    var lines = lineBoxes(p);
    if (lines.length < 2 || !tw) { restore(p); return; }

    var byLine = lines.map(function () { return []; });
    spans.forEach(function (sp) {
      var k = lineOf(lines, sp);
      if (k >= 0) byLine[k].push(sp);
    });

    var plan = [];
    for (var k = 0; k < lines.length - 1; k++) {
      var words = byLine[k];
      if (!words.length) continue;
      var slack = width - (lines[k].right - lines[k].left);
      var n = Math.floor(slack / tw) - 1;
      if (n <= 0) continue;
      // توزيع الكشائد على الكلمات بالتناوب، بدءًا من آخر السطر
      var counts = words.map(function () { return 0; });
      var cap = words.length * MAX_PER_WORD;
      n = Math.min(n, cap);
      for (var i = 0; i < n; i++) counts[words.length - 1 - (i % words.length)]++;
      plan.push({ words: words, counts: counts });
    }

    plan.forEach(function (ln) {
      ln.words.forEach(function (sp, i) {
        sp.textContent = stretch(sp.dataset.w, ln.counts[i]);
      });
    });

    p.style.textAlign = "";
    // إن انكسر سطرٌ بسبب الكشيدة نتخلّى عنها في هذه الفقرة
    if (lineBoxes(p).length !== lines.length ||
        p.getBoundingClientRect().height > startHeight + 1) {
      restore(p);
    }
  }

  function run() {
    document.querySelectorAll(".md-typeset p").forEach(justify);
  }

  // لا تدخل الكشيدة في النصّ المنسوخ
  // (تُحذف الكشائد المضافة وحدها، وتبقى أي كشيدة كانت في النصّ الأصلي)
  document.addEventListener("copy", function (e) {
    var sel = document.getSelection();
    if (!sel || !sel.rangeCount || !e.clipboardData) return;
    var box = document.createElement("div");
    for (var i = 0; i < sel.rangeCount; i++) box.appendChild(sel.getRangeAt(i).cloneContents());
    var added = box.querySelectorAll("span.kw");
    if (!added.length) return;
    added.forEach(function (sp) {
      var bare = function (s) { return s.split(TATWEEL).join(""); };
      // الكلمة المحدَّدة كاملةً تعود كما كُتبت، وجزؤها يُنسخ بلا كشيدة
      sp.textContent = bare(sp.textContent) === bare(sp.dataset.w) ? sp.dataset.w : bare(sp.textContent);
    });
    // يُعرض المحتوى المنسوخ خارج الشاشة لحظةً كي يحفظ المتصفح فواصل الأسطر والفقرات
    box.style.cssText = "position:fixed;left:-99999px;top:0";
    document.body.appendChild(box);
    var text = box.innerText;
    document.body.removeChild(box);
    e.clipboardData.setData("text/plain", text);
    e.preventDefault();
  });

  var timer;
  window.addEventListener("resize", function () {
    clearTimeout(timer);
    timer = setTimeout(run, 200);
  });

  function start() {
    var fonts = document.fonts && document.fonts.ready;
    if (fonts) fonts.then(run); else run();
  }

  if (typeof document$ !== "undefined") {
    document$.subscribe(start);
  } else {
    document.addEventListener("DOMContentLoaded", start);
  }
})();
