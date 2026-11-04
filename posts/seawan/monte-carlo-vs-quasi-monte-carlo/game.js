// The pi game: five short stages, played one step at a time with the lesson kit.
// The darts in stages 2 and 3 are thrown by your own browser, just for fun. Stage 4 shows the recorded results (results.csv).
const race = VIBE.data['results.csv'];
const PI = '3.1415926536';
const size = (n) => (n >= 1e9 ? 'about a billion' : n >= 1e6 ? `about ${Math.round(n / 1e6)} million` : n.toLocaleString('en-GB'));
const lastRow = race[race.length - 1];
const timesBetter = (r) => r.mc_mean_abs_err / r.rqmc_mean_abs_err;
const haltonAlwaysAhead = race.every((r) => r.rqmc_mean_abs_err < r.mc_mean_abs_err);

// Team Halton's recipe: write the dart's number in a base, then flip its digits around the point.
function flipped(number, base) {
  let result = 0, part = 1 / base;
  for (; number > 0; number = Math.floor(number / base), part /= base) result += part * (number % base);
  return result;
}
const haltonDart = (i) => [flipped(i, 2), flipped(i, 3)];
const randomDart = () => [Math.random(), Math.random()];
const inSlice = ([x, y]) => x * x + y * y <= 1;
const guessFrom = (darts) => (4 * darts.filter(inSlice).length) / darts.length;

// The square with its pizza slice, and the darts so far: filled inside, hollow outside.
function board(darts, width = 240) {
  const S = 200;
  return svg('svg', { viewBox: `0 0 ${S} ${S}`, width, role: 'img', 'aria-label': 'A square with a quarter circle and darts', style: 'display:block;margin:6px auto;background:var(--panel)' },
    svg('path', { d: `M0 ${S} L0 0 A${S} ${S} 0 0 1 ${S} ${S} Z`, fill: 'var(--goodbg)', stroke: 'var(--good)' }),
    ...darts.map((d) => svg('circle', { cx: d[0] * S, cy: S - d[1] * S, r: 3, fill: inSlice(d) ? 'var(--accent)' : 'none', stroke: 'var(--accent)' })));
}

// Show a guess with its correct digits in green.
function compared(guess) {
  const text = Number(guess).toFixed(10); let same = 0;
  while (same < text.length && text[same] === PI[same]) same += 1;
  return h('span', { style: 'font:600 15px ui-monospace,Menlo,Consolas,monospace' }, h('span', { style: 'color:var(--good)' }, text.slice(0, same)), text.slice(same));
}

