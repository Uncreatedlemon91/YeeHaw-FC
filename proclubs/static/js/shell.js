// The page shell: the sidebar's collapse toggle (remembered per browser)
// and the UTC clock in the top bar -- every fixture time on the site is
// stored in UTC, so the clock is the reference people check against.
(function () {
  var KEY = "yfc-nav-collapsed";
  var root = document.documentElement;
  var toggle = document.querySelector("[data-nav-toggle]");

  function apply(collapsed) {
    root.classList.toggle("nav-collapsed", collapsed);
    if (toggle) {
      toggle.setAttribute("aria-pressed", collapsed ? "true" : "false");
      toggle.setAttribute("aria-label", collapsed ? "Expand the sidebar" : "Collapse the sidebar");
    }
  }

  var saved = false;
  try { saved = localStorage.getItem(KEY) === "1"; } catch (e) { /* storage blocked */ }
  apply(saved);

  if (toggle) {
    toggle.addEventListener("click", function () {
      var next = !root.classList.contains("nav-collapsed");
      apply(next);
      try { localStorage.setItem(KEY, next ? "1" : "0"); } catch (e) { /* storage blocked */ }
    });
  }

  var clock = document.querySelector("[data-utc-clock] .clock-text");
  if (clock) {
    var tick = function () {
      var now = new Date();
      var hh = String(now.getUTCHours()).padStart(2, "0");
      var mm = String(now.getUTCMinutes()).padStart(2, "0");
      clock.textContent = hh + ":" + mm + " UTC";
    };
    tick();
    setInterval(tick, 15000);
  }

  // Horizontal strips (the phone's section links, the tab bar): bring the
  // current item into view, and flag which edges have more to scroll to so
  // CSS can fade them (data-fade="start|end|both", absent when it all fits).
  function wireStrip(strip, current) {
    function fade() {
      var max = strip.scrollWidth - strip.clientWidth;
      var parts = [];
      if (max > 1 && strip.scrollLeft > 1) parts.push("start");
      if (max > 1 && strip.scrollLeft < max - 1) parts.push("end");
      if (parts.length) strip.setAttribute("data-fade", parts.join(" "));
      else strip.removeAttribute("data-fade");
    }
    if (current && strip.scrollWidth > strip.clientWidth + 1) {
      var s = strip.getBoundingClientRect(), c = current.getBoundingClientRect();
      strip.scrollLeft += c.left - s.left - (s.width - c.width) / 2;
    }
    fade();
    strip.addEventListener("scroll", fade, { passive: true });
    window.addEventListener("resize", fade);
  }
  document.querySelectorAll(".side-nav, .tab-bar").forEach(function (strip) {
    wireStrip(strip, strip.querySelector("[aria-current], .active"));
  });

  // <form data-loading="Saving..."> : on submit, disable the submit buttons,
  // mark them .is-loading and swap their text, so a slow save can't be
  // double-submitted. (The button's value is still sent: the disabling is
  // deferred a tick so the browser has already collected the form data.)
  document.addEventListener("submit", function (e) {
    var form = e.target;
    if (!form.matches || !form.matches("form[data-loading]") || e.defaultPrevented) return;
    var label = form.getAttribute("data-loading") || "Working\u2026";
    var buttons = form.querySelectorAll("button[type=submit], button:not([type]), input[type=submit]");
    setTimeout(function () {
      buttons.forEach(function (b) {
        b.disabled = true;
        b.classList.add("is-loading");
        b.setAttribute("aria-busy", "true");
        if (b.tagName === "INPUT") b.value = label; else b.textContent = label;
      });
    }, 0);
  });
})();
