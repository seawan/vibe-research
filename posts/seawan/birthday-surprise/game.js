// The birthday game: five short stages, played one step at a time with the lesson kit.
// The slider in stage 5 shows the recorded results (results.csv). The pretend classes in stage 3 are rolled by
// your own browser, just for fun, and are not part of the recorded experiment.
const rows = VIBE.data['results.csv'];
const row = (kids) => rows.find((r) => r.class_size === kids);
const percent = (p) => `${(p * 100).toFixed(1)}%`;
const answer = rows.find((r) => r.simulated > 0.5).class_size;
const GUESSES = [100, answer, 183, 365];

// One pretend class on a year-long strip: each dot is a birthday, a ring marks a shared one.
function yearStrip(days) {
  const count = {}; days.forEach((d) => { count[d] = (count[d] ?? 0) + 1; });
  const x = (d) => 6 + (d / 364) * 488;
  return svg('svg', { viewBox: '0 0 500 34', width: '100%', role: 'img', 'aria-label': 'Birthdays across the year' },
    svg('line', { x1: 6, x2: 494, y1: 17, y2: 17, stroke: 'var(--line)', 'stroke-width': 2 }),
    ...days.map((d) => svg('circle', { cx: x(d), cy: 17, r: 3, fill: 'var(--accent)' })),
    ...Object.keys(count).filter((d) => count[d] > 1).map((d) => svg('circle', { cx: x(+d), cy: 17, r: 9, fill: 'none', stroke: 'var(--real)', 'stroke-width': 3 })));
}

// Kids in a ring, with a line for every pair.
function ring(kids) {
  const at = (i) => { const a = (i / kids) * 2 * Math.PI - Math.PI / 2; return [100 + 88 * Math.cos(a), 100 + 88 * Math.sin(a)]; };
  const lines = [];
  for (let i = 0; i < kids; i++) for (let j = i + 1; j < kids; j++) { const [x1, y1] = at(i), [x2, y2] = at(j); lines.push(svg('line', { x1, y1, x2, y2, stroke: 'var(--real)', 'stroke-width': kids > 12 ? 0.5 : 1.5 })); }
  return svg('svg', { viewBox: '0 0 200 200', width: '220', role: 'img', 'aria-label': `${kids} kids joined by lines` }, ...lines,
    ...Array.from({ length: kids }, (_, i) => { const [cx, cy] = at(i); return svg('circle', { cx, cy, r: 6, fill: 'var(--accent)' }); }));
}
const pairs = (kids) => (kids * (kids - 1)) / 2;

