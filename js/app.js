// app.js — uygulama kabuğu, yönlendirici ve çalışma süresi sayacı.

import { store } from './store.js';
import { $$, toast, bindCopy, fitMath } from './ui.js';
import { getCurriculum, getIndex, getAllCardIds } from './data.js';
import { dueCount } from './srs.js';
import { setWakeLockWanted } from './wakelock.js';

import homeView from './views/home.js';
import coursesView from './views/courses.js';
import courseView from './views/course.js';
import topicView from './views/topic.js';
import quizView from './views/quiz.js';
import cardsView from './views/cards.js';
import examView from './views/exam.js';
import scheduleView from './views/schedule.js';
import myCoursesView from './views/mycourses.js';
import gradesView from './views/grades.js';
import statsView from './views/stats.js';
import settingsView from './views/settings.js';
import searchView, { invalidateSearchIndex } from './views/search.js';
import mistakesView from './views/mistakes.js';
import notesView from './views/notes.js';
import { ico } from './icons.js';

const routes = [
  { re: /^\/$/, view: homeView, nav: '/' },
  { re: /^\/dersler$/, view: coursesView, nav: '/dersler' },
  { re: /^\/ders\/([A-Z0-9]+)$/, view: courseView, nav: '/dersler', math: true },
  { re: /^\/konu\/([A-Z0-9]+)\/([\w-]+)$/, view: topicView, nav: '/dersler', study: true, math: true },
  { re: /^\/quiz\/([A-Z0-9]+)(?:\/([\w-]+))?$/, view: quizView, nav: '/dersler', study: true, math: true },
  { re: /^\/kartlar(?:\/([A-Z0-9]+))?$/, view: cardsView, nav: '/kartlar', study: true, math: true },
  { re: /^\/sinav(?:\/([A-Z0-9]+)\/(\w+))?$/, view: examView, nav: '/sinav', study: true, math: true },
  { re: /^\/program$/, view: scheduleView, nav: '/program' },
  { re: /^\/derslerim$/, view: myCoursesView, nav: '/derslerim' },
  { re: /^\/notlar$/, view: gradesView, nav: '/notlar' },
  { re: /^\/istatistik$/, view: statsView, nav: '/istatistik' },
  { re: /^\/ara(?:\/(.*))?$/, view: searchView, nav: '/ara', math: true },
  { re: /^\/yanlislarim$/, view: mistakesView, nav: '/istatistik', study: true, math: true },
  { re: /^\/notlarim$/, view: notesView, nav: '/istatistik', math: true },
  { re: /^\/ayarlar$/, view: settingsView, nav: '/' },
];

// KaTeX yalnızca matematik gösteren ekranlarda yüklenir — ana sayfa hafif kalsın.
let katexPromise = null;
function ensureKatex() {
  if (window.katex) return Promise.resolve();
  if (!katexPromise) {
    katexPromise = new Promise((resolve) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = 'vendor/katex/katex.min.css';
      document.head.appendChild(css);
      const js = document.createElement('script');
      js.src = 'vendor/katex/katex.min.js';
      js.onload = resolve;
      js.onerror = () => resolve(); // yüklenemezse formüller ham metin olarak görünür
      document.head.appendChild(js);
    });
  }
  return katexPromise;
}

const viewEl = () => document.getElementById('view');
let currentCleanup = null;
let currentRoute = null;

