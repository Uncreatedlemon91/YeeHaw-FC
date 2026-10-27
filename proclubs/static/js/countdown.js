// Ticks the match-center countdown on the home page. Harmless no-op on any
// page without a [data-countdown] element.
//
// The digits are decorative (aria-hidden in the markup) and tick every
// second; the element's aria-label is refreshed only once a minute, so a
// screen reader reads "Kick-off in 2 days, 3 hours" on request instead of
// announcing every tick. At kick-off the timer gives way to "Kicked off"
// (or "Live" for the first two hours) rather than sitting at 00:00:00:00.
document.querySelectorAll('[data-countdown]').forEach((el) => {
  const target = new Date(el.dataset.countdown).getTime();
  if (isNaN(target)) return;
  const dEl = el.querySelector('.cd-d');
  const hEl = el.querySelector('.cd-h');
  const mEl = el.querySelector('.cd-m');
  const sEl = el.querySelector('.cd-s');
  const done = el.parentElement && el.parentElement.querySelector('[data-kicked]');
  let timer = null;
  let lastLabelMinute = -1;

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function plural(n, word) {
    return n + ' ' + word + (n === 1 ? '' : 's');
  }

  function tick() {
    const diff = target - Date.now();
    if (diff <= 0) {
      const live = Date.now() - target < 2 * 3600000;
      el.hidden = true;
      if (done) {
        done.textContent = live ? 'Live now' : 'Kicked off';
        done.hidden = false;
        done.classList.toggle('is-live', live);
      }
      if (timer) clearInterval(timer);
      return;
    }
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    dEl.textContent = pad(d);
    hEl.textContent = pad(h);
    mEl.textContent = pad(m);
    sEl.textContent = pad(s);
    const minute = Math.floor(diff / 60000);
    if (minute !== lastLabelMinute) {
      lastLabelMinute = minute;
      el.setAttribute('aria-label', 'Kick-off in ' + plural(d, 'day') + ', ' +
        plural(h, 'hour') + ', ' + plural(m, 'minute'));
    }
  }

  tick();
  timer = setInterval(tick, 1000);
});
