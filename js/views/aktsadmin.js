// views/aktsadmin.js — yönetici: yanlış AKTS değerlerini herkes için düzeltir.
//
// Düzeltme müfredat dosyasını değiştirmez; Firestore'daki config/akts belgesine yazılır ve
// tüm kullanıcılarda müfredat değerinin önüne geçer (js/akts.js). Yazma yetkisi yalnızca
// firestore.rules'daki yönetici e-postalarında; bu ekran yetkisi olmayana form göstermez.

import { getCurriculum } from '../data.js';
import { escHtml, toast, empty } from '../ui.js';
import { ico } from '../icons.js';
import { cloudConfigured } from '../cloud.js';
import { getUser, isAuthKnown, onSync } from '../sync.js';
import { aktsOverrides, aktsInfo, dataAkts, refreshAkts, saveAkts } from '../akts.js';

export default async function aktsAdminView() {
  if (!cloudConfigured()) {
    return { title: 'AKTS düzeltmeleri', sub: 'Yönetici', html: empty('lock', 'Hesap sistemi kapalı', 'AKTS düzeltmeleri hesap sistemiyle birlikte çalışır.') };
  }

  // Oturum henüz belli değilse bekle (sayfa doğrudan açıldığında).
  if (!isAuthKnown()) {
    await new Promise((resolve) => { const off = onSync(({ authKnown }) => { if (authKnown) { setTimeout(() => off(), 0); resolve(); } }); });
  }
  const user = getUser();
  const c = await import('../cloud.js');
  if (!c.isAdmin(user)) {
    return {
      title: 'AKTS düzeltmeleri', sub: 'Yönetici',
      html: empty('lock', 'Bu sayfa yöneticiye özel', user
        ? 'Hesabının AKTS düzeltme yetkisi yok.'
        : 'Yönetici hesabıyla giriş yapman gerekiyor.', '<a class="btn" href="#/hesap">Hesap</a>'),
    };
  }

  await refreshAkts();
  const cur = await getCurriculum();
  const idx = cur.courseIndex || {};

  // Dersleri yarıyıllara göre grupla; hiçbir yarıyılda geçmeyenler (seçmeli havuzu) sonda.
  const seen = new Set();
  const groups = (cur.semesters || []).map((sem) => {
    const codes = sem.courses.filter((code) => idx[code] && !seen.has(code));
    codes.forEach((code) => seen.add(code));
    return { label: `${sem.label} · ${sem.term}`, codes };
  }).filter((g) => g.codes.length);
  const rest = Object.keys(idx).filter((code) => !seen.has(code)).sort();
  if (rest.length) groups.push({ label: 'Diğer dersler', codes: rest });

  const overrides = aktsOverrides();
  const info = aktsInfo();

  const row = (code) => {
    const m = idx[code];
    const base = dataAkts(m);
    const o = overrides[code];
    const has = typeof o === 'number';
    return `<div class="akts-row${has ? ' fixed' : ''}" data-code="${escHtml(code)}" data-search="${escHtml(`${code} ${m.name}`.toLocaleLowerCase('tr'))}">
      <div class="grow">
        <b>${escHtml(m.name)}</b>
        <span class="cc-meta">${escHtml(code)} · müfredatta ${base} AKTS</span>
      </div>
      <input type="number" inputmode="decimal" min="0" max="60" step="0.5" value="${has ? o : ''}" placeholder="${base}" aria-label="${escHtml(m.name)} AKTS">
      <button type="button" class="icon-btn" data-clear title="Müfredat değerine dön"${has ? '' : ' hidden'}>${ico('x')}</button>
    </div>`;
  };

  return {
    title: 'AKTS düzeltmeleri',
    sub: 'Yönetici · tüm kullanıcılar için',
    html: `<div class="stack">
      <div class="card">
        <p class="small" style="margin:0">Yanlış AKTS'yi kutuya yaz. Boş bırakılan ya da müfredatla aynı olan değer
        düzeltme sayılmaz. Kaydettiğinde tüm kullanıcıların ders listesinde ve not ortalamasında geçerli olur.</p>
        <p class="tiny muted" style="margin:8px 0 0">${Object.keys(overrides).length} düzeltme
        ${info.updatedAt ? ` · son değişiklik ${new Date(info.updatedAt).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · ${escHtml(info.updatedBy)}` : ''}</p>
      </div>
      <input type="search" class="ans-input" id="aktsSearch" placeholder="Ders adı ya da kodu ara…" autocomplete="off">
      ${groups.map((g) => `<section class="akts-group"><h3>${escHtml(g.label)}</h3>${g.codes.map(row).join('')}</section>`).join('')}
      <div class="quiz-actions">
        <button class="btn primary block" id="aktsSave" type="button" disabled>Değişiklik yok</button>
      </div>
    </div>`,

    onMount(root) {
      const saveBtn = root.querySelector('#aktsSave');

      const collect = () => {
        const next = {};
        root.querySelectorAll('.akts-row').forEach((r) => {
          const code = r.dataset.code;
          const raw = r.querySelector('input').value.trim().replace(',', '.');
          if (raw === '') return;
          const n = Number(raw);
          if (Number.isFinite(n) && n !== dataAkts(idx[code])) next[code] = n;
        });
        return next;
      };

      const refresh = () => {
        const next = collect();
        const diff = new Set([...Object.keys(next), ...Object.keys(overrides)].filter((k) => next[k] !== overrides[k])).size;
        saveBtn.disabled = diff === 0;
        saveBtn.textContent = diff ? `Kaydet · ${diff} değişiklik` : 'Değişiklik yok';
        root.querySelectorAll('.akts-row').forEach((r) => {
          const v = r.querySelector('input').value.trim();
          r.classList.toggle('fixed', v !== '' && Number(v.replace(',', '.')) !== dataAkts(idx[r.dataset.code]));
          r.querySelector('[data-clear]').hidden = v === '';
        });
      };

      root.addEventListener('input', (e) => {
        if (e.target.matches('.akts-row input')) refresh();
        if (e.target.id === 'aktsSearch') {
          const q = e.target.value.trim().toLocaleLowerCase('tr');
          root.querySelectorAll('.akts-row').forEach((r) => { r.hidden = !!q && !r.dataset.search.includes(q); });
          root.querySelectorAll('.akts-group').forEach((g) => { g.hidden = ![...g.querySelectorAll('.akts-row')].some((r) => !r.hidden); });
        }
      });

      root.addEventListener('click', (e) => {
        const clear = e.target.closest('[data-clear]');
        if (!clear) return;
        clear.closest('.akts-row').querySelector('input').value = '';
        refresh();
      });

      saveBtn.addEventListener('click', async () => {
        const next = collect();
        for (const [code, n] of Object.entries(next)) {
          if (n < 0 || n > 60) { toast(`${code}: AKTS 0–60 arasında olmalı`, 3200); return; }
        }
        saveBtn.disabled = true;
        saveBtn.textContent = 'Kaydediliyor…';
        try {
          await saveAkts(next, getUser()?.email);
          Object.keys(overrides).forEach((k) => delete overrides[k]);
          Object.assign(overrides, aktsOverrides());
          toast(`Kaydedildi · ${Object.keys(overrides).length} düzeltme herkes için geçerli`, 3200);
          refresh();
        } catch (err) {
          const denied = err?.code === 'permission-denied';
          toast(denied ? 'Yetki yok: bu hesap firestore.rules\'da yönetici değil.' : `Kaydedilemedi (${err?.code || err?.message})`, 4000);
          refresh();
        }
      });
    },
  };
}