function path() {
  const h = location.hash.replace(/^#/, '');
  return h || '/';
}

export function go(to) {
  if (location.hash === '#' + to) render();
  else location.hash = to;
}

async function render() {
  const p = path();
  const match = routes.map((r) => ({ r, m: p.match(r.re) })).find((x) => x.m);
  const root = viewEl();

  accrueStudy();   // sayfadan ayrılmadan önceki süreyi yaz
  if (currentCleanup) { try { currentCleanup(); } catch (_) {} currentCleanup = null; }

  if (!match) {
    currentRoute = null;
    syncStudy();
    root.innerHTML = `<div class="empty"><div class="e-ico">${ico('compass')}</div><b>Sayfa bulunamadı</b>
      <p class="small">Aradığın sayfa yok.</p><a class="btn primary" href="#/">Ana sayfaya dön</a></div>`;
    setTitle('Bulunamadı', '');
    return;
  }

  currentRoute = match.r;
  syncStudy();     // çalışma ekranıysa ekranı açık tut, sayacı başlat
  const params = match.m.slice(1);
  root.innerHTML = `<div class="empty"><div class="e-ico">${ico('clock')}</div><b>Yükleniyor…</b></div>`;

  let result;
  try {
    if (match.r.math) await ensureKatex();
    result = await match.r.view(params, { go });
  } catch (err) {
    console.error(err);
    root.innerHTML = `<div class="empty"><div class="e-ico">${ico('alert')}</div><b>Bir şeyler ters gitti</b>
      <p class="small">${(err && err.message) || 'Bilinmeyen hata'}</p>
      <a class="btn" href="#/">Ana sayfa</a></div>`;
    return;
  }

  root.innerHTML = result.html || '';
  setTitle(result.title || '', result.sub || '');
  bindCopy(root);
  fitMath(root);
  if (typeof result.onMount === 'function') {
    currentCleanup = result.onMount(root) || null;
  }

  markNav(match.r.nav);
  document.getElementById('backBtn').hidden = p === '/';
  root.scrollTop = 0;
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  refreshChrome();
}

function setTitle(title, sub) {
  document.getElementById('pageTitle').textContent = title || 'KKÜ BM';
  document.getElementById('pageSub').textContent = sub || 'Bilgisayar Mühendisliği';
  document.title = title ? `${title} · KKÜ BM` : 'KKÜ BM · Çalışma';
}

function markNav(nav) {
  $$('[data-nav]').forEach((a) => a.classList.toggle('on', a.dataset.nav === nav));
  // Açık sayfa alt çubukta yoksa (Program, Notlar…) "Menü" sekmesi yansın ki kullanıcı
  // nerede olduğunu kaybetmesin.
  const inTabbar = $$('#tabbar [data-nav]').some((a) => a.dataset.nav === nav);
  document.getElementById('moreBtn')?.classList.toggle('on', !inTabbar);
}

// ---------- mobil "Menü" paneli ----------

const moreSheet = () => document.getElementById('moreSheet');
const moreBtn = () => document.getElementById('moreBtn');

/** Panel içeriğini kenar menüden üretir: bölüm listesi tek yerde (index.html #sidenav) kalsın. */
function buildMoreGrid() {
  const grid = document.getElementById('moreGrid');
  if (!grid || grid.childElementCount) return;
  for (const a of $$('#sidenav a[data-nav]')) {
    const clone = a.cloneNode(true);
    clone.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));   // kopya kimlik olmasın
    clone.querySelectorAll('.badge').forEach((el) => el.remove());              // rozet alt çubukta zaten var
    grid.appendChild(clone);
  }
  const settings = document.createElement('a');
  settings.href = '#/ayarlar';
  settings.dataset.nav = '/ayarlar';
  settings.innerHTML = '<svg class="ni" aria-hidden="true"><use href="#i-settings"/></svg><span>Ayarlar</span>';
  grid.appendChild(settings);
}

function openMore() {
  buildMoreGrid();
  markNav(currentRoute?.nav);
  moreSheet().hidden = false;
  moreBtn().setAttribute('aria-expanded', 'true');
  document.getElementById('moreGrid').querySelector('a.on, a')?.focus({ preventScroll: true });
}

function closeMore() {
  if (moreSheet().hidden) return;
  moreSheet().hidden = true;
  moreBtn().setAttribute('aria-expanded', 'false');
}

// ---------- kabuk bilgileri (streak, kart rozeti, hedef halkası) ----------

let allCardsCache = null;
async function allCards() {
  if (!allCardsCache) allCardsCache = await getAllCardIds();
  return allCardsCache;
}

export async function refreshChrome() {
  const s = store.state;
  document.getElementById('streakNum').textContent = s.streak.current || 0;

  const cards = await allCards();
  const { total } = dueCount(cards, s.srs);
  for (const id of ['dueBadge', 'dueBadgeM']) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.textContent = total > 99 ? '99+' : total;
    el.hidden = total === 0;
  }

  const today = store.todayStats();
  const goal = s.settings.dailyGoal || 30;
  const pct = Math.min(100, Math.round((today.minutes / goal) * 100));
  const ringEl = document.getElementById('goalRing');
  if (ringEl) {
    ringEl.style.background = `conic-gradient(var(--acc) ${pct * 3.6}deg, var(--surface-2) 0)`;
    ringEl.innerHTML = `<span style="background:var(--bg);width:40px;height:40px;border-radius:50%;display:grid;place-content:center">${today.minutes}′</span>`;
    ringEl.title = `Bugün ${today.minutes} dk / hedef ${goal} dk`;
  }
}

