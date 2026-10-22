// site.js: scroll reveal, card glow, hero example, box light and the demo phone. No dependencies.
var LOG = [["hi-Latn","Kal subah 8 baje dawai yaad dila dena.","Reminder set for tomorrow, 8:00 AM"],["hi-Latn","Dr. Sharma ke yahan Thursday ka appointment le lo.","Booked: Dr. Sharma, Thursday 11:00 AM"],["gu","મમ્મીને WhatsApp કરો કે હું 7 વાગ્યે આવીશ.","Message sent to Mummy"],["en","Order my usual thali from Zomato.","Thali ordered, after your yes"]];

(function () {
  var mq = function (q) { return window.matchMedia && window.matchMedia(q).matches; };
  var reduce = mq("(prefers-reduced-motion: reduce)");
  var fine = mq("(pointer: fine)") && !reduce;
  var root = document.documentElement;
  var hasIO = "IntersectionObserver" in window;

  // Header: a hairline and soft shadow appear once the page scrolls.
  function onScrollHead() { root.classList.toggle("is-scrolled", window.scrollY > 8); }
  window.addEventListener("scroll", onScrollHead, { passive: true });
  onScrollHead();

  // Scroll reveal: headings and cards rise into place once, cards one after another.
  var reveal = document.querySelectorAll("[data-reveal], [data-reveal-group]");
  document.querySelectorAll("[data-reveal-group]").forEach(function (g) {
    Array.prototype.forEach.call(g.children, function (c, i) { c.style.setProperty("--d", Math.min(i, 8) * 0.08 + "s"); });
  });
  if (hasIO && !reduce) {
    var rio = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (!e.isIntersecting) return;
        var el = e.target; el.classList.add("is-in"); rio.unobserve(el);
        setTimeout(function () { el.classList.add("is-done"); }, 1600); });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    reveal.forEach(function (el) { rio.observe(el); });
  } else {
    reveal.forEach(function (el) { el.classList.add("is-in"); });
  }

  if (fine) {
    // Cards: a soft glow follows the pointer.
    document.querySelectorAll("[data-glow]").forEach(function (c) {
      c.addEventListener("mousemove", function (e) {
        var r = c.getBoundingClientRect();
        c.style.setProperty("--gx", (e.clientX - r.left) + "px");
        c.style.setProperty("--gy", (e.clientY - r.top) + "px");
      });
    });
    // Buttons: lean gently toward the pointer.
    document.querySelectorAll("[data-magnet]").forEach(function (b) {
      b.addEventListener("mousemove", function (e) {
        var r = b.getBoundingClientRect();
        var dx = (e.clientX - r.left - r.width / 2) / r.width, dy = (e.clientY - r.top - r.height / 2) / r.height;
        b.style.transform = "translate(" + (dx * 8).toFixed(1) + "px," + (dy * 6).toFixed(1) + "px)";
      });
      b.addEventListener("mouseleave", function () { b.style.transform = ""; });
    });
  }

  // Demo phone: earlier messages are already there; the new ones appear one after another, once.
  // The chat scrolls inside the phone, and follows each new message to the bottom.
  document.querySelectorAll("[data-play]").forEach(function (list) {
    var items = list.querySelectorAll(".play-item:not(.is-old)");
    var toBottom = function () { list.scrollTo({ top: list.scrollHeight, behavior: reduce ? "auto" : "smooth" }); };
    if (reduce || !hasIO) {
      items.forEach(function (m) { m.classList.add("is-shown"); });
      list.scrollTop = list.scrollHeight;
      return;
    }
    list.scrollTop = list.scrollHeight;
    var io = new IntersectionObserver(function (e) {
      if (!e[0].isIntersecting) return;
      io.disconnect();
      items.forEach(function (m, i) {
        setTimeout(function () { m.classList.add("is-shown"); toBottom(); }, 500 + i * 1100);
      });
    }, { threshold: 0.4 });
    io.observe(list);
  });

  // Hero: an example request types out, then Bunty's result appears.
  var ex = document.querySelector("[data-example]");
  if (!ex) return;
  var sayEl = ex.querySelector("[data-say-ex]");
  var doneText = ex.querySelector("[data-done-ex]").lastElementChild;

  // One example: type what you say (2.2 s), show Bunty's answer, hold, next.
  var i = 1, t = 0, TYPE = 2.2, CYCLE = 6.5;
  function load(n) {
    var row = LOG[n];
    sayEl.setAttribute("lang", row[0]);
    sayEl.className = "example__say caret";
    doneText.textContent = row[2];
    ex.classList.add("is-typing");
  }
  var last = 0, raf = 0, visible = true;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (!last) last = now;
    var dt = (now - last) / 1000;
    if (dt < 1 / 30) return;
    last = now; dt = Math.min(dt, 0.1); t += dt;
    var row = LOG[i], text = '"' + row[1] + '"';
    if (t < TYPE) {
      sayEl.textContent = text.slice(0, Math.ceil(text.length * t / TYPE));
    } else if (ex.classList.contains("is-typing")) {
      sayEl.textContent = text; sayEl.className = "example__say";
      ex.classList.remove("is-typing");
    }
    if (t >= CYCLE) { t = 0; i = (i + 1) % LOG.length; load(i); }
  }
  function run() {
    var go = visible && !document.hidden;
    if (go && !raf) { last = 0; raf = requestAnimationFrame(frame); }
    if (!go && raf) { cancelAnimationFrame(raf); raf = 0; }
  }

  if (reduce) return; // still: one finished example

  // Mouse over the dark box: a soft light follows the pointer across the gradient.
  var card = document.querySelector(".box");
  if (fine && card) {
    card.addEventListener("mousemove", function (e) {
      var r = card.getBoundingClientRect();
      card.style.setProperty("--mx", (e.clientX - r.left) + "px");
      card.style.setProperty("--my", (e.clientY - r.top) + "px");
      card.classList.add("is-lit");
    });
    card.addEventListener("mouseleave", function () { card.classList.remove("is-lit"); });
  }

  document.addEventListener("visibilitychange", run);
  if (hasIO) {
    new IntersectionObserver(function (e) { visible = e[0].isIntersecting; run(); }).observe(ex);
  }
  i = 0; t = 0; load(0);
  run();
})();
