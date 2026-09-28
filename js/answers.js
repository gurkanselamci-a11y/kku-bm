// answers.js — bir cevabın doğru sayılıp sayılmayacağı. Tek doğruluk kaynağı burası;
// hem quiz motoru hem deneme sınavı buradan geçer.
//
// Üç ayrı derdi çözer:
//
// 1. SEMBOLİK SAYISAL CEVAP. Soru "y(e) kaçtır?" diyor, öğrenci kâğıt üzerinde
//    `e√6` buluyor ama kutuya sayı girmesi gerekiyor; hesap makinesine koşup
//    6.66 yazınca da tolerans dışında kalıyordu. Artık kutuya doğrudan `e*sqrt(6)`
//    ya da `e√6` yazılabiliyor — küçük bir ifade değerlendirici çalışıyor.
//    eval/Function KULLANILMAZ: girdiyi kendi elimizle çözümlüyoruz.
//
// 2. MANTIK İFADELERİ. Eskiden kısa cevap metin olarak sadeleştiriliyordu ve
//    normalize() bütün işaretleri attığı için `¬p ∧ ¬q` de `p ∧ q` de "p q"
//    oluyordu: yanlış cevap doğru sayılıyordu. Artık iki taraf da mantık ifadesi
//    gibi duruyorsa ifade olarak çözümlenip karşılaştırılıyor; `~p^~q`, `p' ve q'`,
//    `değil p ve değil q` aynı cevap, `p^q` değil.
//
// 3. MAKUL YUVARLAMA. Cevap 6.658403 iken 6.66 yazan öğrenci yanlış yapmış
//    sayılmamalı. Yazarın verdiği toleransı en fazla 10 katına kadar, cevabın
//    binde ikisiyle sınırlı olarak genişletiyoruz. `tolerance: 0` yazan soru
//    (tam sayı isteyen sayma soruları) buna girmez.

const REL = 0.002;      // makul yuvarlama payı — cevabın binde ikisi
const REL_KAT = 10;     // yazarın toleransının en fazla bu katına kadar genişler
const YAKIN_KAT = 5;    // bu pay içinde kalan cevap "çok yakın" diye işaretlenir

/**
 * Türkçe duyarlı sadeleştirme: küçük harf, aksan ve noktalama temizliği.
 * Kesme işareti BOŞLUĞA değil hiçliğe düşer; böylece "She's" ile "Shes",
 * "Ankara'da" ile "Ankarada" aynı kabul edilir.
 */
