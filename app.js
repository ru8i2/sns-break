'use strict';

// ---------- データ ----------
const STORE_KEY = 'snsbreak.v1';
const ACTIVE_KEY = 'snsbreak.active';

// ?from= の値 → 表示名とURLスキーム
const APPS = {
  instagram: { name: 'Instagram', scheme: 'instagram://app' },
  x: { name: 'X', scheme: 'twitter://' },
  twitter: { name: 'X', scheme: 'twitter://' },
  tiktok: { name: 'TikTok', scheme: 'snssdk1233://' },
  youtube: { name: 'YouTube', scheme: 'youtube://' },
  facebook: { name: 'Facebook', scheme: 'fb://' },
  threads: { name: 'Threads', scheme: 'barcelona://' },
  line: { name: 'LINE', scheme: 'line://' },
};

const DEFAULTS = { goal: null, openMode: 'shortcut', passName: 'SNSパス', events: [] };

function readJSON(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}
function writeJSON(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch { /* 保存できなくても画面は動かす */ }
}

const state = Object.assign({}, DEFAULTS, readJSON(STORE_KEY) || {});
if (!Array.isArray(state.events)) state.events = [];
const save = () => writeJSON(STORE_KEY, state);

// events: { type: 'intercept' | 'open' | 'session', t: ms, app: string|null, min?: number }
function addEvent(ev) {
  state.events.push(ev);
  save();
}

// ---------- ユーティリティ ----------
const $ = (id) => document.getElementById(id);
const appKey = (s) => (s || '').trim().toLowerCase();
const appName = (key) => (APPS[key] ? APPS[key].name : key);
const appScheme = (key) => (APPS[key] ? APPS[key].scheme : /^[a-z][a-z0-9+.-]*$/.test(key) ? `${key}://` : null);

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

// 「2時間8分」を数字と単位に分けて描画
function renderDuration(target, min) {
  target.textContent = '';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h > 0) {
    target.append(String(h), el('span', 'unit', '時間'));
    if (m > 0) target.append(String(m), el('span', 'unit', '分'));
  } else {
    target.append(String(m), el('span', 'unit', '分'));
  }
}
const durationText = (min) => {
  const h = Math.floor(min / 60), m = min % 60;
  return h > 0 ? `${h}時間${m > 0 ? m + '分' : ''}` : `${m}分`;
};

function weekStart(now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = (d.getDay() + 6) % 7; // 月曜はじまり
  d.setDate(d.getDate() - diff);
  return d;
}

function weekSummary() {
  const start = weekStart();
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  const days = Array(7).fill(0);
  let total = 0, attempts = 0, did = 0, opened = 0;
  for (const ev of state.events) {
    if (ev.t < start.getTime() || ev.t >= end.getTime()) continue;
    if (ev.type === 'intercept') attempts++;
    else if (ev.type === 'open') opened++;
    else if (ev.type === 'session') {
      did++;
      total += ev.min;
      days[(new Date(ev.t).getDay() + 6) % 7] += ev.min;
    }
  }
  return { start, end, days, total, attempts, did, opened };
}

let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2400);
}

// ---------- 画面切り替え ----------
let current = null;
function show(id) {
  if (current === 'timer' && id !== 'timer') stopTicking();
  document.querySelectorAll('.screen').forEach((s) => { s.hidden = s.id !== id; });
  current = id;
  const render = renderers[id];
  if (render) render();
  window.scrollTo(0, 0);
}

let pendingApp = null; // 開こうとしたアプリ（?from=）

const renderers = {
  home() {
    const { total } = weekSummary();
    renderDuration($('home-total'), total);
    $('home-goal').textContent = `やりたいこと：${state.goal}`;
    $('home-start').textContent = `いま${state.goal}をはじめる`;
  },
  wait() {
    $('wait-app').textContent = `${appName(pendingApp)}を開こうとしています`;
    const q = $('wait-question');
    q.textContent = '';
    q.append('その時間で、', el('em', null, state.goal), 'を', el('br'), '何分できるかな？');
    $('wait-open').textContent = `それでも${appName(pendingApp)}を開く`;
  },
  timer() {
    $('timer-goal').textContent = `${state.goal}中`;
    $('timer-sheet').hidden = true;
    startTicking();
  },
  report() {
    const s = weekSummary();
    const last = new Date(s.end);
    last.setDate(last.getDate() - 1);
    const md = (d) => `${d.getMonth() + 1}月${d.getDate()}日`;
    $('report-range').textContent = `${md(s.start)} – ${md(last)}`;
    renderDuration($('report-total'), s.total);

    const bars = $('report-bars');
    bars.textContent = '';
    const max = Math.max(...s.days, 1);
    const today = (new Date().getDay() + 6) % 7;
    '月火水木金土日'.split('').forEach((label, i) => {
      const b = el('div', 'bar' + (s.days[i] > 0 ? ' on' : '') + (i === today ? ' today' : ''));
      const fill = el('i');
      fill.style.height = `${(s.days[i] / max) * 100}%`;
      b.append(fill, el('span', null, label));
      bars.append(b);
    });

    const count = (target, n) => { target.textContent = ''; target.append(String(n), el('small', null, '回')); };
    count($('report-attempts'), s.attempts);
    count($('report-did'), s.did);
    count($('report-opened'), s.opened);
    $('report-did-label').textContent = `${state.goal}をした`;

    const foot = $('report-foot');
    foot.textContent = '';
    foot.append('SNSの代わりに、', el('b', null, state.goal), 'を。');
    $('report-controls').hidden = false;
  },
  settings() {
    $('settings-goal').value = state.goal;
    $('settings-pass').value = state.passName;
    document.querySelectorAll('input[name="openMode"]').forEach((r) => { r.checked = r.value === state.openMode; });
    $('pass-field').hidden = state.openMode !== 'shortcut';
  },
};

