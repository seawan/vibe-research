// The interactive figures in this post. Each one asks the reader to guess first, then lets them explore.
// Everything shown comes from the run's own output files (probes.json, samples.json, results.csv). Nothing is
// simulated here, except the adventure dial, which applies the same sum the model uses to its real recorded odds.
// VIBE (the chosen figure and its data), h() (makes a page element), root and report come from the site's sandbox.

root.prepend(h('style', {}, `
.bar{display:grid;grid-template-columns:3.2em 1fr 3.6em;gap:8px;align-items:center;margin:3px 0;font-variant-numeric:tabular-nums}
.bar b{font:600 15px ui-monospace,Menlo,Consolas,monospace;text-align:center}.bar i{display:block;height:18px;min-width:1px;border-radius:3px;background:var(--accent);transition:width .2s}
.bar.real i{background:var(--real)}.bar.real b{color:var(--real)}.bar span{text-align:right;font-size:14px}
.tiles{display:flex;flex-wrap:wrap;gap:3px;margin:8px 0}.tile{min-width:26px;min-height:32px;padding:2px;font:600 15px ui-monospace,Menlo,Consolas,monospace;border-radius:5px}
.tile.right{background:var(--goodbg);border-color:var(--good)}.tile.wrong{background:var(--badbg);border-color:var(--bad)}.tile.picked{outline:2px solid var(--accent)}
.text{white-space:pre-wrap;font:15px/1.5 Georgia,serif;background:var(--panel);border-radius:8px;padding:10px;margin:8px 0;overflow-wrap:anywhere}.text .given{color:var(--muted)}.text .surprise{color:var(--real);font-weight:700}
.ticks{display:flex;justify-content:space-between;font-size:13px;color:var(--muted)}.good{color:var(--good);font-weight:650}.bad{color:var(--bad);font-weight:650}
.grid100{display:grid;grid-template-columns:repeat(20,1fr);gap:2px;max-width:320px;margin:8px 0}.grid100 i{aspect-ratio:1;border-radius:2px;background:var(--line)}.grid100 i.on{background:var(--good)}
svg text{fill:var(--muted);font-size:12px}`));

// ---------- small building blocks ----------
const STEPS = [0, 100, 300, 1000, 2000];
const REAL_NEXT = { 'Once upon a ti': 'm', 'The king and the qu': 'e' };
const pct = (p) => (p >= 0.995 ? '100%' : p < 0.01 && p > 0 ? '<1%' : `${Math.round(p * 100)}%`);
const show = (c) => (c === ' ' ? '␣' : c === '\n' ? '↵' : c);
const named = (c) => (c === ' ' ? 'space' : c === '\n' ? 'new line' : c);
const clear = (el, ...kids) => { el.replaceChildren(...kids.flat()); return el; };
const tornBetween = (odds) => Math.exp(-odds.reduce((sum, p) => sum + (p > 0 ? p * Math.log(p) : 0), 0));
const say = () => h('p', { class: 'say', role: 'status' });

// Guess first: a question with answer buttons. After any answer (or a skip), `then` opens the explorer.
function askFirst(question, options, rightIndex, explain, then) {
  const buttons = options.map((label, i) => h('button', { onclick: () => answer(i) }, label));
  const skip = h('button', { onclick: () => answer(null) }, 'Just show me');
  const result = say();
  const box = h('div', {}, h('p', { class: 'ask' }, question), h('div', { class: 'row' }, buttons, skip), result);
  root.append(box);
  function answer(i) {
    [...buttons, skip].forEach((b) => { b.disabled = true; });
    buttons[rightIndex].classList.add('on');
    if (i !== null) result.append(h('span', { class: i === rightIndex ? 'good' : 'bad' }, i === rightIndex ? 'You got it! ' : 'Not quite. '));
    result.append(explain);
    then();
  }
}

