// Run with: node quiz.test.js
const assert = require('node:assert');
const Quiz = require('./quiz.js');

const card = (term, definition) => ({ term, definition });
const normalize = text => text.trim().toLowerCase();

const cards = [
  card('What uses DFS?', 'Backtracking'),
  card('What prunes invalid partial solutions?', ' backtracking '),
  card('What uses BFS?', 'Branch and Bound'),
  card('Backtracking space?', 'O(n)'),
  card('Merge sort time?', 'O(n log n)'),
  card('Quicksort worst case?', 'O(n^2)'),
  card('Binary search time?', 'O(log n)'),
];

for (let run = 0; run < 500; run++) {
  const questions = Quiz.build(cards);
  assert.strictEqual(questions.length, cards.length);
  for (const q of questions) {
    assert.ok(q.options.length >= 2 && q.options.length <= 4);
    assert.strictEqual(q.options[q.correct], q.answer);
    const unique = new Set(q.options.map(normalize));
    assert.strictEqual(unique.size, q.options.length, 'identical answers must appear once');
  }
}

const spaced = Quiz.build([card('Q1', 'Back Tracking'), card('Q2', 'Backtracking'), card('Q3', 'Branch and Bound')]);
for (const q of spaced) {
  const forms = q.options.map(option => option.replace(/\s+/g, '').toLowerCase());
  assert.strictEqual(new Set(forms).size, forms.length, 'spacing differences must not create a second right answer');
}

assert.deepStrictEqual(Quiz.build([]), [], 'an empty set has no questions');
assert.deepStrictEqual(Quiz.build([card('Q', 'A')]), [], 'one card has no wrong answers');
assert.deepStrictEqual(Quiz.build([card('Q1', 'Same'), card('Q2', 'same ')]), [], 'one distinct answer can not be a quiz');
assert.strictEqual(Quiz.build([card('Q1', 'A'), card('', 'B'), card('Q3', '')]).length, 0, 'blank cards are ignored');

const sameQuestion = Quiz.build([card('Q', 'A'), card('q', 'B'), card('Other', 'C')]);
for (const q of sameQuestion.filter(item => item.term.toLowerCase() === 'q')) {
  assert.deepStrictEqual(q.options.length, 2);
  assert.ok(q.options.includes('C'), 'another answer to the same question is never a wrong option');
}

console.log('quiz checks passed');