// ---------- ストップウォッチ ----------
let tickHandle = null;

function startTicking() {
  stopTicking();
  const tick = () => {
    const active = readJSON(ACTIVE_KEY);
    if (!active) return;
    const sec = Math.floor((Date.now() - active.start) / 1000);
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    const pad = (n) => String(n).padStart(2, '0');
    $('timer-clock').textContent = h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
    const done = sec >= 60;
    $('timer-clock').classList.toggle('done', done);
    $('timer-note').textContent = done ? 'いい調子。いつでも止められます' : '1分から記録されます';
    if (!$('timer-sheet').hidden) {
      const rest = Math.max(60 - sec, 0);
      $('timer-sheet-text').textContent = rest > 0 ? `あと${rest}秒で記録になります。` : 'もう記録になります。';
    }
  };
  tick();
  tickHandle = setInterval(tick, 250);
}
function stopTicking() {
  clearInterval(tickHandle);
  tickHandle = null;
}

function startSession(app) {
  writeJSON(ACTIVE_KEY, { start: Date.now(), app });
  show('timer');
}

function finishSession() {
  const active = readJSON(ACTIVE_KEY);
  if (!active) return show('home');
  const min = Math.floor((Date.now() - active.start) / 60000);
  if (min < 1) {
    $('timer-sheet').hidden = false;
    return;
  }
  writeJSON(ACTIVE_KEY, null);
  addEvent({ type: 'session', t: active.start, app: active.app, min });
  pendingApp = null;
  $('result-goal').textContent = state.goal;
  renderDuration($('result-min'), min);
  $('result-week').textContent = `今週の合計 ${durationText(weekSummary().total)}`;
  show('result');
}

function quitSession() {
  const active = readJSON(ACTIVE_KEY);
  writeJSON(ACTIVE_KEY, null);
  pendingApp = active && active.app;
  show(pendingApp ? 'wait' : 'home');
}

// ---------- それでも開く ----------
function openAnyway() {
  const app = pendingApp;
  addEvent({ type: 'open', t: Date.now(), app });
  const scheme = appScheme(app);
  if (!scheme) {
    toast('このアプリはホーム画面から開いてください');
    pendingApp = null;
    return show('home');
  }
  const url = state.openMode === 'shortcut'
    ? `shortcuts://run-shortcut?name=${encodeURIComponent(state.passName)}&input=text&text=${encodeURIComponent(scheme)}`
    : scheme;
  pendingApp = null;
  location.href = url;
  // Safariに戻ってきたときは「ちょっと待った」ではなくホームを見せる
  setTimeout(() => show('home'), 800);
}

// ---------- イベント ----------
$('setup-save').addEventListener('click', () => {
  state.goal = $('setup-goal').value.trim() || '読書';
  save();
  if (pendingApp) {
    addEvent({ type: 'intercept', t: Date.now(), app: pendingApp });
    show('wait');
  } else {
    show('home');
  }
});

$('home-start').addEventListener('click', () => startSession(null));
$('home-report').addEventListener('click', () => show('report'));
$('home-settings').addEventListener('click', () => show('settings'));

$('wait-start').addEventListener('click', () => startSession(pendingApp));
$('wait-open').addEventListener('click', openAnyway);

$('timer-stop').addEventListener('click', finishSession);
$('timer-continue').addEventListener('click', () => { $('timer-sheet').hidden = true; });
$('timer-quit').addEventListener('click', quitSession);

$('result-report').addEventListener('click', () => show('report'));
$('result-close').addEventListener('click', () => show('home'));

$('report-card').addEventListener('click', () => { $('report-controls').hidden = !$('report-controls').hidden; });
$('report-back').addEventListener('click', () => show('home'));

document.querySelectorAll('input[name="openMode"]').forEach((r) => {
  r.addEventListener('change', () => { $('pass-field').hidden = r.value !== 'shortcut'; });
});
$('settings-back').addEventListener('click', () => show('home'));
$('settings-save').addEventListener('click', () => {
  state.goal = $('settings-goal').value.trim() || state.goal;
  state.passName = $('settings-pass').value.trim() || DEFAULTS.passName;
  const mode = document.querySelector('input[name="openMode"]:checked');
  state.openMode = mode ? mode.value : state.openMode;
  save();
  toast('保存しました');
  show('home');
});
$('settings-reset').addEventListener('click', () => {
  if (!confirm('これまでの記録をすべて消しますか？')) return;
  state.events = [];
  save();
  writeJSON(ACTIVE_KEY, null);
  toast('記録を消しました');
  show('home');
});

// 他のアプリから戻ってきたら表示を更新（計測は開始時刻から計算するので止まらない）
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && current && renderers[current] && current !== 'timer') renderers[current]();
});

// ---------- 起動 ----------
(function init() {
  const params = new URLSearchParams(location.search);
  const from = appKey(params.get('from'));
  const view = params.get('view');
  // 再読み込みで二重に記録しないよう、URLからパラメータを消しておく
  if (location.search) history.replaceState(null, '', location.pathname + location.hash);

  if (from) pendingApp = from;

  if (readJSON(ACTIVE_KEY)) return show('timer');
  if (!state.goal) return show('setup');
  if (from) {
    addEvent({ type: 'intercept', t: Date.now(), app: from });
    return show('wait');
  }
  show(view === 'report' ? 'report' : 'home');
})();

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
