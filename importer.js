// Turns pasted or dropped text into cards. Existing question lists and term pairs keep their layout, and
// anything else goes through a small built-in generator. It never invents an answer: answers always come
// from the text, and a question with no answer in the text becomes a card with a blank response.
// ponytail: word statistics, not a language model, so it can't paraphrase or infer. A model would mean a large download or a server.
const Importer = (() => {
  const MAX_CARDS = 5000;
  const SHARE_NEEDED = 0.6;
  const DELIMITERS = ['\t', ' | ', ' -> ', ' → ', ' = ', ' — ', ' – ', ' - ', ' : ', ': '];
  const NUMBERED = /^(?:(?:q|question)\s*)?\d+\s*[.):-]\s*/i;
  const QUESTION_LABEL = /^(?:q|question)\s*\d*\s*[:.)]\s*(.*)$/i;
  const ANSWER_LABEL = /^(?:ans|answer|a)\s*\d*\s*[:=]\s*(.*)$/i;
  const OPTION = /^([a-e])[).]\s+(.*)$/i;
  const HEADER_TERM = /^(?:term|question|front|q)$/i;
  const HEADER_DEFINITION = /^(?:definition|answer|back|response|a)$/i;
  const STATEMENT = /^(.{2,80}?)\s+(is|are|means|refers to|uses|has|requires|needs|contains|produces|stores)\s+(.{2,})$/i;
  // Sentences starting with these depend on context, so the subject wouldn't make sense as a question.
  const UNCLEAR_START = /^(?:it|this|that|these|those|they|there|here|he|she|we|you|i|if|when|which|then|as|now|also|next|once|note|because|since|although|while|however|thus|so|but|and|or|in|on|at|for|to|with|by|from|after|before|each|its|their)\b/i;
  const VERB_QUESTIONS = {
    is: subject => `What is ${subject}?`,
    are: subject => `What are ${subject}?`,
    means: subject => `What does ${subject} mean?`,
    'refers to': subject => `What does ${subject} refer to?`,
    has: subject => `What does ${subject} have?`,
  };

  const clean = line => line
    .replace(/^\s*(?:[-*•]\s+|>\s*)/, '')
    .replace(/\*\*|__/g, '')
    .replace(/^\s*\|\s*/, '')
    .replace(/\s*\|\s*$/, '')
    .trim();
  const unnumber = text => text.replace(NUMBERED, '').trim();
  const endsLikeQuestion = line => /\?\s*$/.test(line);
  const mostly = (count, total) => total > 0 && count / total >= SHARE_NEEDED;
  const card = (term, definition = '') => ({ term: unnumber(term), definition: definition.trim() });

  function withoutHeader(cards) {
    const [first] = cards;
    return first && HEADER_TERM.test(first.term) && HEADER_DEFINITION.test(first.definition) ? cards.slice(1) : cards;
  }

  // Handles quoted commas and line breaks.
  function csvRows(text) {
    const rows = [[]];
    let field = '';
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (c === '"') quoted = false;
        else field += c;
      } else if (c === '"') quoted = true;
      else if (c === ',') { rows[rows.length - 1].push(field); field = ''; }
      else if (c === '\n') { rows[rows.length - 1].push(field); field = ''; rows.push([]); }
      else if (c !== '\r') field += c;
    }
    rows[rows.length - 1].push(field);
    return rows;
  }

  // "Term - definition" on each line.
  function byDelimiter(lines) {
    const usable = lines.filter(line => !/^[\s|:-]+$/.test(line));
    const delimiter = DELIMITERS.find(d =>
      mostly(usable.filter(line => line.includes(d) && !endsLikeQuestion(line)).length, usable.length));
    if (!delimiter) return null;
    return withoutHeader(usable.map(line => {
      const at = line.indexOf(delimiter);
      return at < 0 ? card(line) : card(line.slice(0, at), line.slice(at + delimiter.length));
    }));
  }

  // "What uses DFS? Backtracking" on each line.
  function bySameLineQuestion(lines) {
    const matches = lines.map(line => line.match(/^(.+?\?)\s+(\S.*)$/));
    if (!mostly(matches.filter(Boolean).length, lines.length)) return null;
    return lines.map((line, i) => (matches[i] ? card(matches[i][1], matches[i][2]) : card(line)));
  }

  function finishQuestion(item) {
    let answer = item.answer.join('\n').trim();
    let term = item.term.join('\n');
    if (item.options.length) {
      const letter = answer.match(/^\(?([a-e])\)?(?:[).:]|\s|$)/i);
      const picked = letter && item.options.find(o => o.letter === letter[1].toLowerCase());
      if (picked) answer = picked.text;
      else if (!answer) term += `\n${item.options.map(o => `${o.letter.toUpperCase()}) ${o.text}`).join('\n')}`;
    }
    return card(term, answer);
  }

  // Questions followed by their answers, including multiple choice and "Answer: B".
  function byQuestions(lines, isStart, labeled) {
    const cards = [];
    let current = null;
    for (const line of lines) {
      if (!line) continue;
      const answerLine = line.match(ANSWER_LABEL);
      const option = line.match(OPTION);
      if (current && answerLine) {
        current.answer.push(answerLine[1]);
        current.hasAnswer = true;
      } else if (isStart(line)) {
        if (current) cards.push(finishQuestion(current));
        const labelText = line.match(QUESTION_LABEL);
        current = { term: [labeled && labelText ? labelText[1] : line], options: [], answer: [], hasAnswer: false };
      } else if (current && option && !current.hasAnswer) {
        current.options.push({ letter: option[1].toLowerCase(), text: option[2] });
      } else if (current && labeled && !current.hasAnswer) {
        current.term.push(line);
      } else if (current) {
        current.answer.push(line);
        current.hasAnswer = true;
      }
    }
    if (current) cards.push(finishQuestion(current));
    return cards;
  }

  // A first line and its details, separated from the next card by a blank line.
  function byBlocks(lines) {
    const blocks = [[]];
    for (const line of lines) {
      if (line) blocks[blocks.length - 1].push(line);
      else if (blocks[blocks.length - 1].length) blocks.push([]);
    }
    const filled = blocks.filter(block => block.length);
    if (filled.length < 2 || !mostly(filled.filter(block => block.length > 1).length, filled.length)) return null;
    return filled.map(([term, ...rest]) => card(term, rest.join('\n')));
  }

  // "Backtracking uses DFS." becomes "What does Backtracking use?" with the answer "DFS".
  function statementCard(sentence) {
    const text = unnumber(sentence).replace(/[.!]+$/, '').trim();
    const match = text.match(STATEMENT);
    if (!match || text.includes('?')) return null;
    const subject = match[1].replace(/^(?:The|A|An)\b/, first => first.toLowerCase());
    const verb = match[2].toLowerCase();
    if (UNCLEAR_START.test(subject) || subject.includes(',') || subject.split(/\s+/).length > 8 || DANGLING_END.test(match[1]) || /^not\b/i.test(match[3])) return null;
    const question = VERB_QUESTIONS[verb] ? VERB_QUESTIONS[verb](subject) : `What does ${subject} ${verb.slice(0, -1)}?`;
    return { term: question, definition: match[3][0].toUpperCase() + match[3].slice(1) };
  }

  const looksLikeNotes = line => !endsLikeQuestion(line)
    && !OPTION.test(line)
    && (/[.!]$/.test(line) || line.split(/\s+/).length >= 8 || Boolean(statementCard(line)));

  /* Card generator: turns pasted notes into cards. It runs on the device and uses word statistics, not a language model. */
  const NOISE = /^(?:page\s+\d+(?:\s+of\s+\d+)?|\d+|©.*|copyright\b.*|.*all rights reserved.*|https?:\S+|(?:table of )?contents|overview)$/i;
  const CODE = /[{};]\s*$|^(?:function\b|end\s+(?:if|for|while|function)\b|.*\bthen$|else$|return\b|for\b.*\bdo$|while\b.*\bdo$|initialize\b|set\b.*\bto\b|recursive call\b|#include|def\s|class\s|public\s|import\s)/i;
  const SHOUTED_CODE = /^[A-Z]{2,}\s+[A-Z]{2,}/;
  const VAGUE_SUBJECT = /^(?:the\s+)?(?:following|above|same|first|second|third|next|last|other|one|two|three|result|answer|idea|key|goal|reason|problem|example|point)\b/i;
  const DEFINITION_START = /^(?:(?:a|an|the|one|two|three|four|five|six|seven|eight|nine|ten)\b|[^a-z])/;
  const LEGAL_TEXT = /\b(?:all rights reserved|copyright|without the prior|may not be reproduced|written permission)\b/i;
  const EXAMPLE_HEADING = /\b(?:example|walkthrough|exercise)\b/i;
  const DANGLING_END = /\b(?:and|or|of|the|a|an|to|in|by|for|with|using|from|on|at|is|are|that|which)$/i;
  const NEEDS_CONTEXT = /\b(?:let['’]s|let us|as you|for example|in this (?:chapter|section)|the following|above|below|previously|as explained|this|these|those|it|its|they|their|he|she|we|you)\b/i;
  const NOT_A_TERM = /^(?:note|example|important|approach|given|thus|summary|how|why|key point|wrapping up|step\s*\d+|case\s*\d.*)$/i;
  const STOP_WORDS = new Set('about after again also among because been before being between both could does doing down during each even every from further have having here into just like made make many more most much must need only other over same should since some such than that their them then there these they this those through under until upon very were what when where which while will with within without would your'.split(' '));
  const MAX_GENERATED = 300;
  const BLANK = '____';

  const wordsIn = text => text.toLowerCase().match(/[a-z][a-z'-]+/g) || [];
  const contentWords = text => wordsIn(text).filter(word => word.length > 3 && !STOP_WORDS.has(word));
  const wordCount = text => text.split(/\s+/).filter(Boolean).length;
  const isSymbolic = line => (line.match(/[a-z]/gi) || []).length < line.length * 0.5;

  function looksLikeHeading(line) {
    const words = line.split(/\s+/);
    if (words.length > 8 || /[.!,;:]$/.test(line) || /:\s/.test(line) || statementCard(line)) return false;
    const capitalized = words.filter(word => /^[^a-z]/.test(word)).length;
    return capitalized / words.length >= 0.6;
  }

  // Rebuilds paragraphs from pasted text, repairing line breaks from PDFs and dropping page furniture and code.
  function readUnits(source) {
    const units = [];
    let heading = '';
    let open = null;
    let afterGap = false;
    const close = () => { if (open) units.push(open); open = null; };
    for (const raw of source.split(/\r\n?|\n/)) {
      const isBullet = /^\s*[-*•▪◦○]\s+/.test(raw);
      const isMarkdownHeading = /^\s*#{1,6}\s+/.test(raw);
      const line = unnumber(clean(raw.replace(/^\s*#{1,6}\s+/, '').replace(/^\s*[▪◦○]\s+/, '')));
      // A blank line only ends a paragraph if the sentence was finished. PDFs also put gaps at page breaks.
      if (!line) {
        if (open && /[.!?:]$/.test(open.text)) close();
        afterGap = true;
        continue;
      }
      if (NOISE.test(line)) continue;
      const isListItem = /^\s*\d+[.)]\s/.test(raw);
      const gapped = afterGap;
      afterGap = false;
      if (open && /:$/.test(open.text) && !isListItem && !/:$/.test(line) && (isSymbolic(line) || wordCount(open.text) <= 5) && !CODE.test(line)) {
        open.text += ` ${line}`;
        if (isSymbolic(line)) close(); // Otherwise a label's text may still wrap onto the next line.
        continue;
      }
      if (CODE.test(line) || SHOUTED_CODE.test(line) || isSymbolic(line)) { close(); continue; }
      const continues = open && !isBullet && !isListItem && !/[.!?:]$/.test(open.text)
        && (/^[a-z(]/.test(line) || (!gapped && (/,$/.test(open.text) || wordCount(open.text) >= 8)));
      if (continues) {
        open.text = /[a-z]-$/.test(open.text) && /^[a-z]/.test(line) ? open.text.slice(0, -1) + line : `${open.text} ${line}`;
        continue;
      }
      close();
      if (isMarkdownHeading || (!isBullet && looksLikeHeading(line))) heading = line;
      else open = { text: line, heading };
    }
    close();
    return units;
  }

  function sentencesIn(text) {
    const masked = text.replace(/\b(e\.g|i\.e|etc|vs|dr|mr|ms|prof|fig|no)\./gi, match => match.replace(/\./g, '\u0001'));
    return masked.replace(/([.!])\s+(?=[A-Z0-9"'(])/g, '$1\n').split('\n').map(s => s.replace(/\u0001/g, '.').trim()).filter(Boolean);
  }

  function factCard(sentence) {
    const text = sentence.replace(/[.!:]+$/, '').trim();
    if (text.includes('?') || DANGLING_END.test(text)) return null;
    const named = text.match(/^(.{8,120}?)\s+(?:is|are)\s+(?:called|known as|referred to as|termed)\s+(.{2,50})$/i);
    if (named && !UNCLEAR_START.test(named[1])) return { term: `What is the term for: ${named[1][0].toLowerCase()}${named[1].slice(1)}?`, definition: named[2] };
    const label = text.match(/^([A-Z][^:]{1,48}):\s+(\S.{2,})$/);
    if (label && wordCount(label[1]) <= 6 && !NOT_A_TERM.test(label[1]) && !looksLikeHeading(label[2])) return { term: label[1], definition: label[2][0].toUpperCase() + label[2].slice(1) };
    const fact = statementCard(text);
    if (!fact || fact.definition.length > 240) return null;
    const subject = text.match(STATEMENT)[1];
    const answer = text.match(STATEMENT)[3];
    const isDefinitionVerb = /^(?:is|are)$/i.test(text.match(STATEMENT)[2]);
    if (VAGUE_SUBJECT.test(subject) || (isDefinitionVerb && !DEFINITION_START.test(answer))) return null;
    return fact;
  }

  // Chooses what to hide: complexities first, then numbers, names, and finally the rarest repeated word.
  function pickBlank(sentence, frequency) {
    const appearsOnce = answer => sentence.toLowerCase().split(answer.toLowerCase()).length === 2;
    const fromPattern = pattern => (sentence.match(pattern) || []).find(appearsOnce);
    const complexity = fromPattern(/[OΘΩ]\s*\([^)]*\)/g);
    if (complexity) return complexity;
    const number = /\bstep\s+\d/i.test(sentence) ? null : fromPattern(/\b\d[\d,.]*\d%?|\b\d%?(?=\s+[a-z])/g);
    if (number) return number;
    const afterFirstWord = sentence.replace(/^\S+\s*/, '');
    const name = (afterFirstWord.match(/\b(?:[A-Z][a-zA-Z-]+|[A-Z]{2,})(?:\s+(?:(?:and|of|vs)\s+)?(?:[A-Z][a-zA-Z-]+|[A-Z]{2,}))*/g) || []).find(appearsOnce);
    if (name) return name;
    const repeated = (afterFirstWord.match(/[A-Za-z][A-Za-z'-]{4,}/g) || []).filter(word => {
      const lower = word.toLowerCase();
      return !STOP_WORDS.has(lower) && !/(?:ing|ly)$/.test(lower) && (frequency.get(lower) || 0) >= 3 && appearsOnce(word);
    });
    return repeated.sort((a, b) => frequency.get(a.toLowerCase()) - frequency.get(b.toLowerCase()) || b.length - a.length)[0] || null;
  }

  function generateCards(source) {
    const units = readUnits(source);
    const frequency = new Map();
    for (const word of units.flatMap(unit => contentWords(unit.text))) frequency.set(word, (frequency.get(word) || 0) + 1);
    const candidates = [];
    let sentenceCount = 0;
    units.forEach(unit => {
      if (EXAMPLE_HEADING.test(unit.heading)) return;
      for (const rawSentence of sentencesIn(unit.text)) {
        if (LEGAL_TEXT.test(rawSentence)) continue;
        const lead = rawSentence.match(/^([^:]{2,30}):\s+(.+)$/);
        const sentence = lead && NOT_A_TERM.test(lead[1]) ? lead[2] : rawSentence;
        sentenceCount++;
        const words = contentWords(sentence);
        const importance = words.reduce((sum, word) => sum + frequency.get(word), 0) / (words.length || 1);
        const fact = factCard(sentence);
        if (fact) {
          candidates.push({ ...fact, heading: unit.heading, order: candidates.length, importance: Infinity });
          continue;
        }
        const length = wordCount(sentence);
        const isWholeSentence = /^[A-Z].*[.!]$/.test(sentence) && !/^[^:]{1,30}:\s/.test(sentence);
        if (length < 8 || length > 40 || !isWholeSentence || UNCLEAR_START.test(sentence) || NEEDS_CONTEXT.test(sentence)) continue;
        const answer = pickBlank(sentence, frequency);
        if (answer) candidates.push({
          term: `${unit.heading ? `${unit.heading}: ` : ''}${sentence.replace(answer, BLANK)}`,
          definition: answer,
          heading: '',
          order: candidates.length,
          importance,
        });
      }
    });
    // Facts always stay. Fill-in-the-blank cards compete for the remaining spots, up to about one per two sentences.
    const limit = Math.min(MAX_GENERATED, Math.ceil(sentenceCount / 2) + candidates.filter(c => c.importance === Infinity).length);
    const chosen = [];
    const seenTerms = new Set();
    for (const candidate of [...candidates].sort((a, b) => b.importance - a.importance || a.order - b.order)) {
      if (chosen.length >= limit) break;
      let { term } = candidate;
      if (seenTerms.has(term.toLowerCase()) && candidate.heading) term = `${candidate.heading}: ${term}`;
      if (seenTerms.has(term.toLowerCase())) continue;
      const words = new Set(contentWords(`${term} ${candidate.definition}`));
      const repeatsAnother = chosen.some(other => {
        const shared = [...words].filter(word => other.words.has(word)).length;
        return shared / (words.size + other.words.size - shared || 1) >= 0.7;
      });
      if (repeatsAnother) continue;
      seenTerms.add(term.toLowerCase());
      chosen.push({ term, definition: candidate.definition, order: candidate.order, words });
    }
    return chosen.sort((a, b) => a.order - b.order).map(({ term, definition }) => ({ term, definition }));
  }

  function byPlainLines(lines) {
    if (lines.length % 2) return lines.map(line => card(line));
    const cards = [];
    for (let i = 0; i < lines.length; i += 2) cards.push(card(lines[i], lines[i + 1]));
    return cards;
  }

  function parse(text, fileName = '') {
    const source = String(text).replace(/^﻿/, '');
    let cards;
    if (/\.csv$/i.test(fileName)) {
      cards = withoutHeader(csvRows(source).map(row => card(row[0] || '', row[1] || '')));
    } else {
      const lines = source.split(/\r\n?|\n/).map(clean).filter(line => !/^#{1,6}\s/.test(line));
      const filled = lines.filter(Boolean);
      const hasLabels = filled.some(line => QUESTION_LABEL.test(line)) && filled.some(line => ANSWER_LABEL.test(line));
      const hasQuestions = filled.some(line => endsLikeQuestion(line) || NUMBERED.test(line));
      if (hasLabels) cards = byQuestions(lines, line => QUESTION_LABEL.test(line), true);
      else {
        cards = byDelimiter(filled) || bySameLineQuestion(filled);
        const quizLines = filled.filter(line => endsLikeQuestion(line) || OPTION.test(line) || ANSWER_LABEL.test(line)).length;
        const averageWords = filled.reduce((sum, line) => sum + wordCount(line), 0) / (filled.length || 1);
        const isProse = quizLines / (filled.length || 1) < 0.25
          && (mostly(filled.filter(looksLikeNotes).length, filled.length) || (averageWords >= 5 && averageWords * filled.length >= 80));
        if (!cards && isProse) cards = generateCards(source);
        if (!cards && hasQuestions) cards = byQuestions(lines, line => endsLikeQuestion(line) || NUMBERED.test(line), false);
        if (!cards) cards = byBlocks(lines) || byPlainLines(filled);
      }
    }
    return cards.filter(c => c.term || c.definition).slice(0, MAX_CARDS);
  }

  return { parse };
})();

if (typeof module !== 'undefined') module.exports = Importer;