lesson({
  stages: [
    { title: 'The birthday game', icon: '🎂', steps: [
      { say: 'Everyone in a class says their birthday. If **any two kids** share the same day and month, the class **wins**!' },
      { ask: 'Mia was born on 3 May 2014. Sam was born on 3 May 2015. Is that a match?', options: ['Yes', 'No, the years are different'], right: 0, why: 'Only the day and month count.' },
      { ask: 'Mia was born on 3 May. Leo was born on 3 June. Is that a match?', options: ['Yes', 'No'], right: 1, why: 'Same day, but a different month.' },
      { ask: 'Your guess: how many kids does a class need to have an even chance of winning?', options: GUESSES.map((n) => `${n} kids`), predict: 'guess', why: 'Keep that guess in mind. We’ll test it in Stage 5!' },
    ] },
    { title: 'What is a chance?', icon: '🪙', steps: [
      { say: 'A **chance** says how likely something is. We often write it as a **percentage**, which means “out of 100”.' },
      { ask: 'You toss a fair coin. What is the chance of heads?', options: ['10%', '50%', '100%'], right: 1, why: '50% means about half the time, like one side of a coin.' },
      { ask: 'A class has a 97% chance of a match. Does it have to have a match?', options: ['Yes, it must', 'No, but it is very likely'], right: 1, why: 'Very likely is not the same as certain.' },
    ] },
    { title: 'Roll some classes', icon: '🎲', steps: [
      { say: 'Move the slider to choose a class size. Then roll at least **5** pretend classes. An orange ring marks a shared birthday.', play(box, done) {
        let kids = 23, won = 0, rolled = 0;
        const label = h('p', { class: 'say' }), strip = h('div'), tally = h('p', { class: 'say', role: 'status' });
        const draw = () => { label.textContent = `Kids in the class: ${kids}`; tally.textContent = rolled ? `${won} of ${rolled} classes had a match.` : 'No classes rolled yet.'; };
        const roll = () => {
          const days = Array.from({ length: kids }, () => Math.floor(Math.random() * 365));
          rolled += 1; if (new Set(days).size < kids) won += 1;
          strip.replaceChildren(yearStrip(days)); draw();
          if (rolled >= 5) done();
          report();
        };
        box.append(label, slider(5, 60, kids, (v) => { kids = v; won = rolled = 0; strip.replaceChildren(); draw(); }, 'Kids in the class'), h('div', { class: 'row' }, h('button', { class: 'on', onclick: roll }, 'Roll a class')), strip, tally);
        draw();
      } },
      { ask: 'You rolled a few classes. Could a fresh set of rolls give a different count?', options: ['Yes, chance changes it', 'No, it is always the same'], right: 0, why: 'A few rolls wobble a lot. That’s why our computer played each size a million times.' },
    ] },
    { title: 'Why so few kids?', icon: '🤝', steps: [
      { say: 'Here’s the secret: **any two kids** can win it for the class. Two kids together are called a **pair**.' },
      { say: 'Move the slider. Each line is a pair that could match. Watch how fast the lines grow!', play(box, done) {
        const pic = h('div', { style: 'text-align:center' }), label = h('p', { class: 'say', role: 'status' });
        const draw = (kids) => { pic.replaceChildren(ring(kids)); label.textContent = `${kids} kids make ${pairs(kids)} pairs.`; if (kids >= 12) done(); };
        box.append(slider(2, 23, 2, draw, 'Kids in the class'), pic, label);
        draw(2);
      } },
      { ask: 'How many pairs do 4 kids make?', show: () => h('div', { style: 'text-align:center' }, ring(4)), options: ['3', '4', '6'], right: 2, why: 'Count the lines: 6.' },
      { ask: `A class of ${answer} kids makes how many pairs?`, options: [String(answer), '100', String(pairs(answer))], right: 2, why: `${pairs(answer)} pairs! That is a lot of chances to match.` },
    ] },
    { title: 'What the computer found', icon: '🏆', steps: [
      { say: 'For every class size from 2 to 80, our computer played the game **a million times**. Find the **smallest class** that wins more than half the time, then press Check.', play(box, done) {
        let kids = 2;
        const big = h('p', { class: 'ask' }), meter = h('i'), hint = h('p', { class: 'say', role: 'status' });
        const draw = (v) => { kids = v; big.textContent = `${kids} kids: wins ${percent(row(kids).simulated)} of games`; meter.style.width = `${row(kids).simulated * 100}%`; hint.textContent = ''; };
        const check = () => {
          if (kids === answer) { hint.textContent = `Yes! ${answer} kids is just over half.`; done(); }
          else hint.textContent = kids < answer ? 'Not over half yet. Try a bigger class.' : 'That wins more than half, but a smaller class does too. Try fewer kids.';
          report();
        };
        box.append(big, slider(2, 80, 2, draw, 'Kids in the class'), h('div', { class: 'progress', style: 'margin:8px 0' }, meter), h('div', { class: 'row' }, h('button', { class: 'on', onclick: check }, 'Check')), hint);
        draw(2);
      } },
      { say: (state) => `The answer is **${answer} kids**. ${state.guess === undefined ? '' : GUESSES[state.guess] === answer ? 'You guessed it right at the start. Wow!' : `You guessed ${GUESSES[state.guess]} at the start. Most people guess far too many.`}` },
      { ask: 'Maths can work out the exact answer too. How close were the computer’s games?', options: ['Very close', 'Far away'], right: 0, why: `For ${answer} kids, the games gave ${percent(row(answer).simulated)} and the maths gives ${percent(row(answer).exact)}.` },
      { ask: 'Our game gave every day the same chance. Is that exactly true of real birthdays?', options: ['Yes', 'No'], right: 1, why: 'Some days are more common, and we left out 29 February too. So our answer belongs to our rules.' },
    ] },
  ],
  finish: () => h('div', {}, h('p', { class: 'ask' }, '🎉 You finished all the stages!'), h('p', {}, `With just ${answer} kids, a shared birthday is about as likely as a coin landing heads. Try it with your own class. Your class is just one game, so a match isn’t promised.`)),
});
