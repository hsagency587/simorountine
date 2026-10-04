'use strict';

/* =========================================================================
   Workout — l'app degli allenamenti, dentro la tendina Workout della Routine.
   E' l'ultima versione dell'app che sta per conto suo, con le differenze che
   servono qui: non ha un file suo (il piano sta nel file delle task della
   Routine, alla voce wk, e lo salva la Routine col suo token e la sua chiave),
   parla inglese, non ha easter egg ne' Pubblica, e la settimana sta sempre in
   cima. Questa pagina vive in una cornice dentro la Routine e le parla
   attraverso `ponteWk`. I video invece li carica lei, nel repository della
   Routine, su un branch loro.
   ========================================================================= */

/* La Routine che ci ospita. Aperta da sola, questa pagina non ha dati: torna
   alla Routine. */
const P = (() => { try { return parent !== window ? parent.ponteWk : null; } catch (e) { return null; } })();
if (!P) { location.replace('../'); throw new Error('fuori dalla Routine'); }

/* Dove vanno i video: il repository della Routine, su un branch tutto loro,
   cosi' un video non tocca mai il file delle task. Se il branch non c'e'
   ancora, il primo video lo crea. */
const REPO        = 'hsagency587/simorountine';
const BRANCH      = 'video';
const API         = 'https://api.github.com/repos/' + REPO;

/* come si guarda lo schermo: sta nel telefono, non nel file */
const VISTA_KEY   = 'gwork-wk-vista-v1';
/* i video scelti in questo telefono e non ancora arrivati su GitHub */
const CODA_KEY    = 'gwork-wk-coda-v1';

const $  = id => document.getElementById(id);

function el(tag, cls, txt) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt != null) e.textContent = txt;
  return e;
}

function today() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

const fmtTime = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });

/* ------------------------------------------------ la forma del piano ---- */

/* Le regole del piano stanno in dati.js, in comune con la Routine. */
const { MAX_SLOT, ORDINALI, MATTINA_BASE, EV, validMattina, viaGruppi, validSchede,
        nomeVideoOk, videiDi, normEs, dataOk, validTipo, latiDi, tipoDi, spostaTipi } = WK;

const nomeMattina = () => tstore.mattina || MATTINA_BASE;

/* Stesso nome, stesso esercizio: descrizione e video stanno nella libreria.
   La riga di un workout puo' avere una nota sua, che si legge sopra la
   descrizione. Un nome che in libreria non c'e' (dati scritti alla vecchia)
   prende quello scritto altrove con lo stesso nome. */
function indiceEs() {
  const m = new Map();
  const metti = (r, lib) => {
    const n = normEs(r && r[0]);
    if (!n) return;
    const x = m.get(n) || { d: '', v: '', lib: false };
    if (x.lib && !lib) return;
    if (!x.d && r[3]) x.d = r[3];
    if (!x.v && r[4]) x.v = r[4];
    if (lib) x.lib = true;
    m.set(n, x);
  };
  for (const r of tstore.libreria || []) metti(r, true);
  for (const o of [tstore].concat(tstore.prep || [])) {
    for (const k of Object.keys(o.schede || {})) for (const r of o.schede[k].es) metti(r);
  }
  return m;
}
function completo(r, ind) {
  if (!r) return r;
  const x = (ind || indiceEs()).get(normEs(r[0]));
  if (!x) return r;
  const nota = r[3] || '';
  const d = !nota ? x.d : (!x.d || nota.indexOf(x.d) >= 0) ? nota : nota + '\n\n' + x.d;
  const v = [...new Set(videiDi(r).concat(videiDi([0, 0, 0, 0, x.v])))].slice(0, 6).join(',');
  return [r[0], r[1], r[2], d, v];
}

/* ------------------------------------------------------- lo stato ---- */

/* Il piano, il token e la chiave sono della Routine: si leggono da li' ogni
   volta, mai una copia. La Routine sostituisce il suo stato quando legge il
   file online o quando un'altra sua copia ha scritto nel telefono, e una copia
   tenuta qui resterebbe indietro. */
Object.defineProperty(window, 'tstore', { get: () => P.wk() });
Object.defineProperty(window, 'token',  { get: () => P.token() });
Object.defineProperty(window, 'chiave', { get: () => P.chiave() });

/* La coda dei video da caricare: sta in questo telefono, non nel file. */
let daCaricare = (() => {
  try { const v = JSON.parse(localStorage.getItem(CODA_KEY) || '[]'); return Array.isArray(v) ? v.filter(nomeVideoOk) : []; }
  catch (e) { return []; }
})();
function salvaCoda() {
  try { localStorage.setItem(CODA_KEY, JSON.stringify(daCaricare)); } catch (e) { /* resta in memoria */ }
}

/* sch: la tendina WORKOUTS aperta; solo: la sola scheda scelta con la sua
   pastiglia, vuoto = tutte. La tendina parte sempre chiusa: aprendo l'app si
   vede oggi. La settimana non ha tendina: sta sempre in cima. */
let mostra = (() => {
  try {
    const v = JSON.parse(localStorage.getItem(VISTA_KEY) || 'null');
    if (v && typeof v === 'object') return { sch: false, solo: typeof v.solo === 'string' ? v.solo : '' };
  } catch (e) { /* si parte da oggi */ }
  return { sch: false, solo: '' };
})();
function salvaMostra() {
  try { localStorage.setItem(VISTA_KEY, JSON.stringify(mostra)); } catch (e) {}
}
/* Nella Routine si scrive sempre: e' la propria app. Senza token la modifica
   resta nel telefono e la Routine dice che manca, come per tutto il resto. */
const scrive = () => true;

/* Ogni modifica passa di qui: la Routine la segna, fa comparire Save e
   riscrive nella giornata cosa si fa nei workout. */
function touch() {
  P.cambio();
}

/* Publish: il piano dei workout parte con il file della Routine, poi i video in coda. */
async function pubblica() {
  await P.pubblica();
  codaVideo();
}

/* ------------------------------------------------ il piano ---- */

const GIORNI  = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const GIORNI2 = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MESI3   = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SETTIMANA = [1, 2, 3, 4, 5, 6, 0];
/* La pagina di chi si allena parla italiano; l'editor resta in inglese. */
const GIORNI_IT  = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const GIORNI2_IT = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MESI3_IT   = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ORDINALI_IT = ['1st', '2nd', '3rd', '4th'];      /* da lunedi' a domenica */

/* Una riga di tabella: le celle in ordine, ognuna con le sue classi. */
function tabRiga(celle, cls) {
  const r = el('div', 'tabr' + (cls ? ' ' + cls : ''));
  for (const c of celle) {
    const d = el('div', 'tabc' + (c.cls ? ' ' + c.cls : ''), c.t);
    r.appendChild(d);
  }
  return r;
}

/* ------------------------------------------------ le date ---- */