export function invalidateCards() { allCardsCache = null; invalidateSearchIndex(); }

// ---------- tema ----------

// CSS'te her palet tek yerde tanımlı (:root = kâğıt, [data-theme="dark"] = ozalit), bu yüzden
// "Sistem" seçiliyken de burada çözülmüş bir değer damgalanır. Eskiden "auto" damgayı
// kaldırıyordu ve CSS'te sistem sorgusu olmadığı için açık temalı telefonda da koyu açılıyordu.
const systemDark = matchMedia('(prefers-color-scheme: dark)');

export function applyTheme() {
  const t = store.settings.theme;
  const dark = t === 'dark' || (t === 'auto' && systemDark.matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = dark ? '#0f151b' : '#f2f4f6';
}

// Sistem teması uygulama açıkken değişirse (ör. akşam otomatik koyu mod) hemen uy.
// (Dinleyici aşağıda, başlangıç bölümünde bağlanıyor.)

/**
 * Konu anlatımının punto ve satır aralığını kullanıcı tercihine göre ayarlar.
 * Temanın kendi değerleri css/app.css'te; burada yalnızca fark varsa üzerine yazılır,
 * böylece tema ileride değişirse ayara dokunmayan kullanıcı yeni değerleri alır.
 */
export function applyReading() {
  const { readingSize, readingLine } = store.settings;
  const html = document.documentElement;
  // null ise temanın kendi değeri geçerli olsun diye satır içi tanımı kaldırıyoruz.
  if (readingSize) html.style.setProperty('--prose-size', `${readingSize}px`);
  else html.style.removeProperty('--prose-size');
  if (readingLine) html.style.setProperty('--prose-lh', String(readingLine));
  else html.style.removeProperty('--prose-lh');
}

// ---------- çalışma süresi sayacı + ekranı açık tutma ----------
//
// ESKİDEN sabit 30 sn'lik tikler sayılıyordu. Tarayıcı, arka plandaki (ya da ekranı kapanmış)
// sekmede zamanlayıcıları dakikada bire indirdiği, uzun süre sonra tamamen dondurduğu için
// bu sayım gerçek süreyi tutmuyordu. Artık geçen GERÇEK zaman ölçülür: yalnızca sayfa
// görünürken ve çalışma ekranındayken işler, donma sonrası toplu sıçrama yapmaz.

const TICK_MS = 15000;
const MAX_STEP_MS = 90000;   // donma/uyku sonrası tek adımda en fazla bu kadarı sayılır
let studyMs = 0;
let lastMark = Date.now();
let wasStudying = false;

const studying = () => !document.hidden && !!currentRoute && !!currentRoute.study;

function accrueStudy() {
  const now = Date.now();
  const dt = now - lastMark;
  lastMark = now;
  // Süre, ARALIĞIN BAŞINDAKİ duruma göre sayılır: sekme gizlendiğinde olay zaten
  // document.hidden=true ile gelir, o ana kadarki görünür süre yoksa kaybolurdu.
  if (wasStudying && dt > 0) {
    studyMs += Math.min(dt, MAX_STEP_MS);
    const mins = Math.floor(studyMs / 60000);
    if (mins >= 1) {
      studyMs -= mins * 60000;
      store.addMinutes(mins);
      refreshChrome();
    }
  }
  wasStudying = studying();
}

/** Sayacı ve ekran kilidini o anki ekrana/ayara göre günceller. */
function syncStudy() {
  accrueStudy();
  setWakeLockWanted(store.settings.keepAwake !== false && !!currentRoute && !!currentRoute.study);
}

setInterval(accrueStudy, TICK_MS);
document.addEventListener('visibilitychange', accrueStudy);
window.addEventListener('pagehide', accrueStudy);

/** Ayarlar'daki "ekran kapanmasın" anahtarı değişince hemen uygulanır. */
export function applyKeepAwake() { syncStudy(); }

// ---------- başlangıç ----------

window.addEventListener('hashchange', render);

document.getElementById('backBtn').addEventListener('click', () => history.back());
document.getElementById('moreBtn').addEventListener('click', () => (moreSheet().hidden ? openMore() : closeMore()));
moreSheet().addEventListener('click', (e) => {
  if (e.target.closest('[data-close]') || e.target.closest('a[href]')) closeMore();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMore(); });
window.addEventListener('hashchange', closeMore);
document.getElementById('settingsBtn').addEventListener('click', () => go('/ayarlar'));
document.getElementById('searchBtn').addEventListener('click', () => go('/ara'));
document.getElementById('streakBox').addEventListener('click', () => go('/istatistik'));

matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

(async function boot() {
  applyTheme();
  applyReading();
  try {
    await Promise.all([getCurriculum(), getIndex()]);
  } catch (err) {
    document.getElementById('splash').innerHTML =
      `<div class="empty"><div class="e-ico">${ico('offline')}</div><b>Veri yüklenemedi</b>
       <p class="small">Uygulamayı bir web sunucusu üzerinden aç (README'ye bak).<br>${err.message}</p></div>`;
    return;
  }
  document.getElementById('splash').remove();
  document.getElementById('shell').hidden = false;
  await render();

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    try {
      const reg = await navigator.serviceWorker.register('sw.js');

      // DİKKAT: dinleyici register'dan HEMEN sonra, araya `await` koymadan bağlanmalı;
      // arada bekleme olursa olay kaçar.
      reg.addEventListener('updatefound', () => {
        // Bu olay ilk kurulumda da tetiklenir. Ayrımı O AN yönetici olup olmadığı verir:
        // yönetici varsa sayfa zaten eski sürümle çalışıyor, yani bu bir güncellemedir.
        // (Anlık görüntüyü sayfa açılışında almak yanlış: ilk kayıt da aynı oturumda olabiliyor.)
        if (!navigator.serviceWorker.controller) return;
        // Kurulum artık hızlı bittiği için (service worker kurulumda 35 MB indirmiyor)
        // `installing` biz bakmadan boşalabiliyor; `waiting`/`active` de denenir ve
        // o anki durum hemen sınanır.
        const sw = reg.installing || reg.waiting || reg.active;
        if (!sw) return;
        const check = () => {
          if (sw.state === 'installed' || sw.state === 'activated') showUpdateBar();
        };
        check();
        sw.addEventListener('statechange', check);
      });

      // Hangi yarıyıldaysak onun derslerini önce indir: çevrimdışı kalındığında en olası
      // dersler hazır olsun. (Service worker localStorage'a erişemez, bu yüzden sayfa söyler.)
      const sem = store.state.settings.activeSemester || (await getCurriculum()).activeSemester;
      const mine = Object.keys(store.state.enrollment || {});
      const tellSW = () => navigator.serviceWorker.controller?.postMessage({ type: 'prefetch', semester: sem, codes: mine });
      tellSW();
      navigator.serviceWorker.addEventListener('controllerchange', tellSW);
    } catch (err) {
      // Sessiz yutma YOK: bir keresinde buradaki hata (register satırının kazara silinmesi)
      // fark edilmedi ve uygulama çevrimdışı desteğini tamamen kaybetti. Çevrimdışı olmak
      // ya da desteklenmemek normaldir, ama konsola bir iz bırakmalı.
      console.warn('Service worker kaydı yapılamadı:', err && err.message);
    }
  }
})();

function showUpdateBar() {
  if (document.getElementById('updateBar')) return;
  const bar = document.createElement('div');
  bar.id = 'updateBar';
  bar.className = 'update-bar';
  bar.innerHTML = '<span>Yeni içerik hazır</span><button class="btn primary" id="updateBtn">Yenile</button>';
  document.body.appendChild(bar);
  bar.querySelector('#updateBtn').addEventListener('click', () => location.reload());
}

// Klavye kısayolları (masaüstü)
document.addEventListener('keydown', (e) => {
  if (e.target.matches('input, textarea, select')) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const map = { d: '/dersler', k: '/kartlar', s: '/sinav', p: '/program', i: '/istatistik', h: '/', a: '/ara', y: '/yanlislarim', n: '/notlarim', g: '/notlar', m: '/derslerim' };
  const to = map[e.key.toLowerCase()];
  if (to) { go(to); e.preventDefault(); }
});

export { toast };
