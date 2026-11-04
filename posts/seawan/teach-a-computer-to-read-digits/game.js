// The handwriting game: five short stages, played one step at a time with the lesson kit.
// Scores come from results.csv. Digit pictures are cut from the run's own examples.png and mistakes.png.
// The answers below are copied from the labels printed above those pictures, and the mix-up counts from the post's table.
const scores = VIBE.data['results.csv'];
const EXAMPLES = [5, 0, 4, 1, 9, 2, 1, 3, 1, 4, 3, 5, 3, 6, 1, 7];
const MISTAKES = [[9, 8], [4, 2], [5, 3], [4, 8], [8, 2], [1, 8], [5, 3], [7, 2], [0, 6], [5, 8], [4, 9], [9, 8], [7, 9], [9, 7], [8, 9], [6, 5]];

// Cut one digit out of a sheet of 8 columns and 2 rows.
const SHEETS = { examples: { file: 'examples.png', rows: [115, 286] }, mistakes: { file: 'mistakes.png', rows: [135, 335] } };
const CROP = 116;
function digit(sheetName, index, size = 150) {
  const sheet = SHEETS[sheetName], column = index % 8, row = index < 8 ? 0 : 1;
  const canvas = h('canvas', { width: CROP, height: CROP, role: 'img', 'aria-label': 'A handwritten digit', style: `width:${size}px;height:${size}px;border-radius:8px;background:#fff;display:block;margin:8px auto` });
  const image = new Image();
  image.onload = () => canvas.getContext('2d').drawImage(image, 82 + 141 * column - CROP / 2, sheet.rows[row] - CROP / 2, CROP, CROP, 0, 0, CROP, CROP);
  image.src = VIBE.data[sheet.file];
  return canvas;
}

const atRound = (round) => scores.filter((r) => r.epoch === round).map((r) => r.test_accuracy * 100);
const average = (list) => list.reduce((a, b) => a + b, 0) / list.length;
const FINAL = average(atRound(5));
const WRONG = Math.round((10000 * (100 - FINAL)) / 100);
const numberOptions = (real, said) => [real, said].sort((a, b) => a - b).map(String);
const detective = (index) => {
  const [real, said] = MISTAKES[index], options = numberOptions(real, said);
  return { ask: 'What digit is this?', show: () => digit('mistakes', index), options, right: options.indexOf(String(real)), why: `The label says ${real}. The computer said ${said}.` };
};
const guessExample = (index, others) => {
  const options = [EXAMPLES[index], ...others].sort((a, b) => a - b).map(String);
  return { ask: 'What digit is this?', show: () => digit('examples', index), options, right: options.indexOf(String(EXAMPLES[index])), why: 'The **label** on this picture tells us the right answer.' };
};

