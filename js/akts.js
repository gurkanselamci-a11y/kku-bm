// akts.js — müfredattaki AKTS değerleri ve yöneticinin yaptığı düzeltmeler.
//
// Müfredat dosyasında (data/curriculum.json) bazı derslerin AKTS'si yanlış olabiliyor.
// Düzeltmeler Firestore'daki tek bir belgede (config/akts) tutulur: herkes okur, yalnızca
// yönetici yazar. Burada yerel önbelleğe de alınır ki çevrimdışıyken ve giriş yapılmamışken
// de doğru AKTS ile ortalama hesaplansın.

import { cloudConfigured } from './cloud.js';

const KEY = 'kkubm.akts';

function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (d && typeof d.overrides === 'object') return d;
  } catch { /* bozuksa yok say */ }
  return { overrides: {}, updatedAt: 0, updatedBy: '' };
}
let data = load();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* kota */ } };

/** Müfredattaki (düzeltilmemiş) değer. */
export const dataAkts = (meta) => Number(meta?.credits?.akts) || 0;

/** Geçerli AKTS: düzeltme varsa o, yoksa müfredattaki. */
export function aktsOf(code, meta) {
  const o = data.overrides?.[code];
  return typeof o === 'number' && Number.isFinite(o) ? o : dataAkts(meta);
}

export const aktsOverrides = () => ({ ...(data.overrides || {}) });
export const aktsInfo = () => ({ updatedAt: data.updatedAt, updatedBy: data.updatedBy });

/** Buluttaki düzeltmeleri çeker; değiştiyse 'kkubm:akts' olayı yayar. Hata sessizdir. */
export async function refreshAkts() {
  if (!cloudConfigured()) return false;
  try {
    const c = await import('./cloud.js');
    const d = await c.readAktsConfig();
    if (!d) return false;
    const next = { overrides: d.overrides || {}, updatedAt: d.updatedAt || 0, updatedBy: d.updatedBy || '' };
    const changed = JSON.stringify(next.overrides) !== JSON.stringify(data.overrides);
    data = next;
    save();
    if (changed) window.dispatchEvent(new CustomEvent('kkubm:akts'));
    return changed;
  } catch (err) {
    console.warn('AKTS düzeltmeleri alınamadı:', err?.code || err?.message);
    return false;
  }
}

/**
 * Yönetici kaydı. overrides = { KOD: sayı }. Müfredat değerine eşit ya da boş olanlar
 * çağıran tarafından zaten çıkarılmış olmalı; burada yalnızca sayı ve aralık denetlenir.
 */
export async function saveAkts(overrides, email) {
  const clean = {};
  for (const [code, v] of Object.entries(overrides || {})) {
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0 && n <= 60) clean[code] = Math.round(n * 2) / 2;
  }
  const c = await import('./cloud.js');
  const saved = await c.writeAktsConfig(clean, email);
  data = { overrides: saved.overrides, updatedAt: saved.updatedAt, updatedBy: saved.updatedBy };
  save();
  window.dispatchEvent(new CustomEvent('kkubm:akts'));
  return data;
}