const pad2 = n => (n < 10 ? '0' : '') + n;
const chiaveData = d => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
const daChiave = k => new Date(k + 'T00:00:00');
function piuGiorni(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
/* il lunedi' della settimana di una data */
function lunedi(d) { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
/* "3 Nov" */
const dataCorta = k => { const d = daChiave(k); return d.getDate() + ' ' + MESI3[d.getMonth()]; };
const dataIt = k => { const d = daChiave(k); return d.getDate() + ' ' + MESI3_IT[d.getMonth()]; };
const giorniFra = (a, b) => Math.round((daChiave(b) - daChiave(a)) / 86400000);

/* ------------------------------------------------ quale piano vale ---- */

/* La preparazione in corso in una data, o null. */
const prepDi = k => tstore.prep.find(p => p.dal <= k && k <= p.al) || null;

/* Il numero della settimana di una preparazione in cui cade una data: 0 per la
   prima. Oltre l'ultima scritta si ripete l'ultima. */
function settimanaDi(p, k) {
  const i = Math.floor(giorniFra(chiaveData(lunedi(daChiave(p.dal))), chiaveData(lunedi(daChiave(k)))) / 7);
  return Math.max(0, Math.min(i, p.settimane.length - 1));
}

/* Il piano che vale in una data: quello della preparazione, se ce n'e' una in
   corso, altrimenti quello di sempre. `src` dice da dove vengono le schede. */
function pianoDi(k) {
  const p = prepDi(k);
  if (!p) return { src: 'base', prep: null, workout: tstore.workout, conti: tstore.conti,
                   schede: tstore.schede, mattina: tstore.mattina, mattinaVia: tstore.mattinaVia,
                   mattinaQuando: tstore.mattinaQuando, altre: tstore.altre };
  const i = settimanaDi(p, k);
  const w = p.settimane[i];
  return { src: p.id, prep: p, sett: i, workout: w.workout, conti: w.conti,
           schede: p.schede, mattina: p.mattina, mattinaVia: p.mattinaVia,
           mattinaQuando: p.mattinaQuando, altre: p.altre };
}

/* Le schede di una fonte: il piano di sempre o una preparazione. */
function schedeDi(src) {
  if (src === 'base') return tstore.schede;
  const p = tstore.prep.find(x => x.id === src);
  return p ? p.schede : {};
}

/* I workout di un giorno di un piano: solo le caselle che il giorno ha. */
const workoutDelGiorno = (pi, g) => (pi.workout[g] || []).slice(0, pi.conti[g] || 0);

/* Ridisegnare la pagina la rifa' da zero: la posizione dello scorrimento si
   segna prima e si rimette dopo. */
function paintW() {
  const y = window.scrollY;
  disegnaW();
  window.scrollTo(0, y);
}

/* La fila delle pastiglie scorre di lato per conto suo: ridisegnandola resta
   dove l'aveva lasciata il dito. */
let chipX = 0;

/* La pagina si legge e basta: si scrive nell'editor. Tutto quello che si vede
   viene dal piano che vale oggi, e la tabella giorno per giorno: se una
   preparazione finisce a meta' settimana, da quel giorno torna il piano di
   sempre. */
/* L'anteprima di una preparazione che sta per iniziare: la pagina si
   disegna come se fosse gia' il primo giorno. null = la pagina di oggi. */
let anteprima = null;
/* Quanti giorni prima dell'inizio compare l'avviso: dal sabato per un lunedi'. */
const AVVISO_GIORNI = 2;

/* La pagina della tendina. In cima la preparazione in corso, poi la settimana
   (sempre aperta, senza tendina: nella Routine si vuole vedere subito), poi le
   liste di tutti i giorni e gli allenamenti di oggi, e in fondo la tendina
   WORKOUTS. */
function disegnaW() {
  const pagina = $('wlist');
  pagina.textContent = '';
  const vero = today();
  const pAnt = anteprima ? tstore.prep.find(x => x.id === anteprima) : null;
  if (!pAnt) anteprima = null;
  const t0 = pAnt ? daChiave(pAnt.dal) : vero;
  const kOggi = chiaveData(t0);
  const oggi = pianoDi(kOggi);

  const box = el('section', 'col col-sx');
  const dx = el('section', 'col col-dx');
  /* la preparazione in corso: nome, date, quanto manca. Sta sopra tutto */
  if (oggi.prep) {
    const p = oggi.prep;
    const manca = giorniFra(kOggi, p.al);
    const b = el('div', 'prepbanda');
    if (p.nomeFine && p.nome && kOggi === p.al && !pAnt) {
      /* il giorno dell'evento: TODAY e il nome, in grande */
      b.classList.add('evento');
      b.appendChild(el('p', 'prepbanda-eti', 'TODAY'));
      b.appendChild(el('p', 'prepbanda-evento', p.nome));
    } else {
      b.appendChild(el('p', 'prepbanda-eti', 'PREPARATION' + (p.nome ? ' · ' + p.nome : '')));
      b.appendChild(el('p', 'prepbanda-date', dataIt(p.dal) + ' → ' + dataIt(p.al) +
        (pAnt ? '' : ' · ' + (manca === 0 ? 'last day' : manca === 1 ? '1 day left' : manca + ' days left'))));
    }
    pagina.appendChild(b);
  }
  pagina.appendChild(box);
  pagina.appendChild(dx);

  /* in anteprima: la barra per tornare indietro */
  if (pAnt) {
    const bar = el('div', 'antbar');
    const ind = el('button', 'schbtn antindietro', '‹ Back');
    ind.type = 'button';
    ind.dataset.antindietro = '1';
    bar.appendChild(ind);
    bar.appendChild(el('span', 'antbar-eti', 'PREVIEW'));
    box.appendChild(bar);
  }

  /* una preparazione che inizia fra poco: l'avviso, con l'anteprima */
  if (!pAnt) {
    const kVero = chiaveData(vero);
    const pross = tstore.prep.find(x => x.dal > kVero && giorniFra(kVero, x.dal) <= AVVISO_GIORNI);
    if (pross) {
      const fra = giorniFra(kVero, pross.dal);
      const b = el('div', 'prossima');
      const quando = fra === 1 ? 'Tomorrow' : 'On ' + GIORNI_IT[daChiave(pross.dal).getDay()];
      const testo = el('p', 'prossima-testo', quando + ' starts ');
      testo.appendChild(el('b', null, pross.nome || 'the preparation'));
      b.appendChild(testo);
      const ap = el('button', 'prossima-btn', 'Preview');
      ap.type = 'button';
      ap.dataset.anteprima = pross.id;
      b.appendChild(ap);
      box.appendChild(b);
    }
  }

  /* La settimana di adesso, da lunedi' a domenica, ogni giorno col piano che
     vale in quella data. Le colonne sono quante ne servono al giorno piu'
     pieno; gli altri hanno le caselle in piu' vuote. */
  const lun = lunedi(t0);
  const giorni = SETTIMANA.map((g, i) => {
    const d = piuGiorni(lun, i);
    const k = chiaveData(d);
    const pi = pianoDi(k);
    return { g: g, d: d, k: k, pi: pi, w: workoutDelGiorno(pi, g) };
  }).filter(x => !pAnt || (x.k >= pAnt.dal && x.k <= pAnt.al));   /* in anteprima: solo i giorni della preparazione */
  const n = Math.max(1, ...giorni.map(x => x.pi.conti[x.g] || 0));
  const tab = el('div', 'tab tab-w');
  tab.style.setProperty('--wcol', n);
  /* in cima alla tabella, sempre la stessa scritta, su tutta la riga */
  const capo = tabRiga([{ t: 'SCHEDULING', cls: 'tuttariga' }], 'capo');
  tab.appendChild(capo);
  for (const x of giorni) {
    const celle = [{ t: GIORNI2_IT[x.g] + ' ' + x.d.getDate(), cls: 'eti' }];
    const quanti = x.pi.conti[x.g] || 0;
    const ev = x.pi.prep && x.pi.prep.nomeFine && x.pi.prep.nome && x.k === x.pi.prep.al;
    if (ev) celle.push({ t: x.pi.prep.nome, cls: 'evento' });
    else for (let i = 0; i < n; i++) {
      if (i >= quanti) celle.push({ t: '', cls: 'fuori' });
      else if (x.w[i] === MORNING) celle.push({ t: nomeMattinaDi(x.pi), cls: 'every' });
      else celle.push({ t: x.w[i] || '—', cls: x.w[i] ? '' : 'vuota' });
    }
    const cls = [x.k === kOggi ? 'oggi' : '', x.pi.prep ? 'inprep' : ''].filter(Boolean).join(' ');
    tab.appendChild(tabRiga(celle, cls));
  }
  box.appendChild(tab);

  paintMorning(box, oggi, kOggi);
  paintOggi(box, oggi, kOggi, t0.getDay(), pAnt ? GIORNI_IT[t0.getDay()].toUpperCase() + ' ' + t0.getDate() + ' WORKOUTS' : 'TODAY WORKOUTS');
  paintSchede(dx, oggi);
}


/* Gli allenamenti diversi scritti in un piano, nell'ordine della settimana. */
function allenamentiDi(pi) {
  const out = [];
  for (const g of SETTIMANA) {
    for (const v of workoutDelGiorno(pi, g)) if (v && v !== MORNING && out.indexOf(v) < 0) out.push(v);
  }
  return out;
}

/* Le frecce ai lati della fila: spariscono se ci sta tutto, e quella del
   capolinea si spegne quando da quella parte non c'e' piu' niente. */
function frecceChip(riga) {
  const f = riga.querySelector('.chipsch');
  const sx = riga.querySelector('[data-chipscorri="-1"]');
  const dx = riga.querySelector('[data-chipscorri="1"]');
  const scorre = f.scrollWidth > f.clientWidth + 1;
  sx.hidden = !scorre;
  dx.hidden = !scorre;
  if (!scorre) return;
  sx.classList.toggle('spenta', f.scrollLeft <= 1);
  dx.classList.toggle('spenta', f.scrollLeft >= f.scrollWidth - f.clientWidth - 1);
}

/* Una scheda da leggere: il nome nella riga grigia in alto, poi gli esercizi. */
function tabScheda(nome, sc) {
  const tab = el('div', 'tab tab-i');
  osservaTab.observe(tab);
  const cap = el('div', 'tabr capo schcapo');
  cap.appendChild(el('div', 'tabc', nome));
  /* una quantita' scritta senza esercizio sta nella banda del nome */
  const sole = (sc.es || []).filter(r => !r[0] && r[1]).map(r => r[1]);
  if (sole.length) cap.appendChild(el('div', 'tabc val', sole.join('  ·  ')));
  tab.appendChild(cap);
  return tab;
}

/* Le due colonne di una scheda, nome e quanto, si dividono lo spazio secondo
   quello che c'e' scritto: se il quanto e' lungo la sua colonna si allarga,
   fino a meta' scheda al massimo. Si prova ogni larghezza e si tiene quella
   che fa la scheda piu' bassa; a parita', la colonna del nome resta larga. */
const COL_Q_MIN = 1.25 / 4.25, COL_Q_MAX = 0.5;
let righello = null;
function righe(testo, font, largo) {
  if (!testo) return 0;
  if (largo <= 0) return 99;
  const ctx = righello || (righello = document.createElement('canvas').getContext('2d'));
  ctx.font = font;
  const spazio = ctx.measureText(' ').width;
  let n = 1, x = 0;
  for (const w of testo.split(/\s+/).filter(Boolean)) {
    const lw = ctx.measureText(w).width;
    if (lw > largo) {                       /* parola piu' lunga della colonna: va a capo dentro */
      if (x > 0) n++;
      n += Math.ceil(lw / largo) - 1;
      x = lw % largo;
      continue;
    }
    if (x > 0 && x + spazio + lw > largo) { n++; x = lw; }
    else x += (x > 0 ? spazio : 0) + lw;
  }
  return n;
}
function bilanciaTab(tab) {
  if (!tab.isConnected) { osservaTab.unobserve(tab); return; }
  const dati = [];
  for (const r of tab.querySelectorAll('.tabr')) {
    const eti = r.querySelector(':scope > .tabc.eti'), val = r.querySelector(':scope > .tabc.val');
    if (!eti || !val || r.classList.contains('capo')) continue;
    const W = r.clientWidth;
    if (!W) continue;
    const fe = getComputedStyle(eti), fv = getComputedStyle(val);
    const pad = c => parseFloat(c.paddingLeft) + parseFloat(c.paddingRight);
    const frec = val.querySelector('.desfrec');
    const extra = frec ? frec.getBoundingClientRect().width + 8 : 0;
    const tv = [...val.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join(' ');
    dati.push({ W, te: eti.textContent, tv, font: [fe.font, fv.font], pad: [pad(fe), pad(fv) + extra + 1] });
  }
  if (!dati.length) return;
  let meglio = COL_Q_MIN, costo = Infinity;
  for (let p = COL_Q_MIN; p <= COL_Q_MAX + 1e-9; p += 0.01) {
    let c = 0;
    for (const d of dati) c += Math.max(righe(d.te, d.font[0], d.W * (1 - p) - d.pad[0]), righe(d.tv, d.font[1], d.W * p - d.pad[1]));
    if (c < costo - 1e-9) { costo = c; meglio = p; }
  }
  const q = Math.min(COL_Q_MAX, meglio);
  tab.style.setProperty('--colonne', 'minmax(0,' + (1 - q).toFixed(3) + 'fr) minmax(0,' + q.toFixed(3) + 'fr)');
}
/* la scheda si ribilancia quando cambia larghezza: girando il telefono, o
   aprendo la tendina che la contiene */
const osservaTab = typeof ResizeObserver === 'function'
  ? new ResizeObserver(voci => { for (const v of voci) bilanciaTab(v.target); })
  : { observe() {}, unobserve() {} };

/* Le righe di una scheda: gli esercizi, e il recupero in fondo a destra, solo
   se e' scritto. `src` e `nome` dicono dove sta la scheda, per aprire la
   descrizione di un esercizio. */
function righeScheda(tab, sc, src, nome) {
  const pila = new Pila(tab);
  const ind = indiceEs();
  sc.es.forEach((r0, i) => {
    if (!r0[0]) return;
    const r = completo(r0, ind);              /* senza nome: sta nella banda, o e' vuota */
    const dove = pila.vai(r[2] || []);
    const riga = r[1]
      ? tabRiga([{ t: r[0] || '—', cls: r[0] ? 'eti' : 'eti vuota' },
                 { t: r[1], cls: 'val' }])
      : tabRiga([{ t: r[0], cls: 'eti' }], 'solo');
    /* con una descrizione dentro, la riga si tocca e si apre. La freccia dice
       che sotto c'e' qualcosa da leggere o da guardare. In un Tabata si apre
       ogni esercizio, anche senza descrizione: da li' parte la sequenza, che
       comincia sempre dal primo del gruppo. */
    const tabata = !!tipoDi(sc, r0) || (r[2] || []).some(x => /tabata/i.test(x));
    if (r[3] || r[4] || tabata) {
      riga.classList.add('condesc');
      riga.dataset.desces = JSON.stringify([src, nome, i]);
      riga.lastChild.appendChild(el('span', 'desfrec', '▾'));   /* uguale per tutti: con o senza video */
    }
    dove.appendChild(riga);
  });
  if (sc.rec) {
    const r = el('div', 'tabr recgiu');
    const c = el('div', 'tabc');
    c.appendChild(el('span', 'receti', 'Recovery'));
    c.appendChild(el('span', 'recval', sc.rec));
    /* un recupero scritto come tempo ha il tasto del suo timer, a sinistra
       nella stessa casella: niente descrizione, parte subito */
    if (tempiRiga(sc.rec)) {
      r.classList.add('contimer');
      const b = el('button', 'tavvia tavvia-rec');
      b.type = 'button';
      b.dataset.recup = JSON.stringify([src, nome]);
      b.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="14" r="8"/><path d="M12 14V10M9 2h6M12 2v4M19 7l1.5-1.5"/></svg>';
      b.appendChild(el('span', null, 'Recovery'));
      c.prepend(b);
      /* il tasto dice gia' Recupero: a destra resta solo il tempo */
      c.querySelector('.receti').remove();
    }
    r.appendChild(c);
    tab.appendChild(r);
  } else if (!sc.es.length) {
    tab.appendChild(tabRiga([{ t: '—', cls: 'vuota' }]));
  }
  return tab;
}

/* Le scatole dei gruppi aperte mentre si scorre le righe di una scheda. Ogni
   riga dice la sua via: quello che e' in comune con la riga prima resta
   aperto, il resto si chiude e si riapre. */
function Pila(radice) {
  this.via = [];
  this.dove = [radice];
}

Pila.prototype.vai = function (g) {
  let n = 0;
  while (n < this.via.length && n < g.length && this.via[n] === g[n]) n++;
  this.via = this.via.slice(0, n);
  this.dove = this.dove.slice(0, n + 1);
  let primo = null;
  for (let i = n; i < g.length; i++) {
    const box = el('div', 'grpbox');
    const corpo = el('div', 'grpcorpo');
    box.appendChild(corpo);
    this.dove[this.dove.length - 1].appendChild(box);
    this.via.push(g[i]);
    this.dove.push(corpo);
    if (!primo) primo = box;
  }
  if (primo) primo.appendChild(el('span', 'grpeti', g.slice(n).join(' › ')));
  return this.dove[this.dove.length - 1];
};

/* L'attivita' del mattino ha una scheda sua, che non viene dal piano: niente
   recupero. Nel file sta sotto una chiave fissa, che non cambia mai; il nome
   che si legge sta a parte e si riscrive quando si vuole. */
const MORNING = '__morning';
const nomeMattinaDi = pi => (pi && pi.mattina) || MATTINA_BASE;

/* Se una lista Every day si vede in una data. */
function quandoVale(q, k) {
  q = q || { modo: 'sempre' };
  if (q.modo === 'giorni') return q.giorni.indexOf(daChiave(k).getDay()) >= 0;
  if (q.modo === 'ogni') { const d = giorniFra(q.dal, k); return d >= 0 && d % q.n === 0; }
  if (q.modo === 'date') return q.date.indexOf(k) >= 0;
  if (q.modo === 'ciclo') {
    const d = giorniFra(q.dal, k);
    const giro = q.passi.reduce((a, x) => a + Math.abs(x), 0);
    if (d < 0 || !giro) return false;
    let r = d % giro;
    for (const x of q.passi) { if (r < Math.abs(x)) return x > 0; r -= Math.abs(x); }
    return false;
  }
  return true;
}

/* Tutte le liste Every day di un piano: la prima e quelle in piu'. */
function listeDi(pi) {
  return [{ chiave: MORNING, nome: nomeMattinaDi(pi), via: !!pi.mattinaVia, quando: pi.mattinaQuando }]
    .concat((pi.altre || []).map(a => ({ chiave: EV(a.id), nome: a.nome || 'Every day', via: a.via, quando: a.quando })));
}

/* Le liste Every day che si vedono in una data: accese, del giorno giusto, e
   con qualcosa dentro. */
function listeDelGiorno(pi, k) {
  return listeDi(pi).filter(l => !l.via && quandoVale(l.quando, k) && pi.schede[l.chiave] && pi.schede[l.chiave].es.length);
}

function paintMorning(box, pi, k) {
  for (const l of listeDelGiorno(pi, k)) {
    const sc = pi.schede[l.chiave];
    const tab = tabScheda(l.nome, sc);
    box.appendChild(righeScheda(tab, { es: sc.es, rec: '', tipi: sc.tipi }, pi.src, l.chiave));
  }
}

/* Quello che si fa oggi, senza aprire niente: le schede del giorno, solo se
   hanno degli esercizi scritti. */
function paintOggi(box, pi, k, g, titolo) {
  let capo = false;
  for (const nome of workoutDelGiorno(pi, g)) {
    if (!nome) continue;
    /* un giorno con la lista di tutti i giorni: se il box in alto e' spento,
       la lista compare qui; se e' acceso c'e' gia' */
    if (nome === MORNING) {
      const scm = pi.schede[MORNING];
      if (!scm || !scm.es.length || listeDelGiorno(pi, k).some(l => l.chiave === MORNING)) continue;
      if (!capo) { box.appendChild(el('p', 'grp', titolo || 'TODAY WORKOUTS')); capo = true; }
      const tm = tabScheda(nomeMattinaDi(pi), scm);
      tm.classList.add('tab-oggi');
      box.appendChild(righeScheda(tm, { es: scm.es, rec: '', tipi: scm.tipi }, pi.src, MORNING));
      continue;
    }
    const sc = pi.schede[nome];
    if (!sc || (!sc.es.length && !sc.rec)) continue;
    if (!capo) { box.appendChild(el('p', 'grp', titolo || 'TODAY WORKOUTS')); capo = true; }
    const t = tabScheda(nome, sc);
    t.classList.add('tab-oggi');
    box.appendChild(righeScheda(t, sc, pi.src, nome));
  }
}

/* Le schede del piano che vale oggi, dentro una tendina: una barra con il
   numero e la freccia, che si apre e si chiude. Solo quelle con qualcosa
   dentro: le altre non avrebbero niente da far leggere. */
function paintSchede(box, pi) {
  const nomi = allenamentiDi(pi).filter(n => pi.schede[n] && (pi.schede[n].es.length || pi.schede[n].rec));
  const apri = el('button', 'wkbar' + (mostra.sch ? ' open' : ''));
  apri.type = 'button';
  apri.dataset.schroot = '1';
  apri.setAttribute('aria-expanded', mostra.sch ? 'true' : 'false');
  apri.appendChild(el('span', 'wkbar-nome', 'WORKOUTS'));
  apri.appendChild(el('span', 'wkbar-frec', '▾'));
  box.appendChild(apri);
  if (!mostra.sch) return;

  if (!nomi.length) {
    box.appendChild(el('p', 'vuoto', 'The plan is still empty.'));
    return;
  }

  const riga = el('div', 'chiprow');
  const sx = el('button', 'chipfrec', '‹');
  sx.type = 'button'; sx.dataset.chipscorri = '-1';
  sx.setAttribute('aria-label', 'Scroll the workouts left');
  const chips = el('div', 'chips chipsch');
  for (const nome of nomi) {
    const acceso = mostra.solo === nome;
    const c = el('button', 'chip chipw' + (acceso ? ' sel' : ''), nome);
    c.type = 'button';
    c.dataset.chipsch = nome;
    c.setAttribute('aria-pressed', acceso ? 'true' : 'false');
    chips.appendChild(c);
  }
  const dx = el('button', 'chipfrec', '›');
  dx.type = 'button'; dx.dataset.chipscorri = '1';
  dx.setAttribute('aria-label', 'Scroll the workouts right');
  riga.appendChild(sx); riga.appendChild(chips); riga.appendChild(dx);
  box.appendChild(riga);
  chips.scrollLeft = chipX;
  chips.addEventListener('scroll', () => {
    chipX = chips.scrollLeft;
    frecceChip(riga);
  }, { passive: true });
  requestAnimationFrame(() => frecceChip(riga));

  /* nessuna pastiglia accesa: si vedono tutte; una accesa: solo quella */
  const visti = nomi.indexOf(mostra.solo) >= 0 ? [mostra.solo] : nomi;
  const lista = el('div', 'schlista');
  box.appendChild(lista);
  for (const nome of visti) {
    const sc = pi.schede[nome];
    lista.appendChild(righeScheda(tabScheda(nome, sc), sc, pi.src, nome));
  }
}

/* ------------------------------------------------- i tocchi sulla pagina ---- */

$('wlist').addEventListener('click', ev => {
  const ant = ev.target.closest('button[data-anteprima]');
  if (ant) {
    anteprima = ant.dataset.anteprima;
    history.pushState({ ant: 1 }, '');
    disegnaW();
    window.scrollTo(0, 0);
    return;
  }
  if (ev.target.closest('button[data-antindietro]')) { history.back(); return; }
  if (ev.target.closest('button[data-calroot]')) {
    mostra.cal = !mostra.cal;
    salvaMostra();
    paintW();
    return;
  }
  if (ev.target.closest('button[data-schroot]')) {
    mostra.sch = !mostra.sch;
    salvaMostra();
    paintW();
    return;
  }
  const fr = ev.target.closest('button[data-chipscorri]');
  if (fr) {
    const f = fr.parentElement.querySelector('.chipsch');
    f.scrollBy({ left: +fr.dataset.chipscorri * f.clientWidth * 0.8, behavior: 'smooth' });
    return;
  }
  const ch = ev.target.closest('button[data-chipsch]');
  if (ch) {
    const n = ch.dataset.chipsch;
    mostra.solo = mostra.solo === n ? '' : n;
    salvaMostra();
    paintW();
    return;
  }
  const dl = ev.target.closest('.tabr[data-desces]');
  if (dl) {
    const q = JSON.parse(dl.dataset.desces);
    apriDesc(q[0], q[1], q[2]);
    return;
  }
  const rc = ev.target.closest('button[data-recup]');
  if (rc) {
    const q = JSON.parse(rc.dataset.recup);
    avviaRecupero(q[0], q[1]);
  }
});

/* ------------------------------------------- descrizione di un esercizio --- */

/* Si apre a tutto schermo, col testo grande: si legge mentre si fa
   l'esercizio. Dalla scheda aperta la stessa finestra si scrive. */
const dlgDesc = $('descrizione');

/* Un link scritto da solo su una riga: e' un video. */
const RIGA_LINK = /^\s*(https?:\/\/\S+)\s*$/i;
const haVideo = txt => String(txt || '').split('\n').some(r => RIGA_LINK.test(r));

/* Da un link al modo di mostrarlo. YouTube, Vimeo e Google Drive hanno un
   lettore da incorporare; un file video diretto si suona da solo; tutto il
   resto (Instagram, TikTok...) diventa un bottone che apre il link. I
   lettori che lo permettono partono muti: l'audio si accende dal lettore. */
function videoDi(link) {
  let u;
  try { u = new URL(link); } catch (e) { return null; }
  const host = u.hostname.replace(/^www\.|^m\./, '');
  const dritto = /\.(mp4|webm|m4v|mov|ogv)$/i.test(u.pathname);
  if (dritto) return { tipo: 'file', src: u.href };

  let id = '', verticale = false, inizio = 0;
  if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'music.youtube.com') {
    if (u.pathname === '/watch') id = u.searchParams.get('v') || '';
    else {
      const m = u.pathname.match(/^\/(shorts|embed|live)\/([^/?#]+)/);
      if (m) { id = m[2]; verticale = m[1] === 'shorts'; }
    }
  }
  if (id && /^[\w-]{6,20}$/.test(id)) {
    const t = u.searchParams.get('t') || u.searchParams.get('start') || '';
    const hms = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/);
    if (hms) inizio = (+hms[1] || 0) * 3600 + (+hms[2] || 0) * 60 + (+hms[3] || 0);
    return { tipo: 'frame', verticale: verticale,
             src: 'https://www.youtube-nocookie.com/embed/' + id + '?rel=0&playsinline=1&mute=1' + (inizio ? '&start=' + inizio : '') };
  }
  /* Wistia, Loom, Dailymotion, Streamable: tutti hanno un lettore da incorporare */
  if (/(^|\.)wistia\.(com|net)$/.test(host) || host === 'wi.st') {
    const m = u.pathname.match(/\/(?:medias|embed\/iframe|embed\/medias|iframe)\/([a-z0-9]+)/i);
    if (m) return { tipo: 'frame', src: 'https://fast.wistia.net/embed/iframe/' + m[1] + '?muted=true' };
  }
  if (host === 'loom.com') {
    const m = u.pathname.match(/^\/(?:share|embed)\/([a-f0-9]+)/i);
    if (m) return { tipo: 'frame', src: 'https://www.loom.com/embed/' + m[1] };
  }
  if (host === 'dailymotion.com' || host === 'dai.ly') {
    const m = host === 'dai.ly' ? u.pathname.match(/^\/([a-z0-9]+)/i) : u.pathname.match(/^\/video\/([a-z0-9]+)/i);
    if (m) return { tipo: 'frame', src: 'https://www.dailymotion.com/embed/video/' + m[1] + '?mute=true' };
  }
  if (host === 'streamable.com') {
    const m = u.pathname.match(/^\/(?:e\/)?([a-z0-9]+)/i);
    if (m) return { tipo: 'frame', src: 'https://streamable.com/e/' + m[1] };
  }
  if (host === 'vimeo.com') {
    const m = u.pathname.match(/^\/(\d+)/);
    if (m) return { tipo: 'frame', src: 'https://player.vimeo.com/video/' + m[1] + '?muted=1' };
  }
  if (host === 'drive.google.com') {
    const m = u.pathname.match(/\/file\/d\/([^/]+)/);
    const d = m ? m[1] : u.searchParams.get('id');
    if (d) return { tipo: 'frame', src: 'https://drive.google.com/file/d/' + encodeURIComponent(d) + '/preview' };
  }
  return { tipo: 'link', src: u.href };
}

function videoNodo(link) {
  const v = videoDi(link);
  if (!v) return el('p', 'desriga', link);
  if (v.tipo === 'file') {
    const w = el('div', 'desvideo');
    const vid = el('video');
    vid.src = v.src;
    vid.controls = true;
    vid.playsInline = true;
    vid.preload = 'metadata';
    w.appendChild(vid);
    return w;
  }
  if (v.tipo === 'frame') {
    const w = el('div', 'desvideo frame' + (v.verticale ? ' verticale' : ''));
    const f = el('iframe');
    f.src = v.src;
    f.loading = 'lazy';
    f.allow = 'autoplay; encrypted-media; fullscreen; picture-in-picture';
    f.allowFullscreen = true;
    f.referrerPolicy = 'strict-origin-when-cross-origin';
    f.title = 'Video';
    w.appendChild(f);
    return w;
  }
  const a = el('a', 'deslink', '▶  Open the video');
  a.href = v.src;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  return a;
}

/* Il testo della descrizione, riga per riga. Una riga che comincia con un
   trattino, un asterisco o un numero e' una voce di elenco. Un link da solo
   su una riga e' un video. */
function testoDesc(box, txt, senzaLink) {
  box.textContent = '';
  for (const riga of String(txt || '').split('\n')) {
    const lk = riga.match(RIGA_LINK);
    if (lk) { if (!senzaLink) box.appendChild(videoNodo(lk[1])); continue; }
    const m = riga.match(/^\s*([-*•]|\d+[.)])\s+(.*)$/);
    if (m) {
      const p = el('p', 'desriga conpunto');
      p.appendChild(el('span', 'despunto', /\d/.test(m[1]) ? m[1] : '•'));
      p.appendChild(el('span', 'destesto', m[2]));
      box.appendChild(p);
    } else {
      box.appendChild(el('p', 'desriga' + (riga.trim() ? '' : ' vuota'), riga));
    }
  }
}

/* La descrizione si apre per leggerla: si scrive nell'editor. `src` dice
   se l'esercizio sta nel piano di sempre o in una preparazione. */
function apriDesc(src, nome, i) {
  const sc = schedeDi(src)[nome];
  const r = completo(sc && sc.es[i]);
  if (!r) return;
  const lista = nome.indexOf('__') === 0 ? listeDi(src === 'base' ? tstore : tstore.prep.find(p => p.id === src) || tstore).find(l => l.chiave === nome) : null;
  $('descTit').textContent = r[0] || (lista ? lista.nome : nome);
  /* sotto il nome, per esteso: quanto (ripetizioni, tempi) e in che gruppo */
  const tg = tipoDi(sc, sc.es[i]);
  const quanto = [r[1], (r[2] || []).join(' › '), tg ? detto(tg.tipo) : ''].filter(Boolean);
  $('descQta').textContent = quanto.join('  ·  ');
  $('descQta').hidden = !quanto.length;
  /* se i tempi sono tempi veri, accanto c'e' il tasto del timer */
  tPiano = pianoTimer(sc, sc.es[i]);
  $('tAvvia').hidden = !tPiano;
  if (tPiano) $('tAvviaTxt').textContent = tPiano.sequenza ? 'Start sequence' : 'Start';
  $('descQtaRiga').hidden = !quanto.length && !tPiano;
  /* i link video scritti nel testo salgono nello slot, dopo i video caricati */
  testoDesc($('descTesto'), r[3], true);
  dlgDesc.showModal();
  dlgDesc.focus();                /* niente tastiera addosso appena si apre */
  vLista = videiDi(r).map(n => ({ tipo: 'mio', nome: n }));
  for (const riga of String(r[3] || '').split('\n')) {
    const lk = riga.match(RIGA_LINK);
    const v = lk && videoDi(lk[1]);
    if (v) vLista.push(v);
  }
  vIdx = 0;
  paintVNav();
  /* con piu' video, un avviso leggero sopra il primo: sparisce al tocco */
  $('vAvviso').hidden = vLista.length < 2;
  $('vAvviso').textContent = vLista.length + ' videos: the arrows are below';
  mostraElemento(vLista[0] || null);
}

/* Il recupero di una scheda: il timer parte subito, a tutto schermo, senza
   passare da una descrizione. Fermandolo si torna alla pagina. */
let tSoloTimer = false;
function avviaRecupero(src, nome) {
  const sc = schedeDi(src)[nome];
  const pr = sc && sc.rec && pianoTempi('Recovery', sc.rec);
  if (!pr) return;
  /* e' tutto recupero: il timer lo dice e lo colora cosi' */
  const piano = { sequenza: false, fase: i => { const f = pr.fase(i); return f && Object.assign({}, f, { pausa: true }); } };
  $('descTit').textContent = '';
  $('descQta').hidden = true;
  $('descQtaRiga').hidden = true;
  testoDesc($('descTesto'), '', true);
  mostraElemento(null);
  dlgDesc.showModal();
  tmrAvvia(piano);
  tSoloTimer = true;               /* dopo: tmrAvvia ferma un timer vecchio */
}

/* Un elemento dello slot: un video caricato, un lettore incorporato
   (YouTube, Wistia, Loom...), un file video da un link, o un bottone per le
   piattaforme che non si lasciano incorporare (Patreon, Instagram...). */
function mostraElemento(x) {
  if (!x) { mostraVideo('', false); return; }
  if (x.tipo === 'mio') { mostraVideo(x.nome, false); return; }
  pulisciVideo();
  const slot = $('vSlot');
  slot.hidden = false;
  $('vVideo').hidden = true;
  $('vStato').textContent = '';
  if (x.tipo === 'file') {
    const v = $('vVideo');
    v.muted = true;
    v.src = x.src; v.hidden = false;
    return;
  }
  if (x.tipo === 'frame') {
    const f = el('iframe', 'vframe');
    f.src = x.src;
    f.allow = 'autoplay; encrypted-media; fullscreen; picture-in-picture';
    f.allowFullscreen = true;
    f.referrerPolicy = 'strict-origin-when-cross-origin';
    f.title = 'Video';
    slot.classList.toggle('verticale', !!x.verticale);
    slot.appendChild(f);
    return;
  }
  const a = el('a', 'vlink', '▶  Open the video');
  try { a.appendChild(el('span', 'vlink-host', new URL(x.src).hostname.replace(/^www\./, ''))); } catch (e) {}
  a.href = x.src; a.target = '_blank'; a.rel = 'noopener noreferrer';
  slot.appendChild(a);
}

/* Piu' video nella stessa descrizione: le frecce sotto lo slot. */
let vLista = [], vIdx = 0;
function paintVNav() {
  const n = vLista.length;
  $('vNav').hidden = n < 2;
  $('vConta').textContent = (vIdx + 1) + ' of ' + n;
  $('vPrima').disabled = vIdx <= 0;
  $('vDopo').disabled = vIdx >= n - 1;
}
function vaiVideo(d) {
  const i = vIdx + d;
  if (i < 0 || i >= vLista.length) return;
  vIdx = i;
  $('vAvviso').hidden = true;
  paintVNav();
  mostraElemento(vLista[vIdx]);
}
$('vPrima').addEventListener('click', () => vaiVideo(-1));
$('vDopo').addEventListener('click', () => vaiVideo(1));
$('vAvviso').addEventListener('click', () => { $('vAvviso').hidden = true; });
$('vSlot').addEventListener('pointerdown', () => { $('vAvviso').hidden = true; });

/* Chiudendo, i video si fermano: la finestra si svuota. */
function chiudiDesc() {
  tmrFerma();
  pulisciVideo();
  $('vNav').hidden = true;
  $('vAvviso').hidden = true;
  dlgDesc.close();
  $('descTesto').textContent = '';
}

$('descChiudi').addEventListener('click', chiudiDesc);
dlgDesc.addEventListener('cancel', ev => {
  /* col timer aperto, il tasto indietro non butta via niente: il timer va in
     pausa e resta li'. Lo chiude solo Stop; a timer finito, anche indietro */
  if (!$('tmr').hidden) {
    ev.preventDefault();
    if (!tmr.f || tmr.f.fine) tmrFerma(); else if (!tmr.fermo) tmrPausa();
    return;
  }
  pulisciVideo(); $('descTesto').textContent = '';
});

/* ------------------------------------------------------------ il timer --- */

/* I tempi si leggono da come sono scritti nelle schede. Un tempo e' 2' o 2’,
   30" o 30” (anche 30''), 1'30", 10min. Quattro casi:
   - un tempo solo, "2’": un timer di 2 minuti;
   - tempi col +, "2’ + 2’": uno dopo l'altro, con 10 secondi in mezzo;
   - un gruppo Tabata, "Tabata 45”/15”": gli esercizi del gruppo in fila,
     45" di lavoro e 15" di pausa. I giri si scrivono nel nome del gruppo
     ("x3", "3 giri"); se non ci sono, la sequenza gira finche' non si ferma;
   - un EMOM, "EMOM 10min": ogni minuto il timer riparte, per 10 minuti. Se
     l'EMOM e' un gruppo, ogni minuto passa all'esercizio dopo. Senza i
     minuti scritti, gira finche' non si ferma. */
const T_UNO = String.raw`(?:(\d{1,3})\s*(?:["”″]|''|’’)|(\d{1,3})\s*(?:['’′]|min(?:uti)?\.?)(?:\s*(\d{1,2})\s*(?:["”″]|''|’’))?)`;
const T_RE = new RegExp(T_UNO, 'gi');
const T_SOLI = new RegExp('^\\s*' + T_UNO + '(?:\\s*\\+\\s*' + T_UNO + ')*\\s*$', 'i');
const T_PAUSA_PIU = 10;
const secondiDi = m => m[1] ? +m[1] : +m[2] * 60 + (+m[3] || 0);
const tempiIn = t => [...String(t || '').matchAll(T_RE)].map(secondiDi).filter(x => x > 0);
const giriIn = t => { const m = String(t).match(/(?:^|\s)[x×]\s*(\d{1,2})\b|\b(\d{1,2})\s*(?:giri|round|rounds)\b/i); return m ? +(m[1] || m[2]) : 0; };

/* Il tipo di un gruppo detto per il Sifu, sotto il nome dell'esercizio. */
const detto = t => t.t === 'tabata'
  ? 'Tabata ' + t.l + '" work / ' + t.r + '" rest · ' + (t.g ? t.g + (t.g === 1 ? ' round' : ' rounds') : 'open rounds')
  : 'EMOM · ' + (t.m ? t.m + ' minutes' : 'open minutes');

/* Il piano del timer per una riga della scheda, o null se non ci sono tempi.
   `fase(i)` dice la fase numero i: { pausa, sec, nome, info }, o null alla fine.
   Un gruppo col suo tipo (Tabata, EMOM) comanda. Senza tipo, un Tabata si
   riconosce ancora dal nome; un EMOM no: c'e' solo se il gruppo e' di tipo
   EMOM. */
let tPiano = null;
function pianoTimer(sc, r) {
  if (!r) return null;
  const righe = sc.es;
  const g = r[2] || [];
  const nomi = via => righe.filter(x => x[0] && dentroVia(x[2] || [], via)).map(x => x[0]);
  const tg = tipoDi(sc, r);

  const kt = tg ? -1 : g.findIndex(x => /tabata/i.test(x));
  if ((tg && tg.tipo.t === 'tabata') || kt >= 0) {
    const via = tg ? tg.via : g.slice(0, kt + 1), t = tg ? null : tempiIn(g[kt]);
    const lav = tg ? tg.tipo.l : t[0] || 20, rec = tg ? tg.tipo.r : (t.length > 1 ? t[1] : 10);
    const giri = tg ? tg.tipo.g : giriIn(g[kt]);
    /* un esercizio con piu' lati ha un intervallo per lato */
    const passi = [];
    for (const x of nomi(via)) {
      const L = latiDi(tg && tg.tipo, x);
      for (let q = 1; q <= L; q++) passi.push(x + (L > 1 ? ' · side ' + q + ' of ' + L : ''));
    }
    const es = passi, n = es.length;
    if (!n) return null;
    return { sequenza: true, fase: i => {
      const passo = Math.floor(i / 2), pausa = i % 2 === 1;
      const giro = Math.floor(passo / n), j = passo % n;
      if (giri && giro >= giri) return null;
      const ultimo = giri && giro === giri - 1 && j === n - 1;
      if (pausa && ultimo) return null;
      const dove = 'Round ' + (giro + 1) + (giri ? ' of ' + giri : '') + '  ·  ' + (j + 1) + ' of ' + n;
      return pausa ? { pausa: true, sec: rec, nome: 'Next: ' + es[(j + 1) % n], info: dove }
                   : { sec: lav, nome: es[j], info: dove };
    } };
  }

  if (tg && tg.tipo.t === 'emom') {
    /* ogni esercizio per i suoi minuti di fila, poi il prossimo, a giro */
    const es = nomi(tg.via), min = tg.tipo.m, turno = [];
    es.forEach((x, j) => {
      const L = latiDi(tg.tipo, x);
      for (let lato = 1; lato <= L; lato++) {
        for (let q = 0; q < (tg.tipo.a[j] || 1); q++) turno.push(x + (L > 1 ? ' · side ' + lato + ' of ' + L : ''));
      }
    });
    if (!turno.length) return null;
    return { sequenza: es.length > 1, fase: i => {
      if (min && i >= min) return null;
      const poi = es.length > 1 && !(min && i + 1 >= min) ? '  ·  next: ' + turno[(i + 1) % turno.length] : '';
      return { sec: 60, nome: turno[i % turno.length], info: 'Minute ' + (i + 1) + (min ? ' of ' + min : '') + poi };
    } };
  }

  return pianoTempi(r[0], r[1]);
}

/* I tempi scritti in una quantita', o null se non sono tempi:
   - "2’", "1'30\"", "2’ + 2’": i tempi, uno dopo l'altro;
   - "1’/1’30”": un tempo o l'altro, si parte dal primo;
   - "3’ + 2’ cycle + 2’ walk", "1 + 1’ cycle + 1’ walk": ogni pezzo e' un
     tempo con un nome dopo; un numero senza unita' prende quella dei vicini.
   Serie e ripetizioni ("30” x 3", "2 volte gamba 1’") non sono tempi. */
const T_PEZZO = new RegExp('^' + T_UNO + '\\s*(.*)$', 'i');
const T_BARRA = new RegExp('^\\s*' + T_UNO + '(?:\\s*/\\s*' + T_UNO + ')+\\s*$', 'i');
function tempiRiga(q) {
  q = String(q || '').trim();
  if (!q) return null;
  if (T_SOLI.test(q)) return tempiIn(q).map(sec => ({ sec: sec, eti: '' }));
  if (T_BARRA.test(q)) return [{ sec: tempiIn(q)[0], eti: '' }];
  const pezzi = q.split('+').map(x => x.trim());
  const out = [];
  for (const p of pezzi) {
    const m = p.match(T_PEZZO);
    if (m && tempiIn(m[0].slice(0, m[0].length - m[4].length)).length) {
      const eti = m[4].trim();
      if (/[\dx×\/]/i.test(eti.charAt(0)) || /\d/.test(eti)) return null;
      out.push({ sec: secondiDi(m), eti: eti, sec_: m[1] ? 's' : 'm' });
      continue;
    }
    const b = pezzi.length > 1 && p.match(/^(\d{1,3})(?:\s+([^\d]*))?$/);
    if (!b) return null;
    out.push({ n: +b[1], eti: (b[2] || '').trim() });
  }
  if (!out.some(x => x.sec)) return null;
  /* i numeri senza unita': l'unita' del pezzo dopo, o di quello prima */
  out.forEach((x, i) => {
    if (x.sec) return;
    const vic = out.slice(i + 1).concat(out.slice(0, i).reverse()).find(y => y.sec);
    x.sec = vic.sec_ === 's' ? x.n : x.n * 60;
  });
  return out.map(x => ({ sec: x.sec, eti: x.eti }));
}

function pianoTempi(nome, q) {
  const t = tempiRiga(q);
  if (!t || !t.length) return null;
  const fasi = [], n = t.length;
  t.forEach((x, j) => {
    if (j) fasi.push({ pausa: true, sec: T_PAUSA_PIU, nome: nome, info: 'Next: ' + (x.eti || (j + 1) + ' of ' + n) });
    fasi.push({ sec: x.sec, nome: nome + (x.eti ? ' · ' + x.eti : ''), info: n > 1 ? (j + 1) + ' of ' + n : '' });
  });
  return { sequenza: false, fase: i => fasi[i] || null };
}

/* Il timer che corre. Il tempo si conta dall'orologio e non dai tic: se il
   telefono rallenta la pagina, i secondi restano giusti. A ogni cambio di
   fase un bip e una vibrazione; alla fine tre bip. Lo schermo resta acceso. */
const tmr = { piano: null, i: 0, f: null, fine: 0, resto: 0, fermo: false, tic: 0, audio: null, lock: null };

/* Il suono: la campanella del ring, passata da un compressore che la porta
   al massimo senza gracchiare. Si riconosce anche con la musica in palestra.
   Su iPhone la pagina suona anche col telefono in silenzioso. */
function audioTimer() {
  if (tmr.audio) return tmr.audio;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* niente */ }
  const a = new AC();
  const comp = a.createDynamicsCompressor();
  comp.threshold.value = -30; comp.knee.value = 0; comp.ratio.value = 20;
  comp.attack.value = 0.001; comp.release.value = 0.1;
  const su = a.createGain(), fuori = a.createGain();
  su.gain.value = 4;
  fuori.gain.value = 2;                 /* il compressore abbassa: qui si torna al massimo */
  su.connect(comp); comp.connect(fuori); fuori.connect(a.destination);
  a.uscita = su;
  tmr.audio = a;
  return a;
}

/* Un colpo di campanella: il colpo del martelletto, poi le note della campana
   (non armoniche, per questo suona di metallo) che si spengono piano, le piu'
   alte prima. */
const CAMPANA = [[1, 1, 1.6], [2.0, 0.55, 1.1], [2.42, 0.5, 0.9], [2.98, 0.3, 0.7],
                 [4.16, 0.28, 0.45], [5.43, 0.18, 0.3], [6.79, 0.12, 0.2]];
function colpo(a, t) {
  const f0 = 880;
  for (const [r, amp, dur] of CAMPANA) {
    const o = a.createOscillator(), g = a.createGain();
    o.frequency.value = f0 * r;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(amp * 0.5, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(a.uscita);
    o.start(t); o.stop(t + dur + 0.02);
  }
  /* il martelletto: un soffio di rumore brevissimo */
  const n = a.createBuffer(1, Math.floor(a.sampleRate * 0.03), a.sampleRate), d = n.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = a.createBufferSource(), g = a.createGain(), hp = a.createBiquadFilter();
  hp.type = 'highpass'; hp.frequency.value = 2500;
  g.gain.value = 0.4;
  src.buffer = n; src.connect(hp); hp.connect(g); g.connect(a.uscita);
  src.start(t);
}


function bip(volte) {
  if (navigator.vibrate) navigator.vibrate(volte > 1 ? [400, 150, 400, 150, 800] : [300, 100, 300]);
  const a = tmr.audio;
  if (!a) return;
  /* la campanella del ring, tre colpi di fila: uguale a ogni cambio e alla fine */
  const t0 = a.currentTime + 0.02;
  for (let k = 0; k < 3; k++) colpo(a, t0 + k * 0.28);
}

async function tieniAcceso() {
  try { if (navigator.wakeLock && !tmr.lock) tmr.lock = await navigator.wakeLock.request('screen'); } catch (e) { /* niente */ }
  if (tmr.lock) tmr.lock.addEventListener('release', () => { tmr.lock = null; });
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && tmr.piano) tieniAcceso();
});

const mmss = sec => Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');

function tmrDisegna() {
  const f = tmr.f, box = $('tmr');
  if (!f) return;
  const ms = tmr.fermo ? tmr.resto : tmr.fine - Date.now();
  box.classList.toggle('pausa', !!f.pausa);
  box.classList.toggle('fermo', tmr.fermo);
  $('tmrFase').textContent = f.fine ? 'Done' : tmr.fermo ? 'Paused' : f.pausa ? 'Rest' : 'Go';
  $('tmrNome').textContent = f.nome || '';
  $('tmrTempo').textContent = mmss(Math.max(0, Math.ceil(ms / 1000)));
  $('tmrInfo').textContent = f.info || '';
}

/* Entra nella fase i, che comincia al momento `da`. Le fasi da zero secondi
   si saltano. Se il telefono e' rimasto indietro, si recupera il passo. */
function tmrEntra(i, da) {
  for (;;) {
    const f = tmr.piano.fase(i);
    if (!f) { tmrFine(); return; }
    if (f.sec > 0) {
      tmr.i = i; tmr.f = f; tmr.fine = da + f.sec * 1000;
      if (tmr.fine > Date.now()) break;
      da = tmr.fine;
    }
    i++;
  }
  tmrDisegna();
}

function tmrTic() {
  if (tmr.fermo || !tmr.f) return;
  if (Date.now() >= tmr.fine) {
    tmrEntra(tmr.i + 1, tmr.fine);
    if (tmr.piano) bip(tmr.f && tmr.f.fine ? 3 : 1);
    return;
  }
  tmrDisegna();
}

function tmrAvvia(piano) {
  tmrFerma();
  try { const a = audioTimer(); if (a) a.resume(); } catch (e) { tmr.audio = null; }
  const v = $('vVideo');
  if (!v.paused) v.pause();
  tmr.piano = piano;
  tmr.fermo = false;
  $('tmrPausa').textContent = 'Pause';
  $('tmrPausa').hidden = false;
  tmrStopBtn('Stop', true);
  $('tmr').hidden = false;
  tmrEntra(0, Date.now());
  tmr.tic = setInterval(tmrTic, 200);
  tieniAcceso();
}

function tmrFine() {
  clearInterval(tmr.tic);
  tmr.f = { fine: true, sec: 0, nome: tmr.f ? tmr.f.nome : '', info: '' };
  tmr.fermo = true; tmr.resto = 0;
  $('tmrPausa').hidden = true;
  tmrStopBtn('Close', false);
  tmrDisegna();
  $('tmr').classList.remove('fermo');
  if (tmr.lock) tmr.lock.release().catch(() => {});
}

function tmrFerma() {
  clearInterval(tmr.tic);
  if (tSoloTimer) { tSoloTimer = false; setTimeout(chiudiDesc, 0); }
  tmr.piano = null; tmr.f = null;
  $('tmr').hidden = true;
  if (tmr.lock) tmr.lock.release().catch(() => {});
}

$('tAvvia').addEventListener('click', () => { if (tPiano) tmrAvvia(tPiano); });
/* Stop si tocca due volte: il primo tocco chiede conferma. Chiudi, a timer
   finito, basta una volta. */
function tmrStopBtn(testo, rosso) {
  const b = $('tmrStop');
  b.textContent = testo;
  delete b.dataset.sicuro;
  b.classList.toggle('btn-del', rosso);
  b.classList.remove('sicuro');
}
$('tmrStop').addEventListener('click', () => {
  const b = $('tmrStop');
  if (!tmr.f || tmr.f.fine || b.dataset.sicuro) { tmrFerma(); return; }
  b.dataset.sicuro = '1';
  b.textContent = 'Really stop?';
  b.classList.add('sicuro');
  setTimeout(() => { if (b.dataset.sicuro && !$('tmr').hidden) tmrStopBtn('Stop', true); }, 4000);
});
function tmrPausa() {
  if (!tmr.f || tmr.f.fine) return;
  if (tmr.fermo) { tmr.fine = Date.now() + tmr.resto; tmr.fermo = false; }
  else { tmr.resto = Math.max(0, tmr.fine - Date.now()); tmr.fermo = true; }
  $('tmrPausa').textContent = tmr.fermo ? 'Resume' : 'Pause';
  tmrDisegna();
}
$('tmrPausa').addEventListener('click', () => {
  tmrPausa();
});

/* ------------------------------------------------------ i video ---- */

/* Un esercizio ha un video suo, che sta in cima alla descrizione. Il file si
   sceglie dal telefono o dal PC, resta subito in questo dispositivo e al Save
   parte per GitHub, nella cartella video/ del branch del piano. Gli altri
   telefoni lo scaricano appena leggono il piano e lo tengono per sempre: in
   palestra si guarda anche senza rete. Non si cancella mai niente, ne' qui ne'
   su GitHub: i video sono pochi. */

/* Oltre questa misura GitHub rischia di rifiutare il file. */
const VIDEO_MAX = 60 * 1024 * 1024;
const RAW_VIDEO = 'https://raw.githubusercontent.com/' + REPO + '/' + BRANCH + '/video/';
const TIPI_AUDIO = { mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', wav: 'audio/wav' };
const tipoVideo = n => /\.webm$/.test(n) ? 'video/webm' : /\.jpg$/.test(n) ? 'image/jpeg'
                     : TIPI_AUDIO[n.split('.').pop()] || 'video/mp4';

/* Il deposito dei video nel telefono: IndexedDB, un file per nome. */
let dbVideo = null;
function apriDb() {
  if (!dbVideo) dbVideo = new Promise((ok, ko) => {
    const q = indexedDB.open('gwork-wk-video', 1);
    q.onupgradeneeded = () => q.result.createObjectStore('v');
    q.onsuccess = () => ok(q.result);
    q.onerror = () => ko(q.error);
  });
  return dbVideo;
}
async function vGet(n) {
  try {
    const d = await apriDb();
    return await new Promise(ok => {
      const q = d.transaction('v').objectStore('v').get(n);
      q.onsuccess = () => ok(q.result || null);
      q.onerror = () => ok(null);
    });
  } catch (e) { return null; }
}
async function vPut(n, blob) {
  const d = await apriDb();
  await new Promise((ok, ko) => {
    const t = d.transaction('v', 'readwrite');
    t.objectStore('v').put(blob, n);
    t.oncomplete = ok;
    t.onerror = () => ko(t.error);
  });
}

/* Con la Data key anche i video partono chiusi: davanti al pacchetto c'e' una
   firma, cosi' chi lo apre sa che va decifrato. */
const FIRMA = new TextEncoder().encode('WKENC1');
async function cifraByte(buf) {
  const u = new Uint8Array(buf);
  if (!chiave) return u;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv   = crypto.getRandomValues(new Uint8Array(12));
  const k    = await derivaChiave(chiave, salt);
  const ct   = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, k, u));
  const out  = new Uint8Array(FIRMA.length + 28 + ct.length);
  out.set(FIRMA, 0); out.set(salt, 6); out.set(iv, 22); out.set(ct, 34);
  return out;
}
async function decifraByte(buf) {
  const u = new Uint8Array(buf);
  if (u.length < 34 || !FIRMA.every((b, i) => u[i] === b)) return u;
  if (!chiave) throw new Error('key missing');
  const k = await derivaChiave(chiave, u.slice(6, 22));
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u.slice(22, 34) }, k, u.slice(34)));
}

