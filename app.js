/* Timewise – a task planner for days, weeks, months and years.
   Plain JavaScript, no dependencies. Data lives in localStorage. */
(() => {
'use strict';

/* ---------- constants ---------- */
const KEY = 'timewise.v1';
const WEIGHT = { major: 3, minor: 1 };   // a major task counts 3x in the weighted score
const MAX_MAJOR = 3;                      // soft limit shown as a warning
const HEAVY_DAY = 6;                      // a day with this many tasks or more is "heavy"
const REASONS = [
  ['time', 'Ran out of time'],
  ['estimate', 'Underestimated the effort'],
  ['emergency', 'Unexpected event / emergency'],
  ['health', 'Low energy or health'],
  ['motivation', 'Procrastination / low motivation'],
  ['distraction', 'Got distracted'],
  ['blocked', 'Waiting on someone / something'],
  ['priority', 'No longer a priority'],
  ['other', 'Other']
];
const TIPS = {
  time: 'Plan fewer tasks per day and block fixed time for the important ones.',
  estimate: 'Add about 30% buffer to your estimates and split big tasks into smaller steps.',
  emergency: 'Leave one empty slot each day for surprises.',
  health: 'Protect your sleep, and put demanding tasks in your high-energy hours.',
  motivation: 'Make the first step tiny (5 minutes) and attach the task to a fixed time.',
  distraction: 'Try one focus block with the phone out of reach before checking messages.',
  blocked: 'Identify dependencies at planning time and ask for what you need a day ahead.',
  priority: 'Dropping irrelevant tasks is healthy. Try removing them earlier, at planning time.',
  other: 'Add a short note whenever you miss a task so patterns become visible.'
};
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

/* ---------- tiny helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const today = () => ymd(new Date());
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
const addMonths = (s, n) => {
  const d = parse(s), day = d.getDate();
  d.setDate(1); d.setMonth(d.getMonth() + n);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return ymd(d);
};
const daysInMonth = ym => new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0).getDate();
const fmt = (s, o) => new Intl.DateTimeFormat('en-GB', o).format(parse(s));
const uid = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'id' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
const pct = v => v == null ? '–' : Math.round(v * 100) + '%';
const reasonLabel = id => { const r = REASONS.find(x => x[0] === id); return r ? r[1] : 'No reason given'; };
const toast = msg => { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2600); };

/* ---------- state ---------- */
const DEFAULTS = { threshold: 70, weekStart: 1, theme: 'auto' };
let state = load();
const ui = { view: 'day', cursor: today() };
const S = () => state.settings;

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (raw && Array.isArray(raw.tasks)) return { tasks: raw.tasks, settings: { ...DEFAULTS, ...(raw.settings || {}) } };
  } catch (e) { /* ignore */ }
  return { tasks: [], settings: { ...DEFAULTS } };
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch (e) { toast('Could not save. Browser storage is full or blocked.'); }
}
const byId = id => state.tasks.find(t => t.id === id);

/* ---------- date anchoring: every task has a scope + an anchor date ---------- */
const weekStart = s => { const off = (parse(s).getDay() - S().weekStart + 7) % 7; return addDays(s, -off); };
const anchor = (scope, s) => scope === 'week' ? weekStart(s) : scope === 'month' ? s.slice(0, 7) + '-01' : scope === 'year' ? s.slice(0, 4) + '-01-01' : s;
function periodEnd(t) {
  if (t.scope === 'week') return addDays(t.date, 6);
  if (t.scope === 'month') return t.date.slice(0, 7) + '-' + pad(daysInMonth(t.date.slice(0, 7)));
  if (t.scope === 'year') return t.date.slice(0, 4) + '-12-31';
  return t.date;
}
const isUnreviewed = t => t.status === 'pending' && periodEnd(t) < today();

/* ---------- stats ---------- */
function stat(list, now) {
  let done = 0, missed = 0, unrev = 0, pend = 0, wDone = 0, wTot = 0;
  for (const t of list) {
    const w = WEIGHT[t.priority] || 1;
    if (t.status === 'done') { done++; wDone += w; wTot += w; }
    else if (t.status === 'missed') { missed++; wTot += w; }
    else if (periodEnd(t) < now) { unrev++; wTot += w; }   // never marked = counted as not done
    else pend++;
  }
  const due = done + missed + unrev;
  return { done, missed, unrev, pend, due, total: list.length, rate: due ? done / due : null, wrate: wTot ? wDone / wTot : null };
}

