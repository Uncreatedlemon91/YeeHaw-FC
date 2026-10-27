// The player file's tabs and the service record's filter. Every panel is
// already in the page (the server decided what each viewer may see), so
// this only shows one at a time; without it the first tab is still shown.
//
// ?tab=record opens a tab first (the server renders it .active); a #hash
// that points inside another tab (#coach-notes, #season) opens that tab.
(function () {
  const tabs = Array.from(document.querySelectorAll('.file-tabs [role="tab"]'));
  if (!tabs.length) return;

  function show(key, focus) {
    tabs.forEach((t) => {
      const on = t.dataset.fileTab === key;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
      if (on && focus) t.focus();
    });
    document.querySelectorAll('.file-panel').forEach((p) => {
      p.classList.toggle('active', p.id === 'file-' + key);
    });
  }

  tabs.forEach((t) => t.addEventListener('click', () => {
    show(t.dataset.fileTab);
    try {
      const url = new URL(location.href);
      url.searchParams.set('tab', t.dataset.fileTab);
      url.hash = '';
      history.replaceState(null, '', url);
    } catch (e) { /* the tab still switches */ }
  }));
  tabs[0].parentElement.addEventListener('keydown', (e) => {
    const i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    let n = -1;
    if (e.key === 'ArrowRight') n = (i + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') n = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = tabs.length - 1;
    if (n < 0) return;
    e.preventDefault();
    tabs[n].click();
    tabs[n].focus();
  });

  if (location.hash.length > 1) {
    let target = null;
    try { target = document.getElementById(decodeURIComponent(location.hash.slice(1))); } catch (e) { /* bad hash */ }
    const panel = target && target.closest('.file-panel');
    if (panel) {
      show(panel.id.replace('file-', ''));
      target.scrollIntoView();
    }
  }

  // Service record filter: hides the rows outside the chosen group.
  const chips = Array.from(document.querySelectorAll('[data-record-filter]'));
  const rows = Array.from(document.querySelectorAll('.timeline-item'));
  const none = document.querySelector('.record-empty');
  chips.forEach((chip) => chip.addEventListener('click', () => {
    const f = chip.dataset.recordFilter;
    chips.forEach((c) => {
      const on = c === chip;
      c.classList.toggle('active', on);
      c.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    let shown = 0;
    rows.forEach((r) => {
      const keep = f === 'all' || r.dataset.group === f;
      r.hidden = !keep;
      if (keep) shown += 1;
    });
    if (none) none.hidden = shown > 0;
  }));
})();