/* base64 di un file grande: lo fa il browser, a pezzi, senza bloccarsi */
const b64Blob = blob => new Promise((ok, ko) => {
  const f = new FileReader();
  f.onload = () => ok(String(f.result).split(',')[1] || '');
  f.onerror = () => ko(f.error);
  f.readAsDataURL(blob);
});

/* Un video su GitHub: blob, albero, commit, e il branch che avanza. E' la via
   di GitHub per i file grandi; quella del piano si ferma molto prima. */
/* Il corpo della richiesta costruito a pezzi: il file si trasforma in testo
   3 MB alla volta e i pezzi restano pezzi (un Blob), cosi' un video da 60 MB
   non diventa mai un'unica stringa enorme nella memoria del telefono. */
async function corpoBlob(blob) {
  const parti = ['{"encoding":"base64","content":"'];
  const PEZZO = 3 * 1024 * 1024;            /* multiplo di 3: i pezzi si attaccano senza rotture */
  for (let o = 0; o < blob.size; o += PEZZO) {
    const u = new Uint8Array(await blob.slice(o, o + PEZZO).arrayBuffer());
    let t = '';
    for (let i = 0; i < u.length; i += 0x8000) t += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    parti.push(btoa(t));
    await aspetta(0);                        /* respiro: la pagina resta viva */
  }
  parti.push('"}');
  return new Blob(parti, { type: 'application/json' });
}

