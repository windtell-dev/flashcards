// ponytail: one localStorage key, so with two tabs open the last save wins. Add a storage listener if that matters.
const KEY = 'flashcards.sets';
const THEME_KEY = 'flashcards.theme';
const DEMO_KEY = 'flashcards.demoAdded';
const MAX_DROP_BYTES = 2 * 1024 * 1024;
const UNREADABLE_FILE = /\.(pdf|docx?|pptx?|xlsx?|pages|key|numbers|png|jpe?g|gif|heic|webp|zip)$/i;

// Temporary demo set. Delete this, seedDemo, and its call when real content takes over.
const DEMO_SET = {
  title: 'Branch and Bound vs Backtracking',
  cards: [
    ['What is the worst case scenario space complexity O(n)', 'Back Tracking'],
    ['Which is the worst case scenario space complexity that is exponential', 'Branch and Bound'],
    ['What uses DFS?', 'Backtracking'],
    ['What uses BFS?', 'Branch and Bound'],
    ['What prunes when a partial solution becomes invalid?', 'Backtracking'],
  ],
};
const app = document.getElementById('app');
const warning = document.getElementById('warning');
let sets = load();
let study = null;
let quiz = null;

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

function showWarning(text = "Your changes can't be saved in this browser. Check that site data is allowed.") {
  warning.textContent = text;
  warning.hidden = false;
}

// Adds the demo once per browser, so deleting it sticks and existing sets are left alone.
function seedDemo() {
  try {
    if (localStorage.getItem(DEMO_KEY)) return;
    localStorage.setItem(DEMO_KEY, '1');
  } catch {
    return;
  }
  if (sets.some(set => set.title.trim().toLowerCase() === DEMO_SET.title.toLowerCase())) return;
  sets.unshift({
    id: makeId(),
    title: DEMO_SET.title,
    cards: DEMO_SET.cards.map(([term, definition]) => ({ id: makeId(), term, definition })),
  });
  save();
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
  const [, id, mode] = location.hash.match(/^#\/set\/([^/]+)\/(edit|study|quiz)$/) || [];
  tidy(mode === 'edit' ? id : null);
  study = null;
  quiz = null;
  scrollTo(0, 0);
  app.classList.toggle('wide', !mode);
  const set = sets.find(s => s.id === id);
  if (set && mode === 'edit') renderEdit(set);
  else if (set && mode === 'study' && set.cards.length) renderStudy(set);
  else if (set && mode === 'study') location.replace(`#/set/${id}/edit`);
  else if (set && mode === 'quiz') renderQuiz(set);
  else renderHome();
}

/* sets */
function setHtml(set) {
  const id = esc(set.id);
  const title = esc(set.title.trim() || 'Untitled set');
  return `
    <li class="set">
      <a class="set-link" href="#/set/${id}/${set.cards.length ? 'study' : 'edit'}" title="${title}">
        <span class="set-title">${title}</span>
        <span class="set-count">${plural(set.cards.length)}</span>
      </a>
      <div class="set-actions">
        <a class="pill edit-link" href="#/set/${id}/edit" aria-label="Edit ${title}" title="Edit">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9a2.800 2.800 0 0 0-4-4L4 16z"/><path d="m13.500 6.500 4 4"/></svg>
        </a>
      </div>
    </li>`;
}

// Switches between flipping cards and taking a quiz on the study page.
function modeTabs(set, active) {
  const id = esc(set.id);
  const canQuiz = Quiz.build(set.cards).length > 0;
  const tab = (mode, label) => `<a href="#/set/${id}/${mode}" ${active === mode ? 'aria-current="page"' : ''}>${label}</a>`;
  return `
    <nav class="modes" aria-label="Study mode">
      ${tab('study', 'Flashcards')}
      ${canQuiz ? tab('quiz', 'Quiz') : '<span class="mode-off" title="A quiz needs at least two different answers">Quiz</span>'}
    </nav>`;
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
    <p class="drop-hint">Drag a text file or selected questions anywhere here to make a set.</p>
    <ul class="sets">
      <li>
        <button class="add-tile" id="new" type="button" aria-label="New set">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v16M4 12h16"/></svg>
        </button>
      </li>
      ${sets.map(setHtml).join('')}
    </ul>
    <dialog id="addDialog" aria-labelledby="addHeading"></dialog>`;
  document.getElementById('theme').onclick = e => {
    setDark(!isDark());
    e.currentTarget.setAttribute('aria-checked', isDark());
  };
  document.getElementById('new').onclick = openAddDialog;
}

/* add a set */
function addSet(title, cards) {
  const set = { id: makeId(), title, cards };
  sets.unshift(set);
  save();
  return set;
}

function openAddDialog() {
  const dialog = document.getElementById('addDialog');
  drawAddChoices();
  dialog.showModal();
  // A click on the backdrop lands on the dialog itself, because its content fills the box.
  dialog.onclick = e => { if (e.target === dialog) dialog.close(); };
}

const dialogHead = (title, showBack) => `
  <div class="dialog-head">
    ${showBack ? '<button class="icon-only" id="addBack" type="button" aria-label="Back">←</button>' : ''}
    <h2 id="addHeading">${title}</h2>
    <button class="icon-only" id="addClose" type="button" aria-label="Close">×</button>
  </div>`;

function bindDialogHead(dialog) {
  dialog.querySelector('#addClose').onclick = () => dialog.close();
  const back = dialog.querySelector('#addBack');
  if (back) back.onclick = drawAddChoices;
}

function drawAddChoices() {
  const dialog = document.getElementById('addDialog');
  dialog.innerHTML = `
    <div class="dialog-body">
      ${dialogHead('New set', false)}
      <button class="choice" id="addText" type="button">
        <b>Add from text</b>
        <span>Paste notes, slides, or a whole chapter, and cards are made for you.</span>
      </button>
      <button class="choice" id="addManual" type="button">
        <b>Create manually</b>
        <span>Type each question and response yourself.</span>
      </button>
    </div>`;
  bindDialogHead(dialog);
  dialog.querySelector('#addText').onclick = drawAddFromText;
  dialog.querySelector('#addManual').onclick = () => {
    const set = addSet('', [newCard(), newCard()]);
    location.hash = `#/set/${set.id}/edit`;
  };
}

