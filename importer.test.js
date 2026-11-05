// Run with: node importer.test.js
const assert = require('node:assert');
const { parse } = require('./importer.js');

const expected = [
  { term: 'What uses DFS?', definition: 'Backtracking' },
  { term: 'What uses BFS?', definition: 'Branch and Bound' },
];

const sameCards = {
  tabs: 'What uses DFS?\tBacktracking\nWhat uses BFS?\tBranch and Bound',
  dashes: 'What uses DFS? - Backtracking\nWhat uses BFS? - Branch and Bound',
  'same line': 'What uses DFS? Backtracking\nWhat uses BFS? Branch and Bound',
  labels: 'Q: What uses DFS?\nA: Backtracking\n\nQ: What uses BFS?\nA: Branch and Bound',
  'long labels': 'Question 1: What uses DFS?\nAnswer: Backtracking\nQuestion 2: What uses BFS?\nAnswer: Branch and Bound',
  'next line': 'What uses DFS?\nBacktracking\nWhat uses BFS?\nBranch and Bound',
  numbered: '1. What uses DFS?\nBacktracking\n\n2. What uses BFS?\nBranch and Bound',
  markdown: '# Review\n\n- **What uses DFS?** - Backtracking\n- **What uses BFS?** - Branch and Bound',
  table: '| Question | Answer |\n| --- | --- |\n| What uses DFS? | Backtracking |\n| What uses BFS? | Branch and Bound |',
  'windows line endings': 'What uses DFS?\tBacktracking\r\nWhat uses BFS?\tBranch and Bound\r\n',
  'with heading line': 'Practice questions\nWhat uses DFS?\nBacktracking\nWhat uses BFS?\nBranch and Bound',
};
for (const [name, text] of Object.entries(sameCards)) {
  assert.deepStrictEqual(parse(text), expected, name);
}

assert.deepStrictEqual(
  parse('Question,Answer\n"What uses DFS?",Backtracking\n"Which, exactly?","Branch, and Bound"', 'set.csv'),
  [{ term: 'What uses DFS?', definition: 'Backtracking' }, { term: 'Which, exactly?', definition: 'Branch, and Bound' }],
  'csv',
);

assert.deepStrictEqual(
  parse('1. What uses DFS?\nA) Backtracking\nB) Merge sort\nAnswer: A\n2. What uses BFS?\nA) Quicksort\nB) Branch and Bound\nAnswer: B'),
  expected,
  'multiple choice answers become the option text',
);

assert.deepStrictEqual(
  parse('1. What uses DFS?\n2. What uses BFS?'),
  [{ term: 'What uses DFS?', definition: '' }, { term: 'What uses BFS?', definition: '' }],
  'questions without answers keep a blank response',
);

const unanswered = parse('What uses DFS?\nA) Backtracking\nB) Merge sort');
assert.ok(unanswered[0].term.includes('A) Backtracking') && unanswered[0].definition === '', 'unanswered choices stay with the question');