export function normalize(s) {
  return String(s ?? '')
    .toLocaleLowerCase('tr-TR')
    .replace(/[‘’ʼ'`´]/g, '')
    .replace(/[ıİ]/g, 'i').replace(/[şŞ]/g, 's').replace(/[ğĞ]/g, 'g')
    .replace(/[üÜ]/g, 'u').replace(/[öÖ]/g, 'o').replace(/[çÇ]/g, 'c')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

// ==================================================================== sayısal ifade

const SABIT = { pi: Math.PI, e: Math.E, tau: Math.PI * 2, inf: Infinity };

const FONK = {
  sqrt: Math.sqrt, kok: Math.sqrt, cbrt: Math.cbrt,
  ln: Math.log, log: Math.log10, log10: Math.log10, log2: Math.log2,
  exp: Math.exp, abs: Math.abs,
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
  asin: Math.asin, acos: Math.acos, atan: Math.atan,
};

// İki değişkenli: kombinasyon ve permütasyon — ayrık matematikte cevap sık sık
// C(10,3) biçiminde bulunur, öğrenci 120'yi ayrıca hesaplamak zorunda kalmasın.
const FONK2 = {
  c: (n, k) => faktoriyel(n) / (faktoriyel(k) * faktoriyel(n - k)),
  p: (n, k) => faktoriyel(n) / faktoriyel(n - k),
};

function faktoriyel(n) {
  if (!Number.isInteger(n) || n < 0 || n > 170) return NaN;
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

/** Yazıyı hesaplanabilir biçime indirger: √ → sqrt, π → pi, virgül → nokta… */
function sadeIfade(metin) {
  const ham = String(metin ?? '');
  // Türkçe ondalık virgül (6,66) noktaya çevrilir — ama C(10,3) gibi iki değişkenli
  // çağrıda virgül ayraçtır, ona dokunulmaz.
  const ayrac = /\b[cp]\s*\(/i.test(ham);
  return (ayrac ? ham : ham.replace(/(\d),(\d)/g, '$1.$2'))
    .toLowerCase()
    .replace(/[−‒–—]/g, '-')
    .replace(/[×⋅∙·]/g, '*')
    .replace(/÷/g, '/')
    .replace(/√/g, ' sqrt ')
    .replace(/π/g, ' pi ')
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
    .replace(/∞/g, ' inf ')
    .replace(/[{}\[\]]/g, (ch) => (ch === '{' || ch === '[' ? '(' : ')'))
    .trim();
}

/**
 * Sayısal ifadeyi çözer. Sayı döner, çözemezse NaN.
 * Desteklenen: + - * / ^ ( ) ! , sabitler (pi, e), tek ve iki değişkenli fonksiyonlar,
 * ve örtük çarpma (2pi, e sqrt 6, 3(4+1)).
 */
export function sayiCoz(metin) {
  const s = sadeIfade(metin);
  if (!s || s.length > 160) return NaN;
  let i = 0;

  const bosluk = () => { while (i < s.length && s[i] === ' ') i++; };
  const bak = () => { bosluk(); return s[i]; };
  const yut = (ch) => { bosluk(); if (s[i] === ch) { i++; return true; } return false; };

  function toplam() {
    let v = carpim();
    for (;;) {
      bosluk();
      if (s[i] === '+') { i++; v += carpim(); }
      else if (s[i] === '-') { i++; v -= carpim(); }
      else return v;
    }
  }

  function carpim() {
    let v = tekli();
    for (;;) {
      bosluk();
      if (s[i] === '*') { i++; v *= tekli(); }
      else if (s[i] === '/') { i++; v /= tekli(); }
      else if (/[0-9.(a-z]/.test(s[i] || '')) v *= tekli();   // örtük çarpma
      else return v;
    }
  }

  function tekli() {
    bosluk();
    if (s[i] === '-') { i++; return -tekli(); }
    if (s[i] === '+') { i++; return tekli(); }
    return us();
  }

  function us() {
    const taban = sonek();
    bosluk();
    if (s[i] === '^') { i++; return Math.pow(taban, tekli()); }   // sağa bağlı: 2^-1
    return taban;
  }

  function sonek() {
    let v = atom();
    for (;;) { bosluk(); if (s[i] === '!') { i++; v = faktoriyel(v); } else return v; }
  }

  function atom() {
    bosluk();
    if (yut('(')) { const v = toplam(); if (!yut(')')) throw 0; return v; }
    const sayi = /^\d+(?:\.\d+)?(?:e[+-]?\d+)?/.exec(s.slice(i));
    if (sayi) { i += sayi[0].length; return parseFloat(sayi[0]); }
    const ad = /^[a-z]+/.exec(s.slice(i));
    if (!ad) throw 0;
    const isim = ad[0];
    i += isim.length;
    if (FONK2[isim] && bak() === '(') {
      yut('(');
      const a = toplam();
      if (!yut(',')) throw 0;
      const b = toplam();
      if (!yut(')')) throw 0;
      return FONK2[isim](a, b);
    }
    if (FONK[isim]) return FONK[isim](tekli());   // sqrt 6 ve sqrt(6) ikisi de geçerli
    if (isim in SABIT) return SABIT[isim];
    throw 0;
  }

  try {
    const v = toplam();
    bosluk();
    return i === s.length && Number.isFinite(v) ? v : NaN;
  } catch (_) {
    return NaN;
  }
}

// ==================================================================== mantık ifadesi

// Öncelik: değil > ve > veya > ise > ancak ve ancak
const ONCELIK = { '=': 1, '>': 2, '|': 3, '&': 4 };

/**
 * Mantık ifadesini tek harfli belirteçlere indirger. Sözcük biçimleri ("ve", "veya",
 * "ise", "değil") ve okuldan okula değişen semboller ortak yazıya çevrilir.
 */
function sadeMantik(metin) {
  let s = String(metin ?? '').toLocaleLowerCase('tr-TR');
  // Üstteki çizgi (LaTeX \overline / \bar) sonek değil demektir
  s = s.replace(/\\overline\s*\{([^{}]*)\}/g, '($1)%').replace(/\\bar\s*\{?([a-z])\}?/g, '$1%');
  s = s.replace(/\\(?:lnot|neg|sim)/g, '¬').replace(/\\(?:land|wedge|cdot)/g, '∧')
    .replace(/\\(?:lor|vee)/g, '∨').replace(/\\(?:rightarrow|to|implies|supset)/g, '→')
    .replace(/\\(?:leftrightarrow|iff|equiv)/g, '↔').replace(/\\oplus/g, '⊕')
    .replace(/\\(?:left|right|,|;|!|quad|qquad|text|mathrm)/g, '')
    .replace(/[{}$]/g, '');
  // Sözcükler — uzun kalıplar önce ("ancak ve ancak" içindeki "ve" yutulmasın),
  // kelime sınırıyla ("very" içindeki "ve" yakalanmasın).
  s = s.replace(/\bancak ve ancak\b/g, '↔')
    .replace(/\b(?:iff|denktir)\b/g, '↔')
    .replace(/\b(?:ve|and)\b/g, '∧')
    .replace(/\b(?:veya|ya da|or)\b/g, '∨')
    .replace(/\bxor\b/g, '⊕')
    .replace(/\b(?:ise|implies)\b/g, '→')
    .replace(/\b(?:degil|değil|not|tersi)\b/g, '¬')
    .replace(/\b(?:bar|tümleyeni|tumleyeni)\b/g, '′');
  return s
    // Çift yönlü koşul tek yönlüden ÖNCE: yoksa "<=>" içindeki "=>" yutulur.
    .replace(/<->|<=>|[⇔≡]/g, '↔')
    .replace(/->|=>|[⇒⊃]/g, '→')
    .replace(/[∧^&·*]/g, '&')
    .replace(/[∨+]/g, '|')
    .replace(/[⊕⊻]/g, '#')
    .replace(/[‘’ʼ'`´′]/g, '%')    // p' → sonek değil
    .replace(/↔/g, '=')
    .replace(/→/g, '>')
    .replace(/[¬!~]/g, '!')
    .replace(/\bv\b/g, '|')        // "p v q" — Türkçe kitaplarda yaygın "veya"
    .replace(/⊤/g, '1')
    .replace(/⊥/g, '0')
    .replace(/\s+/g, '');
}

/** Ayrıştırıcı: mantık ifadesini ağaca çevirir, olmuyorsa null döner. */
function mantikAgac(metin) {
  const s = sadeMantik(metin);
  if (!s || s.length > 120 || !/[a-z]/.test(s)) return null;
  if (/[^a-z01!&|>=#()%]/.test(s)) return null;
  let i = 0;

  const yut = (ch) => (s[i] === ch ? (i++, true) : false);

  function ikiYonlu() {
    let n = koşul();
    while (yut('=')) n = { op: '=', c: [n, koşul()] };
    return n;
  }
  function koşul() {
    const sol = xor();
    if (yut('>')) return { op: '>', c: [sol, koşul()] };   // sağa bağlı
    return sol;
  }
  function xor() {
    let n = veya();
    while (yut('#')) n = { op: '#', c: [n, veya()] };
    return n;
  }
  function veya() {
    let n = ve();
    while (yut('|')) n = { op: '|', c: [n, ve()] };
    return n;
  }
  function ve() {
    let n = degil();
    while (yut('&')) n = { op: '&', c: [n, degil()] };
    return n;
  }
  function degil() {
    if (yut('!')) return { op: '!', c: [degil()] };
    return sonek();
  }
  function sonek() {
    let n = atom();
    while (yut('%')) n = { op: '!', c: [n] };
    return n;
  }
  function atom() {
    if (yut('(')) { const n = ikiYonlu(); if (!yut(')')) throw 0; return n; }
    const ch = s[i];
    if (ch === '0' || ch === '1') { i++; return { op: 'sabit', v: ch === '1' }; }
    if (ch && ch >= 'a' && ch <= 'z') { i++; return { op: 'var', v: ch }; }
    throw 0;
  }

  try {
    const n = ikiYonlu();
    return i === s.length ? n : null;
  } catch (_) {
    return null;
  }
}

/** Ağacı tek biçimli yazıya döker; ve/veya/xor'un terimleri sıralanır (p&q = q&p). */
function yaz(n) {
  if (n.op === 'var') return n.v;
  if (n.op === 'sabit') return n.v ? '1' : '0';
  if (n.op === '!') {
    const ic = yaz(n.c[0]);
    return '!' + (ic.length > 1 && !/^!/.test(ic) ? `(${ic})` : ic);
  }
  const parcala = (x) => (x.op === n.op && '&|#'.includes(n.op) ? x.c.flatMap(parcala) : [x]);
  const uc = '&|#'.includes(n.op) ? parcala(n) : n.c;
  let parts = uc.map((x) => {
    const t = yaz(x);
    const zayif = x.op !== 'var' && x.op !== 'sabit' && x.op !== '!'
      && (ONCELIK[x.op] || 0) <= (ONCELIK[n.op] || 0) && x.op !== n.op;
    return zayif ? `(${t})` : t;
  });
  if ('&|#='.includes(n.op)) parts = parts.sort();
  return parts.join(n.op);
}

/** Mantık ifadesinin tek biçimli yazımı; ifade değilse null. */
export function mantikCanon(metin) {
  const n = mantikAgac(metin);
  return n ? yaz(n) : null;
}

// Yalnız başına mantık sayılmayan işaretler: `+ * ^ = & |` cebirde de kullanılıyor.
// "y=x+1" (eğik asimptot) ya da "A" (Boole sadeleştirmesi) mantık ifadesi gibi
// okunursa bir şey kazanmıyoruz, tuhaf kenar durumları kazanıyoruz. Bu yüzden soruyu
// mantık sorusu saymak için ORTADA AÇIKÇA mantık işareti olmalı: değilleme ya da
// sözcük/sembol hâlinde bir bağlaç.
const MANTIK_ISARETI = /[¬∧∨→↔⇒⇔⊕⊻≡⊤⊥~′]|'|<->|->|&&|\|\||\\(?:lnot|neg|land|lor|rightarrow|leftrightarrow|oplus|overline|bar|to|iff|sim)\b|\b(?:ve|veya|ya da|değil|degil|ise|xor|iff|bar|tersi|tümleyeni|tumleyeni|and|or|not)\b/i;

/** Bu cevap gerçekten bir mantık ifadesi mi (cebirsel ifade değil)? */
export function mantikIfadesi(metin) {
  if (!MANTIK_ISARETI.test(String(metin ?? ''))) return null;
  return mantikCanon(metin);
}

function degiskenler(n, kume = new Set()) {
  if (n.op === 'var') kume.add(n.v);
  (n.c || []).forEach((x) => degiskenler(x, kume));
  return kume;
}

function hesapla(n, d) {
  switch (n.op) {
    case 'var': return !!d[n.v];
    case 'sabit': return n.v;
    case '!': return !hesapla(n.c[0], d);
    case '&': return hesapla(n.c[0], d) && hesapla(n.c[1], d);
    case '|': return hesapla(n.c[0], d) || hesapla(n.c[1], d);
    case '#': return hesapla(n.c[0], d) !== hesapla(n.c[1], d);
    case '>': return !hesapla(n.c[0], d) || hesapla(n.c[1], d);
    case '=': return hesapla(n.c[0], d) === hesapla(n.c[1], d);
    default: return false;
  }
}

/**
 * İki ifade mantıksal olarak denk mi (doğruluk tablosu)? Denklik tek başına "doğru"
 * saymaya yetmez — "sadeleştir" sorusunda sorunun kendisi de kendine denktir. Sadece
 * "denk ama sadeleşmemiş" uyarısını verirken kullanılır.
 */
export function mantikDenk(a, b) {
  const A = mantikAgac(a);
  const B = mantikAgac(b);
  if (!A || !B) return false;
  const vars = [...new Set([...degiskenler(A), ...degiskenler(B)])];
  if (vars.length > 8) return false;
  for (let m = 0; m < (1 << vars.length); m++) {
    const d = {};
    vars.forEach((v, k) => { d[v] = !!(m & (1 << k)); });
    if (hesapla(A, d) !== hesapla(B, d)) return false;
  }
  return true;
}

// ==================================================================== cevap denetimi

/** Sayısal cevapta kabul penceresi — makul yuvarlama cezalandırılmasın. */
export function sayiPayi(hedef, tolerance) {
  const tol = Math.abs(tolerance ?? 0.01);
  // tolerance: 0 "tam sayı istiyorum" demektir (sayma soruları) — dokunmuyoruz.
  if (!tol) return 0;
  return Math.max(tol, Math.min(Math.abs(hedef) * REL, tol * REL_KAT));
}

/**
 * Cevap doğrulama — tüm soru tipleri için tek kapı.
 * Dönüş: { correct, expected, yakin?, denk?, deger? }
 *   yakin — sayısal cevap payın dışında ama az farkla (arayüz "çok yakın" der)
 *   denk  — mantık ifadesi beklenene denk ama beklenen biçimde değil
 *   deger — öğrenci sembolik yazdıysa ifadenin sayısal karşılığı
 */
export function checkAnswer(q, given) {
  switch (q.type) {
    case 'mcq':
      return { correct: Number(given) === Number(q.answer), expected: q.choices?.[q.answer] };
    case 'tf':
      return { correct: Boolean(given) === Boolean(q.answer), expected: q.answer ? 'Doğru' : 'Yanlış' };
    case 'numeric': {
      const hedef = Number(q.answer);
      const ham = String(given).replace(',', '.').trim();
      // Düz sayı önce denenir; olmuyorsa ifade olarak çözülür (e*sqrt(6), C(10,3)…)
      const duz = /^[+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(ham) ? parseFloat(ham) : NaN;
      const val = Number.isFinite(duz) ? duz : sayiCoz(given);
      const pay = sayiPayi(hedef, q.tolerance);
      const fark = Math.abs(val - hedef);
      const expected = `${q.answer}${q.unit ? ' ' + q.unit : ''}`;
      if (!Number.isFinite(val)) return { correct: false, expected };
      const ok = fark <= pay;
      const out = { correct: ok, expected };
      if (!Number.isFinite(duz)) out.deger = val;
      if (!ok && fark <= Math.max(pay * YAKIN_KAT, Math.abs(hedef) * 0.01)) out.yakin = true;
      return out;
    }
    case 'short': {
      const accept = q.accept || [];
      // Mantık yolu: SORU mantık sorusuysa (kabul listesinde açık bir mantık işareti
      // varsa) cevap metin olarak değil ifade olarak karşılaştırılır. Eskiden bütün
      // işaretler atıldığı için "¬p ∧ ¬q" ile "p ∧ q" aynı sayılıyordu.
      if (mantikSorusu(q)) {
        const bekleniyor = mantikGoster(accept[0]) || accept[0];
        const benim = mantikCanon(given);
        if (benim) {
          const kanon = accept.map((a) => mantikCanon(a)).filter(Boolean);
          if (kanon.includes(benim)) return { correct: true, expected: bekleniyor };
          const denk = accept.some((a) => mantikDenk(a, given));
          return { correct: false, expected: bekleniyor, denk };
        }
      }
      const norm = normalize(given);
      const accepted = accept.map(normalize).filter(Boolean);
      // Kabul edilen cevap, öğrencinin cümlesinde TAM KELİME olarak geçiyorsa doğru sayılır:
      // accept "must" iken "must be tired" da kabul edilir, ama "mustard" edilmez.
      const padded = ` ${norm} `;
      const contains = (a) => padded.includes(` ${a} `);
      // Olumsuzluk tuzağı: accept "correct" iken "not correct" doğru sayılmamalı.
      const NEG = ['not', 'no', 'never', 'degil', 'yok', 'hayir', 'yanlis'];
      const negated = (a) => NEG.some((n) => !` ${a} `.includes(` ${n} `) && padded.includes(` ${n} `));
      const ok = norm.length > 0
        && accepted.some((a) => a === norm || (contains(a) && !negated(a)));
      return { correct: ok, expected: accept[0] };
    }
    case 'code': {
      const norm = String(given || '').trim().replace(/\r/g, '').replace(/[ \t]+$/gm, '');
      const exp = String(q.expected || '').trim().replace(/\r/g, '').replace(/[ \t]+$/gm, '');
      return { correct: norm === exp, expected: q.expected };
    }
    case 'open':
      return { correct: null, expected: q.explain }; // kendi kendini değerlendirme
    default:
      return { correct: null, expected: null };
  }
}

const GOSTER = { '!': '¬', '&': ' ∧ ', '|': ' ∨ ', '>': ' → ', '=': ' ↔ ', '#': ' ⊕ ' };

/**
 * Mantık ifadesini okunur sembollerle yazar. Soru "sembolle yazınız" derken doğru
 * cevabı `~p ^ ~q` diye göstermek tuhaf kaçıyordu.
 */
export function mantikGoster(metin) {
  const k = mantikCanon(metin);
  return k ? k.replace(/[!&|>=#]/g, (c) => GOSTER[c]).replace(/\s{2,}/g, ' ').trim() : null;
}

/** Kısa cevabı mantık ifadesi olarak değerlendirmek gerekiyor mu? */
export function mantikSorusu(q) {
  return q.type === 'short' && (q.accept || []).some((a) => mantikIfadesi(a));
}

/**
 * Sorunun cevabı sembol gerektiriyor mu? Gerekiyorsa cevap kutusunun üstünde
 * sembol şeridi çıkar — telefondan ¬ ∧ ∨ yazmak imkânsıza yakın.
 */
export function sembolSeridi(q) {
  if (q.type === 'numeric') return ['√', 'π', 'e', '^', '(', ')', '/'];
  return mantikSorusu(q) ? ['¬', '∧', '∨', '→', '↔', '⊕', '(', ')'] : null;
}
