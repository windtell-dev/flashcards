// ponytail: one localStorage key, so with two tabs open the last save wins. Add a storage listener if that matters.
const KEY = 'flashcards.sets';
const THEME_KEY = 'flashcards.theme';
const app = document.getElementById('app');
const warning = document.getElementById('warning');
let sets = load();
let study = null;
const editingIds = new Set();

function load() {
  let raw;
  try { raw = localStorage.getItem(KEY); } catch { return showWarning(), []; }
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch { /* handled below */ }
  // Keep unreadable data under another key so the next save can't erase it.
  try { localStorage.setItem(`${KEY}.unreadable.${Date.now()}`, raw); } catch { /* nothing else to try */ }
  return [];
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(sets));
    warning.hidden = true;
  } catch {
    showWarning();
  }
}

function showWarning() {
  warning.textContent = "Your changes can't be saved in this browser. Check that site data is allowed.";
  warning.hidden = false;
}

const isDark = () => document.documentElement.dataset.theme === 'dark';

function showThemeColor() {
  document.querySelector('meta[name="theme-color"]').content = isDark() ? '#000000' : '#d3c0c9';
}

function setDark(dark) {
  const root = document.documentElement;
  root.classList.add('changing-theme');
  setTimeout(() => root.classList.remove('changing-theme'), 400);
  if (dark) root.dataset.theme = 'dark';
  else delete root.dataset.theme;
  showThemeColor();
  try { localStorage.setItem(THEME_KEY, dark ? 'dark' : 'pink'); } catch { /* the choice just won't be remembered */ }
}

const esc = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const makeId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const newCard = () => ({ id: makeId(), term: '', definition: '' });
const isBlank = card => !card.term.trim() && !card.definition.trim();
const plural = n => `${n} ${n === 1 ? 'card' : 'cards'}`;

// Removes blank cards and empty sets, except in the set being edited.
function tidy(editingId) {
  const before = JSON.stringify(sets);
  sets = sets
    .map(set => (set.id === editingId ? set : { ...set, cards: set.cards.filter(card => !isBlank(card)) }))
    .filter(set => set.id === editingId || set.title.trim() || set.cards.length);
  if (JSON.stringify(sets) !== before) save();
}