assert.deepStrictEqual(
  parse('Mitosis\nCell division\n\nOsmosis\nWater movement'),
  [{ term: 'Mitosis', definition: 'Cell division' }, { term: 'Osmosis', definition: 'Water movement' }],
  'blocks',
);
assert.deepStrictEqual(
  parse('Mitosis\nCell division\nOsmosis\nWater movement'),
  [{ term: 'Mitosis', definition: 'Cell division' }, { term: 'Osmosis', definition: 'Water movement' }],
  'alternating lines',
);
assert.deepStrictEqual(
  parse('Backtracking uses DFS. Branch and Bound uses BFS.\nIt prunes invalid nodes.\nMerge sort is a stable sort.\nThe pivot is not random.\nBinary search requires a sorted list.'),
  [
    { term: 'What does Backtracking use?', definition: 'DFS' },
    { term: 'What does Branch and Bound use?', definition: 'BFS' },
    { term: 'What is Merge sort?', definition: 'A stable sort' },
    { term: 'What does Binary search require?', definition: 'A sorted list' },
  ],
  'plain notes become questions, skipping unclear and negative sentences',
);
assert.deepStrictEqual(
  parse('- The pivot is the last value\n- Quicksort has a worst case of O(n^2)'),
  [
    { term: 'What is the pivot?', definition: 'The last value' },
    { term: 'What does Quicksort have?', definition: 'A worst case of O(n^2)' },
  ],
  'bulleted notes',
);
assert.deepStrictEqual(
  parse('I went to the store today and bought a lot of food.\nThen I walked home after that.'),
  [],
  'notes with no usable statements make no cards',
);
const pasted = `Cell Biology Review

The cell is the basic unit of life. All living organisms are made of one or more cells, and every cell comes from an existing cell.
Mitochondria produce most of the cell's ATP through cellular respiration. The process that plants use to turn sunlight into glucose is called photosynthesis.
Page 12 of 40
Osmosis is the movement of water across a selectively permeable
membrane. It is important to review this chapter before the exam. Active transport requires ATP because it moves particles against a gradient.

Divide:
Split the list into two
halves.

FUNCTION Copy(List)
    RETURN List
END FUNCTION

Human cells contain 46 chromosomes arranged in 23 pairs within the nucleus of the cell.
Copyright 2026 Someone. All rights reserved and this may not be reproduced anywhere.`;
const made = parse(pasted);
const has = (term, definition) => made.some(c => c.term === term && c.definition === definition);
assert.ok(has('What is the cell?', 'The basic unit of life'), 'definition');
assert.ok(has('What is the term for: the process that plants use to turn sunlight into glucose?', 'photosynthesis'), 'named term');
assert.ok(has('What is Osmosis?', 'The movement of water across a selectively permeable membrane'), 'repairs a wrapped line');
assert.ok(has('Divide', 'Split the list into two halves'), 'label with its text on wrapped lines');
assert.ok(has('Cell Biology Review: Human cells contain ____ chromosomes arranged in 23 pairs within the nucleus of the cell.', '46'), 'fill in the blank with heading');
assert.ok(!made.some(c => /Page 12|FUNCTION|RETURN|Copyright|rights reserved|important to review/.test(c.term + c.definition)), 'drops page furniture, code, legal text, and context-dependent sentences');
const flat = text => text.replace(/\s+/g, ' ').toLowerCase();
for (const c of made) {
  assert.ok(flat(pasted).includes(flat(c.definition)), `answers only come from the text: ${c.definition}`);
  if (c.term.includes('____')) assert.ok(flat(pasted).includes(flat(c.term.replace(/^[^:]+: /, '').replace('____', c.definition))), 'blanks restore the original sentence');
}
assert.deepStrictEqual(
  parse('What is merge sort?\nMerge sort splits a list in half and merges the sorted halves back together.\nWhat is quicksort?\nQuicksort moves a pivot into place and then sorts each side of it.'),
  [
    { term: 'What is merge sort?', definition: 'Merge sort splits a list in half and merges the sorted halves back together.' },
    { term: 'What is quicksort?', definition: 'Quicksort moves a pivot into place and then sorts each side of it.' },
  ],
  'questions with long answers keep their layout',
);
const huge = Array.from({ length: 4000 }, (_, i) => `Topic number ${i} uses a method that researchers describe with many repeated technical details.`).join(' ');
const started = Date.now();
assert.ok(parse(huge).length <= 300, 'generated card limit');
assert.ok(Date.now() - started < 3000, 'large pastes stay fast');

assert.deepStrictEqual(parse(''), [], 'empty');
assert.deepStrictEqual(parse('   \n\n  '), [], 'blank');
assert.strictEqual(parse(Array.from({ length: 6000 }, (_, i) => `Term ${i}\tAnswer ${i}`).join('\n')).length, 5000, 'card limit');

console.log('importer checks passed');