// A slider that moves through named stops, with the stops written underneath.
function stopSlider(stops, start, onChange) {
  const input = h('input', { type: 'range', min: 0, max: stops.length - 1, step: 1, value: start, 'aria-valuetext': String(stops[start]), oninput: () => { input.setAttribute('aria-valuetext', String(stops[+input.value])); onChange(+input.value); } });
  return h('div', {}, input, h('div', { class: 'ticks' }, stops.map((s) => h('span', {}, String(s)))));
}

function bars(rows) {
  const tallest = Math.max(...rows.map((r) => r.odds), 0.001);
  return rows.map((r) => h('div', { class: `bar${r.real ? ' real' : ''}` }, h('b', {}, show(r.letter)), h('div', {}, h('i', { style: `width:${(r.odds / tallest) * 100}%` })), h('span', {}, pct(r.odds))));
}

// The most likely letters, always including the real answer so the reader can follow it.
function topRows(odds, alphabet, real, count) {
  const rows = odds.map((p, i) => ({ letter: alphabet[i], odds: p, real: alphabet[i] === real })).sort((a, b) => b.odds - a.odds);
  const shown = rows.slice(0, count);
  if (real && !shown.some((r) => r.real)) shown[count - 1] = rows.find((r) => r.real);
  return shown;
}

function beginningButtons(prompts, onPick) {
  const buttons = prompts.map((p, i) => h('button', { class: i ? '' : 'on', onclick: () => { buttons.forEach((b) => b.classList.toggle('on', b === buttons[i])); onPick(p); } }, `“${p}”`));
  return h('div', { class: 'row' }, buttons);
}