lesson({
  stages: [
    { title: 'You be the computer', icon: '🔢', steps: [
      { say: 'People write numbers in lots of different ways. Can a computer learn to read them? First, **you** try.' },
      guessExample(1, [6, 8]),
      guessExample(4, [4, 7]),
      guessExample(8, [4, 7]),
      { say: 'You did that without thinking! A **digit** is one written sign for a number. Each of our pictures has a **label** that gives the right answer.' },
    ] },
    { title: 'Pictures are made of squares', icon: '🟦', steps: [
      { say: 'To a computer, a picture is a grid of tiny squares called **pixels**. Tap squares to draw a 7.', play(box, done) {
        const SIZE = 8; let lit = 0;
        const note = h('p', { class: 'say', role: 'status' }, 'Tap at least 6 squares.');
        const grid = h('div', { style: `display:grid;grid-template-columns:repeat(${SIZE},1fr);gap:2px;max-width:280px;margin:8px auto` }, Array.from({ length: SIZE * SIZE }, () => {
          const cell = h('button', { 'aria-label': 'Pixel', 'aria-pressed': 'false', style: 'aspect-ratio:1;min-height:0;padding:0;border-radius:3px', onclick: () => {
            const on = cell.getAttribute('aria-pressed') !== 'true';
            cell.setAttribute('aria-pressed', String(on)); cell.style.background = on ? 'var(--fg)' : '';
            lit += on ? 1 : -1;
            note.textContent = `You lit ${lit} of ${SIZE * SIZE} pixels. The computer only sees which squares are dark.`;
            if (lit >= 6) done();
          } });
          return cell;
        }));
        box.append(grid, note);
      } },
      { ask: 'What is a pixel?', options: ['One tiny square in a picture', 'A kind of computer', 'A written number'], right: 0, why: 'Lots of pixels together make the picture.' },
      { say: 'Our pictures come from a real collection called **MNIST**. Each one is just 28 squares wide and 28 tall.', show: () => digit('examples', 15) },
    ] },
    { title: 'Practice and the test', icon: '📚', steps: [
      { say: `A **neural network** is a program with lots of adjustable settings, like knobs. It guesses, checks the label, and turns its knobs a little. That is **training**, or practice.` },
      { say: 'We gave it **60,000** pictures to practise on, and kept **10,000** more hidden for a test.' },
      { ask: 'Why keep the test pictures hidden during practice?', options: ['To see if it can read new pictures', 'To save computer memory', 'Because they are harder'], right: 0, why: 'It is like practising spelling with one list, then being tested on a different list.' },
      { ask: 'The knobs start at random settings, so we ran 3 separate tries. Why?', options: ['Different starts might give different results', 'The first try always fails'], right: 0, why: 'Comparing tries shows how much chance matters.' },
    ] },
    { title: 'How well did it do?', icon: '📈', steps: [
      { ask: 'Your guess: after 5 practice rounds, how many pictures out of 100 does it read correctly?', options: ['about 60', 'about 80', 'about 99'], predict: 'guess' },
      { say: 'Move the slider through the 5 practice rounds. These are the real scores from all 3 tries.', play(box, done) {
        const label = h('p', { class: 'ask' }), list = h('div');
        const draw = (round) => {
          const now = atRound(round);
          label.textContent = `After round ${round}: ${average(now).toFixed(2)}% correct on average`;
          list.replaceChildren(...now.map((score, i) => h('p', { class: 'say' }, `Try ${i + 1}: ${score.toFixed(2)}%`)));
          if (round === 5) done();
        };
        box.append(label, slider(1, 5, 1, draw, 'Practice round'), list);
        draw(1);
      } },
      { ask: `It got ${FINAL.toFixed(2)}% right. About how many of the 10,000 test pictures were wrong?`, options: ['About 12', `About ${WRONG}`, 'About 1,000'], right: 1, why: `${(100 - FINAL).toFixed(2)}% of 10,000 is about ${WRONG} pictures.` },
      { ask: 'Two of the three tries got slightly worse in the last round. So does more practice always help?', options: ['Yes, always', 'Not every time'], right: 1, why: 'Small ups and downs happen. We can’t tell why from these results alone.' },
    ] },
    { title: 'Mistake detective', icon: '🔍', steps: [
      { say: 'Now the hard ones. The computer got **all** of these next pictures wrong. Can you beat it?' },
      detective(2), detective(7), detective(9), detective(12), detective(15),
      { ask: 'What was its most common mix-up across all 3 tries?', options: ['A real 1 read as 7', 'A real 5 read as 3', 'A real 0 read as 8'], right: 1, why: 'A real 5 was read as 3 a total of 23 times.' },
      { ask: 'Does our test show it can read a whole page of writing?', options: ['Yes', 'No, only single digits'], right: 1, why: 'The pictures were single digits, centred and all one size. Reading a digit isn’t the same as understanding a number, either.' },
    ] },
  ],
  finish: () => h('div', {}, h('p', { class: 'ask' }, '🎉 You finished all the stages!'), h('p', {}, `After practice, the computer read ${FINAL.toFixed(2)}% of new digits correctly, about ${WRONG} mistakes in 10,000. It learned from examples, but it still mixes up some shapes.`)),
});
