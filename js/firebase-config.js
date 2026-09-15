// firebase-config.js — Firebase projesinin web yapılandırması.
//
// Bu değerler GİZLİ DEĞİLDİR: her Firebase web uygulamasında tarayıcıya açıkça gönderilir.
// Verileri koruyan şey anahtar değil, Firestore güvenlik kurallarıdır (firestore.rules).
//
// null bırakılırsa hesap sistemi kapalı kalır ve uygulama eskisi gibi yalnızca bu cihazda
// çalışır. Kurulum adımları: docs/FIREBASE-KURULUM.md

export const firebaseConfig = {
  apiKey: 'AIzaSyDFa5i0gWAxH__vwphwGWSieCpAsWkpBdM',
  authDomain: 'kku-bm-qievly.firebaseapp.com',
  projectId: 'kku-bm-qievly',
  storageBucket: 'kku-bm-qievly.firebasestorage.app',
  messagingSenderId: '431106579015',
  appId: '1:431106579015:web:06235c3ceba1b9c3512f62',
};

// AKTS düzeltmelerini yapabilen hesaplar. Güvenlik kuralı (firestore.rules) da aynı listeyi
// kullanır; burası yalnızca düzenleme ekranını göstermek için. İkisi birlikte güncellenmeli.
export const ADMIN_EMAILS = ['gurkanselamci@gmail.com'];
