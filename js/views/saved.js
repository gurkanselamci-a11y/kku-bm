// views/saved.js — yıldızladığın sorular, ders ders, çözümüyle birlikte.
// Soru ekranındaki yıldıza basınca buraya düşer; liste ders başlıklarına ayrılır.

import { store } from '../store.js';
import { getCourse, getCourseMeta, collectQuestions } from '../data.js';
import { md, mdInline, mdPhrase } from '../md.js';
import { escHtml, empty, toast, confirmAction } from '../ui.js';
import { typeLabel } from '../quizrunner.js';
import { ico } from '../icons.js';

/**
 * Sorunun doğru cevabı, gösterime hazır HTML olarak. Şıkların içinde formül olabiliyor
 * (`$\neg p \land \neg q$`); düz kaçışla yazılırsa ham LaTeX görünür.
 */
function cevapHtml(q) {
  switch (q.type) {
    case 'mcq': return q.choices?.[q.answer] == null ? ''
      : `${'ABCDE'[q.answer] || ''}) ${mdPhrase(q.choices[q.answer])}`;
    case 'tf': return q.answer ? 'Doğru' : 'Yanlış';
    case 'numeric': return escHtml(`${q.answer}${q.unit ? ' ' + q.unit : ''}`);
    case 'short': return mdPhrase((q.accept || [])[0] || '');
    case 'code': return q.expected ? `<code>${escHtml(q.expected)}</code>` : '';
    default: return '';
  }
}

export default async function savedView() {
  const kayit = store.state.savedQ || {};
  const uids = Object.keys(kayit);

  if (!uids.length) {
    return {
      title: 'Kaydettiklerim',
      sub: 'Yıldızladığın sorular',
      html: empty('star', 'Henüz soru kaydetmedin',
        'Soru çözerken sağ üstteki yıldıza basınca soru çözümüyle birlikte buraya düşer. Sınav öncesi tek yerden bakarsın.',
        '<div class="btn-row" style="justify-content:center;margin-top:14px">'
        + '<a class="btn primary" href="#/dersler">Derslere git</a>'
        + '<a class="btn ghost" href="#/yanlislarim">Yanlışlarım</a></div>'),
    };
  }

  // Yalnızca kayıtlı sorusu olan derslerin içeriği indirilir.
  const codes = [...new Set(uids.map((u) => kayit[u]?.code || String(u).split('/')[0]))];
  const bolumler = [];
  for (const code of codes) {
    const [course, meta] = await Promise.all([getCourse(code), getCourseMeta(code)]);
    if (!course) continue;
    const sorular = collectQuestions(course)
      .filter((q) => kayit[q.uid])
      .sort((a, b) => a.week - b.week);
    if (sorular.length) bolumler.push({ meta, sorular });
  }
  bolumler.sort((a, b) => b.sorular.length - a.sorular.length);
  const toplam = bolumler.reduce((a, b) => a + b.sorular.length, 0);

  // İçeriği silinmiş/taşınmış sorular listede görünmez; kaydı da temizleyelim.
  if (toplam < uids.length) {
    const canli = new Set(bolumler.flatMap((b) => b.sorular.map((q) => q.uid)));
    store.update((s) => { uids.forEach((u) => { if (!canli.has(u)) delete s.savedQ[u]; }); });
  }

  const kart = (q, meta) => `<div class="card sq" data-uid="${escHtml(q.uid)}" style="--c:${meta.color}">
      <div class="row spread" style="gap:8px">
        <a class="tiny" href="#/konu/${meta.code}/${q.topicId}" style="color:var(--acc)">
          ${q.week}. hafta · ${escHtml(q.topicTitle)}</a>
        <button class="btn ghost tiny" data-del="${escHtml(q.uid)}" style="padding:2px 8px"
          aria-label="Kayıttan çıkar">${ico('star-on')} Çıkar</button>
      </div>
      <div class="small" style="margin:8px 0 0">${mdInline(q.q)}</div>
      ${q.code ? `<div class="small">${md('```' + (q.lang || '') + '\n' + q.code + '\n```')}</div>` : ''}
      <details class="sq-sol">
        <summary>Çözümü göster <span class="tiny muted">· ${typeLabel(q.type)}</span></summary>
        ${cevapHtml(q) ? `<p class="small" style="margin:10px 0 6px">Cevap: <b>${cevapHtml(q)}</b></p>` : ''}
        <div class="prose small">${md(q.explain || '')}</div>
      </details>
    </div>`;

  return {
    title: 'Kaydettiklerim',
    sub: `${toplam} soru · ${bolumler.length} ders`,
    html: `<div class="stack">
      ${bolumler.length > 1 ? `<div class="row wrap" style="gap:6px">${bolumler
        .map((b) => `<button class="chip" data-jump="${b.meta.code}">${escHtml(b.meta.shortName)} · ${b.sorular.length}</button>`)
        .join('')}</div>` : ''}
      ${bolumler.map((b) => `<div id="s-${b.meta.code}">
        <div class="sec-title"><h2>${escHtml(b.meta.shortName)}</h2>
          <a class="tiny" href="#/ders/${b.meta.code}">${b.sorular.length} soru →</a></div>
        <div class="stack">${b.sorular.map((q) => kart(q, b.meta)).join('')}</div>
      </div>`).join('')}
    </div>`,

    onMount(root) {
      root.addEventListener('click', (e) => {
        // Ders rozetleri: bölüme kaydır. Bağlantı olarak yazılamaz — adres çubuğundaki
        // # yönlendiriciye ait, "#s-BIL2001" sayfayı bulunamadıya düşürür.
        const jump = e.target.closest('[data-jump]');
        if (jump) {
          root.querySelector(`#s-${CSS.escape(jump.dataset.jump)}`)
            ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          return;
        }
        const btn = e.target.closest('[data-del]');
        if (!btn) return;
        const uid = btn.dataset.del;
        if (!confirmAction('Bu soru kayıttan çıkarılsın mı?')) return;
        store.toggleSavedQ(uid);
        root.querySelector(`.sq[data-uid="${CSS.escape(uid)}"]`)?.remove();
        toast('Kayıttan çıkarıldı');
      });
    },
  };
}
