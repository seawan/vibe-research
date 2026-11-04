// Lesson kit: a post's interactive figure becomes a game in stages, one small step at a time.
// lesson({ stages: [{ title, icon, steps: [...] }], finish(state) }). A step is one of:
//   { say, show }                       a teaching card
//   { ask, show, options, right, why }  a question; a missed question comes back at the end of the stage
//   { ask, options, predict: 'key' }    a guess with no wrong answer; the chosen index is kept in state[key]
//   { say, play(box, done, state) }     something to try; Continue unlocks when it calls done()
// say, ask, why and show may be functions of state.
const rich = (text) => String(text).split(/\*\*/).map((part, i) => (i % 2 ? h('strong', {}, part) : part));
const slider = (min, max, start, onInput, label) => { const s = h('input', { type: 'range', min, max, value: start, 'aria-label': label, oninput: () => onInput(+s.value) }); return s; };
const svg = (tag, attrs, ...kids) => { const e = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const k in attrs) e.setAttribute(k, attrs[k]); e.append(...kids); return e; };
const value = (v, state) => (typeof v === 'function' ? v(state) : v);

function lesson({ stages, finish }) {
  let saved = { done: [], stars: 0, state: {} };
  const save = () => parent.postMessage({ type: 'vibe-save', value: JSON.stringify(saved) }, '*');
  const top = () => parent.postMessage({ type: 'vibe-top' }, '*');
  const screen = (...kids) => { root.replaceChildren(...kids.filter((k) => k != null)); setTimeout(report, 30); };
  const firstOpen = () => stages.findIndex((_, i) => !saved.done.includes(i));

  function map() {
    const next = firstOpen();
    const nodes = stages.map((s, i) => {
      const done = saved.done.includes(i), open = done || i === next;
      return h('button', { class: `stage${done ? ' done' : ''}${i === next ? ' next' : ''}`, disabled: !open, onclick: () => play(i) },
        h('span', { class: 'dot', 'aria-hidden': 'true' }, done ? '✓' : open ? s.icon : '🔒'), h('span', {}, h('small', {}, `Stage ${i + 1}`), h('br'), s.title));
    });
    screen(h('div', { class: 'head' }, h('strong', {}, `${saved.done.length} of ${stages.length} stages`), h('span', {}, `⭐ ${saved.stars}`)),
      h('div', { class: 'path' }, nodes),
      next < 0 ? win() : h('p', { class: 'muted' }, saved.done.length ? 'Tap the next stage to carry on.' : 'Tap Stage 1 to start. Each stage takes about a minute.'));
  }

  function win() {
    return h('div', {}, h('div', { class: 'card' }, value(finish, saved.state)),
      h('div', { class: 'row' }, h('button', { onclick: () => { saved = { done: [], stars: 0, state: {} }; save(); map(); } }, 'Play again from the start')));
  }

  function play(index) {
    const stage = stages[index], queue = stage.steps.map((step) => ({ step, retry: false }));
    let at = 0, stars = 0;
    function next() {
      at += 1; top();
      if (at >= queue.length) return end();
      draw();
    }
    function end() {
      if (!saved.done.includes(index)) { saved.done.push(index); saved.stars += stars; }
      save(); top();
      screen(h('div', { class: 'win' }, h('div', { class: 'big', 'aria-hidden': 'true' }, stage.icon), h('p', { class: 'ask' }, `Stage ${index + 1} done!`), h('p', {}, stars ? `You earned ${stars} ⭐` : 'Nice work finishing it.')),
        h('div', { class: 'row' }, h('button', { class: 'go', onclick: map }, 'Continue')));
    }
    function bar() {
      return h('div', { class: 'head' }, h('button', { class: 'quiet', 'aria-label': 'Back to the stages', onclick: map }, '✕'),
        h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': queue.length, 'aria-valuenow': at }, h('i', { style: `width:${(at / queue.length) * 100}%` })));
    }
    function draw() {
      const { step, retry } = queue[at], state = saved.state;
      const foot = h('div', { class: 'foot', role: 'status' });
      const go = (label = 'Continue') => h('button', { class: 'go', onclick: next }, label);
      const pic = step.show ? value(step.show, state) : null;
      if (step.ask) {
        const buttons = value(step.options, state).map((label, i) => h('button', { class: 'choice', onclick: () => pick(i) }, label));
        const pick = (i) => {
          buttons.forEach((b) => { b.disabled = true; });
          if (step.predict) {
            state[step.predict] = i; save(); buttons[i].classList.add('chosen');
            foot.replaceChildren(h('p', {}, rich(value(step.why, state) ?? 'Good guess! Let’s find out.')), go());
          } else if (i === step.right) {
            buttons[i].classList.add('right');
            if (!retry) stars += 1;
            foot.className = 'foot good';
            foot.replaceChildren(h('p', {}, h('strong', {}, retry ? 'That’s it! ' : 'Correct! +1 ⭐ '), rich(value(step.why, state) ?? '')), go());
          } else {
            buttons[i].classList.add('wrong'); buttons[step.right].classList.add('right');
            foot.className = 'foot bad';
            queue.push({ step, retry: true });
            foot.replaceChildren(h('p', {}, h('strong', {}, 'Not quite. '), rich(value(step.why, state) ?? ''), ' We’ll try this one again soon.'), go('Got it'));
          }
          setTimeout(report, 30);
        };
        screen(bar(), h('p', { class: 'ask' }, rich(value(step.ask, state))), pic, h('div', { class: 'choices' }, buttons), foot);
      } else if (step.play) {
        const box = h('div', {}), cont = h('button', { class: 'go', disabled: true, onclick: next }, 'Continue');
        foot.append(cont);
        screen(bar(), h('p', { class: 'ask' }, rich(value(step.say, state))), box, foot);
        step.play(box, () => { cont.disabled = false; save(); setTimeout(report, 30); }, state);
      } else {
        foot.append(go());
        screen(bar(), h('p', { class: 'lead' }, rich(value(step.say, state))), pic, foot);
      }
    }
    draw();
  }

  addEventListener('message', (e) => {
    if (e.data?.type !== 'vibe-saved') return;
    try { const v = JSON.parse(e.data.value); if (Array.isArray(v?.done) && v.state) saved = v; } catch { /* start fresh */ }
    map();
  });
  parent.postMessage({ type: 'vibe-load' }, '*');
  map();
}
