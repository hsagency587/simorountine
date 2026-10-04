'use strict';

/* =========================================================================
   Workout — l'app degli allenamenti, dentro la tendina Workout della Routine.
   E' la stessa app che sta per conto suo, con una differenza: qui non ha un
   file suo. Il piano sta nel file delle task della Routine (alla voce wk), e
   lo salva la Routine, col suo token e la sua chiave. Questa pagina vive in
   una cornice dentro la Routine e le parla attraverso `ponteWk`. I video
   invece li carica lei, nel repository della Routine, su un branch loro.
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
const { MAX_SLOT, ORDINALI, MATTINA_BASE, EV, validMattina, viaGruppi,
        validSchede, nomeVideoOk, videiDi, normEs, dataOk, validSorprese } = WK;

const nomeMattina = () => tstore.mattina || MATTINA_BASE;

/* Stesso nome, stesso esercizio: una riga senza descrizione o senza video
   mostra quelli scritti per lo stesso esercizio altrove (prima la libreria,
   poi il piano, poi le preparazioni). I dati salvati non cambiano. */
function indiceEs() {
  const m = new Map();
  const metti = r => {
    const n = normEs(r && r[0]);
    if (!n) return;
    const x = m.get(n) || { d: '', v: '' };
    if (!x.d && r[3]) x.d = r[3];
    if (!x.v && r[4]) x.v = r[4];
    m.set(n, x);
  };
  for (const r of tstore.libreria || []) metti(r);
  for (const o of [tstore].concat(tstore.prep || [])) {
    for (const k of Object.keys(o.schede || {})) for (const r of o.schede[k].es) metti(r);
  }
  return m;
}
function completo(r, ind) {
  if (!r || (r[3] && r[4])) return r;
  const x = (ind || indiceEs()).get(normEs(r[0]));
  if (!x) return r;
  return [r[0], r[1], r[2], r[3] || x.d, r[4] || x.v];
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
   pastiglia; vuoto = tutte */
let mostra = (() => {
  try {
    const v = JSON.parse(localStorage.getItem(VISTA_KEY) || 'null');
    if (v && typeof v === 'object')
      return { sch: v.sch !== false, solo: typeof v.solo === 'string' ? v.solo : '' };
  } catch (e) { /* si parte con la tendina aperta */ }
  return { sch: true, solo: '' };
})();
function salvaMostra() {
  try { localStorage.setItem(VISTA_KEY, JSON.stringify(mostra)); } catch (e) {}
}
/* Nella Routine si scrive sempre: e' la propria app. Senza token la modifica
   resta nel telefono e la Routine dice che manca, come per tutto il resto. */
const scrive = () => true;

/* Ogni modifica passa di qui: la Routine la segna, fa comparire Salva e
   riscrive nella giornata cosa si fa nei workout. */
function touch() {
  P.cambio();
}

/* Salva: il piano parte con il file della Routine, poi i video in coda. */
async function salva() {
  if (P.sporco()) await P.salva();
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

/* ------------------------------------------------ la pagina ---- */

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
/* Le postille (easter egg) accese adesso: spariscono al primo tocco,
   scorrendo, o uscendo dall'app. */
let festa = [];
/* Quanti giorni prima dell'inizio compare l'avviso: dal sabato per un lunedi'. */
const AVVISO_GIORNI = 2;

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

  if (!pAnt) postille(box, 'top');

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

  /* la preparazione in corso: nome, date, quanto manca */
  if (oggi.prep) {
    const p = oggi.prep;
    const manca = giorniFra(kOggi, p.al);
    const b = el('div', 'prepbanda');
    b.appendChild(el('p', 'prepbanda-eti', 'PREPARATION' + (p.nome ? ' · ' + p.nome : '')));
    b.appendChild(el('p', 'prepbanda-date', dataIt(p.dal) + ' → ' + dataIt(p.al) +
      (pAnt ? '' : ' · ' + (manca === 0 ? 'last day' : manca === 1 ? '1 day left' : manca + ' days left'))));
    box.appendChild(b);
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
  if (!pAnt) postille(box, 'week');
  const tab = el('div', 'tab tab-w');
  tab.style.setProperty('--wcol', n);
  /* in cima alla tabella, sempre la stessa scritta, su tutta la riga */
  const capo = tabRiga([{ t: 'SCHEDULING', cls: 'tuttariga' }], 'capo');
  tab.appendChild(capo);
  for (const x of giorni) {
    const celle = [{ t: GIORNI2_IT[x.g] + ' ' + x.d.getDate(), cls: 'eti' }];
    const quanti = x.pi.conti[x.g] || 0;
    for (let i = 0; i < n; i++) {
      if (i >= quanti) celle.push({ t: '', cls: 'fuori' });
      else if (x.w[i] === MORNING) celle.push({ t: nomeMattinaDi(x.pi), cls: 'every' });
      else celle.push({ t: x.w[i] || '—', cls: x.w[i] ? '' : 'vuota' });
    }
    const cls = [x.k === kOggi ? 'oggi' : '', x.pi.prep ? 'inprep' : ''].filter(Boolean).join(' ');
    tab.appendChild(tabRiga(celle, cls));
  }
  box.appendChild(tab);

  if (!pAnt) postille(box, 'every');
  paintMorning(box, oggi, kOggi);
  if (!pAnt) postille(box, 'oggi');
  paintOggi(box, oggi, kOggi, t0.getDay(), pAnt ? GIORNI_IT[t0.getDay()].toUpperCase() + ' ' + t0.getDate() + ' WORKOUTS' : 'TODAY WORKOUTS');
  if (!pAnt) postille(dx, 'wk');
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
  const cap = el('div', 'tabr capo schcapo');
  cap.appendChild(el('div', 'tabc', nome));
  /* una quantita' scritta senza esercizio sta nella banda del nome */
  const sole = (sc.es || []).filter(r => !r[0] && r[1]).map(r => r[1]);
  if (sole.length) cap.appendChild(el('div', 'tabc val', sole.join('  ·  ')));
  tab.appendChild(cap);
  return tab;
}

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
       che sotto c'e' qualcosa da leggere o da guardare. */
    if (r[3] || r[4]) {
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
    box.appendChild(righeScheda(tab, { es: sc.es, rec: '' }, pi.src, l.chiave));
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
      box.appendChild(righeScheda(tm, { es: scm.es, rec: '' }, pi.src, MORNING));
      continue;
    }
    const sc = pi.schede[nome];
    if (!sc || (!sc.es.length && !sc.rec)) continue;
    if (!capo) { box.appendChild(el('p', 'grp', titolo || 'TODAY WORKOUTS')); capo = true; }
    if (!anteprima) postille(box, 'w:' + nome);
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
    if (!anteprima) postille(lista, 'w:' + nome);
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
   resto (Instagram, TikTok...) diventa un bottone che apre il link. */
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
             src: 'https://www.youtube-nocookie.com/embed/' + id + '?rel=0&playsinline=1' + (inizio ? '&start=' + inizio : '') };
  }
  /* Wistia, Loom, Dailymotion, Streamable: tutti hanno un lettore da incorporare */
  if (/(^|\.)wistia\.(com|net)$/.test(host) || host === 'wi.st') {
    const m = u.pathname.match(/\/(?:medias|embed\/iframe|embed\/medias|iframe)\/([a-z0-9]+)/i);
    if (m) return { tipo: 'frame', src: 'https://fast.wistia.net/embed/iframe/' + m[1] };
  }
  if (host === 'loom.com') {
    const m = u.pathname.match(/^\/(?:share|embed)\/([a-f0-9]+)/i);
    if (m) return { tipo: 'frame', src: 'https://www.loom.com/embed/' + m[1] };
  }
  if (host === 'dailymotion.com' || host === 'dai.ly') {
    const m = host === 'dai.ly' ? u.pathname.match(/^\/([a-z0-9]+)/i) : u.pathname.match(/^\/video\/([a-z0-9]+)/i);
    if (m) return { tipo: 'frame', src: 'https://www.dailymotion.com/embed/video/' + m[1] };
  }
  if (host === 'streamable.com') {
    const m = u.pathname.match(/^\/(?:e\/)?([a-z0-9]+)/i);
    if (m) return { tipo: 'frame', src: 'https://streamable.com/e/' + m[1] };
  }
  if (host === 'vimeo.com') {
    const m = u.pathname.match(/^\/(\d+)/);
    if (m) return { tipo: 'frame', src: 'https://player.vimeo.com/video/' + m[1] };
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
  const quanto = [r[1], (r[2] || []).join(' › ')].filter(Boolean);
  $('descQta').textContent = quanto.join('  ·  ');
  $('descQta').hidden = !quanto.length;
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
  $('vFull').hidden = true;
  $('vStato').textContent = '';
  if (x.tipo === 'file') {
    const v = $('vVideo');
    v.src = x.src; v.hidden = false; $('vFull').hidden = false;
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
  pulisciVideo();
  $('vNav').hidden = true;
  $('vAvviso').hidden = true;
  dlgDesc.close();
  $('descTesto').textContent = '';
}

$('descChiudi').addEventListener('click', chiudiDesc);
dlgDesc.addEventListener('cancel', () => { pulisciVideo(); $('descTesto').textContent = ''; });

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
const tipoVideo = n => /\.webm$/.test(n) ? 'video/webm' : /\.jpg$/.test(n) ? 'image/jpeg' : 'video/mp4';

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
   volta, in silenzio, appena il piano e' letto. */
let scaricando = false;
/* Chiamata mentre sta gia' scaricando (il piano e' appena cambiato, per
   esempio con gli esercizi importati): finito il giro, ne fa un altro. */
let scaricaAncora = false;
async function scaricaVideo() {
  if (!navigator.onLine) return;
  if (scaricando) { scaricaAncora = true; return; }
  scaricando = true;
  try {
    const nomi = [];
    /* i video del piano di sempre, di tutte le preparazioni e della libreria */
    for (const tutte of [tstore.schede].concat(tstore.prep.map(p => p.schede))) {
      for (const k of Object.keys(tutte)) {
        for (const r of tutte[k].es) for (const v of videiDi(r)) if (nomi.indexOf(v) < 0) nomi.push(v);
      }
    }
    for (const r of tstore.libreria || []) for (const v of videiDi(r)) if (nomi.indexOf(v) < 0) nomi.push(v);
    /* le immagini delle sorprese: arrivano prima del loro giorno */
    for (const x of validSorprese(tstore.sorprese)) if (x.img && nomi.indexOf(x.img) < 0) nomi.push(x.img);
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
  $('vFull').hidden = true;
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
  v.src = vURL;
  v.hidden = false;
  $('vFull').hidden = false;
  st.textContent = '';
}

/* Verticale o orizzontale lo dice il video stesso, appena si apre. */
$('vVideo').addEventListener('loadedmetadata', () => {
  const v = $('vVideo');
  $('vSlot').classList.toggle('verticale', v.videoHeight > v.videoWidth);
  ruota();
});

/* Il bottone a schermo intero. Un video orizzontale gira anche il telefono,
   dove il browser lo permette; uno verticale resta dritto e riempie lo schermo. */
$('vFull').addEventListener('click', async () => {
  const slot = $('vSlot'), v = $('vVideo');
  try {
    if (slot.requestFullscreen) await slot.requestFullscreen();
    else if (v.webkitEnterFullscreen) v.webkitEnterFullscreen();
  } catch (e) {
    try { if (v.webkitEnterFullscreen) v.webkitEnterFullscreen(); } catch (e2) { /* niente */ }
  }
  if (!slot.classList.contains('verticale') && screen.orientation && screen.orientation.lock) {
    screen.orientation.lock('landscape').catch(() => {});
  }
});

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

$('gElenco').addEventListener('click', ev => {
  if (!grp) return;
  const a = ev.target.closest('button[data-gapri]');
  if (a) { grp.via = viaGruppi(JSON.parse(a.dataset.gapri)); disegnaGruppi(); return; }
  if (ev.target.closest('button[data-gnuovo]')) {
    grp.via = [''];
    disegnaGruppi();
    $('gNome').focus();
  }
});

$('gNome').addEventListener('change', () => {
  if (!grp || !grp.via) return;
  const sc = schedeDi(grp.src)[grp.scheda];
  const v = $('gNome').value.slice(0, 40).trim();
  const via = grp.via, d = via.length - 1;
  if (v === via[d]) return;
  if (!v) { $('gNome').value = via[d]; return; }
  for (const r of sc.es) {
    const g = r[2] || [];
    if (dentroVia(g, via)) g[d] = v;
  }
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
  sc.es = sc.es.concat([[a, b, via.slice(), '']]);
  accoda(sc, sc.es.length - 1, via);
  touch();
  disegnaGruppi();
  dopoModifica();
  $('gNuovoEs').focus();
});

/* due tocchi per sciogliere il gruppo: le righe restano */
$('gElimina').addEventListener('click', () => {
  if (!grp || !grp.via) return;
  const b = $('gElimina');
  if (b.textContent !== 'Sure?') { b.textContent = 'Sure?'; return; }
  const sc = schedeDi(grp.src)[grp.scheda];
  const via = grp.via, d = via.length - 1;
  for (const r of sc.es) {
    const g = r[2] || [];
    if (dentroVia(g, via)) g.splice(d, 1);
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

/* Il bottone Save dell'editor dice lo stato del salvataggio della Routine;
   serve anche per spingere i video rimasti in coda. */
function paintSalva() {
  const b = $('edSalva');
  if (!b) return;
  const coda = daCaricare.length && !caricandoVideo && token;
  b.hidden = !(P.sporco() || coda);
  b.disabled = P.salvando();
  b.classList.toggle('err', !!P.errore());
  /* con un errore il bottone dice solo Retry: il perche' sta nella riga accanto */
  b.textContent = P.salvando() ? 'Saving…' : P.errore() ? 'Retry' : 'Save';
}

/* La riga accanto al titolo dell'editor: i video quando caricano, altrimenti
   quello che dice la Routine del suo file. */
function paintSync(msg, err) {
  if (msg !== undefined) { syncMsg = msg; syncErr = !!err; }
  const s = $('edStato');
  if (!s) return;
  const errRt = P.errore();
  const t = syncErr ? syncMsg : errRt ? errRt : P.sporco() ? 'unsaved changes' : syncMsg;
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
  for (const x of tstore.sorprese || []) if (x && x.img) nomi.add(x.img);
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
  } else if (!P.sporco()) {
    paintSync('videos uploaded at ' + fmtTime.format(new Date()));
  }
  paintSalva();
}

/* ---------------------------------------------------------- avviamento --- */

/* tornata la rete: i video nuovi scendono, quelli in coda salgono */
window.addEventListener('online', () => { scaricaVideo(); codaVideo(); });

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
  edAperto: () => !$('ed').hidden,
  sorprese: () => controllaSorprese()
};

disegnaW();
paintSalva();
paintSync();
scaricaVideo();

/* I video stanno nel telefono per sempre: si chiede al browser di non buttare
   mai i dati di questa app, nemmeno quando la memoria scarseggia. */
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

/* ------------------------------------------------ le sorprese ---- */

/* Quali sorprese questo telefono ha gia' visto: ognuna si vede una volta. */
const VISTE_KEY = 'gwork-wk-sorprese-viste-v1';
function vistiLeggi() {
  try { const v = JSON.parse(localStorage.getItem(VISTE_KEY) || '[]'); return Array.isArray(v) ? v : []; }
  catch (e) { return []; }
}
function vistiSegna(ids) {
  try { localStorage.setItem(VISTE_KEY, JSON.stringify(vistiLeggi().concat(ids).slice(-400))); } catch (e) {}
}

function postille(box, dove) {
  for (const n of festa) {
    if (n.dove !== dove) continue;
    box.appendChild(el('div', 'postilla c' + n.colore, n.testo));
  }
}
function spegniPostille() {
  if (!festa.length) return;
  festa = [];
  document.removeEventListener('pointerdown', spegniPostille, true);
  window.removeEventListener('scroll', spegniPostille);
  paintW();
}
function armaPostille() {
  /* un attimo di respiro: il disegno della pagina non deve spegnerle */
  setTimeout(() => {
    document.addEventListener('pointerdown', spegniPostille, true);
    window.addEventListener('scroll', spegniPostille, { passive: true });
  }, 400);
}

/* L'immagine a tutto schermo: si chiude toccandola. */
function mostraImmagine(blob) {
  return new Promise(ok => {
    const u = URL.createObjectURL(blob);
    const box = el('div', 'egg-img');
    const img = el('img');
    img.src = u; img.alt = '';
    box.appendChild(img);
    box.appendChild(el('p', 'egg-img-nota', 'tap to close'));
    const chiudi = () => { box.classList.remove('on'); setTimeout(() => { box.remove(); URL.revokeObjectURL(u); ok(); }, 250); };
    box.addEventListener('click', chiudi);
    document.body.appendChild(box);
    requestAnimationFrame(() => box.classList.add('on'));
  });
}

/* Alla prima apertura del giorno: prima le immagini, poi le postille. */
let festeggiando = false;
async function controllaSorprese(prova) {
  if (festeggiando) return;
  const k = chiaveData(today());
  const visti = vistiLeggi();
  const nuove = prova ? [prova] : validSorprese(tstore.sorprese).filter(x => x.giorno === k && visti.indexOf(x.id) < 0);
  if (!nuove.length) return;
  festeggiando = true;
  try {
    const immagini = [];
    for (const x of nuove) {
      if (x.tipo !== 'img') continue;
      const b = (await vGet(x.img)) || (await prendiVideo(x.img));
      if (b) immagini.push({ x: x, b: b });
    }
    /* si segna come vista solo quello che si e' potuto mostrare */
    if (!prova) vistiSegna(nuove.filter(x => x.tipo === 'nota' || immagini.some(i => i.x === x)).map(x => x.id));
    for (const i of immagini) await mostraImmagine(i.b);
    const note = nuove.filter(x => x.tipo === 'nota');
    if (note.length) {
      festa = festa.concat(note);
      paintW();
      armaPostille();
    }
  } finally {
    festeggiando = false;
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) spegniPostille();
  else if (P.visibile()) controllaSorprese();
});
/* Le sorprese si vedono solo con la sezione Workout davanti: l'app si carica
   insieme alla Routine, nascosta, e una sorpresa mostrata li' andrebbe persa.
   Aprendo la sezione la Routine chiama `sorprese`. */
if (P.visibile()) controllaSorprese();

/* I video rimasti in coda ripartono da soli: all'apertura e quando l'app
   torna davanti. */
document.addEventListener('visibilitychange', () => { if (!document.hidden) { scaricaVideo(); codaVideo(); } });
setTimeout(codaVideo, 3000);