function monthReport(ym, withPrev = true) {
  const now = today(), dim = daysInMonth(ym);
  const tasks = state.tasks.filter(t => t.scope === 'day' && t.date.slice(0, 7) === ym);
  const by = {};
  tasks.forEach(t => (by[t.date] = by[t.date] || []).push(t));
  const days = [];
  for (let i = 1; i <= dim; i++) {
    const date = `${ym}-${pad(i)}`, list = by[date] || [], s = stat(list, now);
    const settled = date < now || (date === now && list.length > 0 && s.pend === 0);
    days.push({ date, list, ...s, settled, good: s.due > 0 && s.rate * 100 >= S().threshold - 1e-9 });
  }
  const elapsed = days.filter(d => d.date <= now);
  const planned = elapsed.filter(d => d.list.length).length;
  const planning = elapsed.length ? planned / elapsed.length : null;
  const active = days.filter(d => d.settled && d.due > 0);
  const follow = active.length ? active.filter(d => d.good).length / active.length : null;
  const score = planning == null || follow == null ? null : Math.round(100 * (0.4 * planning + 0.6 * follow));

  let cur = 0, best = 0;
  for (const d of days) {
    if (!d.settled) continue;
    if (d.good) { cur++; best = Math.max(best, cur); } else cur = 0;
  }

  const weekdays = DOW.map(() => ({ done: 0, due: 0 }));
  elapsed.forEach(d => { const w = parse(d.date).getDay(); weekdays[w].done += d.done; weekdays[w].due += d.due; });

  const weekMap = {};
  tasks.forEach(t => { const k = weekStart(t.date); (weekMap[k] = weekMap[k] || []).push(t); });
  const weeks = Object.keys(weekMap).sort().map(k => ({ start: k, ...stat(weekMap[k], now) }));

  const reasons = {};
  tasks.filter(t => t.status === 'missed').forEach(t => { const k = t.reason || 'none'; reasons[k] = (reasons[k] || 0) + 1; });

  const agg = ds => { const r = { done: 0, due: 0 }; ds.forEach(d => { r.done += d.done; r.due += d.due; }); return { ...r, rate: r.due ? r.done / r.due : null, n: ds.length }; };
  const heavy = agg(days.filter(d => d.list.length >= HEAVY_DAY && d.due > 0));
  const normal = agg(days.filter(d => d.list.length < HEAVY_DAY && d.due > 0));

  const goals = state.tasks.filter(t => t.scope !== 'day' && periodEnd(t).slice(0, 7) === ym);
  const goalStat = stat(goals, now);

  let prev = null;
  if (withPrev) prev = monthReport(addMonths(ym + '-01', -1).slice(0, 7), false);

  return {
    ym, days, tasks, all: stat(tasks, now),
    major: stat(tasks.filter(t => t.priority === 'major'), now),
    minor: stat(tasks.filter(t => t.priority === 'minor'), now),
    planned, elapsed: elapsed.length, planning, active: active.length, follow, score,
    streak: cur, bestStreak: best, weekdays, weeks, reasons, heavy, normal,
    goals, goalStat, late: tasks.filter(t => t.late).length, carried: tasks.filter(t => t.carried > 0).length,
    chronic: tasks.filter(t => t.carried >= 2).length, prev
  };
}

function insights(r) {
  const out = [];
  if (!r.tasks.length) return out;
  if (r.planning != null && r.planning < 0.7)
    out.push(`<b>Planning gap.</b> You set daily tasks on ${r.planned} of ${r.elapsed} days. Days without a plan are where consistency leaks. Even one major task a day keeps the habit alive.`);
  else if (r.planning != null && r.planning >= 0.9)
    out.push(`<b>Great planning habit.</b> You set goals on ${r.planned} of ${r.elapsed} days.`);
  if (r.all.rate != null && r.all.rate >= 0.8 && r.follow != null && r.follow >= 0.8)
    out.push('<b>Strong follow-through.</b> You complete most of what you plan. If it feels easy, consider raising the bar on major tasks.');
  if (r.all.rate != null && r.all.rate < 0.5)
    out.push('<b>Plan is bigger than your capacity.</b> Less than half got done. Try planning about 30% fewer tasks next week and see whether the rate rises.');
  if (r.major.rate != null && r.minor.rate != null && r.major.due >= 3 && r.minor.due >= 3 && r.major.rate + 0.15 < r.minor.rate)
    out.push(`<b>Important tasks slip more.</b> Major tasks are done ${pct(r.major.rate)} of the time versus ${pct(r.minor.rate)} for minor ones. Do the major task first, before easy wins.`);
  if (r.heavy.n >= 2 && r.normal.n >= 2 && r.heavy.rate != null && r.normal.rate != null && r.heavy.rate + 0.1 < r.normal.rate)
    out.push(`<b>Overloaded days hurt.</b> On days with ${HEAVY_DAY}+ tasks you finished ${pct(r.heavy.rate)}, versus ${pct(r.normal.rate)} on lighter days.`);
  const wd = r.weekdays.map((w, i) => ({ i, rate: w.due >= 3 ? w.done / w.due : null })).filter(x => x.rate != null);
  if (wd.length >= 3) {
    const lo = wd.reduce((a, b) => b.rate < a.rate ? b : a), hi = wd.reduce((a, b) => b.rate > a.rate ? b : a);
    if (hi.rate - lo.rate >= 0.2) out.push(`<b>Weekday pattern.</b> ${DOW[hi.i]} is your strongest day (${pct(hi.rate)}) and ${DOW[lo.i]} your weakest (${pct(lo.rate)}). Plan lighter on ${DOW[lo.i]}.`);
  }
  const rs = Object.entries(r.reasons).filter(([k]) => k !== 'none').sort((a, b) => b[1] - a[1]);
  if (rs.length) out.push(`<b>Most common reason for misses:</b> ${esc(reasonLabel(rs[0][0]))} (${rs[0][1]}×). ${esc(TIPS[rs[0][0]] || '')}`);
  if (r.all.unrev > 0)
    out.push(`<b>${r.all.unrev} task${r.all.unrev > 1 ? 's were' : ' was'} never marked.</b> They count as not done. A 2-minute review each evening keeps this report honest.`);
  if (r.chronic > 0)
    out.push(`<b>Chronic carry-over.</b> ${r.chronic} task${r.chronic > 1 ? 's have' : ' has'} been pushed forward 2+ times. Break ${r.chronic > 1 ? 'them' : 'it'} into smaller steps, schedule a specific time, or drop ${r.chronic > 1 ? 'them' : 'it'}.`);
  if (r.late > 0)
    out.push(`${r.late} task${r.late > 1 ? 's were' : ' was'} ticked off after the day ended. That's fine for catching up, but they are flagged as late.`);
  if (r.bestStreak >= 3) out.push(`<b>Best streak:</b> ${r.bestStreak} good days in a row (a good day is ${S().threshold}%+ done).`);
  if (r.prev && r.prev.score != null && r.score != null) {
    const d = r.score - r.prev.score;
    if (Math.abs(d) >= 3) out.push(`<b>Versus last month:</b> your consistency score ${d > 0 ? 'rose' : 'fell'} by ${Math.abs(d)} points.`);
  }
  return out;
}