/* Il file mandato a GitHub con XMLHttpRequest e non con fetch: cosi' si sa a
   che punto e' e la riga in alto lo dice. */
function postaBlob(corpo, avanza) {
  return new Promise(ok => {
    const x = new XMLHttpRequest();
    x.open('POST', API + '/git/blobs');
    x.timeout = 15 * 60 * 1000;
    const H = Object.assign({ 'Content-Type': 'application/json' }, ghHeaders());
    for (const k of Object.keys(H)) x.setRequestHeader(k, H[k]);
    x.upload.onprogress = e => { if (e.lengthComputable && avanza) avanza(e.loaded / e.total); };
    x.onload = () => { try { ok(x.status < 300 ? JSON.parse(x.responseText).sha : null); } catch (e) { ok(null); } };
    x.onerror = x.ontimeout = x.onabort = () => ok(null);
    x.send(corpo);
  });
}

const aspetta = ms => new Promise(r => setTimeout(r, ms));

/* C'e' gia' online? Se un caricamento e' arrivato ma il telefono non ha fatto
   in tempo a segnarlo, non lo si rimanda. */
async function videoOnline(nome) {
  try {
    const r = await fetch(API + '/contents/video/' + nome + '?ref=' + BRANCH, { method: 'GET', headers: ghHeaders(), cache: 'no-store' });
    return r.status === 200;
  } catch (e) { return false; }
}

