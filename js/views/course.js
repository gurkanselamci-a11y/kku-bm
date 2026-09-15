// views/course.js — bir dersin 14 haftalık konu listesi ve genel durumu.

import { store } from '../store.js';
import { getCourse, getCourseMeta, collectCards, collectQuestions } from '../data.js';
import { escHtml, progressBar, empty } from '../ui.js';
import { dueCount } from '../srs.js';
import { currentWeek } from './home.js';
import { ico } from '../icons.js';
import { aktsOf } from '../akts.js';

export default async function courseView([code]) {
  const meta = await getCourseMeta(code);
  const course = await getCourse(code);

  if (!course) {
    return {
      title: meta.name,
      sub: code,
      html: empty('soon', 'İçerik henüz hazır değil',
        `${meta.name} dersi için konu anlatımı ve sorular eklenmemiş. docs/CONTENT_SCHEMA.md dosyasına göre data/courses/${code}.json ekleyebilirsin.`,
        '<a class="btn" href="#/dersler">Derslere dön</a>'),
    };
  }

  const pr = store.courseProgress(code, course.topics.length);
  const cards = collectCards(course);
  const due = dueCount(cards, store.state.srs);
  const qCount = collectQuestions(course).length;
  const week = currentWeek(store.settings);
  const thisWeek = week && week.n >= 1 && week.n <= course.topics.length ? week.n : null;

  const items = course.topics.map((t) => {
    const p = store.topicProgress(code, t.id);
    const isNow = t.week === thisWeek;
    return `<a class="week-item${p.read ? ' done' : ''}" href="#/konu/${code}/${t.id}" style="--c:${meta.color}">
      <span class="week-num">${p.read ? ico('check') : t.week}</span>
      <span class="wi-body">
        <b>${escHtml(t.title)}${isNow ? ' <span class="chip on" style="--c:' + meta.color + '">bu hafta</span>' : ''}</b>
        <small>${escHtml(t.summary || '')}</small>
      </span>
      ${p.attempts ? `<span class="wi-score" style="color:${p.bestScore >= 70 ? 'var(--ok)' : p.bestScore >= 50 ? 'var(--warn)' : 'var(--bad)'}">%${p.bestScore}</span>` : '<span class="tiny muted">—</span>'}
    </a>`;
  }).join('');

  return {
    title: meta.shortName,
    sub: `${code}${meta.instructor ? ' · ' + meta.instructor : ''}`,
    html: `
      <div class="stack">
        <div class="card" style="--c:${meta.color}">
          <div class="row">
            <span class="cc-ico" style="width:44px;height:44px;font-size:22px;background:color-mix(in srgb, ${meta.color} 18%, transparent);border-radius:12px;display:grid;place-content:center">${ico(meta.icon)}</span>
            <span class="grow"><h1 style="font-size:19px;margin:0">${escHtml(course.name)}</h1>
            <span class="tiny muted">${escHtml(code)}${course.credits ? ` · ${course.credits.kredi} kredi · ${aktsOf(code, course)} AKTS` : ''}</span></span>
          </div>
          <div style="margin-top:13px">${progressBar(pr.pct, meta.color)}</div>
          <div class="row spread tiny muted" style="margin-top:6px">
            <span>${pr.read}/${course.topics.length} konu okundu</span>
            <span>%${pr.pct} tamamlandı</span>
          </div>
          ${course.description ? `<p class="small muted" style="margin:12px 0 0">${escHtml(course.description)}</p>` : ''}
        </div>

        <div class="btn-row">
          <a class="btn primary grow" href="#/quiz/${code}">${ico('target')} Karışık soru çöz</a>
          <a class="btn" href="#/kartlar/${code}">${ico('layers')} Kartlar${due.total ? ` (${due.total})` : ''}</a>
        </div>
        <div class="btn-row">
          <a class="btn grow" href="#/sinav/${code}/vize">${ico('exam')} Vize denemesi</a>
          <a class="btn grow" href="#/sinav/${code}/final">${ico('exam')} Final denemesi</a>
        </div>

        <div class="row wrap" style="gap:6px">
          <span class="chip">${course.topics.length} konu</span>
          <span class="chip">${qCount} soru</span>
          <span class="chip">${cards.length} kart</span>
          ${pr.quizzed ? `<span class="chip ${pr.avgScore >= 70 ? 'ok' : 'bad'}">ortalama %${pr.avgScore}</span>` : ''}
        </div>

        ${course.outcomes?.length ? `<details class="card"><summary style="cursor:pointer;font-weight:650">Öğrenme çıktıları</summary>
          <ul class="small muted" style="margin:10px 0 0;padding-left:20px">${course.outcomes.map((o) => `<li>${escHtml(o)}</li>`).join('')}</ul>
        </details>` : ''}

        ${course.resources?.length ? `<details class="card"><summary style="cursor:pointer;font-weight:650">Kaynaklar</summary>
          <ul class="small muted" style="margin:10px 0 0;padding-left:20px">${course.resources.map((r) => `<li><b>${escHtml(r.title)}</b>${r.note ? ' — ' + escHtml(r.note) : ''}</li>`).join('')}</ul>
        </details>` : ''}

        <div>
          <div class="sec-title"><h2>Konular</h2><span class="tiny muted">14 hafta</span></div>
          <div class="week-list">${items}</div>
        </div>
      </div>`,
  };
}
