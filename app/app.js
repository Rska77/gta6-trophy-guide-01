(function () {
  'use strict';

  var STORAGE_EARNED = 'leonida-legend:earned';
  var STORAGE_SPOILER = 'leonida-legend:spoiler-safe';
  var TOTAL_TROPHIES = 55;

  var PHASE_TITLES = {
    1: 'Story: chapters 1–4',
    2: 'Mid-game contacts',
    3: 'Activities & collectibles',
    4: 'Crime, heists & combat',
    5: 'Exploration & collectibles',
    6: 'Completion & platinum'
  };

  var trophies = [];
  var earned = new Set();
  var revealedSpoilers = new Set();
  var spoilerSafe = true;
  var dataLoaded = false;
  var openTrophyId = null;
  var lastFocused = null;
  var previousBodyOverflow = '';

  var filters = {
    search: '',
    grade: 'all',
    category: 'all',
    phase: 'all',
    status: 'all',
    sort: 'route'
  };

  function escapeHtml(value) {
    var replacements = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return replacements[character];
    });
  }

  function phaseTitle(phase) {
    return PHASE_TITLES[Number(phase)] || ('Phase ' + phase);
  }

  function compareIds(a, b) {
    if (typeof a === 'number' && typeof b === 'number') {
      return a - b;
    }
    return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
  }

  function routeCompare(a, b) {
    var aPlatinum = a.grade === 'platinum';
    var bPlatinum = b.grade === 'platinum';
    if (aPlatinum !== bPlatinum) {
      return aPlatinum ? 1 : -1;
    }
    if (Number(a.phase) !== Number(b.phase)) {
      return Number(a.phase) - Number(b.phase);
    }
    return compareIds(a.id, b.id);
  }

  function routeSorted() {
    return trophies.slice().sort(routeCompare);
  }

  function nextTrophy() {
    return routeSorted().find(function (trophy) {
      return !earned.has(trophy.name);
    }) || null;
  }

  function earnedCount() {
    return trophies.reduce(function (count, trophy) {
      return count + (earned.has(trophy.name) ? 1 : 0);
    }, 0);
  }

  function timeToMinutes(value) {
    var text = String(value || '').toLowerCase();
    if (!text) {
      return 0;
    }
    if (text.indexOf('story-wide') !== -1) {
      return 999999;
    }
    var numbers = text.match(/\d+(?:\.\d+)?/g);
    if (!numbers) {
      return 0;
    }
    var minutes = Math.max.apply(null, numbers.map(Number));
    if (/hr|hour/.test(text)) {
      minutes *= 60;
    } else if (/sec|second/.test(text)) {
      minutes /= 60;
    }
    return minutes;
  }

  function gradeChip(trophy) {
    var grade = String(trophy.grade || '').toLowerCase();
    var label = grade ? grade.charAt(0).toUpperCase() + grade.slice(1) : 'Trophy';
    return '<span class="chip grade-chip grade-' + escapeHtml(grade) + '">' + escapeHtml(label) + '</span>';
  }

  function phaseChip(trophy) {
    return '<span class="chip">Phase ' + escapeHtml(trophy.phase) + ': ' + escapeHtml(phaseTitle(trophy.phase)) + '</span>';
  }

  function categoryChip(trophy) {
    return '<span class="chip">' + escapeHtml(trophy.category) + '</span>';
  }

  function difficultyChip(trophy) {
    return '<span class="chip">Difficulty ' + escapeHtml(trophy.difficulty) + '/5</span>';
  }

  function timeChip(trophy) {
    return '<span class="chip">' + escapeHtml(trophy.time) + '</span>';
  }

  function spoilerChip(trophy) {
    if (Number(trophy.spoiler) < 1) {
      return '';
    }
    return '<span class="chip badge-spoiler">SPOILER</span>';
  }

  function warningBadges(trophy) {
    var html = '';
    if (trophy.missable) {
      html += '<span class="badge badge-missable">MISSABLE</span>';
    }
    if (trophy.saveFirst) {
      html += '<span class="badge badge-watch">WATCH</span>';
    }
    return html;
  }

  function phaseTrophies(phase) {
    return routeSorted().filter(function (trophy) {
      return Number(trophy.phase) === Number(phase);
    });
  }

  function phaseStats(phase) {
    var list = phaseTrophies(phase);
    var done = list.filter(function (trophy) {
      return earned.has(trophy.name);
    }).length;
    return { total: list.length, done: done, percent: list.length ? Math.round((done / list.length) * 100) : 0 };
  }

  function renderHeader() {
    var progressLine = document.getElementById('progress-line');
    var nextLine = document.getElementById('next-line');
    if (progressLine) {
      progressLine.textContent = earnedCount() + ' of ' + TOTAL_TROPHIES + ' earned';
    }
    if (!nextLine) {
      return;
    }
    if (!dataLoaded) {
      nextLine.textContent = 'Next: loading the route…';
      return;
    }
    var next = nextTrophy();
    if (next) {
      nextLine.innerHTML = 'Next: <strong>' + escapeHtml(next.name) + '</strong> · Phase ' + escapeHtml(next.phase);
    } else {
      nextLine.innerHTML = 'Next: <strong>Platinum secured</strong> — every trophy is earned.';
    }
  }

  function renderRoadmap() {
    var nextCard = document.getElementById('roadmap-next');
    var phaseList = document.getElementById('phase-list');
    if (!nextCard || !phaseList) {
      return;
    }

    var next = nextTrophy();
    if (!next) {
      nextCard.innerHTML =
        '<p class="next-kicker">ROUTE COMPLETE</p>' +
        '<h3 class="next-name">Every trophy is earned</h3>' +
        '<p class="status-note">Nothing is left on the route. The platinum is yours.</p>';
    } else {
      nextCard.innerHTML =
        '<div>' +
          '<p class="next-kicker">NEXT ON THE ROUTE</p>' +
          '<p class="next-phase">PHASE ' + escapeHtml(next.phase) + ': ' + escapeHtml(phaseTitle(next.phase)) + '</p>' +
          '<h3 class="next-name">' + escapeHtml(next.name) + '</h3>' +
          '<div class="chip-row next-meta">' + gradeChip(next) + difficultyChip(next) + timeChip(next) + '</div>' +
        '</div>' +
        '<div class="next-actions">' +
          '<button id="next-open" class="button primary" type="button" data-open="' + escapeHtml(next.id) + '">Open the guide</button>' +
          '<button id="next-earn" class="button ghost" type="button">Mark as earned</button>' +
        '</div>';
    }

    var phaseHtml = '';
    for (var phase = 1; phase <= 6; phase += 1) {
      var list = phaseTrophies(phase);
      var stats = phaseStats(phase);
      var rows = list.map(function (trophy) {
        var isEarned = earned.has(trophy.name);
        return '<li class="phase-row' + (isEarned ? ' is-earned' : '') + '">' +
          '<label class="phase-check">' +
            '<input type="checkbox" data-earn="' + escapeHtml(trophy.id) + '"' + (isEarned ? ' checked' : '') +
              ' aria-label="Mark ' + escapeHtml(trophy.name) + ' as earned">' +
            '<span class="check-ui" aria-hidden="true"></span>' +
          '</label>' +
          '<span class="phase-row-name" title="' + escapeHtml(trophy.name) + '">' + escapeHtml(trophy.name) + '</span>' +
          '<button class="phase-open" type="button" data-open="' + escapeHtml(trophy.id) +
            '" aria-label="Open guide for ' + escapeHtml(trophy.name) + '">Guide</button>' +
        '</li>';
      }).join('');

      phaseHtml += '<article class="phase-card">' +
        '<div class="phase-card-head">' +
          '<div>' +
            '<span class="phase-number">PHASE ' + phase + '</span>' +
            '<h3 class="phase-title">' + escapeHtml(PHASE_TITLES[phase]) + '</h3>' +
          '</div>' +
          '<span class="phase-count">' + stats.done + ' of ' + stats.total + ' earned</span>' +
        '</div>' +
        '<div class="meter" role="progressbar" aria-label="Phase ' + phase + ' progress" aria-valuemin="0" aria-valuemax="' +
          stats.total + '" aria-valuenow="' + stats.done + '"><span style="width:' + stats.percent + '%"></span></div>' +
        '<ul class="phase-list">' + rows + '</ul>' +
      '</article>';
    }
    phaseList.innerHTML = phaseHtml;
  }

  function filteredTrophies() {
    var needle = filters.search.trim().toLowerCase();
    var result = routeSorted().filter(function (trophy) {
      if (needle) {
        var haystack = (String(trophy.name) + ' ' + String(trophy.description)).toLowerCase();
        if (haystack.indexOf(needle) === -1) {
          return false;
        }
      }
      if (filters.grade !== 'all' && trophy.grade !== filters.grade) {
        return false;
      }
      if (filters.category !== 'all' && trophy.category !== filters.category) {
        return false;
      }
      if (filters.phase !== 'all' && String(trophy.phase) !== filters.phase) {
        return false;
      }
      if (filters.status === 'earned' && !earned.has(trophy.name)) {
        return false;
      }
      if (filters.status === 'unearned' && earned.has(trophy.name)) {
        return false;
      }
      if (filters.status === 'missable' && !trophy.missable) {
        return false;
      }
      return true;
    });

    var routeIndex = new Map(routeSorted().map(function (trophy, index) {
      return [String(trophy.id), index];
    }));
    var routeTie = function (a, b) {
      return (routeIndex.get(String(a.id)) || 0) - (routeIndex.get(String(b.id)) || 0);
    };

    if (filters.sort === 'longest') {
      result.sort(function (a, b) {
        return (timeToMinutes(b.time) - timeToMinutes(a.time)) || routeTie(a, b);
      });
    } else if (filters.sort === 'shortest') {
      result.sort(function (a, b) {
        return (timeToMinutes(a.time) - timeToMinutes(b.time)) || routeTie(a, b);
      });
    } else if (filters.sort === 'name') {
      result.sort(function (a, b) {
        return String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base' }) || routeTie(a, b);
      });
    }
    return result;
  }

  function trophyCard(trophy) {
    var isEarned = earned.has(trophy.name);
    return '<article class="trophy-card' + (isEarned ? ' is-earned' : '') + '">' +
      '<div class="trophy-card-top">' +
        '<h3 class="trophy-name">' + escapeHtml(trophy.name) + '</h3>' +
        gradeChip(trophy) +
      '</div>' +
      '<p class="trophy-desc">' + escapeHtml(trophy.description) + '</p>' +
      '<div class="chip-row">' +
        phaseChip(trophy) + categoryChip(trophy) + difficultyChip(trophy) + timeChip(trophy) +
        spoilerChip(trophy) + warningBadges(trophy) +
      '</div>' +
      '<div class="trophy-card-foot">' +
        '<label class="trophy-check earn-toggle">' +
          '<input type="checkbox" data-earn="' + escapeHtml(trophy.id) + '"' + (isEarned ? ' checked' : '') +
            ' aria-label="Mark ' + escapeHtml(trophy.name) + ' as earned">' +
          '<span class="check-ui" aria-hidden="true"></span>' +
          '<span>Mark earned</span>' +
        '</label>' +
        '<button class="guide-link" type="button" data-open="' + escapeHtml(trophy.id) + '">Guide →</button>' +
      '</div>' +
    '</article>';
  }

  function renderTrophies() {
    var grid = document.getElementById('trophy-grid');
    var count = document.getElementById('result-count');
    if (!grid) {
      return;
    }
    var list = filteredTrophies();
    if (count) {
      count.textContent = 'Showing ' + list.length + ' of ' + TOTAL_TROPHIES;
    }
    if (!list.length) {
      grid.innerHTML = '<div class="empty-state"><strong>No trophies match</strong>' +
        '<p>Try a shorter search or reset one of the filters.</p></div>';
      return;
    }
    grid.innerHTML = list.map(trophyCard).join('');
  }

  function renderProgress() {
    var target = document.getElementById('progress-by-phase');
    if (!target) {
      return;
    }
    var html = '';
    for (var phase = 1; phase <= 6; phase += 1) {
      var stats = phaseStats(phase);
      html += '<div class="phase-progress-row">' +
        '<div class="phase-card-head">' +
          '<div>' +
            '<span class="phase-number">PHASE ' + phase + '</span>' +
            '<div class="phase-title">' + escapeHtml(PHASE_TITLES[phase]) + '</div>' +
          '</div>' +
          '<span class="phase-count">' + stats.done + ' of ' + stats.total + ' earned</span>' +
        '</div>' +
        '<div class="meter" role="progressbar" aria-label="Phase ' + phase + ' progress" aria-valuemin="0" aria-valuemax="' +
          stats.total + '" aria-valuenow="' + stats.done + '"><span style="width:' + stats.percent + '%"></span></div>' +
      '</div>';
    }
    target.innerHTML = html;
  }

  function renderSpoilerToggle() {
    var toggle = document.getElementById('spoiler-toggle');
    var text = document.getElementById('spoiler-toggle-text');
    if (!toggle) {
      return;
    }
    toggle.classList.toggle('is-on', spoilerSafe);
    toggle.setAttribute('aria-checked', spoilerSafe ? 'true' : 'false');
    if (text) {
      text.textContent = spoilerSafe ? 'ON' : 'OFF';
    }
  }

  function warningBoxes(trophy) {
    var html = '';
    if (trophy.missable) {
      html += '<div class="warning-box warning-missable"><strong>MISSABLE — this can be failed permanently; keep a save.</strong></div>';
    }
    if (trophy.saveFirst) {
      html += '<div class="warning-box warning-watch"><strong>WATCH — make a save before this moment.</strong></div>';
    }
    return html;
  }

  function detailMeta(trophy) {
    return '<div class="detail-meta-grid">' +
      '<div class="meta-box"><span>Difficulty</span><strong>' + escapeHtml(trophy.difficulty) + '/5</strong></div>' +
      '<div class="meta-box"><span>Time</span><strong>' + escapeHtml(trophy.time) + '</strong></div>' +
      '<div class="meta-box"><span>Phase</span><strong>Phase ' + escapeHtml(trophy.phase) + '</strong></div>' +
      '<div class="meta-box"><span>Spoiler level</span><strong>' + escapeHtml(trophy.spoiler) + '</strong></div>' +
    '</div>';
  }

  function renderDetail() {
    var content = document.getElementById('detail-content');
    if (!content) {
      return;
    }
    var trophy = trophies.find(function (item) {
      return String(item.id) === String(openTrophyId);
    });
    if (!trophy) {
      content.innerHTML = '<p class="status-note">That trophy could not be found.</p>';
      return;
    }

    var isEarned = earned.has(trophy.name);
    var veiled = spoilerSafe && Number(trophy.spoiler) > 0 && !isEarned && !revealedSpoilers.has(String(trophy.id));

    if (veiled) {
      content.innerHTML =
        '<div class="chip-row">' + gradeChip(trophy) + phaseChip(trophy) + '</div>' +
        '<h2 id="detail-title">Spoiler-protected trophy</h2>' +
        '<p class="detail-desc">This is a story trophy. Its name, description and route notes are kept behind the veil while spoiler-safe mode is on.</p>' +
        '<div class="spoiler-block">' +
          '<p class="veiled" aria-hidden="true">The trophy name, description and route notes are hidden until you choose to reveal them.</p>' +
          '<p>Reveal it only when you are ready. Your earned marks still work whether or not you read the guide.</p>' +
          '<div class="detail-actions">' +
            '<button id="detail-reveal" class="button primary" type="button">Reveal this guide</button>' +
            '<button id="detail-spoiler-off" class="button ghost" type="button">Turn spoiler-safe mode off</button>' +
          '</div>' +
        '</div>';
      return;
    }

    var steps = Array.isArray(trophy.steps) ? trophy.steps : [];
    var sources = Array.isArray(trophy.sources) ? trophy.sources : [];
    var stepsHtml = steps.length
      ? '<div class="detail-section"><h3>Route notes</h3><ol class="detail-steps">' +
          steps.map(function (step) { return '<li>' + escapeHtml(step) + '</li>'; }).join('') +
        '</ol></div>'
      : '';
    var tipHtml = trophy.tip
      ? '<div class="detail-section"><h3>Tip</h3><p class="detail-tip">' + escapeHtml(trophy.tip) + '</p></div>'
      : '';
    var sourcesHtml = sources.length
      ? '<div class="detail-section"><h3>Sources</h3><ul class="sources-list">' +
          sources.map(function (source) { return '<li>' + escapeHtml(source) + '</li>'; }).join('') +
        '</ul></div>'
      : '';
    var earnAction = isEarned
      ? '<span class="detail-earned-note">✓ Earned</span>'
      : '<button class="button primary" type="button" data-detail-earn="' + escapeHtml(trophy.id) + '">Mark this trophy earned</button>';
    var spoilerOff = spoilerSafe
      ? '<button id="detail-spoiler-off" class="button ghost" type="button">Turn spoiler-safe mode off</button>'
      : '';

    content.innerHTML =
      '<div class="chip-row">' + gradeChip(trophy) + phaseChip(trophy) + categoryChip(trophy) + '</div>' +
      '<h2 id="detail-title">' + escapeHtml(trophy.name) + '</h2>' +
      '<p class="detail-desc">' + escapeHtml(trophy.description) + '</p>' +
      warningBoxes(trophy) +
      detailMeta(trophy) +
      '<div class="detail-section"><h3>How to earn it</h3><p class="detail-guide">' +
        escapeHtml(trophy.guide).replace(/\n/g, '<br>') + '</p></div>' +
      stepsHtml + tipHtml + sourcesHtml +
      '<div class="detail-actions">' + earnAction + spoilerOff + '</div>';
  }

  function openDetail(id) {
    if (id == null) {
      return;
    }
    var trophy = trophies.find(function (item) {
      return String(item.id) === String(id);
    });
    if (!trophy) {
      return;
    }
    lastFocused = document.activeElement;
    openTrophyId = String(trophy.id);
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.getElementById('detail-panel').hidden = false;
    renderDetail();
    document.getElementById('detail-close').focus();
  }

  function closeDetail() {
    var panel = document.getElementById('detail-panel');
    if (!panel || panel.hidden) {
      return;
    }
    panel.hidden = true;
    openTrophyId = null;
    document.body.style.overflow = previousBodyOverflow;
    if (lastFocused && typeof lastFocused.focus === 'function' && document.contains(lastFocused)) {
      lastFocused.focus();
    }
  }

  function announce(message) {
    var region = document.getElementById('live-region');
    if (region) {
      region.textContent = message;
    }
  }

  function saveEarned() {
    var names = routeSorted().filter(function (trophy) {
      return earned.has(trophy.name);
    }).map(function (trophy) {
      return trophy.name;
    });
    try {
      localStorage.setItem(STORAGE_EARNED, JSON.stringify(names));
    } catch (error) {
      announce('Progress could not be saved in this browser.');
    }
  }

  function setEarnedById(id, value) {
    var trophy = trophies.find(function (item) {
      return String(item.id) === String(id);
    });
    if (!trophy) {
      return;
    }
    if (value) {
      earned.add(trophy.name);
    } else {
      earned.delete(trophy.name);
    }
    saveEarned();
    renderAll();
    announce(trophy.name + (value ? ' marked as earned.' : ' marked as not earned.'));
  }

  function setSpoilerSafe(value) {
    spoilerSafe = Boolean(value);
    try {
      localStorage.setItem(STORAGE_SPOILER, spoilerSafe ? 'on' : 'off');
    } catch (error) {
      announce('The spoiler setting could not be saved in this browser.');
    }
    renderSpoilerToggle();
    if (openTrophyId) {
      renderDetail();
    }
    announce('Spoiler-safe mode ' + (spoilerSafe ? 'on.' : 'off.'));
  }

  function renderAll() {
    renderHeader();
    renderRoadmap();
    renderTrophies();
    renderProgress();
    renderSpoilerToggle();
    if (openTrophyId) {
      renderDetail();
    }
  }

  function loadEarned() {
    try {
      var raw = localStorage.getItem(STORAGE_EARNED);
      var parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) {
        return;
      }
      var known = new Set(trophies.map(function (trophy) {
        return trophy.name;
      }));
      parsed.forEach(function (name) {
        if (typeof name === 'string' && known.has(name)) {
          earned.add(name);
        }
      });
    } catch (error) {
      earned = new Set();
    }
  }

  function loadSpoilerSetting() {
    try {
      spoilerSafe = localStorage.getItem(STORAGE_SPOILER) !== 'off';
    } catch (error) {
      spoilerSafe = true;
    }
  }

  function exportProgress() {
    var names = routeSorted().filter(function (trophy) {
      return earned.has(trophy.name);
    }).map(function (trophy) {
      return trophy.name;
    });
    var blob = new Blob([JSON.stringify(names, null, 2) + '\n'], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'leonida-legend-progress.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 0);
    var status = document.getElementById('import-status');
    if (status) {
      status.textContent = 'Exported ' + names.length + ' earned trophy' + (names.length === 1 ? '' : 's') + '.';
    }
  }

  function setImportStatus(message) {
    var status = document.getElementById('import-status');
    if (status) {
      status.textContent = message;
    }
  }

  function trophyWord(count) {
    return count === 1 ? 'trophy' : 'trophies';
  }

  function importProgress(file) {
    if (!file) {
      return;
    }
    file.text().then(function (text) {
      var parsed = JSON.parse(text);
      var names = Array.isArray(parsed)
        ? parsed
        : (parsed && Array.isArray(parsed.earned) ? parsed.earned : null);
      if (!names) {
        throw new Error('Expected a JSON list of trophy names.');
      }
      var known = new Set(trophies.map(function (trophy) {
        return trophy.name;
      }));
      var incoming = new Set();
      names.forEach(function (name) {
        if (typeof name === 'string' && known.has(name)) {
          incoming.add(name);
        }
      });
      earned = incoming;
      saveEarned();
      renderAll();
      setImportStatus('Imported ' + incoming.size + ' earned ' + trophyWord(incoming.size) + '.');
      announce('Progress imported.');
    }).catch(function () {
      setImportStatus('That file was not a valid Leonida Legend progress export.');
      announce('Import failed.');
    });
  }

  function activateTab(tabId, moveFocus) {
    var tabs = Array.prototype.slice.call(document.querySelectorAll('[role="tab"]'));
    tabs.forEach(function (tab) {
      var selected = tab.id === tabId;
      tab.setAttribute('aria-selected', selected ? 'true' : 'false');
      tab.setAttribute('tabindex', selected ? '0' : '-1');
      var view = document.getElementById(tab.getAttribute('aria-controls'));
      if (view) {
        view.hidden = !selected;
      }
      if (selected && moveFocus) {
        tab.focus();
      }
    });
  }

  function bindTabs() {
    var tabs = Array.prototype.slice.call(document.querySelectorAll('[role="tab"]'));
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        activateTab(tab.id, false);
      });
      tab.addEventListener('keydown', function (event) {
        var index = tabs.indexOf(tab);
        var target = null;
        if (event.key === 'ArrowRight') {
          target = tabs[(index + 1) % tabs.length];
        } else if (event.key === 'ArrowLeft') {
          target = tabs[(index - 1 + tabs.length) % tabs.length];
        } else if (event.key === 'Home') {
          target = tabs[0];
        } else if (event.key === 'End') {
          target = tabs[tabs.length - 1];
        }
        if (target) {
          event.preventDefault();
          activateTab(target.id, true);
        }
      });
    });
  }

  function bindStaticControls() {
    var openNext = document.getElementById('open-next');
    if (openNext) {
      openNext.addEventListener('click', function () {
        var next = nextTrophy();
        if (next) {
          openDetail(next.id);
        } else {
          announce('Every trophy is already earned.');
        }
      });
    }

    var search = document.getElementById('search-input');
    if (search) {
      search.addEventListener('input', function () {
        filters.search = search.value;
        renderTrophies();
      });
    }

    var selectMap = {
      'filter-grade': 'grade',
      'filter-category': 'category',
      'filter-phase': 'phase',
      'filter-status': 'status',
      'filter-sort': 'sort'
    };
    Object.keys(selectMap).forEach(function (id) {
      var select = document.getElementById(id);
      if (select) {
        select.addEventListener('change', function () {
          filters[selectMap[id]] = select.value;
          renderTrophies();
        });
      }
    });

    var clearFilters = document.getElementById('clear-filters');
    if (clearFilters) {
      clearFilters.addEventListener('click', function () {
        filters = { search: '', grade: 'all', category: 'all', phase: 'all', status: 'all', sort: 'route' };
        if (search) {
          search.value = '';
        }
        Object.keys(selectMap).forEach(function (id) {
          var select = document.getElementById(id);
          if (select) {
            select.value = id === 'filter-sort' ? 'route' : 'all';
          }
        });
        renderTrophies();
      });
    }

    var exportBtn = document.getElementById('export-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', exportProgress);
    }

    var importBtn = document.getElementById('import-btn');
    var importFile = document.getElementById('import-file');
    if (importBtn && importFile) {
      importBtn.addEventListener('click', function () {
        importFile.click();
      });
      importFile.addEventListener('change', function () {
        var file = importFile.files && importFile.files[0];
        importProgress(file);
        importFile.value = '';
      });
    }

    var clearAll = document.getElementById('clear-all');
    if (clearAll) {
      clearAll.addEventListener('click', function () {
        earned = new Set();
        saveEarned();
        renderAll();
        setImportStatus('All ticks cleared.');
        announce('All earned marks cleared.');
      });
    }

    var spoilerToggle = document.getElementById('spoiler-toggle');
    if (spoilerToggle) {
      spoilerToggle.addEventListener('click', function () {
        setSpoilerSafe(!spoilerSafe);
      });
    }

    var detailClose = document.getElementById('detail-close');
    if (detailClose) {
      detailClose.addEventListener('click', closeDetail);
    }
  }

  function bindDynamicControls() {
    document.addEventListener('click', function (event) {
      var openTrigger = event.target.closest('[data-open]');
      if (openTrigger) {
        event.preventDefault();
        openDetail(openTrigger.getAttribute('data-open'));
        return;
      }

      if (event.target.closest('#next-earn')) {
        var next = nextTrophy();
        if (next) {
          setEarnedById(next.id, true);
        }
        return;
      }

      if (event.target.closest('#detail-reveal')) {
        if (openTrophyId) {
          revealedSpoilers.add(String(openTrophyId));
          renderDetail();
          announce('Guide revealed.');
        }
        return;
      }

      if (event.target.closest('#detail-spoiler-off')) {
        setSpoilerSafe(false);
        return;
      }

      var detailEarn = event.target.closest('[data-detail-earn]');
      if (detailEarn) {
        setEarnedById(detailEarn.getAttribute('data-detail-earn'), true);
        return;
      }

      if (event.target.closest('[data-close-detail]')) {
        closeDetail();
      }
    });

    document.addEventListener('change', function (event) {
      var checkbox = event.target.closest('input[data-earn]');
      if (checkbox) {
        setEarnedById(checkbox.getAttribute('data-earn'), checkbox.checked);
      }
    });

    document.addEventListener('keydown', function (event) {
      var panel = document.getElementById('detail-panel');
      if (!panel || panel.hidden) {
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        closeDetail();
        return;
      }
      if (event.key !== 'Tab') {
        return;
      }
      var sheet = panel.querySelector('.detail-sheet');
      var focusable = Array.prototype.slice.call(sheet.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )).filter(function (element) {
        return element.offsetParent !== null;
      });
      if (!focusable.length) {
        return;
      }
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
  }

  function renderError() {
    var nextLine = document.getElementById('next-line');
    var nextCard = document.getElementById('roadmap-next');
    var phaseList = document.getElementById('phase-list');
    var grid = document.getElementById('trophy-grid');
    var progress = document.getElementById('progress-by-phase');
    if (nextLine) {
      nextLine.textContent = 'Next: trophy data could not be loaded.';
    }
    if (nextCard) {
      nextCard.innerHTML = '<p class="next-kicker">ROUTE UNAVAILABLE</p>' +
        '<p class="status-note">Could not read data/trophies.json. Serve the app folder and try again.</p>';
    }
    if (phaseList) {
      phaseList.innerHTML = '<p class="status-note">Phase data is unavailable.</p>';
    }
    if (grid) {
      grid.innerHTML = '<div class="empty-state"><strong>Trophies unavailable</strong>' +
        '<p>The local trophy data file could not be loaded.</p></div>';
    }
    if (progress) {
      progress.innerHTML = '<p class="status-note">Progress data is unavailable.</p>';
    }
    announce('Trophy data could not be loaded.');
  }

  function boot() {
    bindTabs();
    bindStaticControls();
    bindDynamicControls();
    loadSpoilerSetting();
    renderSpoilerToggle();
    renderHeader();
    activateTab('tab-roadmap', false);

    fetch('data/trophies.json')
      .then(function (response) {
        if (!response.ok) {
          throw new Error('Trophy data request failed.');
        }
        return response.json();
      })
      .then(function (data) {
        var list = Array.isArray(data) ? data : (data && Array.isArray(data.trophies) ? data.trophies : null);
        if (!list) {
          throw new Error('Trophy data is not a list.');
        }
        trophies = list.slice();
        dataLoaded = true;
        loadEarned();
        renderAll();
        announce('Trophy guide ready. ' + trophies.length + ' trophies loaded.');
      })
      .catch(function () {
        dataLoaded = false;
        renderError();
      });
  }

  boot();
}());