/* ---------- task rendering ---------- */
const rank = { pending: 0, done: 1, missed: 2 };
const sortTasks = l => l.slice().sort((a, b) =>
  (rank[a.status] - rank[b.status]) || ((a.priority === 'major' ? 0 : 1) - (b.priority === 'major' ? 0 : 1)) ||
  (a.time || '99:99').localeCompare(b.time || '99:99') || (a.created || 0) - (b.created || 0));

function taskRow(t) {
  const over = isUnreviewed(t);
  return `<li class="task ${t.status} ${t.priority}${over ? ' overdue' : ''}" data-id="${esc(t.id)}">
    <div class="mark">
      <button class="ck" data-act="done" title="${t.status === 'done' ? 'Undo' : 'Mark done'}" aria-label="Mark done">✓</button>
      <button class="ck x" data-act="miss" title="Not done" aria-label="Mark not done">✗</button>
    </div>
    <div class="body">
      <div class="title">${esc(t.title)}</div>
      <div class="meta">
        <span class="tag ${t.priority}">${t.priority}</span>
        ${t.time ? `<span>🕒 ${esc(t.time)}</span>` : ''}
        ${t.scope !== 'day' ? `<span>${t.scope}</span>` : ''}
        ${t.carried ? `<span class="tag warn">carried ×${t.carried}</span>` : ''}
        ${t.late && t.status === 'done' ? '<span class="tag warn">done late</span>' : ''}
        ${over ? '<span class="tag warn">needs review</span>' : ''}
        ${t.series ? '<span title="Repeating task">↻</span>' : ''}
      </div>
      ${t.status === 'missed' ? `<div class="why">Why: ${esc(reasonLabel(t.reason))}${t.reasonNote ? ' – ' + esc(t.reasonNote) : ''}</div>` : ''}
      ${t.notes ? `<div class="note">${esc(t.notes)}</div>` : ''}
    </div>
    <div class="acts">
      ${t.status !== 'pending' ? '<button data-act="reset" title="Reset to pending" aria-label="Reset">↺</button>' : ''}
      <button data-act="edit" title="Edit" aria-label="Edit">✎</button>
      <button data-act="del" title="Delete" aria-label="Delete">🗑</button>
    </div></li>`;
}
const taskList = l => `<ul class="tasks">${l.map(taskRow).join('') || '<li class="empty">Nothing here yet.</li>'}</ul>`;

function goalsPanel(scope, title) {
  const a = anchor(scope, ui.cursor);
  const list = sortTasks(state.tasks.filter(t => t.scope === scope && t.date === a));
  const done = list.filter(t => t.status === 'done').length;
  return `<section class="panel compact"><header><h3>${title}</h3><span class="muted">${done}/${list.length}</span>
    <button class="btn sm" data-act="add" data-scope="${scope}">+ Add</button></header>
    <ul class="tasks">${list.map(taskRow).join('') || `<li class="empty">No ${scope} goals set.</li>`}</ul></section>`;
}

function progressBlock(list) {
  const s = stat(list, today());
  const p = list.length ? Math.round(100 * s.done / list.length) : 0;
  return `<div class="progress" aria-label="${p}% done"><i style="width:${p}%"></i></div>
    <div class="summary"><span><b>${s.done}</b> done</span><span><b>${s.missed + s.unrev}</b> not done</span><span><b>${s.pend}</b> to do</span></div>`;
}