async function caricaVideo(nome, avanza) {
  try {
    const blob = await vGet(nome);
    if (!blob) return true;                   /* sparito dal telefono: niente da mandare */
    if (await videoOnline(nome)) return true;
    const dati = chiave ? new Blob([await cifraByte(await blob.arrayBuffer())]) : blob;
    const corpo = await corpoBlob(dati);
    /* il file va su una volta sola; poi si prova ad attaccarlo al branch */
    let sha = null;
    for (let t = 0; t < 3 && !sha; t++) {
      if (t) await aspetta(5000 * t);
      sha = await postaBlob(corpo, avanza);
    }
    if (!sha) return false;
    const H = Object.assign({ 'Content-Type': 'application/json' }, ghHeaders());
    const leggiRef = () => fetch(API + '/git/ref/heads/' + BRANCH, { headers: ghHeaders(), cache: 'no-store' });
    /* Subito dopo il salvataggio del piano GitHub a volte da' ancora il
       branch vecchio, e l'aggancio viene rifiutato: si rilegge e si riprova. */
    for (let t = 0; t < 8; t++) {
      if (t) await aspetta(1500 * t);
      try {
        let ref = await leggiRef();
        if (ref.status === 404) {
          if (!(await creaBranch())) continue;
          ref = await leggiRef();
        }
        if (!ref.ok) continue;
        const base = (await ref.json()).object.sha;
        const c0 = await fetch(API + '/git/commits/' + base, { headers: ghHeaders(), cache: 'no-store' });
        if (!c0.ok) continue;
        const albero0 = (await c0.json()).tree.sha;
        const tr = await fetch(API + '/git/trees', { method: 'POST', headers: H,
          body: JSON.stringify({ base_tree: albero0,
            tree: [{ path: 'video/' + nome, mode: '100644', type: 'blob', sha: sha }] }) });
        if (!tr.ok) continue;
        const cm = await fetch(API + '/git/commits', { method: 'POST', headers: H,
          body: JSON.stringify({ message: 'video: ' + nome, tree: (await tr.json()).sha, parents: [base] }) });
        if (!cm.ok) continue;
        const up = await fetch(API + '/git/refs/heads/' + BRANCH, { method: 'PATCH', headers: H,
          body: JSON.stringify({ sha: (await cm.json()).sha }) });
        if (up.ok) return true;
      } catch (e) { /* rete caduta a meta': si riprova */ }
    }
    return false;
  } catch (e) {
    return false;
  }
}

