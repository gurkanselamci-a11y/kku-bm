// grades.js — harf notu ölçeği, ders başarı notu ve ortalama (GANO/DNO) hesabı.
//
// Ölçek KKÜ lisans yönetmeliğinin harf/katsayı tablosudur. Puan→harf eşlemesi MUTLAK
// değerlendirmeye göredir; bölüm bağıl değerlendirme uygularsa harf kayabilir, bu yüzden
// arayüzde harf her zaman elle değiştirilebilir (bkz. views/grades.js).

export const SCALE = [
  { k: 'AA', c: 4.00, min: 90 },
  { k: 'BA', c: 3.50, min: 85 },
  { k: 'BB', c: 3.00, min: 75 },
  { k: 'CB', c: 2.50, min: 70 },
  { k: 'CC', c: 2.00, min: 60 },
  { k: 'DC', c: 1.50, min: 55 },
  { k: 'DD', c: 1.00, min: 50 },
  { k: 'FD', c: 0.50, min: 40 },
  { k: 'FF', c: 0.00, min: 0 },
];

/** Ortalamaya katsayısıyla giren ya da hiç girmeyen özel harfler. */
export const SPECIAL = [
  { k: 'DZ', c: 0.00, label: 'Devamsız' },
  { k: 'G', c: null, label: 'Geçti — ortalamaya katılmaz' },
  { k: 'M', c: null, label: 'Muaf — ortalamaya katılmaz' },
];

const BY_KEY = new Map([...SCALE, ...SPECIAL].map((x) => [x.k, x]));

/** Geçme sınırı: CC ve üstü doğrudan geçer, DD/DC koşullu sayılır. */
export const PASS_COEF = 2.00;

export function letterFromScore(score) {
  if (!Number.isFinite(score)) return null;
  const hit = SCALE.find((x) => score >= x.min);
  return (hit || SCALE[SCALE.length - 1]).k;
}

/** Harfin katsayısı. Bilinmeyen harf ya da ortalamaya girmeyen harf (G/M) için null. */
export function coefOf(letter) {
  const row = BY_KEY.get(letter);
  return row ? row.c : null;
}

export function countsInGpa(letter) {
  return Number.isFinite(coefOf(letter));
}

export function statusOf(letter) {
  const c = coefOf(letter);
  if (letter === 'G' || letter === 'M') return { k: 'pass', label: letter === 'M' ? 'Muaf' : 'Geçti' };
  if (!Number.isFinite(c)) return { k: 'none', label: '—' };
  if (c >= PASS_COEF) return { k: 'pass', label: 'Geçti' };
  if (c >= 1.00) return { k: 'cond', label: 'Koşullu' };
  return { k: 'fail', label: 'Kaldı' };
}

// ---------- ders içi değerlendirme ----------

/** Yeni seçilen bir dersin varsayılan değerlendirme kalemleri (%40 vize + %60 final). */
export const defaultItems = () => ([
  { id: 'vize', name: 'Vize', weight: 40, score: null },
  { id: 'final', name: 'Final', weight: 60, score: null },
  { id: 'but', name: 'Bütünleme', weight: 60, score: null, replaces: 'final' },
]);

/**
 * Hesaba girecek kalemler. Bütünleme notu girildiyse finalin yerini alır; girilmediyse
 * bütünleme satırı hesap dışıdır (listede yine görünür, kullanıcı gerekirse doldurur).
 */
export function effectiveItems(items) {
  const list = (items || []).filter((i) => i && Number.isFinite(Number(i.weight)));
  const replaced = new Set(
    list.filter((i) => i.replaces && Number.isFinite(i.score)).map((i) => i.replaces),
  );
  return list.filter((i) => {
    if (replaced.has(i.id)) return false;                 // yerine bütünleme geçti
    if (i.replaces && !Number.isFinite(i.score)) return false; // boş bütünleme
    return true;
  });
}

/**
 * Ders başarı notu.
 * `score` girilen kalemlerin ağırlıklı ortalamasıdır — yani "şu ana kadarki" not.
 * Tüm ağırlık dolduğunda (`done`) bu, dersin kesin notudur.
 */
export function computeCourse(items) {
  const list = effectiveItems(items);
  const total = list.reduce((a, i) => a + Number(i.weight), 0);
  const filled = list.filter((i) => Number.isFinite(i.score));
  const filledWeight = filled.reduce((a, i) => a + Number(i.weight), 0);
  const score = filledWeight
    ? filled.reduce((a, i) => a + Number(i.score) * Number(i.weight), 0) / filledWeight
    : null;
  return {
    score,
    total,
    filledWeight,
    done: filledWeight > 0 && filledWeight >= total,
    letter: letterFromScore(score),
  };
}

/**
 * Hedef nota ulaşmak için kalan kalemlerden gereken puan.
 * Girilmemiş ağırlık yoksa ya da hedef zaten imkânsızsa null döner.
 */
export function neededFor(items, target) {
  const list = effectiveItems(items);
  const total = list.reduce((a, i) => a + Number(i.weight), 0);
  const got = list
    .filter((i) => Number.isFinite(i.score))
    .reduce((a, i) => a + Number(i.score) * Number(i.weight), 0);
  const left = total - list.filter((i) => Number.isFinite(i.score)).reduce((a, i) => a + Number(i.weight), 0);
  if (left <= 0) return null;
  return (target * total - got) / left;
}

// ---------- ortalama ----------

/**
 * Ağırlıklı ortalama. rows = [{ akts, letter }]
 * G/M gibi katsayısı olmayan harfler ve harfi olmayan dersler hesaba girmez.
 */
export function gpa(rows) {
  return weightedGpa((rows || []).map((r) => ({ akts: r.akts, coef: coefOf(r.letter) })));
}

/**
 * Ağırlıklı ortalamanın çekirdeği: parts = [{ akts, coef }].
 * Ders ders girilen notlar ve "önceki dönemlerden devir" (tek satırda GANO + AKTS)
 * aynı formülle birleşsin diye ayrı duruyor.
 */
export function weightedGpa(parts) {
  let pts = 0;
  let akts = 0;
  let counted = 0;
  for (const p of parts || []) {
    // DİKKAT: Number(null) === 0. Harfi olmayan ders "FF" gibi sayılmasın diye
    // katsayı sayı DEĞİLSE (null/undefined) satır tamamen atlanır.
    const c = typeof p.coef === 'number' ? p.coef : NaN;
    const a = Number(p.akts);
    if (!Number.isFinite(c) || !Number.isFinite(a) || a <= 0) continue;
    pts += c * a;
    akts += a;
    counted += 1;
  }
  return { gpa: akts ? pts / akts : null, akts, counted };
}

/** Geçilen (katsayı ≥ CC ya da G/M) derslerin AKTS toplamı. */
export function earnedAkts(rows) {
  return (rows || []).reduce((sum, r) => {
    const a = Number(r.akts) || 0;
    const st = statusOf(r.letter);
    return st.k === 'pass' ? sum + a : sum;
  }, 0);
}

export const fmtGpa = (v) => (Number.isFinite(v) ? v.toFixed(2) : '—');
export const fmtScore = (v) => (Number.isFinite(v) ? (Math.round(v * 10) / 10).toString().replace('.', ',') : '—');
