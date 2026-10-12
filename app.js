(() => {
  'use strict';
  const D = window.NAQC;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const svgEl = (tag, attrs = {}) => {
    const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  };
  const split = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
  const LV = ['核心', '熟悉', '了解'];
  const PR = { '首读': 0, '重要': 1, '延伸': 2 };
  const color = (phase) => `var(--p${phase})`;
  // 用 KaTeX 渲染 $...$ 里的 LaTeX；KaTeX 没加载时保持原文
  const tex = (node) => {
    if (window.renderMathInElement) {
      window.renderMathInElement(node, { delimiters: [{ left: '$', right: '$', display: false }], throwOnError: false });
    }
    return node;
  };
  // 搜索时忽略 LaTeX 标记，让 “C6” 能搜到 $C_6$
  const norm = (str) => String(str).replace(/\\(mathrm|text|mathbb|hat|vec)/g, '').replace(/[$\\{}^_]/g, '').toLowerCase();

  const mods = [...D.modules].sort((a, b) => a.order - b.order);
  const M = Object.fromEntries(mods.map((m) => [m.id, m]));
  const next = Object.fromEntries(mods.map((m) => [m.id, mods.filter((x) => split(x.deps).includes(m.id)).map((x) => x.id)]));
  const checksOf = (id) => D.checklist.filter((c) => c.module === id).sort((a, b) => LV.indexOf(a.level) - LV.indexOf(b.level) || a.id.localeCompare(b.id));
  const readsOf = (id) => D.readings.filter((r) => split(r.modules).includes(id)).sort((a, b) => PR[a.priority] - PR[b.priority] || (a.year || 0) - (b.year || 0));
  const termsOf = (id) => D.glossary.filter((g) => g.module === id);
  const steps = [...D.cycle].sort((a, b) => a.step - b.step);

  // ---------- stats ----------
  const core = D.checklist.filter((c) => c.level === '核心').length;
  const first = D.readings.filter((r) => r.priority === '首读').length;
  $('#stats').replaceChildren(...[
    [steps.length, '个实验步骤'], [mods.length, '个知识模块'], [D.checklist.length, `条掌握要求，其中 ${core} 条核心`],
    [D.readings.length, `篇文献，${first} 篇首读`], [D.glossary.length, '个术语'],
  ].map(([n, t]) => { const s = el('span'); s.append(el('b', null, String(n)), t); return s; }));

  // ---------- shared pieces ----------
  function modChip(id) {
    const m = M[id];
    const b = el('button', 'chip');
    b.type = 'button';
    b.style.setProperty('--c', color(m.phase));
    const i = el('i', null, id);
    b.append(i, m.name);
    b.addEventListener('click', () => openModule(id));
    return b;
  }
  function checklistEl(id) {
    const ul = el('ul', 'checks');
    checksOf(id).forEach((c) => {
      const li = el('li');
      li.append(el('span', `lv lv-${c.level}`, c.level), el('span', null, c.item));
      ul.append(li);
    });
    return ul;
  }
  function readsEl(id) {
    const ul = el('ul', 'reads');
    readsOf(id).forEach((r) => {
      const li = el('li');
      const body = el('span');
      const a = el('a', null, r.short + (r.year ? `（${r.year}）` : ''));
      a.href = r.url; a.target = '_blank'; a.rel = 'noopener';
      body.append(a, el('span', 'rn', `${r.type}：${r.note}`));
      li.append(el('span', `pr pr-${r.priority}`, r.priority), body);
      ul.append(li);
    });
    return ul;
  }
  function termChips(id) {
    const wrap = el('div', 'chips');
    termsOf(id).forEach((g) => {
      const b = el('button', 'chip', g.term);
      b.type = 'button';
      b.addEventListener('click', () => { closeDrawer(); showView('terms'); $('#gq').value = g.term; drawTerms(); });
      wrap.append(b);
    });
    return wrap;
  }
  function moduleBody(id, { heading = 'h3' } = {}) {
    const m = M[id];
    const frag = document.createDocumentFragment();
    frag.append(el('p', 'why', m.why));
    frag.append(el(heading, 'sub', '要掌握什么'), checklistEl(id));
    const rs = readsOf(id);
    if (rs.length) frag.append(el(heading, 'sub', '读什么'), readsEl(id));
    if (termsOf(id).length) frag.append(el(heading, 'sub', '相关术语'), termChips(id));
    return frag;
  }

  // ---------- flow ----------
  let current = 1;
  const stepColor = (s) => color(M[split(s.modules)[0]].phase);
  const narrowFlow = matchMedia('(max-width: 720px)');

  function buildSteps() {
    const ol = $('#steps');
    ol.replaceChildren(...steps.map((s, i) => {
      const li = el('li', 'step');
      li.dataset.step = s.step;
      const b = el('button');
      b.type = 'button';
      b.setAttribute('aria-pressed', 'false');
      b.style.setProperty('--c', stepColor(s));
      b.append(el('span', 'trap'), el('span', 'step-n', `第 ${s.step} 步`), el('span', 'step-name', s.name), ...(s.time && s.time !== '—' ? [el('span', 'step-time', s.time)] : []));
      b.addEventListener('click', () => selectStep(s.step, true));
      li.append(b);
      return li;
    }));
    placeSteps();
    tex(ol);
  }
  function placeSteps() {
    const cols = narrowFlow.matches ? 1 : 3;
    $$('#steps .step').forEach((li, i) => {
      const row = Math.floor(i / cols);
      const col = cols === 1 ? 0 : (row % 2 === 0 ? i % cols : cols - 1 - (i % cols));
      li.style.gridRow = String(row + 1);
      li.style.gridColumn = String(col + 1);
    });
  }
  function drawConnectors() {
    const board = $('#board');
    const svg = $('#board-svg');
    const B = board.getBoundingClientRect();
    svg.setAttribute('viewBox', `0 0 ${B.width} ${B.height}`);
    svg.replaceChildren();
    const defs = svgEl('defs');
    const mk = svgEl('marker', { id: 'arr', viewBox: '0 0 10 10', refX: '8', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' });
    mk.append(svgEl('path', { d: 'M1,1 L9,5 L1,9', fill: 'none', stroke: 'var(--faint)', 'stroke-width': '1.6', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    defs.append(mk);
    svg.append(defs);
    const boxes = $$('#steps .step').map((li) => {
      const r = li.getBoundingClientRect();
      return { l: r.left - B.left, r: r.right - B.left, t: r.top - B.top, b: r.bottom - B.top, cx: r.left - B.left + r.width / 2, cy: r.top - B.top + r.height / 2 };
    });
    const segs = [];
    for (let i = 0; i < boxes.length - 1; i++) {
      const a = boxes[i], b = boxes[i + 1];
      let d;
      if (Math.abs(a.cy - b.cy) < 4) {
        d = a.cx < b.cx ? `M${a.r + 4},${a.cy} L${b.l - 6},${b.cy}` : `M${a.l - 4},${a.cy} L${b.r + 6},${b.cy}`;
      } else {
        d = `M${a.cx},${a.b + 4} L${b.cx},${b.t - 6}`;
      }
      segs.push(d);
      svg.append(svgEl('path', { d, stroke: 'var(--faint)', 'stroke-width': '1.5', fill: 'none', 'marker-end': 'url(#arr)' }));
    }
    // loop back: last step → first step, around the left edge (wide layout only)
    if (narrowFlow.matches) return { boxes, svg };
    const last = boxes[boxes.length - 1], firstB = boxes[0];
    const gx = Math.max(8, firstB.l - 16);
    const by = last.b + 20;
    const loop = `M${last.cx},${last.b + 4} L${last.cx},${by} L${gx},${by} L${gx},${firstB.cy} L${firstB.l - 6},${firstB.cy}`;
    svg.append(svgEl('path', { d: loop, stroke: 'var(--faint)', 'stroke-width': '1.3', 'stroke-dasharray': '4 5', fill: 'none', 'marker-end': 'url(#arr)', 'stroke-linejoin': 'round' }));
    const lbl = svgEl('text', { x: (gx + last.cx) / 2, y: by + 16, fill: 'var(--faint)', 'font-size': '12', 'text-anchor': 'middle' });
    lbl.textContent = '重复下一轮';
    svg.append(lbl);
    return { boxes, svg };
  }

  let carried = false;
  function carryAtom(geom) {
    if (carried || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    carried = true;
    const pts = geom.boxes.map((b) => `${b.cx},${b.cy}`);
    const path = svgEl('path', { d: 'M' + pts.join(' L'), fill: 'none', stroke: 'none' });
    const dot = svgEl('circle', { r: '5', class: 'carrier', opacity: '0' });
    geom.svg.append(path, dot);
    const len = path.getTotalLength();
    const dur = 3600;
    let t0 = null;
    const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
    const tick = (now) => {
      if (t0 === null) t0 = now;
      const t = Math.min(1, (now - t0) / dur);
      const p = path.getPointAtLength(ease(t) * len);
      dot.setAttribute('cx', p.x); dot.setAttribute('cy', p.y);
      dot.setAttribute('opacity', String(t < 0.06 ? t / 0.06 : t > 0.92 ? (1 - t) / 0.08 : 1));
      if (t < 1) requestAnimationFrame(tick); else { dot.remove(); path.remove(); }
    };
    requestAnimationFrame(tick);
  }

  function prereqTree(rootIds) {
    const seen = new Set();
    const make = (id, depth) => {
      const li = el('li');
      const m = M[id];
      const b = el('button', 'pnode');
      b.type = 'button';
      b.style.setProperty('--c', color(m.phase));
      b.append(el('span', 'mid', id), m.name);
      b.addEventListener('click', () => openModule(id));
      li.append(b);
      if (seen.has(id) && depth > 0) { b.classList.add('seen'); b.title = '上面已展开'; return li; }
      seen.add(id);
      const deps = split(m.deps);
      if (deps.length) {
        const ul = el('ul');
        deps.forEach((d) => ul.append(make(d, depth + 1)));
        li.append(ul);
      }
      return li;
    };
    const ul = el('ul', 'ptree');
    rootIds.forEach((id) => ul.append(make(id, 0)));
    return ul;
  }

  function selectStep(n, fromUser) {
    current = n;
    $$('#steps .step button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.closest('.step').dataset.step) === n)));
    const s = steps.find((x) => x.step === n);
    const ids = split(s.modules);
    const p = $('#step-panel');
    p.replaceChildren();
    p.append(el('span', 'kicker', `第 ${s.step} 步，共 ${steps.length} 步`), el('h2', null, s.name), el('p', 'what', s.what), el('p', 'meta', `常见时间量级：${s.time}`));
    p.append(el('h3', null, '这一步直接用到的知识'));
    const box = el('div', 'mods');
    ids.forEach((id, i) => {
      const m = M[id];
      const d = el('details', 'mod');
      d.style.setProperty('--c', color(m.phase));
      if (i === 0) d.open = true;
      const sum = el('summary');
      sum.append(el('span', 'mid', id), el('span', 'mname', m.name), el('span', 'men', m.name_en));
      const body = el('div', 'mod-body');
      body.append(moduleBody(id));
      d.append(sum, body);
      box.append(d);
    });
    p.append(box);
    p.append(el('h3', null, '前置知识树'), el('p', 'meta', '要真正理解这一步，需要先掌握的模块。点击任一模块查看完整清单。'), prereqTree(ids));
    tex(p);
    p.scrollTop = 0;
    if (fromUser) {
      history.replaceState(null, '', `#s-${n}`);
      if (matchMedia('(max-width: 980px)').matches) p.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // ---------- tree ----------
  const narrowTree = matchMedia('(max-width: 860px)');
  function buildTree() {
    const stages = [...new Map(mods.map((m) => [m.stage, m.stage_name])).entries()].sort((a, b) => a[0].localeCompare(b[0]));
    $('#tree-layers').replaceChildren(...stages.map(([sid, sname]) => {
      const row = el('div', 'layer');
      const [num, ...rest] = sname.split(' ');
      const nm = el('div', 'layer-name');
      nm.append(el('small', null, `第 ${num} 层`), rest.join(' '));
      const box = el('div', 'layer-mods');
      mods.filter((m) => m.stage === sid).forEach((m) => {
        const b = el('button', 'node');
        b.type = 'button';
        b.dataset.id = m.id;
        b.style.setProperty('--c', color(m.phase));
        b.append(el('span', 'mid', m.id), el('span', null, m.name));
        b.addEventListener('mouseenter', () => focusNode(m.id));
        b.addEventListener('focus', () => focusNode(m.id));
        b.addEventListener('mouseleave', () => focusNode(null));
        b.addEventListener('blur', () => focusNode(null));
        b.addEventListener('click', () => openModule(m.id));
        box.append(b);
      });
      row.append(nm, box);
      return row;
    }));
    const phases = [...new Map(mods.map((m) => [m.phase, m.phase_name])).entries()].sort((a, b) => a[0] - b[0]);
    $('#legend').replaceChildren(...phases.map(([p, n]) => { const s = el('span', null, n); s.style.setProperty('--c', color(p)); return s; }));
  }
  function rel(r, B) { return { l: r.left - B.left, r: r.right - B.left, t: r.top - B.top, b: r.bottom - B.top, cx: r.left - B.left + r.width / 2, cy: r.top - B.top + r.height / 2 }; }
  function drawTreeLinks() {
    const tree = $('#tree'), svg = $('#tree-svg');
    if (tree.offsetParent === null) return;
    const B = tree.getBoundingClientRect();
    svg.setAttribute('viewBox', `0 0 ${B.width} ${B.height}`);
    svg.replaceChildren();
    const g = svgEl('g', { id: 'base-links' });
    const stroke = { stroke: 'var(--line)', 'stroke-width': '1.5', fill: 'none' };
    if (!narrowTree.matches) {
      const root = rel($('#tree-root span').getBoundingClientRect(), B);
      $$('.layer').forEach((row) => {
        const nm = rel($('.layer-name', row).getBoundingClientRect(), B);
        const x0 = root.r, x1 = nm.l, mx = (x0 + x1) / 2;
        g.append(svgEl('path', { d: `M${x0},${root.cy} C${mx},${root.cy} ${mx},${nm.cy} ${x1},${nm.cy}`, ...stroke }));
        const ms = $$('.node', row).map((n) => rel(n.getBoundingClientRect(), B));
        const top = Math.min(...ms.map((m) => m.cy)), bot = Math.max(...ms.map((m) => m.cy));
        const bx = nm.r + 18;
        g.append(svgEl('path', { d: `M${nm.r},${nm.cy} L${bx},${nm.cy}`, ...stroke }));
        g.append(svgEl('path', { d: `M${bx},${Math.min(top, nm.cy)} L${bx},${Math.max(bot, nm.cy)}`, ...stroke }));
        const lefts = new Map();
        ms.forEach((m) => { const k = Math.round(m.cy); if (!lefts.has(k) || m.l < lefts.get(k).l) lefts.set(k, m); });
        lefts.forEach((m) => g.append(svgEl('path', { d: `M${bx},${m.cy} L${m.l},${m.cy}`, ...stroke })));
      });
    }
    svg.append(g, svgEl('g', { id: 'hl-links' }));
  }
  function focusNode(id) {
    const tree = $('#tree'), hl = $('#hl-links');
    $$('.node', tree).forEach((n) => n.classList.remove('on', 'dep', 'nxt'));
    if (hl) hl.replaceChildren();
    if (!id) { tree.classList.remove('focus'); return; }
    tree.classList.add('focus');
    const B = tree.getBoundingClientRect();
    const node = (x) => $(`.node[data-id="${x}"]`, tree);
    const me = node(id); me.classList.add('on');
    const pm = rel(me.getBoundingClientRect(), B);
    const curve = (a, b, c, dashed) => {
      const dy = Math.max(28, Math.abs(b.cy - a.cy) / 2);
      const d = Math.abs(a.cy - b.cy) < 4
        ? `M${a.cx},${a.t} C${a.cx},${a.t - 26} ${b.cx},${b.t - 26} ${b.cx},${b.t}`
        : `M${a.cx},${a.cy} C${a.cx},${a.cy + Math.sign(b.cy - a.cy) * dy} ${b.cx},${b.cy - Math.sign(b.cy - a.cy) * dy} ${b.cx},${b.cy}`;
      const attrs = { d, stroke: c, 'stroke-width': '2', fill: 'none', 'stroke-linecap': 'round' };
      if (dashed) attrs['stroke-dasharray'] = '5 5';
      hl && hl.append(svgEl('path', attrs));
    };
    split(M[id].deps).forEach((d) => { const n = node(d); n.classList.add('dep'); curve(rel(n.getBoundingClientRect(), B), pm, color(M[id].phase), false); });
    next[id].forEach((d) => { const n = node(d); n.classList.add('nxt'); curve(pm, rel(n.getBoundingClientRect(), B), 'var(--faint)', true); });
  }

  // ---------- drawer ----------
  let lastFocus = null;
  function openModule(id) {
    const m = M[id];
    if (!m) return;
    lastFocus = document.activeElement;
    const body = $('#drawer-body');
    body.replaceChildren();
    const card = $('.drawer-card');
    card.style.setProperty('--c', color(m.phase));
    const idl = el('span', 'mid', `模块 ${m.id}`);
    const h = el('h2', null, m.name); h.id = 'drawer-title';
    body.append(idl, h, el('span', 'men', m.name_en), el('p', 'where', `${m.stage_name.replace(/^\d+\s*/, '')}层，${m.phase_name}`));
    body.append(moduleBody(id));
    const deps = split(m.deps);
    if (deps.length) { const c = el('div', 'chips'); deps.forEach((d) => c.append(modChip(d))); body.append(el('h3', null, '前置模块'), c); }
    if (next[id].length) { const c = el('div', 'chips'); next[id].forEach((d) => c.append(modChip(d))); body.append(el('h3', null, '后续模块'), c); }
    const usedIn = steps.filter((s) => split(s.modules).includes(id));
    if (usedIn.length) {
      const c = el('div', 'chips');
      usedIn.forEach((s) => {
        const b = el('button', 'chip', `第 ${s.step} 步：${s.name}`);
        b.type = 'button';
        b.addEventListener('click', () => { closeDrawer(); showView('flow'); selectStep(s.step, true); });
        c.append(b);
      });
      body.append(el('h3', null, '出现在实验流程的'), c);
    }
    $('#drawer').hidden = false;
    document.body.style.overflow = 'hidden';
    tex(body);
    card.scrollTop = 0;
    card.focus();
    history.replaceState(null, '', `#m-${id}`);
  }
  function closeDrawer() {
    if ($('#drawer').hidden) return;
    $('#drawer').hidden = true;
    document.body.style.overflow = '';
    history.replaceState(null, '', `#${view}`);
    if (lastFocus && lastFocus.isConnected) lastFocus.focus();
  }
  $$('[data-close]').forEach((x) => x.addEventListener('click', closeDrawer));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });

  // ---------- references ----------
  const rstate = { q: '', prio: '', type: '' };
  function segButtons(box, options, key) {
    box.replaceChildren(...options.map(([v, label]) => {
      const b = el('button', null, label);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(rstate[key] === v));
      b.addEventListener('click', () => { rstate[key] = v; $$('button', box).forEach((x) => x.setAttribute('aria-pressed', String(x === b))); drawRefs(); });
      return b;
    }));
  }
  segButtons($('#rprio'), [['', '全部'], ['首读', '首读'], ['重要', '重要'], ['延伸', '延伸']], 'prio');
  segButtons($('#rtype'), [['', '全部类型'], ...[...new Set(D.readings.map((r) => r.type))].map((t) => [t, t])], 'type');
  $('#rq').addEventListener('input', (e) => { rstate.q = e.target.value.trim().toLowerCase(); drawRefs(); });
  function drawRefs() {
    let f = D.readings.filter((r) => (!rstate.prio || r.priority === rstate.prio) && (!rstate.type || r.type === rstate.type));
    if (rstate.q) f = f.filter((r) => norm(r.citation + r.short + r.modules + r.note).includes(norm(rstate.q)));
    f = [...f].sort((a, b) => PR[a.priority] - PR[b.priority] || (b.year || 0) - (a.year || 0));
    $('#rcount').textContent = `显示 ${f.length} 篇，共 ${D.readings.length} 篇`;
    $('#refs').replaceChildren(...f.map((r) => {
      const li = el('li');
      const c = el('div', 'cite');
      const a = el('a', null, r.citation); a.href = r.url; a.target = '_blank'; a.rel = 'noopener';
      c.append(a);
      const sub = el('div', 'sub');
      sub.append(el('span', `pr pr-${r.priority}`, r.priority));
      const chips = el('span', 'chips'); split(r.modules).forEach((m) => chips.append(modChip(m)));
      sub.append(chips, el('span', null, r.note));
      c.append(sub);
      li.append(el('span', 'yr', r.year ? String(r.year) : '—'), el('span', 'ty', r.type), c);
      return li;
    }));
    if (!f.length) $('#refs').append(el('li', 'count', '没有匹配的文献，换个关键词试试。'));
    tex($('#refs'));
  }

  function drawTimeline() {
    const box = $('#timeline');
    if (box.offsetParent === null) return;
    const W = box.clientWidth;
    const ms = D.readings.filter((r) => (r.type === '里程碑' || r.type === '理论提案') && r.year).sort((a, b) => a.year - b.year || a.id.localeCompare(b.id));
    const y0 = ms[0].year, y1 = ms[ms.length - 1].year;
    const ml = 14, mr = 14;
    const x = (y) => ml + ((y - y0 + 0.5) / (y1 - y0 + 1)) * (W - ml - mr);
    const by = new Map();
    ms.forEach((r) => { if (!by.has(r.year)) by.set(r.year, []); by.get(r.year).push(r); });
    const R = W < 560 ? 5.5 : 7.5, gap = 3;
    const maxN = Math.max(...[...by.values()].map((v) => v.length));
    const H = 14 + maxN * (2 * R + gap) + 34;
    const base = H - 30;
    const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': '里程碑论文时间线' });
    svg.append(svgEl('line', { x1: ml, x2: W - mr, y1: base, y2: base, stroke: 'var(--line)', 'stroke-width': '1' }));
    const step = W < 560 ? 5 : 2;
    for (let t = Math.ceil(y0 / step) * step; t <= y1; t += step) {
      svg.append(svgEl('line', { x1: x(t), x2: x(t), y1: base, y2: base + 5, stroke: 'var(--faint)' }));
      const tx = svgEl('text', { x: x(t), y: base + 20, 'text-anchor': 'middle', fill: 'var(--faint)', 'font-size': '12' });
      tx.textContent = String(t);
      svg.append(tx);
    }
    const tip = $('#tip');
    for (const [yr, list] of by) {
      list.forEach((r, i) => {
        const a = svgEl('a', { href: r.url, target: '_blank', rel: 'noopener' });
        const ph = M[split(r.modules)[0]].phase;
        const c = svgEl('circle', {
          cx: x(yr), cy: base - R - 4 - i * (2 * R + gap), r: R,
          fill: r.type === '里程碑' ? color(ph) : 'var(--surface)', stroke: color(ph), 'stroke-width': '2',
        });
        c.style.cursor = 'pointer';
        const show = (ev) => {
          tip.replaceChildren(el('div', 'ty', `${r.year}，${r.type}，模块 ${r.modules}`), el('div', null, r.short), el('div', 'rn', r.note));
          tex(tip);
          tip.style.opacity = '1';
          const pt = ev.touches ? ev.touches[0] : ev;
          const tw = 300;
          tip.style.left = Math.max(8, Math.min(pt.clientX - tw / 2, innerWidth - tw - 8)) + 'px';
          tip.style.top = Math.max(8, pt.clientY - 96) + 'px';
        };
        c.addEventListener('mousemove', show);
        c.addEventListener('mouseleave', () => { tip.style.opacity = '0'; });
        a.append(c);
        svg.append(a);
      });
    }
    box.replaceChildren(svg);
  }

  // ---------- terms ----------
  $('#gq').addEventListener('input', drawTerms);
  function drawTerms() {
    const q = $('#gq').value.trim().toLowerCase();
    const f = D.glossary.filter((g) => !q || norm(g.term + g.en + g.explain + g.module).includes(norm(q)))
      .sort((a, b) => M[a.module].order - M[b.module].order);
    $('#gcount').textContent = `显示 ${f.length} 个，共 ${D.glossary.length} 个`;
    $('#terms').replaceChildren(...f.map((g) => {
      const d = el('div', 'term');
      const dt = el('dt');
      dt.append(el('span', null, g.term), el('small', null, g.en));
      const dd = el('dd', null, g.explain);
      const c = el('div', 'chips'); c.append(modChip(g.module));
      d.append(dt, dd, c);
      return d;
    }));
    if (!f.length) $('#terms').append(el('p', 'count', '没有匹配的术语。'));
    tex($('#terms'));
  }

  // ---------- views & routing ----------
  let view = 'flow';
  function showView(v) {
    view = v;
    $$('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.view === v)));
    $$('.view').forEach((s) => { s.hidden = s.dataset.view !== v; });
    history.replaceState(null, '', `#${v}`);
    const top = $('.tabs').offsetTop;
    if (scrollY > top) scrollTo({ top });
    requestAnimationFrame(() => {
      if (v === 'flow') drawConnectors();
      if (v === 'tree') drawTreeLinks();
      if (v === 'read') drawTimeline();
    });
  }
  $$('.tabs button').forEach((b) => b.addEventListener('click', () => showView(b.dataset.view)));

  let rt;
  addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => {
      placeSteps();
      if (view === 'flow') drawConnectors();
      if (view === 'tree') drawTreeLinks();
      if (view === 'read') drawTimeline();
    }, 120);
  });

  buildSteps();
  buildTree();
  drawRefs();
  drawTerms();

  const h = location.hash.slice(1);
  let startStep = 1;
  if (/^s-\d+$/.test(h)) startStep = Math.min(steps.length, Math.max(1, Number(h.slice(2))));
  if (['tree', 'read', 'terms'].includes(h)) showView(h); else showView('flow');
  selectStep(startStep, false);
  if (h.startsWith('m-') && M[h.slice(2)]) openModule(h.slice(2));

  const start = () => { if (view === 'flow') { const g = drawConnectors(); setTimeout(() => carryAtom(g), 350); } };
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(start); else addEventListener('load', start);
})();