/* Un video da GitHub al telefono. Torna il file, o null. */
async function prendiVideo(nome) {
  try {
    const r = await fetch(RAW_VIDEO + nome, { cache: 'no-store' });
    if (!r.ok) return null;
    const u = await decifraByte(await r.arrayBuffer());
    const blob = new Blob([u], { type: tipoVideo(nome) });
    await vPut(nome, blob);
    return blob;
  } catch (e) {
    return null;
  }
}

/* Tutti i video del piano che il telefono non ha ancora: si scaricano uno alla
   volta, in silenzio, appena la Routine si apre con la rete. Anche quelli della
   libreria. Chiamata mentre sta gia' scaricando (il piano e' appena cambiato),
   finito il giro ne fa un altro. */
let scaricando = false;
let scaricaAncora = false;
async function scaricaVideo() {
  if (!navigator.onLine) return;
  if (scaricando) { scaricaAncora = true; return; }
  scaricando = true;
  try {
    const nomi = [];
    for (const tutte of [tstore.schede].concat(tstore.prep.map(p => p.schede))) {
      for (const k of Object.keys(tutte)) {
        for (const r of tutte[k].es) for (const v of videiDi(r)) if (nomi.indexOf(v) < 0) nomi.push(v);
      }
    }
    for (const r of tstore.libreria || []) for (const v of videiDi(r)) if (nomi.indexOf(v) < 0) nomi.push(v);
    for (const n of nomi) if (!(await vGet(n))) await prendiVideo(n);
  } finally {
    scaricando = false;
  }
  if (scaricaAncora) { scaricaAncora = false; scaricaVideo(); }
}

/* Lo slot del video, in cima alla descrizione. Sempre orizzontale; un video
   verticale ci sta dentro intero, con le bande ai lati. */
let vURL = null;
let vMostrato = '';

function pulisciVideo() {
  for (const x of $('vSlot').querySelectorAll('.vframe, .vlink')) x.remove();
  const v = $('vVideo');
  v.pause();
  v.removeAttribute('src');
  v.load();
  if (vURL) URL.revokeObjectURL(vURL);
  vURL = null;
  vMostrato = '';
  $('vSlot').classList.remove('verticale');
  document.body.classList.remove('vland');
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}

async function mostraVideo(nome, scrivibile) {
  pulisciVideo();
  vMostrato = nome;
  const slot = $('vSlot'), v = $('vVideo'), st = $('vStato');
  /* senza video lo slot non si vede */
  slot.hidden = !nome;
  v.hidden = true;
  if (!nome) { st.textContent = 'No video'; return; }
  st.textContent = 'Loading the video…';
  let blob = await vGet(nome);
  if (!blob && vMostrato === nome) {
    st.textContent = 'Downloading the video…';
    blob = await prendiVideo(nome);
  }
  if (vMostrato !== nome) return;            /* nel frattempo si e' chiuso o cambiato */
  if (!blob) {
    st.textContent = navigator.onLine ? 'The video is not online yet: try again in a few minutes'
                                      : 'The video is not on this phone yet: it needs internet once';
    return;
  }
  vURL = URL.createObjectURL(blob);
  v.muted = true;                            /* ogni video parte muto */
  v.src = vURL;
  v.hidden = false;
  st.textContent = '';
}

/* Verticale o orizzontale lo dice il video stesso, appena si apre. */
$('vVideo').addEventListener('loadedmetadata', () => {
  const v = $('vVideo');
  $('vSlot').classList.toggle('verticale', v.videoHeight > v.videoWidth);
  ruota();
});

/* I video partono muti: l'audio e lo schermo intero si comandano dai
   comandi del video stesso, quelli del telefono. */

/* Uscendo dallo schermo intero il telefono torna libero di girare. */
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && screen.orientation && screen.orientation.unlock) {
    try { screen.orientation.unlock(); } catch (e) { /* niente */ }
  }
});

/* Girando il telefono con un video orizzontale aperto, il video prende tutto
   lo schermo. Il browser non sempre concede lo schermo intero vero senza un
   tocco: in quel caso lo slot si allarga lo stesso sopra a tutto, e il
   risultato a occhio e' uguale. Tornando dritti, torna al suo posto. */
const orizzontale = matchMedia('(orientation: landscape) and (max-height: 600px)');
function ruota() {
  const slot = $('vSlot');
  const su = dlgDesc.open && !$('vVideo').hidden && !slot.classList.contains('verticale') && orizzontale.matches;
  document.body.classList.toggle('vland', su);
  if (su && !document.fullscreenElement && slot.requestFullscreen) slot.requestFullscreen().catch(() => {});
  if (!su && document.fullscreenElement === slot && !orizzontale.matches) document.exitFullscreen().catch(() => {});
}
if (orizzontale.addEventListener) orizzontale.addEventListener('change', ruota);

/* Un file video scelto nell'editor: resta subito nel telefono, sotto un nome
   nuovo, e al Save parte per GitHub. Torna il nome, o un errore da mostrare. */
/* La compressione dei video, prima di tenerli: il telefono registra in 1080p
   o 4K, e un esercizio si capisce benissimo in 720p. La fa il browser con i
   suoi strumenti video (WebCodecs), attraverso una libreria che si scarica
   solo quando serve. Due passate: la prima a 720p; se il file e' ancora
   sopra il limite, una seconda piu' piccola. Se il browser non ce la fa, il
   video resta com'e'. */
const MEDIABUNNY = 'https://cdn.jsdelivr.net/npm/mediabunny@1.60.0/+esm';
const PASSATE_VIDEO = [{ lato: 1280, bit: 1500000, audio: 96000 },
                       { lato: 854,  bit: 700000,  audio: 64000 }];

async function comprimiVideo(f, avanza) {
  if (!('VideoEncoder' in window)) return null;
  let mb;
  try { mb = await import(MEDIABUNNY); } catch (e) { return null; }
  let migliore = null;
  for (let i = 0; i < PASSATE_VIDEO.length; i++) {
    const p = PASSATE_VIDEO[i];
    try {
      const input = new mb.Input({ source: new mb.BlobSource(f), formats: mb.ALL_FORMATS });
      const target = new mb.BufferTarget();
      const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: 'in-memory' }), target: target });
      const conv = await mb.Conversion.init({
        input: input, output: output,
        video: t => {
          const w = t.displayWidth, h = t.displayHeight;
          const o = { bitrate: p.bit };
          if (Math.max(w, h) > p.lato) { if (w >= h) o.width = p.lato; else o.height = p.lato; }
          return o;
        },
        audio: { bitrate: p.audio }
      });
      if (!conv.isValid) break;
      conv.onProgress = x => { if (avanza) avanza((i + x) / (i + 1)); };
      await conv.execute();
      const b = new Blob([target.buffer], { type: 'video/mp4' });
      if (!migliore || b.size < migliore.size) migliore = b;
      if (b.size <= VIDEO_MAX) break;
    } catch (e) { break; }
  }
  return migliore;
}

async function tieniVideo(f, avanza) {
  const piccolo = await comprimiVideo(f, avanza);
  if (piccolo && piccolo.size < f.size) f = new File([piccolo], 'video.mp4', { type: 'video/mp4' });
  if (f.size > VIDEO_MAX) {
    return { errore: 'Video too big: ' + Math.round(f.size / 1048576) + ' MB, the limit is 60 MB. Record a shorter clip, or at 720p.' };
  }
  const est = (f.name.match(/\.(mp4|webm|mov|m4v)$/i) || [0, 'mp4'])[1].toLowerCase();
  const nome = 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8) + '.' + est;
  try {
    await vPut(nome, new Blob([f], { type: tipoVideo(nome) }));
  } catch (e) {
    return { errore: 'This device has no room for the video.' };
  }
  return { nome: nome };
}

/* ------------------------------------------------- il pannello dei gruppi ---- */

const stessaVia = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const dentroVia = (g, via) => g.length >= via.length && via.every((x, i) => g[i] === x);

function gruppiDi(sc) {
  const out = [];
  for (const r of sc.es) {
    const g = r[2] || [];
    for (let d = 1; d <= g.length; d++) {
      const v = g.slice(0, d);
      if (!out.some(x => stessaVia(x, v))) out.push(v);
    }
  }
  return out;
}

function accoda(sc, i, via) {
  const r = sc.es[i];
  const resto = sc.es.filter((x, j) => j !== i);
  let ultimo = -1;
  resto.forEach((x, j) => { if (dentroVia(x[2] || [], via)) ultimo = j; });
  if (ultimo < 0) return;
  sc.es = resto.slice(0, ultimo + 1).concat([r], resto.slice(ultimo + 1));
}

const dlgGrp = $('gruppo');
let grp = null;                   /* { src, scheda, via } */

/* Dopo ogni cambio nei gruppi si ridisegnano la pagina e l'editor. */
function dopoModifica() {
  paintW();
  if (typeof edRidisegna === 'function') edRidisegna();
}

/* `src` e' la fonte della scheda: il piano di sempre o una preparazione. */
function apriGruppi(src, nome, via) {
  const tutte = schedeDi(src);
  if (!tutte[nome]) tutte[nome] = { es: [], rec: '' };
  grp = { src: src, scheda: nome, via: via ? viaGruppi(via) : null };
  disegnaGruppi();
  dlgGrp.showModal();
  dlgGrp.focus();
}

