// Builds multiple-choice questions from a set's cards.
const Quiz = (() => {
  const MAX_OPTIONS = 4;
  // Ignores case and spaces, so "Back Tracking" and "backtracking" count as the same answer.
  const normalize = text => text.replace(/\s+/g, '').toLowerCase();

  function shuffle(items, random = Math.random) {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  // Answers that match another card's answer appear once, so there's never a second "right" pill.
  // Cards with the same question are skipped as wrong answers, because their answers may also be right.
  function wrongAnswers(card, cards) {
    const seen = new Set([normalize(card.definition)]);
    const answers = [];
    for (const other of cards) {
      const key = normalize(other.definition);
      if (seen.has(key) || normalize(other.term) === normalize(card.term)) continue;
      seen.add(key);
      answers.push(other.definition.trim());
    }
    return answers;
  }

  function build(cards, random = Math.random) {
    const usable = cards.filter(card => card.term.trim() && card.definition.trim());
    const questions = [];
    for (const card of shuffle(usable, random)) {
      const wrong = shuffle(wrongAnswers(card, usable), random).slice(0, MAX_OPTIONS - 1);
      if (!wrong.length) continue;
      const answer = card.definition.trim();
      const options = shuffle([answer, ...wrong], random);
      questions.push({ term: card.term.trim(), answer, options, correct: options.indexOf(answer) });
    }
    return questions;
  }

  return { build };
})();

if (typeof module !== 'undefined') module.exports = Quiz;