lesson({
  stages: [
    { title: 'Meet pi', icon: '🥧', steps: [
      { say: 'Measure around a circle. Divide by the distance straight across. You get a special number called **pi**, written π. Say it like “pie”.' },
      { say: 'Make the circle bigger or smaller. What happens to the answer?', play(box, done) {
        const pic = h('div'), note = h('p', { class: 'ask', role: 'status' });
        let moves = 0;
        const draw = (across) => {
          pic.replaceChildren(svg('svg', { viewBox: '0 0 200 200', width: 180, role: 'img', 'aria-label': 'A circle', style: 'display:block;margin:auto' }, svg('circle', { cx: 100, cy: 100, r: across / 2, fill: 'none', stroke: 'var(--accent)', 'stroke-width': 4 }), svg('line', { x1: 100 - across / 2, x2: 100 + across / 2, y1: 100, y2: 100, stroke: 'var(--real)', 'stroke-width': 3 })));
          note.textContent = `Around ${(Math.PI * across).toFixed(1)} ÷ across ${across} = ${Math.PI.toFixed(2)}`;
          if (++moves > 3) done();
        };
        box.append(slider(40, 190, 100, draw, 'Size of the circle'), pic, note);
        draw(100);
      } },
      { ask: 'A coin and a bike wheel. Which one has the bigger pi?', options: ['The bike wheel', 'The coin', 'They are the same'], right: 2, why: 'Every circle has the same pi.' },
      { ask: 'Do the digits of pi ever stop?', options: ['Yes, at 3.14', 'No, they go on forever'], right: 1, why: 'They go on forever without repeating: 3.14159265… We already know lots of them, so pi is a perfect target to check a guessing game against.' },
    ] },
    { title: 'The dart game', icon: '🎯', steps: [
      { say: 'Here’s a square with a slice of pizza in it. Throw pretend darts **at random**. Then count how many land on the slice, divide by all your darts, and multiply by 4. That’s a guess for pi!' },
      { say: 'Throw at least 30 darts and watch your guess.', play(box, done) {
        const darts = [], pic = h('div'), note = h('p', { class: 'say', role: 'status' }, 'No darts yet.');
        const throwDarts = (count) => {
          for (let i = 0; i < count; i++) darts.push(randomDart());
          pic.replaceChildren(board(darts));
          const inside = darts.filter(inSlice).length;
          note.replaceChildren(`${inside} of ${darts.length} on the slice. 4 × ${inside} ÷ ${darts.length} = `, compared(guessFrom(darts)));
          if (darts.length >= 30) done();
          report();
        };
        pic.append(board(darts));
        box.append(pic, note, h('div', { class: 'row' }, h('button', { class: 'on', onclick: () => throwDarts(1) }, 'Throw 1'), h('button', { onclick: () => throwDarts(10) }, 'Throw 10'), h('button', { onclick: () => throwDarts(100) }, 'Throw 100')));
      } },
      { ask: '8 of your 10 darts land on the slice. What is your guess for pi?', options: ['3.2', '8', '2.5'], right: 0, why: '4 × 8 ÷ 10 = 3.2. Not bad!' },
      { ask: 'What usually makes the guess better?', options: ['Fewer darts', 'More darts', 'Throwing faster'], right: 1, why: 'A little randomness wobbles a lot. A lot of it is much steadier.' },
    ] },
    { title: 'Two teams', icon: '⚔️', steps: [
      { say: '**Team Random** throws each dart anywhere by chance. **Team Halton** follows a recipe that spreads its darts out. Add darts and compare.', play(box, done) {
        const LEFT = h('div'), RIGHT = h('div'), label = h('p', { class: 'say', role: 'status' });
        const randoms = Array.from({ length: 256 }, randomDart), haltons = Array.from({ length: 256 }, (_, i) => haltonDart(i + 1));
        const draw = (count) => {
          LEFT.replaceChildren(h('strong', {}, 'Team Random'), board(randoms.slice(0, count), 150));
          RIGHT.replaceChildren(h('strong', {}, 'Team Halton'), board(haltons.slice(0, count), 150));
          label.textContent = `${count} darts each. Random guesses ${guessFrom(randoms.slice(0, count)).toFixed(3)}. Halton guesses ${guessFrom(haltons.slice(0, count)).toFixed(3)}.`;
          if (count >= 100) done();
        };
        box.append(slider(8, 256, 8, draw, 'Number of darts'), h('div', { style: 'display:flex;flex-wrap:wrap;gap:8px;justify-content:center;text-align:center' }, LEFT, RIGHT), label);
        draw(8);
      } },
      { ask: 'Which team’s darts leave clumps and empty patches?', options: ['Team Random', 'Team Halton'], right: 0, why: 'Chance doesn’t check where earlier darts landed.' },
      { ask: 'Your guess: in a big race, which team gets closer to pi on average?', options: ['Team Random', 'Team Halton', 'A tie'], predict: 'team', why: 'One picture can’t settle it. We need lots of games!' },
    ] },
    { title: 'The big race', icon: '🏁', steps: [
      { say: 'Our computer raced the teams from 64 darts to about a **billion**, playing 50 games at each size. The **miss** is how far a guess lands from pi. Slide to the end. Green digits are correct.', play(box, done) {
        const label = h('p', { class: 'ask' }), body = h('div');
        const bar = (name, miss, biggest, colour) => h('div', { class: 'say' }, `${name}: average miss ${miss.toLocaleString('en-GB', { maximumSignificantDigits: 2, maximumFractionDigits: 20 })}`, h('div', { class: 'progress', style: 'margin-top:4px' }, h('i', { style: `width:${Math.max(0.5, (miss / biggest) * 100)}%;background:${colour}` })));
        const draw = (i) => {
          const r = race[i];
          label.textContent = `${size(r.n)} darts`;
          body.replaceChildren(h('p', { class: 'say' }, 'Real pi: ', compared(PI)), h('p', { class: 'say' }, 'Random, game 1: ', compared(r.mc_guess_try1)), h('p', { class: 'say' }, 'Halton, game 1: ', compared(r.rqmc_guess_try1)),
            bar('Random', r.mc_mean_abs_err, r.mc_mean_abs_err, 'var(--accent)'), bar('Halton', r.rqmc_mean_abs_err, r.mc_mean_abs_err, 'var(--real)'),
            h('p', { class: 'say' }, `Halton’s average miss is ${timesBetter(r).toFixed(timesBetter(r) < 10 ? 1 : 0)} times smaller.`));
          if (i === race.length - 1) done();
        };
        box.append(label, slider(0, race.length - 1, 0, draw, 'Number of darts'), body);
        draw(0);
      } },
      { ask: 'At about a billion darts, how many times smaller is Team Halton’s average miss?', options: ['About 2', 'About 20', `About ${Math.round(timesBetter(lastRow))}`], right: 2, why: `About ${Math.round(timesBetter(lastRow))} times smaller.` },
      { ask: 'Does that mean every Halton guess beats every Random guess?', options: ['Yes', 'No, it compares averages'], right: 1, why: 'A single game can be lucky or unlucky. That’s why we played 50 at each size.' },
      { say: (state) => `${haltonAlwaysAhead ? 'Team Halton had the smaller average miss at **every** size we tested.' : ''} ${state.team === 1 ? 'You called it!' : 'Did you guess that?'}` },
    ] },
    { title: 'What can we trust?', icon: '🧐', steps: [
      { say: 'Darts deep inside the slice or far outside are easy to count. Only darts right next to the **curved edge** can tip one way or the other. That sudden change makes this game a tricky one.' },
      { ask: 'We tried one shape on a flat square. Will Team Halton win every other puzzle too?', options: ['Yes, always', 'We can’t tell, we didn’t test them'], right: 1, why: 'Other shapes and puzzles could behave differently.' },
      { ask: 'What is the best way to check an idea like this?', options: ['Look at one picture', 'Repeat the game many times and compare', 'Ask who looks tidier'], right: 1, why: 'Repeating gave us a fair comparison. Now try the paper version!' },
    ] },
  ],
  finish: () => h('div', {}, h('p', { class: 'ask' }, '🎉 You finished all the stages!'), h('p', {}, `The way you choose your dots can matter a lot. In our test, carefully spread darts gave much closer guesses than random ones. Try it on paper: draw the square and the slice, drop dots, count and multiply by 4.`)),
});