function disegnaGruppi() {
  if (!grp) return;
  const sc = schedeDi(grp.src)[grp.scheda] || { es: [] };
  const vie = gruppiDi(sc);
  if (grp.via && !vie.some(v => stessaVia(v, grp.via))) vie.push(grp.via);

  const chips = $('gElenco');
  chips.textContent = '';
  for (const v of vie) {
    const c = el('button', 'chip chipw' + (grp.via && stessaVia(v, grp.via) ? ' sel' : ''),
                 v.join(' › ') || '(no name)');
    c.type = 'button';
    c.dataset.gapri = JSON.stringify(v);
    chips.appendChild(c);
  }
  const piu = el('button', 'chip chipw chipnuovo', '+ new');
  piu.type = 'button';
  piu.dataset.gnuovo = '1';
  chips.appendChild(piu);

  const corpo = $('gCorpo');
  corpo.hidden = !grp.via;
  if (!grp.via) return;

  const via = grp.via;
  $('gNome').value = via[via.length - 1];

  const sel = $('gDentro');
  sel.textContent = '';
  const nessuno = el('option', null, 'top level');
  nessuno.value = '';
  sel.appendChild(nessuno);
  for (const v of vie) {
    if (dentroVia(v, via)) continue;
    if (v.length >= 4) continue;
    const o = el('option', null, 'in ' + v.join(' › '));
    o.value = JSON.stringify(v);
    sel.appendChild(o);
  }
  const padre = via.slice(0, -1);
  sel.value = padre.length ? JSON.stringify(padre) : '';

  disegnaTipo(sc, via);

  const lista = $('gLista');
  lista.textContent = '';
  sc.es.forEach((r, i) => {
    if (!r[0] && !r[1]) return;
    const g = r[2] || [];
    const l = el('label', 'grigar');
    const c = el('input', 'schsel');
    c.type = 'checkbox';
    c.checked = dentroVia(g, via);
    c.dataset.gsel = i;
    l.appendChild(c);
    l.appendChild(el('span', 'grinome', r[0] || '—'));
    if (g.length && !stessaVia(g, via)) {
      l.appendChild(el('span', 'grialtro', dentroVia(g, via) ? g.slice(via.length).join(' › ')
                                                             : g.join(' › ')));
    }
    if (r[1]) l.appendChild(el('span', 'grival', r[1]));
    lista.appendChild(l);
  });
  if (!lista.children.length) lista.appendChild(el('p', 'vuoto', 'Nothing written yet'));
  $('gNuovoEs').value = '';
  $('gNuovoQ').value = '';
  $('gElimina').textContent = 'Delete this group';
}

/* --- copia e incolla di un gruppo ---------------------------------------
   Tenendo premuta l'etichetta di un gruppo nel pannello compare "Copia": il
   gruppo (esercizi, quantita', gruppi dentro e tipo) va negli appunti di
   questo telefono. Nella pagina di un workout c'e' poi "Incolla". */
const APPUNTI_KEY = 'gwork-wk-appunti-gruppo-v1';
function appuntiGruppo() {
  try { const v = JSON.parse(localStorage.getItem(APPUNTI_KEY) || 'null'); return v && Array.isArray(v.es) && v.es.length ? v : null; }
  catch (e) { return null; }
}
function copiaGruppo(sc, via) {
  const d = via.length - 1;
  const es = sc.es.filter(r => r[0] && dentroVia(r[2] || [], via))
    .map(r => [r[0], r[1] || '', (r[2] || []).slice(d), r[3] || '', r[4] || '']);
  const tipi = {};
  for (const k of Object.keys(sc.tipi || {})) {
    const v = JSON.parse(k);
    if (dentroVia(v, via)) tipi[JSON.stringify(v.slice(d))] = sc.tipi[k];
  }
  try { localStorage.setItem(APPUNTI_KEY, JSON.stringify({ nome: via[d], es: es, tipi: tipi })); } catch (e) { return false; }
  return true;
}
/* Incolla in fondo alla scheda, fuori da altri gruppi. Se c'e' gia' un gruppo
   con lo stesso nome, il nuovo prende un numero dopo il nome. */
function incollaGruppo(sc) {
  const a = appuntiGruppo();
  if (!a) return '';
  const usati = new Set(sc.es.map(r => (r[2] || [])[0]).filter(Boolean));
  let nome = a.nome, n = 2;
  while (usati.has(nome)) nome = (a.nome + ' ' + n++).slice(0, 40);
  sc.es = sc.es.concat(a.es.map(r => [r[0], r[1], [nome].concat(r[2].slice(1)), r[3], r[4]]));
  for (const k of Object.keys(a.tipi || {})) {
    const v = JSON.parse(k);
    if (!sc.tipi) sc.tipi = {};
    sc.tipi[JSON.stringify([nome].concat(v.slice(1)))] = a.tipi[k];
  }
  return nome;
}

/* Il dito tenuto giu' su un'etichetta: dopo mezzo secondo compare "Copia" */
let gPremuto = null, gPremutoT = null;
$('gElenco').addEventListener('pointerdown', ev => {
  const a = ev.target.closest('button[data-gapri]');
  if (!a) return;
  clearTimeout(gPremutoT);
  gPremutoT = setTimeout(() => { gPremuto = a; mostraCopia(a); }, 550);
});
for (const t of ['pointerup', 'pointerleave', 'pointercancel']) $('gElenco').addEventListener(t, () => clearTimeout(gPremutoT));
$('gElenco').addEventListener('contextmenu', ev => { if (ev.target.closest('button[data-gapri]')) ev.preventDefault(); });
function mostraCopia(a) {
  for (const x of $('gElenco').querySelectorAll('.gcopia')) x.remove();
  const b = el('button', 'chip gcopia', 'Copy');
  b.type = 'button';
  b.addEventListener('click', ev => {
    ev.stopPropagation();
    const sc = schedeDi(grp.src)[grp.scheda];
    const via = viaGruppi(JSON.parse(a.dataset.gapri));
    b.textContent = copiaGruppo(sc, via) ? 'Copied ✓' : 'Could not copy';
    b.disabled = true;
    setTimeout(() => b.remove(), 1500);
  });
  a.after(b);
}

$('gElenco').addEventListener('click', ev => {
  if (!grp) return;
  if (ev.target.closest('.gcopia')) return;
  const a = ev.target.closest('button[data-gapri]');
  /* il tocco lungo che ha fatto comparire Copia non apre il gruppo */
  if (a && gPremuto === a) { gPremuto = null; return; }
  if (a) { grp.via = viaGruppi(JSON.parse(a.dataset.gapri)); disegnaGruppi(); return; }
  if (ev.target.closest('button[data-gnuovo]')) {
    grp.via = [''];
    disegnaGruppi();
    $('gNome').focus();
  }
});

/* Invio nei campi del pannello non chiude il pannello: nel nome conferma il
   nome, negli esercizi aggiunge. */
for (const id of ['gNome', 'gNuovoEs', 'gNuovoQ', 'gLav', 'gRec', 'gGiri', 'gMin']) {
  $(id).addEventListener('keydown', ev => {
    if (ev.key !== 'Enter') return;
    ev.preventDefault();
    if (id === 'gNuovoEs' || id === 'gNuovoQ') $('gNuovoOk').click(); else $(id).blur();
  });
}

$('gNome').addEventListener('change', () => {
  if (!grp || !grp.via) return;
  const sc = schedeDi(grp.src)[grp.scheda];
  const v = $('gNome').value.slice(0, 40).trim();
  const via = grp.via, d = via.length - 1;
  if (v === via[d]) return;
  if (!v) { $('gNome').value = via[d]; return; }
  /* un nome gia' usato da un altro gruppo li unirebbe: si chiede prima */
  const altra = via.slice(0, d).concat([v]);
  if (via[d] && sc.es.some(r => dentroVia(r[2] || [], altra)) &&
      !confirm('There is already a group "' + v + '" here.\n\nMerge the two groups into one?')) {
    $('gNome').value = via[d]; return;
  }
  for (const r of sc.es) {
    const g = r[2] || [];
    if (dentroVia(g, via)) g[d] = v;
  }
  spostaTipi(sc, via, via.slice(0, d).concat([v]));
  grp.via = via.slice(0, d).concat([v]);
  touch();
  disegnaGruppi();
  dopoModifica();
});

$('gDentro').addEventListener('change', () => {
  if (!grp || !grp.via) return;
  const sc = schedeDi(grp.src)[grp.scheda];
  const via = grp.via;
  const padre = $('gDentro').value ? viaGruppi(JSON.parse($('gDentro').value)) : [];
  const nuova = padre.concat([via[via.length - 1]]).slice(0, 4);
  const righe = [];
  sc.es.forEach((r, i) => { if (dentroVia(r[2] || [], via)) righe.push(i); });
  for (const i of righe) sc.es[i][2] = nuova.concat((sc.es[i][2] || []).slice(via.length)).slice(0, 4);
  spostaTipi(sc, via, nuova);
  if (padre.length) {
    const blocco = righe.map(i => sc.es[i]);
    const resto = sc.es.filter((r, i) => righe.indexOf(i) < 0);
    let ultimo = -1;
    resto.forEach((r, j) => { if (dentroVia(r[2] || [], padre)) ultimo = j; });
    sc.es = resto.slice(0, ultimo + 1).concat(blocco, resto.slice(ultimo + 1));
  }
  grp.via = nuova;
  touch();
  disegnaGruppi();
  dopoModifica();
});

$('gLista').addEventListener('change', ev => {
  const c = ev.target.closest('input[data-gsel]');
  if (!c || !grp || !grp.via) return;
  const sc = schedeDi(grp.src)[grp.scheda];
  const via = grp.via;
  if (!via[via.length - 1]) {
    c.checked = false;
    $('gNome').focus();
    return;
  }
  const i = +c.dataset.gsel;
  const r = sc.es[i];
  if (!r) return;
  r[2] = c.checked ? via.slice() : via.slice(0, -1);
  accoda(sc, i, via);
  touch();
  disegnaGruppi();
  dopoModifica();
});

$('gNuovoOk').addEventListener('click', () => {
  if (!grp || !grp.via) return;
  const sc = schedeDi(grp.src)[grp.scheda];
  const via = grp.via;
  const a = $('gNuovoEs').value.slice(0, 60).trim();
  const b = $('gNuovoQ').value.slice(0, 60).trim();
  if (!a && !b) { $('gNuovoEs').focus(); return; }
  if (!via[via.length - 1]) { $('gNome').focus(); return; }
  /* come nelle righe del workout: il nome si scrive come in libreria, e un
     nome nuovo entra in libreria */
  let nomeEs = a;
  if (a && typeof edLib === 'function') { const L = edLib(normEs(a), a); if (L) nomeEs = L[0]; }
  sc.es = sc.es.concat([[nomeEs, b, via.slice(), '', '']]);
  accoda(sc, sc.es.length - 1, via);
  touch();
  disegnaGruppi();
  dopoModifica();
  $('gNuovoEs').focus();
});

/* --- il tipo del gruppo nel pannello ---------------------------------- */

