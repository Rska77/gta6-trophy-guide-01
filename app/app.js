// Leonida Legend: a static trophy guide. No build step, no network: the trophy list and its
// guides are data/trophies.json, and everything the player changes stays in this browser.
(function () {
  'use strict';

  const KEY = 'leonida-legend:earned';
  const KEY_SPOILERS = 'leonida-legend:spoiler-safe';
  const GRADE_ORDER = { platinum: 0, gold: 1, silver: 2, bronze: 3 };
  const GRADE_LABEL = { platinum: 'Platinum', gold: 'Gold', silver: 'Silver', bronze: 'Bronze' };
  const VIEWS = ['roadmap', 'trophies', 'progress'];

  let doc;
  let phases;
  let byId;
  let route;
  let earned = new Set();
  let spoilerSafe = true;
  const revealed = new Set();
  let activeView = 'roadmap';

  const filters = {
    q: '',
    grade: 'all',
    category: 'all',
    phase: 'all',
    status: 'all',
    sort: 'route',
  };

  const detailState = { id: null };

  // ---------- storage ----------

  function readEarned() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]');
      const known = new Set(doc.trophies.map((t) => t.name));
      return Array.isArray(raw) ? raw.filter((n) => typeof n === 'string' && known.has(n)) : [];
    } catch {
      return [];
    }
  }

  function saveEarned() {
    try {
      localStorage.setItem(KEY, JSON.stringify([...earned]));
    } catch {
      // Private browsing can refuse writes; the in-memory ticks still work for this visit.
    }
  }

  // ---------- helpers ----------

  const phaseOf = (n) => phases.find((p) => p.n === n);
  const doneCount = (list) => list.filter((t) => earned.has(t.name)).length;
  const pct = (part, whole) => (whole === 0 ? 0 : Math.round((part / whole) * 100));

  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k === 'dataset') Object.assign(node.dataset, v);
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else if (v !== null && v !== false && v !== undefined) node.setAttribute(k, v);
    }
    for (const child of children.flat()) {
      if (child === null || child === undefined || child === false) continue;
      node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return node;
  }

  function fill(host, ...children) {
    host.replaceChildren(...children.flat().filter((child) => child !== null && child !== undefined && child !== false));
  }

  function badge(grade) {
    return el('span', { class: 'badge', dataset: { grade } }, GRADE_LABEL[grade]);
  }

  function chip(label, cls = '') {
    return el('span', { class: `chip ${cls}`.trim() }, label);
  }

  const gradeChip = (grade) => chip(GRADE_LABEL[grade], `g-${grade}`);

  function difficultyLabel(n) {
    if (n >= 4) return 'Hard';
    if (n >= 3) return 'Medium';
    return 'Easy';
  }

  function routeCompare(a, b) {
    return a.phase - b.phase
      || (a.grade === 'platinum') - (b.grade === 'platinum')
      || a.id - b.id;
  }

  // ---------- progress ----------

  function updateProgress() {
    const total = doc.trophies.length;
    const done = earned.size;
    const percent = pct(done, total);
    const ring = document.getElementById('ring');
    ring.style.setProperty('--pct', percent);
    ring.setAttribute('aria-label', `${percent} percent complete`);
    document.getElementById('ring-pct').textContent = `${percent}%`;
    document.getElementById('progress-count').textContent = `${done} of ${total} earned`;
    const next = route.find((t) => !earned.has(t.name));
    document.getElementById('progress-next').textContent = next
      ? `Next: ${next.name}`
      : 'Platinum earned. Every trophy is on your profile.';
  }

  function nextTrophy() {
    return route.find((t) => !earned.has(t.name)) ?? route[route.length - 1];
  }

  // ---------- roadmap ----------

  function renderRoadmap() {
    const next = nextTrophy();
    const phase = phaseOf(next.phase);
    const card = document.getElementById('next-up');
    fill(card,
      el('div', { class: 'kicker' }, `Next on the route · Phase ${phase.n}: ${phase.title}`),
      el('h3', {}, next.name),
      el('p', {}, next.description),
      el('div', { class: 'actions' },
        el('button', { class: 'primary', type: 'button', onclick: () => openDetail(next.id) }, 'Open the guide'),
        el('button', { class: 'ghost', type: 'button', onclick: () => toggleEarned(next.name) },
          earned.has(next.name) ? 'Mark as not earned' : 'Mark as earned'),
      ),
    );

    const grid = document.getElementById('phase-grid');
    fill(grid, ...phases.map((p) => phaseCard(p)));

    const bars = document.getElementById('grade-bars');
    fill(bars, ...Object.keys(GRADE_ORDER).map((grade) => {
      const list = doc.trophies.filter((t) => t.grade === grade);
      if (list.length === 0) return null;
      const color = `var(--${grade})`;
      const done = doneCount(list);
      return el('div', { class: 'grade-bar' },
        el('span', { class: 'dot', style: `background:${color}` }),
        el('span', { class: 'name', style: `color:${color}` }, GRADE_LABEL[grade]),
        el('span', { class: 'bar' }, el('i', { style: `width:${pct(done, list.length)}%;background:${color}` })),
        el('span', { class: 'count' }, `${done}/${list.length}`),
      );
    }));
  }

  function phaseCard(p) {
    const list = route.filter((t) => t.phase === p.n);
    const done = doneCount(list);
    const percent = pct(done, list.length);
    return el('article', { class: 'phase' },
      el('div', { class: 'phase-head' }, el('span', { class: 'phase-num' }, `PHASE ${p.n}`), el('h3', {}, p.title)),
      el('p', {}, p.blurb),
      el('div', { class: 'phase-meta' }, el('span', {}, `${done} of ${list.length} earned`), el('span', {}, `${percent}%`)),
      el('div', { class: 'phase-meter' }, el('i', { style: `width:${percent}%` })),
      el('ul', { class: 'phase-list' }, list.map((t) => {
        const isDone = earned.has(t.name);
        return el('li', {},
          el('button', {
            class: `phase-item${isDone ? ' is-done' : ''}`,
            type: 'button',
            title: isDone ? `Mark ${t.name} as not earned` : `Mark ${t.name} as earned`,
            'aria-pressed': String(isDone),
            onclick: () => toggleEarned(t.name),
          },
            el('span', { class: 'tick' }, '✓'),
            el('span', { class: 'label' }, t.name),
            el('span', { class: 'chip meta' }, t.time),
          ),
        );
      })),
    );
  }

  // ---------- trophy browser ----------

  function matches(t) {
    if (filters.grade !== 'all' && t.grade !== filters.grade) return false;
    if (filters.category !== 'all' && t.category !== filters.category) return false;
    if (filters.phase !== 'all' && String(t.phase) !== filters.phase) return false;
    if (filters.status === 'todo' && earned.has(t.name)) return false;
    if (filters.status === 'done' && !earned.has(t.name)) return false;
    if (filters.status === 'missable' && !t.missable) return false;
    if (filters.status === 'save' && !t.saveFirst) return false;
    const q = filters.q.trim().toLowerCase();
    if (q) {
      const hay = `${t.name} ${t.description} ${t.guide} ${t.category} ${t.steps.join(' ')}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }

  function minutes(t) {
    const text = String(t.time);
    const match = text.match(/(\d+)(?:\s*[–-]\s*(\d+))?/);
    if (!match) return 0;
    const upper = Number(match[2] ?? match[1]);
    return /hr|hour/i.test(text) ? upper * 60 : upper;
  }

  function sortList(list) {
    const sorted = [...list];
    switch (filters.sort) {
      case 'easiest': return sorted.sort((a, b) => a.difficulty - b.difficulty || a.id - b.id);
      case 'longest': return sorted.sort((a, b) => minutes(b) - minutes(a) || a.id - b.id);
      case 'grade': return sorted.sort((a, b) => GRADE_ORDER[a.grade] - GRADE_ORDER[b.grade] || a.id - b.id);
      case 'name': return sorted.sort((a, b) => a.name.localeCompare(b.name));
      default: return sorted.sort(routeCompare);
    }
  }

  function renderCards() {
    const list = sortList(doc.trophies.filter(matches));
    const cards = document.getElementById('cards');
    fill(cards, ...list.map(card));
    const empty = document.getElementById('empty');
    empty.hidden = list.length > 0;
    if (list.length === 0) {
      fill(empty,
        el('span', {}, 'No trophies match these filters.'),
        el('button', { class: 'ghost', type: 'button', onclick: resetFilters }, 'Clear filters'),
      );
    }
    document.getElementById('result-count').textContent = `Showing ${list.length} of ${doc.trophies.length}`;
  }

  function resetFilters() {
    Object.assign(filters, { q: '', grade: 'all', category: 'all', phase: 'all', status: 'all', sort: 'route' });
    for (const id of ['f-q', 'f-grade', 'f-category', 'f-phase', 'f-status', 'f-sort']) {
      document.getElementById(id).value = filters[id.slice(2)];
    }
    renderCards();
  }

  function card(t) {
    const isDone = earned.has(t.name);
    const tags = [
      gradeChip(t.grade),
      chip(`Phase ${t.phase}: ${phaseOf(t.phase).title}`, 'meta'),
      chip(t.category, 'meta'),
      chip(difficultyLabel(t.difficulty), 'meta'),
      chip(t.time, 'meta'),
    ];
    if (t.missable) tags.push(chip('Missable', 'missable'));
    if (t.saveFirst) tags.push(chip('Watch', 'save'));
    if (t.spoiler > 0) tags.push(chip('Spoiler', 'spoiler'));

    return el('article', { class: `card${isDone ? ' is-done' : ''}` },
      el('div', { class: 'card-top' }, el('h3', { class: 'card-title' }, t.name), badge(t.grade)),
      el('p', { class: 'card-desc' }, t.description),
      el('div', { class: 'card-tags' }, tags),
      el('div', { class: 'card-actions' },
        el('button', {
          class: 'check',
          type: 'button',
          'aria-pressed': String(isDone),
          onclick: () => toggleEarned(t.name),
        }, el('span', { class: 'box' }, '✓'), isDone ? 'Earned' : 'Mark earned'),
        el('button', { class: 'open-guide', type: 'button', onclick: () => openDetail(t.id) }, 'Guide →'),
      ),
    );
  }

  function refreshAll() {
    updateProgress();
    renderRoadmap();
    renderCards();
    renderPhaseProgress();
  }

  function toggleEarned(name) {
    if (earned.has(name)) earned.delete(name);
    else earned.add(name);
    saveEarned();
    refreshAll();
    if (detailState.id !== null) {
      const t = byId.get(detailState.id);
      if (t) renderDetailBody(t);
    }
  }

  // ---------- progress view ----------

  function renderPhaseProgress() {
    const host = document.getElementById('phase-progress');
    fill(host, ...phases.map((p) => {
      const list = route.filter((t) => t.phase === p.n);
      const done = doneCount(list);
      return el('div', { class: 'stack-row' },
        el('div', { class: 'row-top' }, el('strong', {}, `Phase ${p.n} · ${p.title}`), el('span', {}, `${done}/${list.length}`)),
        el('div', { class: 'phase-meter' }, el('i', { style: `width:${pct(done, list.length)}%` })),
      );
    }));
  }

  // ---------- detail dialog ----------

  function openDetail(id) {
    const t = byId.get(id);
    if (!t) return;
    detailState.id = id;
    const grade = document.getElementById('detail-grade');
    grade.textContent = GRADE_LABEL[t.grade];
    grade.dataset.grade = t.grade;
    renderDetailBody(t);
    const detail = document.getElementById('detail');
    if (typeof detail.showModal === 'function') detail.showModal();
    else detail.setAttribute('open', '');
    document.getElementById('detail-close').focus();
  }

  function warningBlock(t) {
    if (!t.missable && !t.saveFirst) return null;
    const badges = [
      t.missable ? el('span', { class: 'warn-badge missable' }, 'Missable') : null,
      t.saveFirst ? el('span', { class: 'warn-badge watch' }, 'Watch') : null,
    ];
    let text;
    if (t.missable && t.saveFirst) {
      text = 'This one can be locked out if you move the story past it, so make a manual save first and do it as soon as it appears.';
    } else if (t.missable) {
      text = 'This one can be locked out if you move the story past it. Do it as soon as it appears.';
    } else {
      text = 'Make a manual save before you start so a failed attempt costs nothing.';
    }
    return el('div', { class: 'detail-warn' },
      el('div', { class: 'warn-row' }, badges),
      el('p', {}, text),
    );
  }

  function sourcesBlock(t) {
    if (!Array.isArray(t.sources) || t.sources.length === 0) return null;
    return el('div', {},
      el('p', { class: 'detail-h' }, 'Sources'),
      el('ul', { class: 'sources' }, t.sources.map((s) => el('li', {},
        el('span', { class: 'src-name' }, s.name),
        el('span', { class: 'src-sep', 'aria-hidden': 'true' }, '—'),
        el('span', { class: 'src-domain' }, s.domain),
      ))),
    );
  }

  function renderDetailBody(t) {
    const phase = phaseOf(t.phase);
    const locked = spoilerSafe && t.spoiler > 0 && !revealed.has(t.id);
    const facts = [
      gradeChip(t.grade),
      chip(`Phase ${t.phase}: ${phase.title}`, 'meta'),
      chip(t.category, 'meta'),
      chip(`Difficulty ${'●'.repeat(t.difficulty)}${'○'.repeat(5 - t.difficulty)}`, 'meta'),
      chip(t.time, 'meta'),
    ];
    if (t.missable) facts.push(chip('Missable', 'missable'));
    if (t.saveFirst) facts.push(chip('Watch', 'save'));

    const isDone = earned.has(t.name);
    const body = document.getElementById('detail-body');
    fill(body,
      el('h2', { id: 'detail-title' }, t.name),
      el('p', { class: 'detail-desc' }, t.description),
      el('div', { class: 'detail-facts' }, facts),
      warningBlock(t),
      locked ? spoilerNotice(t) : guideBlock(t),
      sourcesBlock(t),
      el('div', { class: 'detail-actions' },
        el('button', {
          class: isDone ? 'ghost' : 'primary',
          type: 'button',
          onclick: () => toggleEarned(t.name),
        }, isDone ? 'Earned — mark as not earned' : 'Mark as earned'),
        el('button', { class: 'ghost', type: 'button', onclick: () => closeDetail() }, 'Close'),
      ),
    );
  }

  function spoilerNotice(t) {
    return el('div', {},
      el('p', { class: 'detail-body-text' }, 'This guide names story events. Spoiler-safe mode is on, so the details wait behind the button.'),
      el('div', { class: 'button-row' },
        el('button', {
          class: 'reveal',
          type: 'button',
          onclick: () => {
            revealed.add(t.id);
            renderDetailBody(t);
          },
        }, 'Reveal this guide'),
        el('button', {
          class: 'ghost',
          type: 'button',
          onclick: () => setSpoilerSafe(false),
        }, 'Turn spoiler-safe mode off'),
      ),
    );
  }

  function setSpoilerSafe(on) {
    spoilerSafe = on;
    try {
      localStorage.setItem(KEY_SPOILERS, on ? 'on' : 'off');
    } catch {
      // Keep the in-memory setting when storage is unavailable.
    }
    document.getElementById('spoiler-toggle').checked = on;
    if (detailState.id !== null) renderDetailBody(byId.get(detailState.id));
  }

  function guideBlock(t) {
    return el('div', {},
      el('p', { class: 'detail-h' }, 'How to earn it'),
      el('p', { class: 'detail-body-text' }, t.guide),
      el('p', { class: 'detail-h' }, 'Steps'),
      el('ol', { class: 'steps' }, t.steps.map((s) => el('li', {}, s))),
      el('div', { class: 'detail-tip' }, el('strong', {}, 'Tip. '), t.tip),
    );
  }

  function closeDetail() {
    detailState.id = null;
    const detail = document.getElementById('detail');
    if (typeof detail.close === 'function') detail.close();
    else detail.removeAttribute('open');
  }

  // ---------- wiring ----------

  function showView(name) {
    activeView = name;
    for (const tab of document.querySelectorAll('.tab')) {
      const on = tab.dataset.view === name;
      tab.classList.toggle('is-active', on);
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
    }
    for (const view of document.querySelectorAll('.view')) {
      const on = view.id === `view-${name}`;
      view.hidden = !on;
      view.setAttribute('role', 'tabpanel');
      view.setAttribute('aria-labelledby', `tab-${name}`);
    }
    if (location.hash !== `#${name}`) history.replaceState(null, '', `#${name}`);
    window.scrollTo({ top: 0 });
  }

  function wire() {
    const tabs = [...document.querySelectorAll('.tab')].map((tab) => {
      tab.id = `tab-${tab.dataset.view}`;
      tab.addEventListener('click', () => showView(tab.dataset.view));
      return tab;
    });
    for (const tab of tabs) {
      tab.addEventListener('keydown', (event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        const step = event.key === 'ArrowRight' ? 1 : -1;
        const index = tabs.indexOf(tab);
        const nextTab = tabs[(index + step + tabs.length) % tabs.length];
        showView(nextTab.dataset.view);
        nextTab.focus();
      });
    }

    const categorySelect = document.getElementById('f-category');
    const categories = [...new Set(doc.trophies.map((t) => t.category))].sort();
    for (const c of categories) categorySelect.append(el('option', { value: c }, c));

    const phaseSelect = document.getElementById('f-phase');
    for (const p of phases) phaseSelect.append(el('option', { value: String(p.n) }, `Phase ${p.n}: ${p.title}`));

    const bind = (id, key) => {
      const node = document.getElementById(id);
      node.value = filters[key];
      node.addEventListener('input', () => {
        filters[key] = node.value;
        renderCards();
      });
    };
    bind('f-q', 'q');
    bind('f-grade', 'grade');
    bind('f-category', 'category');
    bind('f-phase', 'phase');
    bind('f-status', 'status');
    bind('f-sort', 'sort');

    document.getElementById('clear-filters').addEventListener('click', resetFilters);

    document.getElementById('jump-next').addEventListener('click', () => openDetail(nextTrophy().id));

    document.getElementById('export').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify([...earned].sort(), null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'leonida-legend-progress.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });

    const importNote = document.getElementById('import-note');
    document.getElementById('import').addEventListener('change', async (event) => {
      const file = event.target.files[0];
      if (!file) return;
      try {
        const parsed = JSON.parse(await file.text());
        const names = new Set(doc.trophies.map((t) => t.name));
        const incoming = (Array.isArray(parsed) ? parsed : []).filter((n) => typeof n === 'string' && names.has(n));
        earned = new Set(incoming);
        saveEarned();
        refreshAll();
        importNote.textContent = `Imported ${incoming.length} earned trophies.`;
      } catch {
        importNote.textContent = 'That file is not a progress export from this guide.';
      }
      event.target.value = '';
    });

    document.getElementById('reset').addEventListener('click', () => {
      if (!confirm('Clear every tick? This cannot be undone unless you exported a copy.')) return;
      earned = new Set();
      saveEarned();
      refreshAll();
    });

    const spoilerToggle = document.getElementById('spoiler-toggle');
    spoilerToggle.checked = spoilerSafe;
    spoilerToggle.addEventListener('change', () => setSpoilerSafe(spoilerToggle.checked));

    document.getElementById('detail-close').addEventListener('click', closeDetail);
    const detail = document.getElementById('detail');
    detail.addEventListener('click', (event) => {
      if (event.target === detail) closeDetail();
    });
    detail.addEventListener('close', () => { detailState.id = null; });

    const initial = location.hash.replace('#', '');
    showView(VIEWS.includes(initial) ? initial : 'roadmap');
  }

  async function boot() {
    const response = await fetch('data/trophies.json');
    if (!response.ok) throw new Error(`Could not load the trophy data (${response.status}).`);
    doc = await response.json();
    phases = doc.phases;
    byId = new Map(doc.trophies.map((t) => [t.id, t]));
    route = [...doc.trophies].sort(routeCompare);
    earned = new Set(readEarned());
    spoilerSafe = localStorage.getItem(KEY_SPOILERS) !== 'off';

    wire();
    refreshAll();
  }

  boot().catch((error) => {
    console.error(error);
    const next = document.getElementById('next-up');
    if (next) next.textContent = 'The trophy guide could not load. Serve the app folder over HTTP and reload.';
  });
}());
