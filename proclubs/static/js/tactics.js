// Tactics board: a formation pitch staff can drag roster names onto. No
// external drag-and-drop library -- plain HTML5 drag events, same
// dependency-free approach as charts.js. Read-only for everyone else:
// the server only sends bench/save markup to staff at all (see
// tactics.html), and this file checks TACTICS_IS_STAFF before wiring any
// interactivity, but the real enforcement is server-side (POST /api/tactics
// requires auth.require_staff) -- this is convenience, not the boundary.
(function () {
  const FORMATIONS = window.TACTICS_FORMATIONS || {};
  const BENCH_SLOTS = window.TACTICS_BENCH_SLOTS || {};
  const ALL_SLOTS = window.TACTICS_ALL_SLOTS || {};
  const IS_STAFF = !!window.TACTICS_IS_STAFF;
  const csrfInput = document.getElementById('tactics-csrf-token');
  const CSRF_TOKEN = csrfInput ? csrfInput.value : '';

  let activeFormation = window.TACTICS_ACTIVE_FORMATION;
  if (!FORMATIONS[activeFormation]) {
    activeFormation = Object.keys(FORMATIONS)[0];
  }
  // In-memory working copy -- staff can drag several names around before
  // hitting Save, which sends this whole object in one request rather
  // than one call per drag. Holds both pitch and bench slot keys, since
  // both are saved together (see save-status listener below).
  let currentSlots = { ...(ALL_SLOTS[activeFormation] || {}) };

  const pitch = document.getElementById('tactics-pitch');
  const subsList = document.getElementById('tactics-subs-list');
  const select = document.getElementById('tactics-formation-select');
  const saveBtn = document.getElementById('tactics-save-btn');
  const saveStatus = document.getElementById('tactics-save-status');
  const rosterList = document.getElementById('tactics-roster-list');

  // Full club roster as fetched from the server -- refreshRoster() filters
  // this down to "not already placed on the pitch or bench" on every
  // change, so a name can't be dragged onto two slots at once.
  let allRosterNames = [];

  function esc(v) {
    return String(v ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  // Shared by pitch slots and bench slots -- both are "drop a name here,
  // click to clear" boxes, they just differ in layout (absolute-positioned
  // on the grass vs. a static row underneath).
  function makeSlotEl(slotKey, def, extraClass) {
    const slot = document.createElement('div');
    slot.className = extraClass ? `pitch-slot ${extraClass}` : 'pitch-slot';
    slot.dataset.slotKey = slotKey;

    const name = currentSlots[slotKey];
    if (IS_STAFF) {
      slot.tabIndex = 0;
      slot.setAttribute('role', 'button');
      slot.setAttribute('aria-label', name
        ? `${def.label}: ${name}. Activate to clear.`
        : `${def.label}: empty. Drop a name here.`);
    } else {
      slot.setAttribute('aria-label', name ? `${def.label}: ${name}` : `${def.label}: empty`);
    }
    slot.classList.toggle('filled', !!name);
    slot.innerHTML = name
      ? `<span class="pitch-slot-name">${esc(name)}</span><span class="pitch-slot-pos">${esc(def.label)}</span>`
      : `<span class="pitch-slot-pos">${esc(def.label)}</span>`;

    if (IS_STAFF) {
      slot.addEventListener('dragover', (e) => {
        e.preventDefault();
        slot.classList.add('drag-over');
      });
      slot.addEventListener('dragleave', () => slot.classList.remove('drag-over'));
      slot.addEventListener('drop', (e) => {
        e.preventDefault();
        slot.classList.remove('drag-over');
        const droppedName = e.dataTransfer.getData('text/plain');
        if (!droppedName) return;
        currentSlots[slotKey] = droppedName;
        renderPitch();
        renderSubsBench();
        refreshRoster();
      });
      // Click a filled slot to clear it -- the touch/no-drag-support fallback.
      slot.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); slot.click(); }
      });
      slot.addEventListener('click', () => {
        if (!currentSlots[slotKey]) return;
        delete currentSlots[slotKey];
        renderPitch();
        renderSubsBench();
        refreshRoster();
      });
    }

    return slot;
  }

  function renderPitch() {
    if (!pitch) return;
    pitch.querySelectorAll('.pitch-slot').forEach((el) => el.remove());
    const layout = FORMATIONS[activeFormation] || {};

    Object.entries(layout).forEach(([slotKey, def]) => {
      const slot = makeSlotEl(slotKey, def);
      slot.style.top = `${def.top}%`;
      slot.style.left = `${def.left}%`;
      pitch.appendChild(slot);
    });
  }

  function renderSubsBench() {
    if (!subsList) return;
    subsList.innerHTML = '';
    Object.entries(BENCH_SLOTS).forEach(([slotKey, def]) => {
      subsList.appendChild(makeSlotEl(slotKey, def, 'sub-slot'));
    });
  }

  function renderRoster(names, emptyMessage) {
    if (!rosterList) return;
    if (!names.length) {
      rosterList.innerHTML = `<div class="tactics-roster-empty"><p class="empty-state-body">${esc(emptyMessage)}</p></div>`;
      return;
    }
    rosterList.innerHTML = '';
    names.forEach((name) => {
      const chip = document.createElement('div');
      chip.className = 'tactics-chip';
      chip.textContent = name;
      chip.draggable = true;
      chip.title = 'Drag onto the pitch or bench';
      chip.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', name);
        e.dataTransfer.effectAllowed = 'copy';
      });
      rosterList.appendChild(chip);
    });
  }

  // Re-derives the draggable pool from the full roster minus whoever's
  // already on the pitch or bench -- called after every slot change so a
  // name can't be placed twice.
  function refreshRoster() {
    if (!IS_STAFF || !rosterList) return;
    const placed = new Set(Object.values(currentSlots).filter(Boolean));
    const available = allRosterNames.filter((name) => !placed.has(name));
    const emptyMessage = allRosterNames.length
      ? 'Everyone is on the pitch or bench.'
      : 'No players on the roster yet.';
    renderRoster(available, emptyMessage);
  }

  function loadRoster() {
    if (!IS_STAFF || !rosterList) return;
    rosterList.innerHTML = '<p class="chart-empty" role="status">Loading roster&hellip;</p>';
    fetch('/api/members')
      .then((r) => {
        if (!r.ok) throw new Error('failed to load roster');
        return r.json();
      })
      .then((data) => {
        allRosterNames = (data.members || [])
          .map((m) => m.proName || m.name)
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b));
        refreshRoster();
      })
      .catch(() => {
        rosterList.innerHTML = '<div class="tactics-roster-empty" role="alert"><p class="empty-state-body">Couldn’t load the roster.</p><button type="button" class="btn secondary btn-sm" id="tactics-roster-retry">Try again</button></div>';
        const retry = document.getElementById('tactics-roster-retry');
        if (retry) retry.addEventListener('click', loadRoster);
      });
  }

  if (select) {
    select.addEventListener('change', () => {
      activeFormation = select.value;
      currentSlots = { ...(ALL_SLOTS[activeFormation] || {}) };
      renderPitch();
      renderSubsBench();
      refreshRoster();
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      saveBtn.disabled = true;
      saveStatus.textContent = 'Saving…';
      const body = new URLSearchParams();
      body.set('formation', activeFormation);
      body.set('slots_json', JSON.stringify(currentSlots));
      body.set('csrf_token', CSRF_TOKEN);

      fetch('/api/tactics', { method: 'POST', body })
        .then(async (r) => {
          const data = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(data.error || 'Save failed.');
          ALL_SLOTS[activeFormation] = { ...currentSlots };
          saveStatus.textContent = 'Saved.';
          setTimeout(() => { saveStatus.textContent = ''; }, 3000);
        })
        .catch((err) => {
          saveStatus.textContent = err.message || 'Save failed.';
        })
        .finally(() => {
          saveBtn.disabled = false;
        });
    });
  }

  renderPitch();
  renderSubsBench();
  loadRoster();
})();