/* ---------- views ---------- */
function viewDay() {
  const d = ui.cursor;
  const list = sortTasks(state.tasks.filter(t => t.scope === 'day' && t.date === d));
  const majors = list.filter(t => t.priority === 'major').length;
  const warns = [];
  if (majors > MAX_MAJOR) warns.push(`You have ${majors} major tasks. More than ${MAX_MAJOR} usually means some are not really major.`);
  if (list.length >= HEAVY_DAY) warns.push(`${list.length} tasks is a heavy day. Overloaded days tend to finish at a lower rate.`);
  return `<div class="stack">
    <section class="panel">
      <form class="quick" id="quick" autocomplete="off">
        <input name="title" placeholder="Add a task for this day and press Enter…" maxlength="160" required aria-label="Task title">
        <select name="priority" aria-label="Importance"><option value="minor">Minor</option><option value="major">Major</option></select>
        <input type="time" name="time" aria-label="Time">
        <button class="btn primary">Add</button>
      </form>
      ${list.length ? progressBlock(list) : ''}
      ${warns.map(w => `<div class="warn">⚠ ${esc(w)}</div>`).join('')}
    </section>
    <section class="panel"><header><h3>Tasks</h3></header>${taskList(list)}</section>
    <div class="grid2">
      ${goalsPanel('week', 'This week’s goals')}
      ${goalsPanel('month', 'This month’s goals')}
    </div>
    ${goalsPanel('year', 'This year’s goals')}
  </div>`;
}

function viewWeek() {
  const start = weekStart(ui.cursor), now = today();
  let cards = '';
  for (let i = 0; i < 7; i++) {
    const d = addDays(start, i);
    const list = sortTasks(state.tasks.filter(t => t.scope === 'day' && t.date === d));
    const s = stat(list, now), p = list.length ? Math.round(100 * s.done / list.length) : 0;
    cards += `<section class="daycard compact${d === now ? ' today' : ''}">
      <button class="dayhead" data-act="go" data-view="day" data-date="${d}"><span>${fmt(d, { weekday: 'short', day: 'numeric', month: 'short' })}</span><span class="muted">${s.done}/${list.length}</span></button>
      <div class="progress"><i style="width:${p}%"></i></div>
      <ul class="tasks">${list.map(taskRow).join('') || '<li class="empty">–</li>'}</ul>
      <button class="btn sm" style="margin-top:8px" data-act="add" data-scope="day" data-date="${d}">+ Add</button>
    </section>`;
  }
  return `<div class="stack">${goalsPanel('week', 'Weekly goals')}<div class="weekgrid">${cards}</div></div>`;
}

function weekdayHeader() { return Array.from({ length: 7 }, (_, i) => `<div class="dow">${DOW[(S().weekStart + i) % 7]}</div>`).join(''); }

function calendarHTML(ym, mini) {
  const now = today(), dim = daysInMonth(ym), first = ym + '-01';
  const lead = (parse(first).getDay() - S().weekStart + 7) % 7;
  let cells = '<div class="cell blank"></div>'.repeat(lead);
  for (let i = 1; i <= dim; i++) {
    const d = `${ym}-${pad(i)}`;
    const list = state.tasks.filter(t => t.scope === 'day' && t.date === d), s = stat(list, now);
    const style = s.rate != null ? `background:hsl(${Math.round(s.rate * 120)} 60% 45% / .35)` : '';
    cells += `<button class="cell${d === now ? ' today' : ''}" style="${style}" data-act="go" data-view="day" data-date="${d}" title="${list.length ? s.done + ' of ' + list.length + ' done' : 'No tasks'}">
      <span class="n">${i}</span>${list.length ? `<small>${s.done}/${list.length}</small>` : '<small>&nbsp;</small>'}</button>`;
  }
  return `<div class="cal${mini ? ' mini' : ''}">${weekdayHeader()}${cells}</div>
    <div class="legend"><span>Missed</span><i style="background:hsl(0 60% 45% / .35)"></i><i style="background:hsl(60 60% 45% / .35)"></i><i style="background:hsl(120 60% 45% / .35)"></i><span>All done</span></div>`;
}
function viewMonth() {
  const ym = ui.cursor.slice(0, 7);
  return `<div class="stack"><section class="panel">${calendarHTML(ym)}</section>${goalsPanel('month', 'Monthly goals')}</div>`;
}

function viewYear() {
  const y = ui.cursor.slice(0, 4), nowYm = today().slice(0, 7);
  let cards = '';
  for (let m = 1; m <= 12; m++) {
    const ym = `${y}-${pad(m)}`, r = monthReport(ym, false);
    const p = r.all.rate == null ? 0 : Math.round(r.all.rate * 100);
    cards += `<button class="mcard${ym === nowYm ? ' current' : ''}" data-act="go" data-view="report" data-date="${ym}-01">
      <b>${fmt(ym + '-01', { month: 'long' })}</b>
      <div class="progress"><i style="width:${p}%"></i></div>
      <span class="muted">${r.tasks.length ? `${r.all.done}/${r.tasks.length} done · ${pct(r.all.rate)}` : 'No tasks'}</span>
      <span class="muted">Consistency: <b style="color:var(--ink)">${r.score == null ? '–' : r.score}</b></span>
    </button>`;
  }
  return `<div class="stack">${goalsPanel('year', 'Yearly goals')}<section class="panel"><header><h3>${y} at a glance</h3></header><div class="yeargrid">${cards}</div></section></div>`;
}

function bar(p, label, right, bad) {
  return `<div class="bar${bad ? ' bad' : ''}"><span>${esc(label)}</span><div class="track"><i style="width:${Math.round((p || 0) * 100)}%"></i></div><span class="br">${right}</span></div>`;
}
function kpi(label, value, desc, hero, extra) {
  return `<div class="kpi${hero ? ' hero' : ''}"><div class="l">${label}</div><div class="v">${value}</div><div class="d">${desc}</div>${extra || ''}</div>`;
}
function delta(cur, prev, suffix) {
  if (cur == null || prev == null) return '';
  const d = Math.round(cur - prev);
  if (!d) return '<div class="d">same as last month</div>';
  return `<div class="d delta ${d > 0 ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'} ${Math.abs(d)}${suffix || ''} vs last month</div>`;
}