function drawAddFromText() {
  const dialog = document.getElementById('addDialog');
  dialog.innerHTML = `
    <div class="dialog-body">
      ${dialogHead('Add from text', true)}
      <input class="dialog-field" id="addTitleInput" aria-label="Set title" placeholder="Set title (optional)">
      <textarea class="dialog-field" id="addSource" rows="8" aria-label="Your text" placeholder="Paste all your text here"></textarea>
      <p class="dialog-hint">Paste anything. Question lists stay as they are, and other text becomes definition and fill-in-the-blank cards. This runs on your device, and answers only come from your text.</p>
      <div id="addPreview" role="status"></div>
      <button class="pill primary dialog-create" id="addCreate" type="button" disabled>Create set</button>
    </div>`;
  bindDialogHead(dialog);
  const source = dialog.querySelector('#addSource');
  const create = dialog.querySelector('#addCreate');
  const preview = dialog.querySelector('#addPreview');
  source.oninput = () => {
    const cards = Importer.parse(source.value);
    create.disabled = !cards.length;
    create.textContent = cards.length ? `Create set with ${plural(cards.length)}` : 'Create set';
    if (!source.value.trim()) preview.innerHTML = '';
    else if (!cards.length) preview.innerHTML = '<p class="dialog-hint">No questions found yet. Try one question and answer per line, or full sentences.</p>';
    else preview.innerHTML = `<ul class="preview">${cards.slice(0, 5).map(card => `
      <li><span>${esc(card.term)}</span><b>${esc(card.definition) || 'No response yet'}</b></li>`).join('')}</ul>
      ${cards.length > 5 ? `<p class="dialog-hint">And ${plural(cards.length - 5)} more.</p>` : ''}`;
  };
  create.onclick = () => {
    const cards = Importer.parse(source.value).map(({ term, definition }) => ({ id: makeId(), term, definition }));
    const set = addSet(dialog.querySelector('#addTitleInput').value.trim(), cards);
    location.hash = `#/set/${set.id}/edit`;
  };
  source.focus();
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
    ${modeTabs(set, 'study')}
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

/* quiz */
const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 13 4.500 4.500L19 7"/></svg>';
const CROSS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';

function renderQuiz(set) {
  const questions = Quiz.build(set.cards);
  if (!questions.length) {
    location.replace(`#/set/${esc(set.id)}/study`);
    return;
  }
  document.title = `Quiz: ${set.title.trim() || 'Untitled set'}`;
  quiz = { set, questions, index: 0, score: 0, missed: [], answered: false };
  drawQuestion();
}

function drawQuestion() {
  const { set, questions, index } = quiz;
  const question = questions[index];
  quiz.answered = false;
  app.innerHTML = `
    <div class="head">
      <a class="back" href="#/">← Sets</a>
      <span class="count">${index + 1} / ${questions.length}</span>
    </div>
    <h1 class="study-title">${esc(set.title.trim() || 'Untitled set')}</h1>
    ${modeTabs(set, 'quiz')}
    <section class="quiz-card">
      <div class="face-label">Question/Term</div>
      <p class="quiz-question">${esc(question.term)}</p>
    </section>
    <div class="options" id="options" role="group" aria-label="Answer choices">
      ${question.options.map((option, i) => `
        <button class="option" type="button" data-i="${i}">
          <span class="mark"></span>
          <span class="option-text">${esc(option)}</span>
        </button>`).join('')}
    </div>
    <p class="feedback" id="feedback" role="status"></p>
    <div class="quiz-next"><button class="pill primary" id="next" hidden>${index === questions.length - 1 ? 'See results' : 'Next question'}</button></div>`;
  document.getElementById('options').onclick = e => {
    const option = e.target.closest('.option');
    if (option) choose(Number(option.dataset.i));
  };
  document.getElementById('next').onclick = nextQuestion;
}

function choose(choice) {
  if (quiz.answered) return;
  const question = quiz.questions[quiz.index];
  const right = choice === question.correct;
  const options = document.querySelectorAll('.option');
  quiz.answered = true;
  if (right) quiz.score++;
  else quiz.missed.push(question);
  options.forEach(option => { option.disabled = true; });
  options[question.correct].classList.add('right');
  options[question.correct].querySelector('.mark').innerHTML = CHECK;
  if (!right) {
    options[choice].classList.add('wrong');
    options[choice].querySelector('.mark').innerHTML = CROSS;
  }
  document.getElementById('options').classList.add('answered');
  document.getElementById('feedback').textContent = right ? 'Correct.' : `Not quite. The answer is ${question.answer}.`;
  const next = document.getElementById('next');
  next.hidden = false;
  next.focus();
}

function nextQuestion() {
  quiz.index++;
  if (quiz.index < quiz.questions.length) drawQuestion();
  else drawResults();
}

function drawResults() {
  const { set, questions, score, missed } = quiz;
  quiz.answered = true;
  app.innerHTML = `
    <div class="head"><a class="back" href="#/">← Sets</a></div>
    <h1 class="study-title">${esc(set.title.trim() || 'Untitled set')}</h1>
    ${modeTabs(set, 'quiz')}
    <section class="quiz-card results">
      <p class="quiz-score">${score} of ${questions.length} correct</p>
      ${missed.length ? `
        <p class="label">Review these</p>
        <ul class="missed">${missed.map(item => `
          <li><span>${esc(item.term)}</span><b>${esc(item.answer)}</b></li>`).join('')}</ul>` : '<p class="perfect">You got every question right.</p>'}
    </section>
    <div class="actions">
      <a class="pill" href="#/">Back to sets</a>
      <button class="pill primary" id="again">Quiz again</button>
    </div>`;
  document.getElementById('again').onclick = () => renderQuiz(set);
}

/* drag in questions */
const onHomePage = () => !/^#\/set\//.test(location.hash);
const isTextField = target => ['INPUT', 'TEXTAREA'].includes(target.tagName);
const hasFiles = transfer => [...transfer.types].includes('Files');

function addImportedSet(text, fileName = '') {
  const cards = Importer.parse(text, fileName);
  if (!cards.length) return null;
  return addSet(fileName.replace(/\.[^.]+$/, ''), cards.map(({ term, definition }) => ({ id: makeId(), term, definition })));
}

async function importFile(file) {
  if (UNREADABLE_FILE.test(file.name)) return `${file.name} isn't a text file. Copy its text into a .txt file, or select the text and drag it in.`;
  if (file.size > MAX_DROP_BYTES) return `${file.name} is too large. The limit is 2 MB.`;
  let text;
  try {
    text = await file.text();
  } catch {
    return `${file.name} couldn't be read.`;
  }
  if (text.includes('\0')) return `${file.name} isn't a text file. Copy its text into a .txt file, or select the text and drag it in.`;
  return addImportedSet(text, file.name) || `No questions were found in ${file.name}.`;
}

async function importDropped(files, text) {
  const results = files.length ? await Promise.all(files.map(importFile)) : [addImportedSet(text) || 'No questions were found in that text.'];
  const created = results.filter(result => typeof result !== 'string');
  const problems = results.filter(result => typeof result === 'string');
  if (created.length === 1) {
    location.hash = `#/set/${created[0].id}/edit`;
  } else if (onHomePage()) {
    render();
  }
  if (problems.length) showWarning(problems.join(' '));
  else if (!warning.textContent.startsWith('Your changes')) warning.hidden = true;
}

document.addEventListener('dragover', e => {
  if (isTextField(e.target) && !hasFiles(e.dataTransfer)) return;
  e.preventDefault(); // Otherwise the browser leaves the app to open the dropped file.
  document.body.classList.toggle('dropping', onHomePage());
});
document.addEventListener('dragleave', e => {
  if (!e.relatedTarget) document.body.classList.remove('dropping');
});
document.addEventListener('drop', e => {
  if (isTextField(e.target) && !hasFiles(e.dataTransfer)) return;
  e.preventDefault();
  document.body.classList.remove('dropping');
  if (!onHomePage()) return;
  importDropped([...e.dataTransfer.files], e.dataTransfer.getData('text/plain'));
});

document.addEventListener('keydown', e => {
  if (quiz && !quiz.answered && /^[1-9]$/.test(e.key)) {
    const choice = Number(e.key) - 1;
    if (choice < quiz.questions[quiz.index].options.length) choose(choice);
    return;
  }
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

seedDemo();
showThemeColor();
addEventListener('hashchange', render);
render();
