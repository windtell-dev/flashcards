# Flashcards

A simple flashcard app. Make sets of cards, then flip through them or quiz yourself.

There are no accounts and no build step. The fonts load from Google Fonts, and a fallback font is used offline.

## Run it

Open `index.html` in a browser, or host the folder on GitHub Pages.

**Keyboard shortcuts while studying:** `Space` flips the card, and `←` and `→` move between cards.

**To study a set:** click its square.

**To quiz yourself:** open a set and choose Quiz at the top, then pick an answer with a click or the number keys. A set needs at least two different answers. Identical answers only appear once. A card whose answer is just T, F, True, or False, in any capitalization, becomes a True or False question, and those come together at the end.

**To add a set:** choose the plus square, then **Create manually** or **Add from text**. You can also drag a text file (`.txt`, `.md`, `.csv`, `.tsv`) or selected text onto the home page. Text is turned into cards using these layouts:

- `Term<Tab>Definition`, `Term - Definition`, and similar one-line pairs
- `Q: ...` and `A: ...` labels
- A question with its answer on the next line, numbered or not
- Multiple choice with an `Answer: B` line
- Tables and CSV files
- A term and its definition separated from the next pair by a blank line
- Any other notes, slides, or chapters, which go through the built-in generator

The generator runs entirely in your browser, and nothing is uploaded. It repairs broken line breaks, drops page numbers and code, and turns sentences into cards. For example, `Backtracking uses DFS.` becomes `What does Backtracking use?`. It also uses word frequency to pick important sentences for fill-in-the-blank cards.

It uses word statistics rather than a language model, so it can't paraphrase or work out anything new. Answers only come from your text, questions with no answer get a blank response, and some sentences are skipped. Review the cards after creating a set.

**To change the look:** use the switch at the top to move between pink and dark mode.

**To edit a set:** choose Edit on its square.

**While editing:** `Enter` moves to the next box, and `Shift+Enter` starts a new line.

## Where your cards are saved

Cards are saved in your browser's local storage. They stay on that device and in that browser, and aren't uploaded anywhere. Clearing your site data deletes them.

## Run the checks

Run `node quiz.test.js` and `node importer.test.js`.

## License

[MIT](LICENSE)