function viewReport() {
  const ym = ui.cursor.slice(0, 7), r = monthReport(ym);
  const title = fmt(ym + '-01', { month: 'long', year: 'numeric' });
  if (!r.tasks.length && !r.goals.length) {
    return `<section class="panel"><h3>No daily tasks in ${title}</h3>
      <p class="muted">Plan some tasks and tick them off during the month, and this report will fill itself in.</p>
      ${state.tasks.length === 0 ? '<button class="btn" data-act="sample">Load sample data to see how it works</button>' : ''}</section>`;
  }
  const prev = r.prev;
  const ins = insights(r);
  const weekBars = r.weeks.map(w => bar(w.rate, fmt(w.start, { day: 'numeric', month: 'short' }), `${w.done}/${w.due || w.total}`)).join('') || '<p class="muted">No data.</p>';
  const dowOrder = Array.from({ length: 7 }, (_, i) => (S().weekStart + i) % 7);
  const wdBars = dowOrder.map(i => { const w = r.weekdays[i]; return bar(w.due ? w.done / w.due : 0, DOW[i], w.due ? pct(w.done / w.due) : '–'); }).join('');
  const reasonEntries = Object.entries(r.reasons).sort((a, b) => b[1] - a[1]);
  const maxR = reasonEntries.length ? reasonEntries[0][1] : 1;
  const reasonBars = reasonEntries.map(([k, n]) => bar(n / maxR, k === 'none' ? 'No reason given' : reasonLabel(k), n + '×', true)).join('')
    + (r.all.unrev ? bar(1, 'Never marked', r.all.unrev + '×', true) : '') || '<p class="muted">Nothing missed. 🎉</p>';
  return `<div class="stack">
    <div class="reportbar"><button class="btn" data-act="csv">Export CSV</button><button class="btn" data-act="print">Print / PDF</button></div>
    <div class="kpis">
      ${kpi('Consistency score', r.score == null ? '–' : r.score + '/100', '40% planning habit + 60% follow-through', true, delta(r.score, prev && prev.score, ' pts'))}
      ${kpi('Completion rate', pct(r.all.rate), `${r.all.done} of ${r.all.due} due tasks`, false, delta(r.all.rate == null ? null : r.all.rate * 100, prev && prev.all.rate != null ? prev.all.rate * 100 : null, '%'))}
      ${kpi('Weighted rate', pct(r.all.wrate), 'Major tasks count 3×')}
      ${kpi('Planning consistency', pct(r.planning), `Goals set on ${r.planned} of ${r.elapsed} days`)}
      ${kpi('Follow-through', pct(r.follow), `${r.active ? Math.round((r.follow || 0) * r.active) : 0} of ${r.active} planned days were ${S().threshold}%+ done`)}
      ${kpi('Streak', r.streak + ' day' + (r.streak === 1 ? '' : 's'), `Best this month: ${r.bestStreak}`)}
    </div>
    <section class="panel"><header><h3>What the data says</h3></header>
      ${ins.length ? `<ul class="insights">${ins.map(i => `<li>${i}</li>`).join('')}</ul>` : '<p class="muted">Not enough data yet for insights.</p>'}</section>
    <section class="panel"><header><h3>Daily heatmap</h3></header>${calendarHTML(ym, true)}</section>
    <div class="grid2">
      <section class="panel"><header><h3>Major vs minor</h3></header>
        ${bar(r.major.rate || 0, 'Major', `${pct(r.major.rate)} (${r.major.done}/${r.major.due})`)}
        ${bar(r.minor.rate || 0, 'Minor', `${pct(r.minor.rate)} (${r.minor.done}/${r.minor.due})`)}</section>
      <section class="panel"><header><h3>By week</h3></header>${weekBars}</section>
      <section class="panel"><header><h3>By weekday</h3></header>${wdBars}</section>
      <section class="panel"><header><h3>Why tasks were missed</h3></header>${reasonBars}</section>
    </div>
    <section class="panel"><header><h3>Weekly & monthly goals ending in ${title}</h3><span class="muted">${r.goalStat.done}/${r.goals.length} achieved</span></header>
      ${r.goals.length ? taskList(sortTasks(r.goals)) : '<p class="muted">No weekly or monthly goals set for this month.</p>'}</section>
    <p class="muted" style="font-size:.8rem">How it's measured: only tasks due up to today count. Tasks never marked count as not done. A planned day is "good" at ${S().threshold}%+ done. Streaks break on any day without a good result, including days with no plan.</p>
  </div>`;
}