/* Dal nome si indovina il tipo, solo per consigliarlo: "Tabata 45/15 x3". */
function tipoDalNome(nome) {
  if (/tabata/i.test(nome)) {
    const t = tempiIn(nome);
    return { t: 'tabata', l: t[0] || 20, r: t.length > 1 ? t[1] : 10, g: giriIn(nome) };
  }
  if (/emom/i.test(nome)) {
    const m = nome.match(/emom\s*(?:x\s*|di\s*)?(\d{1,3})(?!\d|\s*["”″\/])/i) || nome.match(/(\d{1,3})\s*(?:min|['’′])/i);
    return { t: 'emom', m: m ? +m[1] : 0, a: [] };
  }
  return null;
}

/* Gli esercizi di un gruppo, in ordine. */
const esDelGruppo = (sc, via) => sc.es.filter(r => r[0] && dentroVia(r[2] || [], via));

/* Quanto dura, detto in chiaro: e' quello che fara' il timer. */
function riassuntoTipo(t, n) {
  if (t.t === 'tabata') {
    const tot = t.g ? t.g * n * (t.l + t.r) - t.r : 0;
    return 'Timer: ' + n + (n === 1 ? ' exercise' : ' exercises') + ' in a row, ' + t.l + '" of work and ' + t.r + '" of rest each, ' +
      (t.g ? t.g + (t.g === 1 ? ' round' : ' rounds') + ' · ' + mmss(tot) + ' in total.' : 'one round after another until Stop.');
  }
  const a = t.a.length ? t.a : [1];
  const turno = a.slice(0, Math.max(1, n)).map(x => x + ' min').join(' + ');
  return 'Timer: a new minute every 60", ' + (n > 1 ? 'exercises in turn (' + turno + '), ' : '') +
    (t.m ? t.m + ' minutes in total.' : 'until Stop.');
}

function disegnaTipo(sc, via) {
  const nome = via[via.length - 1] || '';
  const k = JSON.stringify(via);
  const t = (sc.tipi && sc.tipi[k]) || null;
  const consiglio = !t && tipoDalNome(nome);
  for (const b of $('gTipo').querySelectorAll('[data-gtipo]')) {
    b.classList.toggle('sel', (t ? t.t : '') === b.dataset.gtipo);
    b.classList.toggle('consigliato', !!consiglio && consiglio.t === b.dataset.gtipo);
  }
  $('gConsiglio').hidden = !consiglio;
  if (consiglio) $('gConsiglio').textContent = 'The name says ' + (consiglio.t === 'tabata' ? 'Tabata' : 'EMOM') + '.';
  $('gTabata').hidden = !t || t.t !== 'tabata';
  $('gEmom').hidden = !t || t.t !== 'emom';
  const es = esDelGruppo(sc, via);
  if (t && t.t === 'tabata') {
    $('gLav').value = t.l; $('gRec').value = t.r; $('gGiri').value = t.g || '';
  }
  if (t && t.t === 'emom') {
    $('gMin').value = t.m || '';
    const box = $('gAlt');
    box.textContent = '';
    if (es.length > 1) {
      box.appendChild(el('p', 'nota', 'Minutes in a row for each exercise, then the next:'));
      es.forEach((r, i) => {
        const l = el('label', 'gnum');
        l.appendChild(el('span', 'galt-es', r[0]));
        const inp = el('input', 'campo');
        inp.type = 'number'; inp.inputMode = 'numeric'; inp.min = 1; inp.max = 10;
        inp.value = t.a[i] || 1;
        inp.dataset.galt = i;
        l.appendChild(inp);
        l.appendChild(el('span', null, 'min'));
        box.appendChild(l);
      });
    }
  }
  $('gTimerNota').hidden = !t;
  const passi = es.reduce((n, r) => n + latiDi(t, r[0]), 0);
  if (t) $('gTimerNota').textContent = es.length ? riassuntoTipo(t, passi) : 'No exercises in this group yet.';
}

function tipoCambia(fa) {
  if (!grp || !grp.via || !grp.via[grp.via.length - 1]) return;
  const sc = schedeDi(grp.src)[grp.scheda];
  const k = JSON.stringify(grp.via);
  if (!sc.tipi) sc.tipi = {};
  fa(sc, k);
  if (sc.tipi[k]) sc.tipi[k] = validTipo(sc.tipi[k]);
  if (!sc.tipi[k]) delete sc.tipi[k];
  if (!Object.keys(sc.tipi).length) delete sc.tipi;
  touch();
  disegnaGruppi();
  dopoModifica();
}

$('gTipo').addEventListener('click', ev => {
  const b = ev.target.closest('[data-gtipo]');
  if (!b) return;
  if (grp && grp.via && !grp.via[grp.via.length - 1]) { $('gNome').focus(); return; }
  tipoCambia((sc, k) => {
    const tipo = b.dataset.gtipo;
    if (!tipo) { delete sc.tipi[k]; return; }
    if (sc.tipi[k] && sc.tipi[k].t === tipo) return;
    const dal = tipoDalNome(grp.via[grp.via.length - 1]);
    sc.tipi[k] = dal && dal.t === tipo ? dal : tipo === 'tabata' ? { t: 'tabata', l: 20, r: 10, g: 8 } : { t: 'emom', m: 10, a: [] };
  });
});
for (const [id, campo] of [['gLav', 'l'], ['gRec', 'r'], ['gGiri', 'g'], ['gMin', 'm']]) {
  $(id).addEventListener('change', () => tipoCambia((sc, k) => { if (sc.tipi[k]) sc.tipi[k][campo] = +$(id).value || 0; }));
}
$('gAlt').addEventListener('change', ev => {
  const inp = ev.target.closest('[data-galt]');
  if (!inp) return;
  tipoCambia((sc, k) => {
    const t = sc.tipi[k];
    if (!t) return;
    const n = esDelGruppo(sc, grp.via).length;
    const a = [];
    for (let i = 0; i < n; i++) a.push(t.a[i] || 1);
    a[+inp.dataset.galt] = +inp.value || 1;
    t.a = a;
  });
});

/* due tocchi per sciogliere il gruppo: le righe restano */
$('gElimina').addEventListener('click', () => {
  if (!grp || !grp.via) return;
  const b = $('gElimina');
  if (b.textContent !== 'Sure? Tap again') { b.textContent = 'Sure? Tap again'; return; }
  const sc = schedeDi(grp.src)[grp.scheda];
  const via = grp.via, d = via.length - 1;
  for (const r of sc.es) {
    const g = r[2] || [];
    if (dentroVia(g, via)) g.splice(d, 1);
  }
  /* il suo tipo se ne va; quelli dei gruppi dentro salgono di un posto */
  if (sc.tipi) {
    delete sc.tipi[JSON.stringify(via)];
    spostaTipi(sc, via, via.slice(0, -1));
  }
  grp.via = null;
  touch();
  disegnaGruppi();
  dopoModifica();
});

$('gruppoForm').addEventListener('submit', () => {
  /* un gruppo creato e mai riempito non lascia una scheda vuota */
  if (grp && schedeDi(grp.src)[grp.scheda] && !schedeDi(grp.src)[grp.scheda].es.length && !schedeDi(grp.src)[grp.scheda].rec) {
    delete schedeDi(grp.src)[grp.scheda];
  }
  grp = null; dopoModifica();
});
dlgGrp.addEventListener('cancel', () => { grp = null; });

/* -------------------------------------------------------------- sync ----- */

/* Il piano lo salva la Routine. Qui restano solo i video: vanno su GitHub da
   questa pagina, col token della Routine. */
let syncMsg = '', syncErr = false;

function ghHeaders() {
  const h = { Accept: 'application/vnd.github+json' };
  if (token) h.Authorization = 'Bearer ' + token;
  return h;
}

/* Con la chiave della Routine anche i video partono chiusi: AES-GCM a 256
   bit, chiave ricavata dalla parola con PBKDF2, come il file delle task. */
const ITER = 150000;

async function derivaChiave(pass, salt) {
  const base = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt, iterations: ITER, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/* Publish, nell'editor: si accende quando ci sono modifiche ai workout non
   ancora pubblicate; se l'invio non riesce dice Retry, e il perche' sta
   nella riga accanto. */
function paintSalva() {
  const b = $('edSalva');
  if (!b) return;
  const da = P.daPubblicare();
  const err = !!P.errore() && P.sporco();
  b.hidden = false;
  b.disabled = P.salvando() || (!da && !err);
  b.classList.toggle('err', err);
  b.classList.toggle('fatto', !da && !err && !P.salvando());
  b.textContent = P.salvando() ? 'Publishing…' : err ? 'Retry' : da ? 'Publish' : 'Published ✓';
}

/* La riga accanto al titolo dell'editor: i video quando caricano, altrimenti
   quello che dice la Routine del suo file. */
function paintSync(msg, err) {
  if (msg !== undefined) { syncMsg = msg; syncErr = !!err; }
  const s = $('edStato');
  if (!s) return;
  const errRt = P.sporco() ? P.errore() : '';
  const t = syncErr ? syncMsg : errRt ? errRt : syncMsg || (P.daPubblicare() ? 'not published' : '');
  s.textContent = t;
  s.classList.toggle('err', syncErr || !!errRt);
}

/* Il branch dei video non c'e' ancora: lo si crea da main. Serve una volta
   sola, al primo video. Il token basta: e' il permesso Contents. */
async function creaBranch() {
  try {
    const r = await fetch(API + '/git/ref/heads/main', { headers: ghHeaders(), cache: 'no-store' });
    if (!r.ok) return false;
    const j = await r.json();
    const c = await fetch(API + '/git/refs', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, ghHeaders()),
      body: JSON.stringify({ ref: 'refs/heads/' + BRANCH, sha: j.object.sha })
    });
    return c.ok || c.status === 422;       /* 422: esiste gia' */
  } catch (e) {
    return false;
  }
}

/* I video scelti da questo telefono partono per GitHub. Quelli che non ce la
   fanno restano in lista: Save resta acceso, e si riprova. */
/* La coda dei video: gira da sola, separata dal salvataggio del piano.
   Parte appena un video e' pronto, all'apertura dell'app, quando torna la
   rete o l'app torna davanti, e ogni minuto finche' resta qualcosa. Mentre
   carica tiene lo schermo acceso. Un video tolto dal piano esce dalla coda. */
let caricandoVideo = false;
let ritentaVideo = null;

function nomiNelPiano() {
  const nomi = new Set();
  for (const tutte of [tstore.schede].concat(tstore.prep.map(p => p.schede))) {
    for (const k of Object.keys(tutte)) for (const r of tutte[k].es) for (const v of videiDi(r)) nomi.add(v);
  }
  for (const x of tstore.sorprese || []) for (const f of x ? [x.img, x.audio] : []) if (f) nomi.add(f);
  for (const r of tstore.libreria || []) for (const v of videiDi(r)) nomi.add(v);
  return nomi;
}

async function codaVideo() {
  if (caricandoVideo || !token || !daCaricare.length) return;
  clearTimeout(ritentaVideo);
  caricandoVideo = true;
  paintSalva();
  let luce = null;
  try { if (navigator.wakeLock) luce = await navigator.wakeLock.request('screen'); } catch (e) { /* niente */ }
  try {
    const nel = nomiNelPiano();
    daCaricare = daCaricare.filter(n => nel.has(n));
    salvaCoda();
    const lista = daCaricare.slice();
    for (let i = 0; i < lista.length; i++) {
      const riga = 'uploading video ' + (i + 1) + ' of ' + lista.length;
      paintSync(riga + '… keep the app open');
      const ok = await caricaVideo(lista[i], x => paintSync(riga + '… ' + Math.round(x * 100) + '%'));
      if (ok) {
        daCaricare = daCaricare.filter(x => x !== lista[i]);
        salvaCoda();
      }
    }
  } finally {
    caricandoVideo = false;
    try { if (luce) await luce.release(); } catch (e) { /* niente */ }
  }
  const n = daCaricare.length;
  if (n) {
    paintSync(n + (n === 1 ? ' video still to upload' : ' videos still to upload') + ': retrying in a minute', true);
    ritentaVideo = setTimeout(codaVideo, 60000);
  } else if (!P.daPubblicare()) {
    paintSync('videos uploaded at ' + fmtTime.format(new Date()));
  }
  paintSalva();
}

/* ---------------------------------------------------------- avviamento --- */

/* tornata la rete: i video nuovi scendono, quelli in coda salgono */
window.addEventListener('online', () => { scaricaVideo(); codaVideo(); });
/* tornando all'app: lo stesso */
document.addEventListener('visibilitychange', () => { if (!document.hidden) { scaricaVideo(); codaVideo(); } });

/* A mezzanotte cambia la riga di oggi: si ridisegna al passare del giorno. */
let giornoVisto = today().getTime();
setInterval(() => {
  const t = today().getTime();
  if (t !== giornoVisto) { giornoVisto = t; paintW(); }
}, 60000);

/* Il tasto indietro (anche quello del telefono) chiude l'anteprima. */
window.addEventListener('popstate', () => {
  if (anteprima && !(history.state && history.state.ant)) {
    anteprima = null;
    disegnaW();
    window.scrollTo(0, 0);
  }
});

/* ------------------------------------------------ dentro la Routine ---- */

/* Scorrendo in giu', la Routine ritira la riga sopra la cornice, come fa con
   la dieta. In fondo alla pagina no: ritirarla allungherebbe la cornice, e i
   due si rincorrerebbero. */
window.addEventListener('scroll', () => {
  const fine = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 44;
  P.scorri(window.scrollY, fine);
}, { passive: true });

/* Il dito che scorre di lato sopra la cornice: la Routine non lo vede, perche'
   i tocchi restano qui dentro. Glielo si passa, cosi' il gesto per cambiare
   sezione o chiudere la tendina funziona anche sopra l'app. Con una finestra
   o l'editor aperti, o sulla fila delle pastiglie, non vale. */
document.addEventListener('touchstart', ev => {
  const t = ev.touches[0];
  const ok = ev.touches.length === 1 && !document.querySelector('dialog[open]') && $('ed').hidden
             && !(ev.target.closest && ev.target.closest('.chiprow'));
  P.gestoInizio(t.clientX, t.clientY, ok);
}, { passive: true });
document.addEventListener('touchend', ev => {
  const t = ev.changedTouches[0];
  P.gestoFine(t.clientX, t.clientY);
}, { passive: true });

/* Quello che la Routine chiede a questa pagina. */
window.wkApi = {
  /* il piano e' cambiato sotto (letto online, o scritto da un'altra copia) */
  ricarica() { paintW(); if (typeof edRidisegna === 'function') edRidisegna(); paintSalva(); paintSync(); scaricaVideo(); },
  paintW: () => paintW(),
  paintSalva: () => { paintSalva(); paintSync(); },
  edApri: () => edApri(),
  edChiudi: () => edChiudi(false),
  edAperto: () => !$('ed').hidden
};

disegnaW();
paintSalva();
paintSync();
scaricaVideo();
setTimeout(codaVideo, 3000);

/* I video stanno nel telefono per sempre: si chiede al browser di non buttare
   mai i dati di questa app, nemmeno quando la memoria scarseggia. */
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