function render() {
  const [, id, mode] = location.hash.match(/^#\/set\/([^/]+)\/(edit|study)$/) || [];
  tidy(mode === 'edit' ? id : null);
  study = null;
  scrollTo(0, 0);
  const set = sets.find(s => s.id === id);
  if (set && mode === 'edit') renderEdit(set);
  else if (set && mode === 'study' && set.cards.length) renderStudy(set);
  else if (set && mode === 'study') location.replace(`#/set/${id}/edit`);
  else renderHome();
}

/* sets */
function tileHtml(set) {
  const id = esc(set.id);
  const title = esc(set.title.trim() || 'Untitled set');
  const editing = editingIds.has(set.id);
  const hasCards = set.cards.length > 0;
  const target = editing || !hasCards ? 'edit' : 'study';
  const button = editing
    ? `<a class="pill" href="#/set/${id}/edit">Edit</a>`
    : hasCards
      ? `<a class="pill primary" href="#/set/${id}/study">Study</a>`
      : '<button class="pill primary" disabled>Study</button>';
  return `
    <div class="set">
      <a class="set-link" href="#/set/${id}/${target}" ${editing || hasCards ? 'tabindex="-1"' : ''} title="${title}">
        <span class="set-title">${title}</span>
        <span class="set-count">${plural(set.cards.length)}</span>
      </a>
      ${button}
    </div>`;
}

function setHtml(set) {
  const label = esc(set.title.trim() || 'Untitled set');
  return `
    <li data-id="${esc(set.id)}">
      ${tileHtml(set)}
      <button class="switch" type="button" role="switch" aria-checked="${editingIds.has(set.id)}" aria-label="Edit ${label}">
        <span aria-hidden="true">Edit</span>
        <span class="track"><span class="thumb"></span></span>
      </button>
    </li>`;
}

function renderHome() {
  document.title = 'Flashcards';
  app.innerHTML = `
    <div class="head">
      <h1>Flashcards</h1>
      <button class="theme-switch" id="theme" type="button" role="switch" aria-label="Dark mode" aria-checked="${isDark()}">
        <span class="track"><span class="thumb">
          <svg class="heart" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-8.5-5.3-8.5-11.2A4.8 4.8 0 0 1 12 6.6a4.8 4.8 0 0 1 8.5 3.2C20.5 15.700 12 21 12 21z"/></svg>
          <svg class="moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.800A9 9 0 1 1 11.200 3a7 7 0 0 0 9.800 9.800z"/></svg>
        </span></span>
      </button>
    </div>
    <ul class="sets" id="sets">
      <li>
        <button class="add-tile" id="new" type="button" aria-label="New set">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v16M4 12h16"/></svg>
        </button>
      </li>
      ${sets.map(setHtml).join('')}
    </ul>`;
  document.getElementById('theme').onclick = e => {
    setDark(!isDark());
    e.currentTarget.setAttribute('aria-checked', isDark());
  };
  document.getElementById('new').onclick = () => {
    const set = { id: makeId(), title: '', cards: [newCard(), newCard()] };
    sets.unshift(set);
    save();
    location.hash = `#/set/${set.id}/edit`;
  };
  document.getElementById('sets').onclick = e => {
    const toggle = e.target.closest('.switch');
    if (!toggle) return;
    const item = toggle.closest('li');
    const set = sets.find(s => s.id === item.dataset.id);
    if (!editingIds.delete(set.id)) editingIds.add(set.id);
    toggle.setAttribute('aria-checked', editingIds.has(set.id));
    // Only the square is redrawn, so the switch keeps its animation.
    item.querySelector('.set').outerHTML = tileHtml(set);
  };
}

/* editor */
function rowHtml(card, number) {
  return `
    <div class="row" data-id="${esc(card.id)}">
      <span class="row-number">${number}</span>
      <textarea rows="1" data-field="term" aria-label="Question or term for card ${number}" placeholder="Question/Term">${esc(card.term)}</textarea>
      <textarea rows="1" data-field="definition" aria-label="Response or definition for card ${number}" placeholder="Response/Definition">${esc(card.definition)}</textarea>
      <button class="remove" type="button" aria-label="Delete card ${number}">×</button>
    </div>`;
}

function grow(box) {
  box.style.height = 'auto';
  box.style.height = `${box.scrollHeight + box.offsetHeight - box.clientHeight}px`;
}

function renderEdit(set) {
  document.title = `Edit ${set.title.trim() || 'set'}`;
  if (!set.cards.length) set.cards.push(newCard());
  app.innerHTML = `
    <div class="head">
      <a class="back" href="#/">← Sets</a>
      <button class="pill danger" id="delete">Delete set</button>
    </div>
    <input class="title-input" id="title" aria-label="Set title" placeholder="Set title" value="${esc(set.title)}">
    <div class="rows" id="rows"></div>
    <button class="add" id="add">Add card</button>
    <div class="actions">
      <a class="pill" href="#/">Done</a>
      <a class="pill primary" href="#/set/${esc(set.id)}/study">Study</a>
    </div>`;

  const rows = document.getElementById('rows');
  const draw = () => {
    rows.innerHTML = set.cards.map((card, i) => rowHtml(card, i + 1)).join('');
    rows.querySelectorAll('textarea').forEach(grow);
  };
  const addCard = () => {
    set.cards.push(newCard());
    save();
    draw();
    rows.lastElementChild.querySelector('textarea').focus();
  };
  draw();

  const title = document.getElementById('title');
  title.oninput = () => { set.title = title.value; save(); };
  if (!set.title) title.focus();

  document.getElementById('add').onclick = addCard;
  document.getElementById('delete').onclick = () => {
    if (!confirm(`Delete "${set.title.trim() || 'Untitled set'}"? This can't be undone.`)) return;
    sets = sets.filter(s => s !== set);
    save();
    location.hash = '#/';
  };

  rows.oninput = e => {
    const card = set.cards.find(c => c.id === e.target.closest('.row').dataset.id);
    card[e.target.dataset.field] = e.target.value;
    grow(e.target);
    save();
  };
  rows.onclick = e => {
    if (!e.target.classList.contains('remove')) return;
    set.cards = set.cards.filter(c => c.id !== e.target.closest('.row').dataset.id);
    save();
    draw();
  };
  // Enter moves to the next box and adds a card after the last one. Shift+Enter makes a new line.
  rows.onkeydown = e => {
    if (e.key !== 'Enter' || e.shiftKey || e.target.tagName !== 'TEXTAREA') return;
    e.preventDefault();
    const boxes = [...rows.querySelectorAll('textarea')];
    const next = boxes[boxes.indexOf(e.target) + 1];
    if (next) next.focus();
    else addCard();
  };
}

/* study */
function renderStudy(set) {
  document.title = set.title.trim() || 'Study';
  study = { set, cards: set.cards, index: 0, flipped: false };
  drawCard();
}

function drawCard() {
  const { set, cards, index } = study;
  const card = cards[index];
  const size = text => (text.length > 140 ? 'long' : '');
  const last = index === cards.length - 1;
  study.flipped = false;
  app.innerHTML = `
    <div class="head">
      <a class="back" href="#/">← Sets</a>
      <span class="count" aria-live="polite">${index + 1} / ${cards.length}</span>
    </div>
    <h1 class="study-title">${esc(set.title.trim() || 'Untitled set')}</h1>
    <div class="card" id="card" role="button" tabindex="0" aria-label="Flip card">
      <div class="card-inner">
        <div class="face" id="front">
          <div class="face-label">Question/Term</div>
          <div class="face-text ${size(card.term)}"><span>${esc(card.term)}</span></div>
        </div>
        <div class="face face-back" id="back" aria-hidden="true">
          <div class="face-label">Response/Definition</div>
          <div class="face-text ${size(card.definition)}"><span>${esc(card.definition)}</span></div>
        </div>
      </div>
    </div>
    <div class="controls">
      <button class="pill" id="prev" ${index === 0 ? 'disabled' : ''}>Previous</button>
      ${last ? '<a class="pill primary" href="#/">Done</a>' : '<button class="pill primary" id="next">Next</button>'}
    </div>
    <p class="hint">Click a card or press Space to flip. Use ← and → to move.</p>`;
  document.getElementById('card').onclick = flip;
  document.getElementById('prev').onclick = () => move(-1);
  if (!last) document.getElementById('next').onclick = () => move(1);
}

function flip() {
  study.flipped = !study.flipped;
  document.getElementById('card').classList.toggle('flipped', study.flipped);
  document.getElementById('front').setAttribute('aria-hidden', study.flipped);
  document.getElementById('back').setAttribute('aria-hidden', !study.flipped);
}

function move(step) {
  const index = study.index + step;
  if (index < 0 || index >= study.cards.length) return;
  study.index = index;
  drawCard();
}

document.addEventListener('keydown', e => {
  if (!study) return;
  const onControl = ['BUTTON', 'A'].includes(e.target.tagName);
  if ((e.key === ' ' || e.key === 'Enter') && !onControl) {
    e.preventDefault();
    flip();
  } else if (e.key === 'ArrowRight') {
    move(1);
  } else if (e.key === 'ArrowLeft') {
    move(-1);
  }
});

showThemeColor();
addEventListener('hashchange', render);
render();