/* ---------- render ---------- */
function stepLabel() {
  const c = ui.cursor;
  if (ui.view === 'day') return fmt(c, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  if (ui.view === 'week') { const s = weekStart(c), e = addDays(s, 6); return `${fmt(s, { day: 'numeric', month: 'short' })} – ${fmt(e, { day: 'numeric', month: 'short', year: 'numeric' })}`; }
  if (ui.view === 'month' || ui.view === 'report') return fmt(c, { month: 'long', year: 'numeric' });
  return c.slice(0, 4);
}
function render() {
  const theme = S().theme;
  if (theme === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = theme;
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.view === ui.view));
  $('#label').textContent = stepLabel() + (ui.view === 'report' ? ' – Report' : '');
  const un = state.tasks.filter(isUnreviewed);
  $('#banner').innerHTML = un.length ? `<div class="banner"><span>⚠ <b>${un.length}</b> past task${un.length > 1 ? 's were' : ' was'} never marked done or not done. Marking them keeps your report honest.</span><button class="btn sm" data-act="review">Review oldest</button></div>` : '';
  const views = { day: viewDay, week: viewWeek, month: viewMonth, year: viewYear, report: viewReport };
  $('#view').innerHTML = views[ui.view]();
}
function commit() { save(); render(); }

/* ---------- dialogs ---------- */
function openDialog(d) { if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', ''); }
function closeDialog(d) { if (d.close) d.close(); else d.removeAttribute('open'); }

function recurDates(start, rule) {
  const out = [];
  if (rule === 'daily') for (let i = 0; i < 60; i++) out.push(addDays(start, i));
  else if (rule === 'weekdays') { for (let i = 0; i < 84; i++) { const d = addDays(start, i), w = parse(d).getDay(); if (w !== 0 && w !== 6) out.push(d); } }
  else if (rule === 'weekly') for (let i = 0; i < 26; i++) out.push(addDays(start, i * 7));
  else if (rule === 'monthly') for (let i = 0; i < 12; i++) out.push(addMonths(start, i));
  else out.push(start);
  return out;
}

function syncTaskForm() {
  const f = $('#taskForm').elements, isDay = f.scope.value === 'day', editing = !!f.taskId.value;
  $('#dayOnly').hidden = !isDay;
  f.repeat.disabled = !isDay || editing;
  f.repeat.parentElement.hidden = !isDay || editing;
}
function openTask(task, defaults = {}) {
  const form = $('#taskForm'); form.reset();
  const f = form.elements;
  $('#taskDlgTitle').textContent = task ? 'Edit task' : 'New task';
  f.taskId.value = task ? task.id : '';
  f.ttl.value = task ? task.title : '';
  f.scope.value = task ? task.scope : (defaults.scope || (ui.view === 'week' ? 'day' : ui.view === 'month' ? 'month' : ui.view === 'year' ? 'year' : 'day'));
  f.date.value = task ? task.date : (defaults.date || (ui.view === 'day' ? ui.cursor : (['month', 'year', 'week'].includes(ui.view) ? ui.cursor : today())));
  f.time.value = task ? (task.time || '') : '';
  f.priority.value = task ? task.priority : 'minor';
  f.notes.value = task ? (task.notes || '') : '';
  f.repeat.value = 'none';
  syncTaskForm();
  openDialog($('#taskDialog'));
  setTimeout(() => f.ttl.focus(), 30);
}

function openMiss(id) {
  const t = byId(id); if (!t) return;
  const f = $('#missForm').elements;
  $('#missForm').reset();
  f.reason.innerHTML = '<option value="">– choose a reason –</option>' + REASONS.map(r => `<option value="${r[0]}">${esc(r[1])}</option>`).join('');
  f.missId.value = id;
  $('#missTitle').textContent = t.title;
  f.reason.value = t.reason || '';
  f.note.value = t.reasonNote || '';
  const now = today();
  const next = t.scope === 'day' ? (t.date < now ? now : addDays(t.date, 1)) : t.scope === 'week' ? addDays(t.date, 7) : t.scope === 'month' ? addMonths(t.date, 1) : addMonths(t.date, 12);
  f.carryDate.value = next;
  openDialog($('#missDialog'));
}

function openDelete(id) {
  const t = byId(id); if (!t) return;
  $('#delText').textContent = `“${t.title}”` + (t.series ? ' is part of a repeating series.' : '');
  const m = $('#delMenu');
  m.innerHTML = `<button type="button" class="btn" data-close>Cancel</button>` +
    (t.series ? `<button type="button" class="btn danger" data-delete="future" data-id="${esc(id)}">This and later unfinished</button>` : '') +
    `<button type="button" class="btn danger" data-delete="one" data-id="${esc(id)}">${t.series ? 'Only this one' : 'Delete'}</button>`;
  openDialog($('#delDialog'));
}

/* ---------- actions ---------- */
function setDone(t) {
  if (t.status === 'done') { t.status = 'pending'; delete t.resolvedAt; delete t.late; return; }
  t.status = 'done'; t.resolvedAt = Date.now(); t.late = today() > periodEnd(t);
  delete t.reason; delete t.reasonNote;
}
function reviewOldest() {
  const un = state.tasks.filter(isUnreviewed).sort((a, b) => a.date.localeCompare(b.date))[0];
  if (!un) return;
  ui.view = un.scope === 'day' ? 'day' : un.scope; ui.cursor = un.date; render();
}
function stepCursor(dir) {
  const c = ui.cursor;
  if (ui.view === 'day') ui.cursor = addDays(c, dir);
  else if (ui.view === 'week') ui.cursor = addDays(c, 7 * dir);
  else if (ui.view === 'month' || ui.view === 'report') ui.cursor = addMonths(c.slice(0, 7) + '-01', dir);
  else ui.cursor = addMonths(c.slice(0, 4) + '-01-01', 12 * dir);
  render();
}

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportJSON() {
  download(`timewise-backup-${today()}.json`, JSON.stringify({ app: 'timewise', version: 1, exported: new Date().toISOString(), settings: state.settings, tasks: state.tasks }, null, 2), 'application/json');
  toast('Backup downloaded');
}
function csvCell(v) { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
function exportCSV() {
  const ym = ui.cursor.slice(0, 7);
  const rows = [['date', 'scope', 'title', 'importance', 'status', 'reason', 'details', 'carried', 'done_late']];
  state.tasks.filter(t => t.date.slice(0, 7) === ym).sort((a, b) => a.date.localeCompare(b.date)).forEach(t =>
    rows.push([t.date, t.scope, t.title, t.priority, isUnreviewed(t) ? 'never marked' : t.status, t.status === 'missed' ? reasonLabel(t.reason) : '', t.reasonNote || '', t.carried || 0, t.late ? 'yes' : '']));
  // prefix risky leading characters so spreadsheets don't run them as formulas
  download(`timewise-${ym}.csv`, rows.map(r => r.map(c => csvCell(/^[=+\-@]/.test(String(c)) ? "'" + c : c)).join(',')).join('\n'), 'text/csv');
}
function importJSON(file) {
  const rd = new FileReader();
  rd.onload = () => {
    try {
      const data = JSON.parse(rd.result);
      const list = Array.isArray(data) ? data : data.tasks;
      if (!Array.isArray(list)) throw new Error('bad format');
      const have = new Set(state.tasks.map(t => t.id));
      const clean = [];
      for (const t of list) {
        if (!t || typeof t.title !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(t.date || '')) continue;
        const scope = ['day', 'week', 'month', 'year'].includes(t.scope) ? t.scope : 'day';
        if (t.id && have.has(t.id)) continue;
        clean.push({
          id: t.id ? String(t.id) : uid(), title: t.title.slice(0, 160), scope, date: anchor(scope, t.date),
          time: /^\d{2}:\d{2}$/.test(t.time || '') ? t.time : '', priority: t.priority === 'major' ? 'major' : 'minor',
          status: ['pending', 'done', 'missed'].includes(t.status) ? t.status : 'pending',
          reason: REASONS.some(r => r[0] === t.reason) ? t.reason : '', reasonNote: String(t.reasonNote || '').slice(0, 600),
          notes: String(t.notes || '').slice(0, 600), created: +t.created || Date.now(), carried: +t.carried || 0,
          late: !!t.late, series: t.series ? String(t.series) : undefined
        });
      }
      if (!clean.length) { toast('No new tasks found in that file'); return; }
      if (!confirm(`Import ${clean.length} task(s) and merge them with your current data?`)) return;
      state.tasks.push(...clean); commit(); toast(`Imported ${clean.length} tasks`);
    } catch (e) { toast('That file could not be read as a Timewise backup'); }
  };
  rd.readAsText(file);
}

function loadSample() {
  const titles = ['Plan the day', 'Workout', 'Study session', 'Deep work block', 'Reply to emails', 'Read 20 pages', 'Clean the desk', 'Call family', 'Grocery shopping', 'Review budget', 'Write journal', 'Learn something new'];
  const now = today(); const rnd = (a) => a[Math.floor(Math.random() * a.length)];
  for (let i = 40; i >= 0; i--) {
    const d = addDays(now, -i);
    if (Math.random() < 0.15 && i > 0) continue;
    const n = 2 + Math.floor(Math.random() * 5);
    const rate = parse(d).getDay() === 5 ? 0.5 : 0.75;
    for (let k = 0; k < n; k++) {
      const t = { id: uid(), title: rnd(titles), scope: 'day', date: d, time: '', priority: Math.random() < 0.35 ? 'major' : 'minor', status: 'pending', created: Date.now() + k, carried: 0 };
      if (d < now || (d === now && Math.random() < 0.5)) {
        if (Math.random() < rate) { t.status = 'done'; t.resolvedAt = Date.now(); }
        else if (Math.random() < 0.85 || d === now) { t.status = 'missed'; t.reason = rnd(REASONS)[0]; }
      }
      state.tasks.push(t);
    }
  }
  const ym = now.slice(0, 7) + '-01';
  state.tasks.push({ id: uid(), title: 'Finish the main project milestone', scope: 'month', date: ym, time: '', priority: 'major', status: 'pending', created: Date.now(), carried: 0 });
  state.tasks.push({ id: uid(), title: 'Run a 10 km race', scope: 'year', date: anchor('year', now), time: '', priority: 'major', status: 'pending', created: Date.now(), carried: 0 });
  commit(); toast('Sample data loaded. Clear it in Settings when you are ready.');
}

/* ---------- events ---------- */
document.addEventListener('click', e => {
  const del = e.target.closest('[data-delete]');
  if (del) {
    const t = byId(del.dataset.id);
    if (t) {
      if (del.dataset.delete === 'future' && t.series) state.tasks = state.tasks.filter(x => !(x.series === t.series && x.date >= t.date && x.status === 'pending'));
      else state.tasks = state.tasks.filter(x => x.id !== t.id);
      commit(); toast('Deleted');
    }
    closeDialog($('#delDialog')); return;
  }
  if (e.target.closest('[data-close]')) { closeDialog(e.target.closest('dialog')); return; }
  const b = e.target.closest('[data-act]'); if (!b) return;
  const li = b.closest('[data-id]'), t = li ? byId(li.dataset.id) : null;
  switch (b.dataset.act) {
    case 'view': ui.view = b.dataset.view; render(); break;
    case 'prev': stepCursor(-1); break;
    case 'next': stepCursor(1); break;
    case 'today': ui.cursor = today(); render(); break;
    case 'go': ui.view = b.dataset.view; ui.cursor = b.dataset.date; render(); window.scrollTo({ top: 0 }); break;
    case 'new': openTask(null); break;
    case 'add': openTask(null, { scope: b.dataset.scope, date: b.dataset.date || ui.cursor }); break;
    case 'done': if (t) { setDone(t); commit(); } break;
    case 'miss': if (t) { if (t.status === 'missed') { t.status = 'pending'; delete t.reason; delete t.reasonNote; commit(); } else openMiss(t.id); } break;
    case 'reset': if (t) { t.status = 'pending'; delete t.reason; delete t.reasonNote; delete t.late; delete t.resolvedAt; commit(); } break;
    case 'edit': if (t) openTask(t); break;
    case 'del': if (t) openDelete(t.id); break;
    case 'review': reviewOldest(); break;
    case 'export': exportJSON(); break;
    case 'import': $('#importFile').click(); break;
    case 'csv': exportCSV(); break;
    case 'print': window.print(); break;
    case 'sample': loadSample(); break;
    case 'settings': {
      const f = $('#settingsForm').elements;
      f.threshold.value = S().threshold; f.weekStart.value = S().weekStart; f.theme.value = S().theme;
      openDialog($('#settingsDialog')); break;
    }
    case 'clear':
      if (confirm('Delete ALL tasks and settings from this browser? Export a backup first if unsure.')) {
        state = { tasks: [], settings: { ...DEFAULTS } }; closeDialog($('#settingsDialog')); commit(); toast('All data deleted');
      }
      break;
  }
});

document.addEventListener('submit', e => {
  const id = e.target.id;
  if (id === 'quick') {
    e.preventDefault();
    const f = e.target.elements, title = f.title.value.trim(); if (!title) return;
    state.tasks.push({ id: uid(), title, scope: 'day', date: ui.cursor, time: f.time.value, priority: f.priority.value, status: 'pending', created: Date.now(), carried: 0, notes: '' });
    commit(); const q = $('#quick input[name="title"]'); if (q) q.focus();
  } else if (id === 'taskForm') {
    e.preventDefault();
    const f = e.target.elements, title = f.ttl.value.trim(); if (!title) return;
    const scope = f.scope.value, date = anchor(scope, f.date.value);
    const data = { title, scope, date, priority: f.priority.value, notes: f.notes.value.trim(), time: scope === 'day' ? f.time.value : '' };
    if (f.taskId.value) { const t = byId(f.taskId.value); if (t) Object.assign(t, data); }
    else {
      const rule = scope === 'day' ? f.repeat.value : 'none';
      const dates = recurDates(date, rule), series = rule !== 'none' ? uid() : undefined;
      dates.forEach((d, i) => state.tasks.push({ ...data, date: d, id: uid(), status: 'pending', created: Date.now() + i, carried: 0, series }));
      if (dates.length > 1) toast(`Created ${dates.length} repeating tasks`);
    }
    closeDialog($('#taskDialog')); commit();
  } else if (id === 'missForm') {
    e.preventDefault();
    const f = e.target.elements, t = byId(f.missId.value); if (!t) return;
    t.status = 'missed'; t.reason = f.reason.value; t.reasonNote = f.note.value.trim(); t.resolvedAt = Date.now(); delete t.late;
    if (f.carry.checked && f.carryDate.value) {
      state.tasks.push({ id: uid(), title: t.title, scope: t.scope, date: anchor(t.scope, f.carryDate.value), time: t.time || '', priority: t.priority,
        status: 'pending', created: Date.now(), carried: (t.carried || 0) + 1, notes: t.notes || '' });
      toast('Carried over');
    }
    closeDialog($('#missDialog')); commit();
  }
});

document.addEventListener('change', e => {
  if (e.target.name === 'scope' && e.target.form && e.target.form.id === 'taskForm') syncTaskForm();
  if (e.target.id === 'importFile') { if (e.target.files[0]) importJSON(e.target.files[0]); e.target.value = ''; }
  if (e.target.form && e.target.form.id === 'settingsForm') {
    const f = e.target.form.elements;
    state.settings.threshold = Math.min(100, Math.max(10, +f.threshold.value || DEFAULTS.threshold));
    state.settings.weekStart = +f.weekStart.value === 0 ? 0 : 1;
    state.settings.theme = f.theme.value;
    commit();
  }
});

document.addEventListener('keydown', e => {
  if (e.key.toLowerCase() === 'n' && !e.ctrlKey && !e.metaKey && !e.altKey && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !document.querySelector('dialog[open]')) {
    e.preventDefault(); openTask(null);
  }
});

render();
})();