// ---------- the figures ----------
const FIGURES = {
  // How the odds for one guess change with practice.
  odds() {
    const { odds, alphabet, guess_prompts: prompts } = VIBE.data['probes.json'];
    let prompt = prompts[0], at = 2;
    const firstTop = STEPS.findIndex((_, i) => topRows(odds[i][prompts[0]], alphabet, null, 1)[0].letter === 'm');
    const area = h('div', { hidden: true });
    askFirst('After “Once upon a ti”, the real next letter is m. When does m first become its top guess?', STEPS.map((s) => `${s} steps`), firstTop,
      `m first takes the lead at ${STEPS[firstTop]} steps. Now slide through practice and watch it happen.`, () => { area.hidden = false; draw(); });
    const label = h('p', { class: 'ask' }), chart = h('div'), note = h('p', { class: 'muted' });
    area.append(beginningButtons(prompts, (p) => { prompt = p; draw(); }), label, stopSlider(STEPS, at, (i) => { at = i; draw(); }), chart, note);
    root.append(area);
    function draw() {
      const now = odds[at][prompt], real = REAL_NEXT[prompt];
      label.textContent = `After ${STEPS[at]} practice steps`;
      clear(chart, bars(topRows(now, alphabet, real, 7)));
      note.textContent = `Orange is the real next letter, ${real}. It is torn between about ${tornBetween(now).toFixed(1)} letters.`;
    }
  },

  // Play against the storyteller on the hidden sentence.
  guess() {
    const { read_along: runs, read_along_sentence: sentence } = VIBE.data['probes.json'];
    const letters = runs[runs.length - 1].guesses;
    const START = 5;
    let at = START, you = 0, model = 0, done = 0;
    const score = h('p', { class: 'ask' }), text = h('div', { class: 'text' }), area = h('div');
    root.append(score, text, area);
    function scoreLine() { return `You ${you}, storyteller ${model}, after ${done} ${done === 1 ? 'letter' : 'letters'}`; }
    function ask() {
      const g = letters[at];
      score.textContent = scoreLine();
      clear(text, sentence.slice(0, at), h('span', { class: 'surprise' }, ' ?'));
      const options = [...new Set([g.real, ...g.top.map((t) => t[0])])].sort();
      clear(area, h('p', { class: 'say' }, 'What comes next?'), h('div', { class: 'row' }, options.map((c) => h('button', { onclick: () => reveal(c) }, named(c)))));
    }
    function reveal(pick) {
      const g = letters[at], modelGuess = g.top[0][0];
      done += 1; if (pick === g.real) you += 1; if (modelGuess === g.real) model += 1;
      score.textContent = scoreLine();
      clear(text, sentence.slice(0, at + 1));
      const rows = g.top.map(([letter, p]) => ({ letter, odds: p, real: letter === g.real }));
      if (!rows.some((r) => r.real)) rows.push({ letter: g.real, odds: g.real_odds, real: true });
      at += 1;
      const last = at >= letters.length;
      clear(area, h('p', { class: 'say', role: 'status' }, `It was ${named(g.real)}. You ${pick === g.real ? 'got it' : 'missed it'}. The storyteller's first guess, ${named(modelGuess)}, was ${modelGuess === g.real ? 'right' : 'wrong'}.`),
        bars(rows), h('div', { class: 'row' }, last ? h('button', { onclick: () => { at = START; you = model = done = 0; ask(); } }, 'Play again') : h('button', { class: 'on', onclick: ask }, 'Next letter')));
    }
    ask();
  },

  // The same sentence at each checkpoint. Tap any letter to see the guesses behind it.
  readalong() {
    const { read_along: runs } = VIBE.data['probes.json'];
    const right = (g) => g.top[0][0] === g.real;
    const final = runs[runs.length - 1].guesses.filter(right).length;
    const options = [5, 15, 30, 45], area = h('div', { hidden: true });
    askFirst(`After all ${STEPS[4]} steps, how many of the ${runs[0].guesses.length} letters does it guess right first time?`, options.map((n) => `about ${n}`), options.indexOf(options.reduce((a, b) => (Math.abs(b - final) < Math.abs(a - final) ? b : a))),
      `It gets ${final} of ${runs[0].guesses.length}. Slide to see how it got there, and tap a letter to see its guesses.`, () => { area.hidden = false; draw(); });
    let at = 4, tapped = 9;
    const label = h('p', { class: 'ask' }), tiles = h('div', { class: 'tiles' }), detail = h('div');
    area.append(label, stopSlider(STEPS, at, (i) => { at = i; draw(); }), tiles, detail);
    root.append(area);
    function draw() {
      const guesses = runs[at].guesses;
      label.textContent = `After ${STEPS[at]} steps: ${guesses.filter(right).length} of ${guesses.length} right first time`;
      clear(tiles, guesses.map((g, i) => h('button', { class: `tile ${right(g) ? 'right' : 'wrong'}${i === tapped ? ' picked' : ''}`, 'aria-label': `${named(g.real)}, first guess ${right(g) ? 'right' : 'wrong'}`, onclick: () => { tapped = i; draw(); } }, show(g.real))));
      const g = guesses[tapped], rows = g.top.map(([letter, p]) => ({ letter, odds: p, real: letter === g.real }));
      if (!rows.some((r) => r.real)) rows.push({ letter: g.real, odds: g.real_odds, real: true });
      clear(detail, h('p', { class: 'muted' }, `Its top 3 guesses for this letter (${named(g.real)}). Orange is the real letter.`), bars(rows));
    }
  },

  // The scores for the whole hidden part.
  scores() {
    const rows = VIBE.data['results.csv'];
    const torn = (loss) => Math.exp(loss);
    const area = h('div', { hidden: true });
    const last = rows[rows.length - 1];
    askFirst('At the end, where do you expect the better score: on the part it practised on, or on the hidden part?', ['the practice part', 'the hidden part', 'exactly the same'], last.train_loss < last.test_loss ? 0 : last.test_loss < last.train_loss ? 1 : 2,
      `The practice part scores a little better, but the hidden part stays close. That suggests it learned patterns, not just this exact text.`, () => { area.hidden = false; draw(); });
    let at = rows.length - 1;
    const label = h('p', { class: 'ask' }), chart = h('div'), grid = h('div', { class: 'grid100', role: 'img' }), note = h('p', { class: 'muted' });
    area.append(label, stopSlider(rows.map((r) => r.step), at, (i) => { at = i; draw(); }), chart, note, grid);
    root.append(area);
    // positions on the chart: checkpoints evenly spaced; torn-between on a scale where each step down is a halving
    const W = 520, H = 170, x = (i) => 44 + (i * (W - 60)) / (rows.length - 1), y = (t) => 12 + ((Math.log2(128) - Math.log2(t)) / (Math.log2(128) - 1)) * (H - 36);
    function draw() {
      const svg = (tag, attrs, ...kids) => { const e = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const k in attrs) e.setAttribute(k, attrs[k]); e.append(...kids); return e; };
      const line = (key, colour) => svg('polyline', { points: rows.map((r, i) => `${x(i)},${y(torn(r[key]))}`).join(' '), fill: 'none', stroke: colour, 'stroke-width': 2.5 });
      const now = rows[at];
      clear(chart, svg('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', role: 'img', 'aria-label': 'Torn between, falling with practice' },
        ...[2, 8, 32, 128].flatMap((t) => [svg('line', { x1: 40, x2: W - 10, y1: y(t), y2: y(t), stroke: 'var(--line)' }), svg('text', { x: 32, y: y(t) + 4, 'text-anchor': 'end' }, String(t))]),
        ...rows.map((r, i) => svg('text', { x: x(i), y: H - 6, 'text-anchor': 'middle' }, String(r.step))),
        svg('line', { x1: x(at), x2: x(at), y1: 10, y2: H - 22, stroke: 'var(--muted)', 'stroke-dasharray': '4 3' }),
        line('train_loss', 'var(--accent)'), line('test_loss', 'var(--real)'),
        svg('circle', { cx: x(at), cy: y(torn(now.test_loss)), r: 5, fill: 'var(--real)' })));
      const out100 = Math.round(now.test_first_guess_right * 100);
      label.textContent = `After ${now.step} steps`;
      note.textContent = `Torn between about ${torn(now.test_loss).toFixed(1)} letters on the hidden part (orange) and ${torn(now.train_loss).toFixed(1)} on the practice part (blue). Smaller is better. First guess right ${out100} times in 100 on the hidden part:`;
      grid.setAttribute('aria-label', `${out100} of 100 first guesses right`);
      clear(grid, Array.from({ length: 100 }, (_, i) => h('i', { class: i < out100 ? 'on' : '' })));
    }
  },

  // Step through the real story, one dice roll at a time.
  typewriter() {
    const { typewriter: rolls, prompt } = VIBE.data['probes.json'];
    const surprise = (r) => r.picked !== r.top[0][0];
    const total = rolls.filter(surprise).length;
    const area = h('div', { hidden: true });
    askFirst('When it writes, does it always pick its most likely letter?', ['yes, always', 'no, it rolls a weighted dice'], 1,
      `It rolls a dice weighted by its odds. In this story, ${total} of ${rolls.length} picks were not its top choice. They are orange below.`, () => { area.hidden = false; draw(); });
    let at = 0, timer = null;
    const text = h('div', { class: 'text' }), chart = h('div'), note = h('p', { class: 'muted' });
    const stop = () => { clearInterval(timer); timer = null; play.textContent = 'Play'; };
    const back = h('button', { onclick: () => { stop(); at = Math.max(0, at - 1); draw(); } }, 'Back');
    const next = h('button', { class: 'on', onclick: () => { stop(); at = Math.min(rolls.length, at + 1); draw(); } }, 'Next letter');
    const play = h('button', { onclick: () => {
      if (timer) return stop();
      if (at >= rolls.length) at = 0;
      play.textContent = 'Pause';
      timer = setInterval(() => { at += 1; draw(); if (at >= rolls.length) stop(); }, 450);
    } }, 'Play');
    area.append(text, chart, note, h('div', { class: 'row' }, back, next, play));
    root.append(area);
    function draw() {
      clear(text, h('span', { class: 'given' }, prompt), rolls.slice(0, at).map((r) => (surprise(r) ? h('span', { class: 'surprise' }, r.picked) : r.picked)));
      back.disabled = at === 0; next.disabled = at >= rolls.length;
      if (at >= rolls.length) { clear(chart); note.textContent = `That is ${rolls.length} letters, with ${total} surprises.`; return; }
      const r = rolls[at];
      clear(chart, bars(r.top.map(([letter, p]) => ({ letter, odds: p, real: letter === r.picked }))));
      note.textContent = r.top.some((t) => t[0] === r.picked) ? `Its top 5 choices for the next letter. Orange is the one the dice picked: ${named(r.picked)}.` : `Its top 5 choices. The dice picked a rarer letter outside these: ${named(r.picked)}.`;
    }
  },

  // Guess which checkpoint wrote a story, then read them all.
  stories() {
    const samples = VIBE.data['samples.json'], scores = VIBE.data['results.csv'];
    const quiz = samples.findIndex((s) => s.step === 300);
    root.append(h('div', { class: 'text' }, samples[quiz].story));
    const area = h('div', { hidden: true });
    askFirst('How much practice had it had when it wrote this?', samples.map((s) => `${s.step} steps`), quiz,
      `It had practised for ${samples[quiz].step} steps. It uses mostly real words by now, but the sentences don't make sense yet. Slide to read the others.`, () => { area.hidden = false; draw(); });
    let at = samples.length - 1;
    const label = h('p', { class: 'ask' }), text = h('div', { class: 'text' });
    area.append(label, stopSlider(samples.map((s) => s.step), at, (i) => { at = i; draw(); }), text);
    root.append(area);
    function draw() {
      const s = samples[at], r = scores.find((row) => row.step === s.step);
      label.textContent = `After ${s.step} steps: first guess right ${Math.round(r.test_first_guess_right * 100)} times in 100`;
      text.textContent = s.story;
    }
  },

  // Which earlier letters each layer looks back at.
  attention() {
    const { text, layers } = VIBE.data['probes.json'].attention;
    const NEAR = 5;
    const top = (w) => w.indexOf(Math.max(...w));
    const lastLayer = layers[layers.length - 1];
    let reveal = false, layer = layers.length - 1, tapped = null;
    const ask = h('p', { class: 'ask' }, `It has just read “${text.slice(-5)}”. Which letter do you think it looks back at most? Tap one.`);
    const tiles = h('div', { class: 'tiles' }), result = say(), controls = h('div', { class: 'row', hidden: true }), note = h('p', { class: 'muted', hidden: true });
    const layerButtons = layers.map((_, i) => h('button', { onclick: () => { layer = i; tapped = null; draw(); } }, `Layer ${i + 1}`));
    controls.append(...layerButtons);
    root.append(ask, tiles, result, controls, note);
    function tap(i) {
      if (reveal) { tapped = i; draw(); return; }
      reveal = true; tapped = i;
      const best = top(lastLayer), near = Math.abs(i - best) <= NEAR;
      result.append(h('span', { class: near ? 'good' : 'bad' }, near ? 'Close! ' : 'Not quite. '), `In its last layer, the letter it looks at most is “${named(text[best])}”, ${text.length - best} back from the end. Darker means looked at more. Try each layer, and tap a letter to see its share.`);
      controls.hidden = false; note.hidden = false;
      draw();
    }
    function draw() {
      const w = layers[layer], tallest = Math.max(...w);
      clear(tiles, [...text].map((c, i) => h('button', { class: `tile${i === tapped ? ' picked' : ''}`, style: reveal ? `background:color-mix(in srgb,var(--real) ${Math.round((w[i] / tallest) * 85)}%,var(--bg))` : '', 'aria-label': named(c), onclick: () => tap(i) }, show(c))));
      layerButtons.forEach((b, i) => b.classList.toggle('on', i === layer));
      if (reveal && tapped !== null) note.textContent = `Layer ${layer + 1} gives “${named(text[tapped])}” a ${(w[tapped] * 100).toFixed(1)}% share of its looking back.`;
    }
    draw();
  },

  // Turn the dial: odds are recalculated live from the real recorded odds.
  dial() {
    const { odds, alphabet, guess_prompts: prompts, dial: stories } = VIBE.data['probes.json'];
    const trained = odds[odds.length - 1];
    const NORMAL = 0.8, ROLLS = 30;
    const withDial = (p, t) => { const raised = p.map((x) => x ** (1 / t)); const sum = raised.reduce((a, b) => a + b, 0); return raised.map((x) => x / sum); };
    const area = h('div', { hidden: true });
    askFirst('If you turn the dial up towards wild, what happens to the odds of its favourite letter?', ['they go up', 'they go down', 'they stay the same'], 1,
      'They go down, and the rare letters get more of a chance. Turn the dial and watch the bars.', () => { area.hidden = false; draw(); });
    let prompt = prompts[1], dial = NORMAL;
    const label = h('p', { class: 'ask' }), chart = h('div'), note = h('p', { class: 'muted' }), rolled = h('div');
    const input = h('input', { type: 'range', min: 0.3, max: 1.5, step: 0.05, value: dial, 'aria-label': 'Adventure dial', oninput: () => { dial = +input.value; clear(rolled); draw(); } });
    const beginnings = beginningButtons([prompts[1], prompts[0]], (p) => { prompt = p; clear(rolled); draw(); });
    const roll = h('button', { class: 'on', onclick: rollDice }, `Roll the dice ${ROLLS} times`);
    const storyText = h('div', { class: 'text' });
    const storyButtons = stories.map((s, i) => h('button', { onclick: () => pickStory(i) }, `${['Careful', 'Normal', 'Wild'][i]} (${s.temperature})`));
    area.append(beginnings, label, input, h('div', { class: 'ticks' }, h('span', {}, 'careful 0.3'), h('span', {}, 'normal 0.8'), h('span', {}, 'wild 1.5')), chart, note, h('div', { class: 'row' }, roll), rolled,
      h('p', { class: 'ask' }, 'Stories it really wrote at three settings'), h('div', { class: 'row' }, storyButtons), storyText);
    root.append(area);
    function pickStory(i) { storyButtons.forEach((b, j) => b.classList.toggle('on', j === i)); storyText.textContent = stories[i].story; }
    pickStory(1);
    function draw() {
      const now = withDial(trained[prompt], dial);
      label.textContent = `Adventure dial: ${dial.toFixed(2)}, after “${prompt}”`;
      clear(chart, bars(topRows(now, alphabet, null, 6)));
      note.textContent = `Torn between about ${tornBetween(now).toFixed(1)} letters.`;
    }
    function rollDice() {
      const now = withDial(trained[prompt], dial), best = now.indexOf(Math.max(...now));
      const picks = Array.from({ length: ROLLS }, () => { let r = Math.random(), i = 0; while (i < now.length - 1 && (r -= now[i]) > 0) i += 1; return i; });
      clear(rolled, h('div', { class: 'text' }, picks.map((i) => (i === best ? alphabet[i] : h('span', { class: 'surprise' }, show(alphabet[i]))))),
        h('p', { class: 'muted', role: 'status' }, `${picks.filter((i) => i !== best).length} of ${ROLLS} rolls (orange) were not its favourite, ${named(alphabet[best])}. Roll again: each time is different.`));
    }
  },
};

FIGURES[VIBE.name]();
report();
