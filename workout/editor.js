'use strict';

/* =========================================================================
   L'editor: una schermata a parte. A sinistra
   l'elenco di tutto quello che si scrive (il piano di sempre e le
   preparazioni), a destra i campi di quello che si e' scelto. Sul telefono
   prima l'elenco, poi la pagina, con la freccia per tornare indietro.
   Ogni cambio resta subito nel telefono; su GitHub va solo con Publish,
   insieme al file della Routine.
   ========================================================================= */

const edBox = $('ed');

/* Cosa si sta guardando: { pag, ctx, nome, sett }.
   pag: 'week' | 'morning' | 'workout' | 'new' | 'prep' | 'newprep'.
   ctx: 'base' per il piano di sempre, o l'id di una preparazione. */
let edVista = { pag: 'week', ctx: 'base', sett: 0 };
/* Sul telefono: true quando si vede la pagina, false quando si vede l'elenco */
let edInPagina = false;
/* Gli esercizi con la descrizione aperta, per non chiuderli a ogni ridisegno */
let edAperti = new Set();
/* Gli indirizzi dei video in anteprima: si liberano a ogni ridisegno */
let edUrl = [];

const GIORNI_ED = { 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday', 6: 'Saturday', 0: 'Sunday' };
const stretto = matchMedia('(max-width: 899px)');
const copia = x => JSON.parse(JSON.stringify(x));

/* La fonte di una pagina: il piano di sempre (le sue settimane sono una, e
   sta dentro tstore) o una preparazione. */
function edFonte(ctx) {
  if (ctx === 'base') return { base: true, obj: tstore, schede: tstore.schede, settimane: [tstore] };
  const p = tstore.prep.find(x => x.id === ctx);
  return p ? { base: false, obj: p, prep: p, schede: p.schede, settimane: p.settimane } : null;
}

/* I workout di una fonte: quelli scritti nella settimana e quelli che hanno
   una scheda, senza doppioni, nell'ordine in cui compaiono. */
function edWorkout(f) {
  const out = [];
  for (const w of f.settimane) {
    for (const g of SETTIMANA) {
      for (const v of (w.workout[g] || []).slice(0, w.conti[g] || 0)) if (v && !eLista(v) && out.indexOf(v) < 0) out.push(v);
    }
  }
  for (const k of Object.keys(f.schede)) if (k.indexOf('__') !== 0 && out.indexOf(k) < 0) out.push(k);
  return out;
}

const nomePrep = p => p.nome || 'Preparation';
const datePrep = p => dataCorta(p.dal) + ' – ' + dataCorta(p.al);

/* Ogni cambio passa di qui: resta nel telefono, compare Salva, e la pagina
   sotto l'editor si aggiorna. */
function edCambio(ridisegnaElenco) {
  touch();
  paintW();
  if (ridisegnaElenco) edElenco();
}

/* ------------------------------------------------ aprire e chiudere ---- */

function edApri() {
  if (!scrive()) return;
  /* la tendina della Routine si allarga a tutto lo schermo: l'editor ci sta
     con l'elenco e la pagina affiancati, dove lo schermo lo permette */
  P.editor(true);
  edConverti();                   /* descrizioni e video in libreria, se non lo sono gia' */
  edVista = { pag: 'week', ctx: 'base', sett: 0 };
  edInPagina = !stretto.matches;
  edAperti = new Set();
  edBox.hidden = false;
  document.body.classList.add('ed-aperto');
  history.pushState({ ed: 1 }, '');
  edRidisegna();
}

/* Chiudendo non parte niente: le modifiche restano nel telefono finche'
   non si preme Publish. */
function edChiudi(daIndietro) {
  if (edBox.hidden) return;
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  edBox.hidden = true;
  document.body.classList.remove('ed-aperto');
  edLibera();
  P.editor(false);
  paintW();
  if (!daIndietro && history.state && history.state.ed) history.back();
}

$('edChiudi').addEventListener('click', () => edChiudi(false));
$('edSalva').addEventListener('click', () => {
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  pubblica();
});

/* Il tasto indietro del telefono: dalla pagina all'elenco, dall'elenco fuori. */
$('edIndietro').addEventListener('click', () => history.back());
window.addEventListener('popstate', () => {
  if (edBox.hidden) return;
  if (edInPagina && stretto.matches) { edInPagina = false; edRidisegna(); return; }
  edChiudi(true);
});

function edVai(vista) {
  edVista = vista;
  edAperti = new Set();
  if (stretto.matches && !edInPagina) history.pushState({ ed: 2 }, '');
  edInPagina = true;
  edRidisegna();
  $('edPane').scrollTop = 0;
}

function edLibera() {
  for (const u of edUrl) URL.revokeObjectURL(u);
  edUrl = [];
}

function edRidisegna() {
  if (edBox.hidden) return;
  /* una pagina che non c'e' piu' (preparazione cancellata): si torna al piano */
  if (!edFonte(edVista.ctx)) edVista = { pag: 'week', ctx: 'base', sett: 0 };
  edBox.classList.toggle('in-pagina', edInPagina);
  edElenco();
  edPagina();
  paintSalva();
}

/* ------------------------------------------------ l'elenco ---- */

function edVoce(testo, vista, attiva, cls) {
  const b = el('button', 'ed-voce' + (attiva ? ' on' : '') + (cls ? ' ' + cls : ''), testo);
  b.type = 'button';
  b.addEventListener('click', () => edVai(vista));
  return b;
}

/* Una voce dell'elenco con la sua freccetta: il nome apre la pagina per
   modificare, la freccetta apre sotto un'anteprima da leggere. */
let edAnteprime = new Set();
function edVoceAnteprima(box, testo, vista, attiva, cls, chiave, riempi) {
  const riga = el('div', 'ed-riga');
  riga.appendChild(edVoce(testo, vista, attiva, cls));
  const aperta = edAnteprime.has(chiave);
  const f = el('button', 'ed-freccia' + (aperta ? ' open' : ''), '▾');
  f.type = 'button';
  f.setAttribute('aria-label', aperta ? 'Hide preview' : 'Show preview');
  f.setAttribute('aria-expanded', aperta ? 'true' : 'false');
  f.addEventListener('click', ev => {
    ev.stopPropagation();
    if (aperta) edAnteprime.delete(chiave); else edAnteprime.add(chiave);
    edElenco();
  });
  riga.appendChild(f);
  box.appendChild(riga);
  if (aperta) {
    const pv = el('div', 'ed-anteprima');
    riempi(pv);
    if (!pv.children.length) pv.appendChild(el('p', 'ed-ant-vuota', 'Nothing written yet.'));
    box.appendChild(pv);
  }
  return riga;
}

/* Le righe di una scheda, da leggere: nome, quanto, e il gruppo davanti. */
function edAnteprimaScheda(pv, sc) {
  if (!sc) return;
  for (const r of sc.es) {
    if (!r[0] && !r[1]) continue;
    const l = el('div', 'ed-ant-riga');
    const n = el('span', 'ed-ant-nome', r[0] || '—');
    if (r[2] && r[2].length) n.prepend(el('span', 'ed-ant-grp', r[2].join(' › ') + ' · '));
    l.appendChild(n);
    if (r[1]) l.appendChild(el('span', 'ed-ant-qta', r[1]));
    pv.appendChild(l);
  }
  if (sc.rec) pv.appendChild(el('div', 'ed-ant-riga ed-ant-rec', 'Recovery ' + sc.rec));
}

/* I giorni di una settimana, da leggere: in una preparazione solo quelli del
   periodo. */
function edAnteprimaSett(pv, f, si) {
  const w = f.settimane[Math.min(si, f.settimane.length - 1)];
  const lun = f.base ? null : piuGiorni(lunedi(daChiave(f.prep.dal)), 7 * si);
  SETTIMANA.forEach((g, pos) => {
    const k = lun ? chiaveData(piuGiorni(lun, pos)) : null;
    if (k && (k < f.prep.dal || k > f.prep.al)) return;
    const nomi = (w.workout[g] || []).slice(0, w.conti[g] || 0).map(x => eLista(x) ? nomeLista(f.obj, x) : x).filter(Boolean);
    const l = el('div', 'ed-ant-riga');
    l.appendChild(el('span', 'ed-ant-giorno', GIORNI2[g] + (k ? ' ' + daChiave(k).getDate() : '')));
    l.appendChild(el('span', 'ed-ant-nome', nomi.length ? nomi.join(' + ') : 'Rest'));
    pv.appendChild(l);
  });
}

/* I workout scritti nei giorni che contano: nel piano tutta la settimana, in
   una preparazione solo i giorni dentro il periodo. */
function edWorkoutElenco(f) {
  if (f.base) return edWorkout(f);
  const out = [];
  f.settimane.forEach((w, i) => {
    const lun = piuGiorni(lunedi(daChiave(f.prep.dal)), 7 * i);
    SETTIMANA.forEach((g, pos) => {
      const k = chiaveData(piuGiorni(lun, pos));
      if (k < f.prep.dal || k > f.prep.al) return;
      for (const v of (w.workout[g] || []).slice(0, w.conti[g] || 0)) if (v && !eLista(v) && out.indexOf(v) < 0) out.push(v);
    });
  });
  return out;
}

function edVociFonte(box, ctx) {
  const f = edFonte(ctx);
  const v = edVista;
  if (f.base) {
    edVoceAnteprima(box, 'Week', { pag: 'week', ctx: ctx, sett: 0 }, v.pag === 'week' && v.ctx === ctx, '',
      ctx + ':week:0', pv => edAnteprimaSett(pv, f, 0));
  } else {
    f.settimane.forEach((w, i) => {
      edVoceAnteprima(box, 'Week ' + (i + 1), { pag: 'week', ctx: ctx, sett: i },
        v.pag === 'week' && v.ctx === ctx && v.sett === i, '', ctx + ':week:' + i, pv => edAnteprimaSett(pv, f, i));
    });
  }
  /* la lista di tutti i giorni sta nella sua categoria: Every day */
  box.appendChild(el('p', 'ed-sub', 'Every day'));
  /* sotto il nome: quando si vede, e quante volte */
  const quando = (riga, q, via) => { if (!via) riga.querySelector('.ed-voce').appendChild(el('span', 'ed-voce-sotto', edQuandoBreve(q))); };
  quando(edVoceAnteprima(box, nomeMattinaDi(f.obj) + (f.obj.mattinaVia ? ' (hidden)' : ''), { pag: 'morning', ctx: ctx },
    v.pag === 'morning' && v.ctx === ctx && !v.lista, f.obj.mattinaVia ? 'spenta' : '',
    ctx + ':morning', pv => edAnteprimaScheda(pv, f.schede[MORNING])), f.obj.mattinaQuando, f.obj.mattinaVia);
  for (const a of f.obj.altre) {
    quando(edVoceAnteprima(box, (a.nome || 'Every day') + (a.via ? ' (hidden)' : ''), { pag: 'morning', ctx: ctx, lista: a.id },
      v.pag === 'morning' && v.ctx === ctx && v.lista === a.id, a.via ? 'spenta' : '',
      ctx + ':ev:' + a.id, pv => edAnteprimaScheda(pv, f.schede[EV(a.id)])), a.quando, a.via);
  }
  /* una lista nuova: nasce vuota, con il suo nome da scrivere */
  if (f.obj.altre.length < 10) {
    const nuova = el('button', 'ed-voce piu', '+ New list');
    nuova.type = 'button';
    nuova.addEventListener('click', () => {
      const id = Date.now().toString(36).slice(-6) + Math.random().toString(36).slice(2, 5);
      f.obj.altre.push({ id: id, nome: 'List ' + (f.obj.altre.length + 2), via: false, quando: { modo: 'sempre' } });
      f.schede[EV(id)] = { es: [], rec: '' };
      edCambio(true);
      edVai({ pag: 'morning', ctx: ctx, lista: id });
    });
    box.appendChild(nuova);
  }
  /* i workout nuovi non hanno un bottone: nascono scrivendoli in un giorno della settimana */
  box.appendChild(el('p', 'ed-sub', 'Workouts'));
  const voceWk = n => edVoceAnteprima(box, n, { pag: 'workout', ctx: ctx, nome: n },
    v.pag === 'workout' && v.ctx === ctx && v.nome === n, 'wk', ctx + ':wk:' + n, pv => edAnteprimaScheda(pv, f.schede[n]));
  /* con piu' workout in un giorno, divisi per sessione: sotto ogni sessione
     i suoi workout */
  const sett = edWorkoutSessioni(f);
  if (sett.piu) {
    sett.per.forEach((nomi, s) => {
      if (!nomi || !nomi.length) return;
      box.appendChild(el('p', 'ed-sess', ORDINALI[s] + ' session'));
      for (const n of nomi) voceWk(n);
    });
  } else {
    for (const n of sett.tutti) voceWk(n);
  }
  /* gli altri workout: hanno una scheda, ma nessun giorno della settimana li
     usa. Stanno in una tendina chiusa, in fondo */
  const altri = edWorkout(f).filter(n => sett.tutti.indexOf(n) < 0);
  if (altri.length) {
    const qui = v.pag === 'workout' && v.ctx === ctx && altri.indexOf(v.nome) >= 0 ? ctx + '|' + v.nome : '';
    if (qui && qui !== edAltriUltimo) edAltriAperti.add(ctx);
    edAltriUltimo = qui || edAltriUltimo;
    const aperta = edAltriAperti.has(ctx);
    const t = el('button', 'ed-voce ed-finite ed-altri', (aperta ? '▾ ' : '▸ ') + 'OTHER WORKOUTS (' + altri.length + ')');
    t.type = 'button';
    t.setAttribute('aria-expanded', aperta ? 'true' : 'false');
    t.addEventListener('click', () => { if (aperta) edAltriAperti.delete(ctx); else edAltriAperti.add(ctx); edElenco(); });
    box.appendChild(t);
    if (aperta) for (const n of altri) voceWk(n);
  }
}

/* La tendina OTHER WORKOUTS aperta, per fonte (il piano o una preparazione) */
let edAltriAperti = new Set();
let edAltriUltimo = '';

/* I workout scritti nei giorni della settimana, per sessione: la sessione e'
   il posto nel giorno (il 1° workout, il 2°...). Un workout fatto in sessioni
   diverse sta sotto ognuna. In una preparazione contano solo i giorni del
   periodo. `piu`: qualche giorno ha piu' di un workout; `tutti`: tutti i
   workout della settimana, una volta sola. */
function edWorkoutSessioni(f) {
  const per = [], tutti = [];
  let piu = false;
  f.settimane.forEach((w, i) => {
    const lun = f.base ? null : piuGiorni(lunedi(daChiave(f.prep.dal)), 7 * i);
    SETTIMANA.forEach((g, pos) => {
      if (lun) { const k = chiaveData(piuGiorni(lun, pos)); if (k < f.prep.dal || k > f.prep.al) return; }
      const r = (w.workout[g] || []).slice(0, w.conti[g] || 0);
      if ((w.conti[g] || 0) > 1) piu = true;
      r.forEach((x, s) => {
        if (!x || eLista(x)) return;
        if (!per[s]) per[s] = [];
        if (per[s].indexOf(x) < 0) per[s].push(x);
        if (tutti.indexOf(x) < 0) tutti.push(x);
      });
    });
  });
  return { piu: piu, per: per, tutti: tutti };
}

/* Le preparazioni aperte nell'elenco: la casella le apre e le chiude, il
   pennino porta alla pagina per modificarla. */
let edPrepAperte = new Set();
let edPrepUltima = null;
let edFiniteAperte = false;

function edElenco() {
  const nav = $('edNav');
  const y = nav.scrollTop;
  nav.textContent = '';

  /* sopra tutto: la libreria degli esercizi, da consultare */
  const lib = edVoce('Exercise library', { pag: 'lib', ctx: 'base' }, edVista.pag === 'lib', 'ed-lib-link');
  lib.insertAdjacentHTML('afterbegin', '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5V5a2 2 0 0 1 2-2h13v15H6.5A2.5 2.5 0 0 0 4 20.5 2.5 2.5 0 0 0 6.5 23H19"/><path d="M8 7h7"/></svg>');
  nav.appendChild(lib);
  nav.appendChild(el('p', 'ed-sez', 'PLAN'));
  const base = el('div', 'ed-gruppo');
  edVociFonte(base, 'base');
  nav.appendChild(base);

  nav.appendChild(el('p', 'ed-sez', 'PREPARATIONS'));
  const kOggi = chiaveData(today());
  /* una preparazione appena raggiunta (anche appena creata) si apre da sola */
  if (edVista.ctx !== edPrepUltima) { edPrepUltima = edVista.ctx; if (edVista.ctx !== 'base') edPrepAperte.add(edVista.ctx); }
  const vocePrep = (nav, p) => {
    const stato = p.al < kOggi ? ' fatta' : (p.dal <= kOggi ? ' incorso' : '');
    const aperta = edPrepAperte.has(p.id);
    const riga = el('div', 'ed-riga');
    /* la casella apre e chiude; il pennino a destra porta alla modifica */
    const testa = el('button', 'ed-voce ed-prep' + stato +
      (edVista.pag === 'prep' && edVista.ctx === p.id ? ' on' : ''));
    testa.type = 'button';
    testa.appendChild(el('span', 'ed-prep-nome', nomePrep(p)));
    testa.appendChild(el('span', 'ed-prep-date', datePrep(p) +
      (stato === ' incorso' ? ' · now' : stato === ' fatta' ? ' · ended' : '')));
    testa.setAttribute('aria-expanded', aperta ? 'true' : 'false');
    testa.addEventListener('click', () => {
      if (aperta) edPrepAperte.delete(p.id); else edPrepAperte.add(p.id);
      edElenco();
    });
    riga.appendChild(testa);
    const pen = el('button', 'ed-pennino', '✎');
    pen.type = 'button';
    pen.setAttribute('aria-label', 'Edit ' + nomePrep(p));
    pen.addEventListener('click', ev => { ev.stopPropagation(); edPrepAperte.add(p.id); edVai({ pag: 'prep', ctx: p.id }); });
    riga.appendChild(pen);
    nav.appendChild(riga);
    /* le pagine della preparazione si vedono quando la si apre */
    if (aperta) {
      const g = el('div', 'ed-gruppo ed-figli');
      edVociFonte(g, p.id);
      nav.appendChild(g);
    }
  };
  /* quelle gia' finite stanno in una tendina, chiusa: non occupano spazio */
  const finite = tstore.prep.filter(p => p.al < kOggi);
  for (const p of tstore.prep) if (!(p.al < kOggi)) vocePrep(nav, p);
  nav.appendChild(edVoce('+ Add preparation', { pag: 'newprep', ctx: 'base' }, edVista.pag === 'newprep', 'piu'));
  if (finite.length) {
    if (finite.some(p => p.id === edVista.ctx)) edFiniteAperte = true;
    const t = el('button', 'ed-voce ed-finite', (edFiniteAperte ? '▾ ' : '▸ ') + 'Ended (' + finite.length + ')');
    t.type = 'button';
    t.setAttribute('aria-expanded', edFiniteAperte ? 'true' : 'false');
    t.addEventListener('click', () => { edFiniteAperte = !edFiniteAperte; edElenco(); });
    nav.appendChild(t);
    if (edFiniteAperte) {
      const box = el('div', 'ed-finite-box');
      for (const p of finite) vocePrep(box, p);
      nav.appendChild(box);
    }
  }
  nav.scrollTop = y;
}

/* ------------------------------------------------ le pagine ---- */

function edTitolo(box, testo, sotto) {
  box.appendChild(el('h3', 'ed-h', testo));
  if (sotto) box.appendChild(el('p', 'ed-sotto', sotto));
}

/* Il nome della fonte, sopra il titolo: per sapere sempre dove si scrive. */
function edDove(box, ctx) {
  const f = edFonte(ctx);
  box.appendChild(el('p', 'ed-dove' + (f.base ? '' : ' prep'),
    f.base ? 'PLAN' : 'PREPARATION · ' + nomePrep(f.prep) + ' · ' + datePrep(f.prep)));
}

function edPagina() {
  edLibera();
  const pane = $('edPane');
  const y = pane.scrollTop;
  pane.textContent = '';
  const v = edVista;
  if (v.pag === 'week') edPagSettimana(pane, v.ctx, v.sett || 0);
  else if (v.pag === 'morning') edPagMattina(pane, v.ctx, v.lista);
  else if (v.pag === 'workout') edPagWorkout(pane, v.ctx, v.nome);
  else if (v.pag === 'new') edPagNuovo(pane, v.ctx);
  else if (v.pag === 'prep') edPagPrep(pane, v.ctx);
  else if (v.pag === 'newprep') edPagNuovaPrep(pane);
  else if (v.pag === 'lib') edPagLibreria(pane);
  edBarraUndo(pane);
  pane.scrollTop = y;
}

/* Le cancellazioni grosse (via da tutto) si possono annullare per qualche
   secondo: prima si fotografa quello che tocca, poi si rimette com'era. */
let edUndo = null;
const edFoto = () => JSON.stringify({ libreria: tstore.libreria, schede: tstore.schede, prep: tstore.prep, esercizi: tstore.esercizi });
function edAnnullabile(testo, foto) { edUndo = { testo: testo, foto: foto, t: Date.now() }; }
function edBarraUndo(pane) {
  if (!edUndo || Date.now() - edUndo.t > 10000) { edUndo = null; return; }
  const u = edUndo;
  const bar = el('div', 'ed-tolto');
  bar.appendChild(el('span', 'ed-tolto-t', u.testo));
  edBottone(bar, 'Undo', 'ed-ok', () => {
    Object.assign(tstore, JSON.parse(u.foto));
    edUndo = null;
    edCambio(true);
    edPagina();
  });
  pane.appendChild(bar);
  setTimeout(() => bar.remove(), 10000 - (Date.now() - u.t));
}

/* Un campo di testo con la sua etichetta. `cambia` riceve il valore quando si
   esce dal campo. */
function edCampo(box, etichetta, valore, attr, cambia) {
  const l = el('label', 'ed-campo');
  l.appendChild(el('span', 'ed-eti', etichetta));
  const i = el('input', 'campo');
  i.type = attr.type || 'text';
  if (attr.max) i.maxLength = attr.max;
  if (attr.ph) i.placeholder = attr.ph;
  if (attr.list) i.setAttribute('list', attr.list);
  i.value = valore || '';
  i.addEventListener('change', () => cambia(i.value, i));
  l.appendChild(i);
  box.appendChild(l);
  return i;
}

function edBottone(box, testo, cls, fa) {
  const b = el('button', 'schbtn ' + (cls || ''), testo);
  b.type = 'button';
  b.addEventListener('click', fa);
  box.appendChild(b);
  return b;
}

/* Un bottone che chiede conferma: al primo tocco dice "Sure?", al secondo fa. */
function edConferma(box, testo, fa) {
  const b = edBottone(box, testo, 'btn-del', () => {
    if (b.dataset.sicuro) { fa(); return; }
    b.dataset.sicuro = '1';
    b.textContent = 'Sure? Tap again';
    setTimeout(() => { if (b.isConnected) { delete b.dataset.sicuro; b.textContent = testo; } }, 4000);
  });
  return b;
}

/* --- la settimana ------------------------------------------------------ */

function edPagSettimana(box, ctx, si) {
  const f = edFonte(ctx);
  const w = f.settimane[Math.min(si, f.settimane.length - 1)];
  edDove(box, ctx);
  if (f.base) {
    edTitolo(box, 'Week', '');
  } else {
    const inizio = piuGiorni(lunedi(daChiave(f.prep.dal)), 7 * si);
    const fine = piuGiorni(inizio, 6);
    const ultima = si === f.settimane.length - 1;
    edTitolo(box, 'Week ' + (si + 1), dataCorta(chiaveData(inizio)) + ' – ' + dataCorta(chiaveData(fine)) +
      (ultima && f.settimane.length < settimaneDel(f.prep) ? ' · repeats until the end of the preparation' : ''));
  }

  /* In un giorno va un workout o una lista Every day: si scelgono dalla
     tendina sotto il campo, prima le liste e poi i workout gia' scritti. Una
     lista si sceglie per nome, ma nel campo si legge solo "Every day": quale
     sia lo dice la pagina della lista. Il giorno tiene la sua chiave, cosi' se
     la lista cambia nome il giorno la segue. "Every day" vale la prima. */
  const liste = listeDi(f.obj);
  const voci = () => liste.map(l => l.nome).concat(edWorkout(f).filter(n => !liste.some(l => edNorm(l.nome) === edNorm(n))));
  const EVERY = 'Every day';
  const listaDi = t => {
    const b = edNorm(t);
    if (!b) return null;
    return liste.find(l => edNorm(l.nome) === b) ||
           (['every day', 'everyday', 'ogni giorno'].indexOf(b) >= 0 ? liste[0] : null);
  };

  /* In una preparazione la prima e l'ultima settimana possono essere a meta':
     i giorni prima dell'inizio e dopo la fine restano al piano di sempre, e
     qui si vedono spenti, con la data, invece dei campi. */
  const lunSett = f.base ? null : piuGiorni(lunedi(daChiave(f.prep.dal)), 7 * si);
  SETTIMANA.forEach((g, pos) => {
    const n = w.conti[g] || 0;
    const kGiorno = lunSett ? chiaveData(piuGiorni(lunSett, pos)) : null;
    const fuori = kGiorno && (kGiorno < f.prep.dal || kGiorno > f.prep.al);
    const riga = el('div', 'ed-giorno' + (n ? '' : ' riposo') + (fuori ? ' fuori' : ''));
    const testa = el('div', 'ed-giorno-testa');
    const nomeG = el('span', 'ed-giorno-nome', GIORNI_ED[g]);
    if (kGiorno) nomeG.appendChild(el('span', 'ed-giorno-data', ' ' + dataCorta(kGiorno)));
    testa.appendChild(nomeG);
    if (fuori) return;             /* fuori dal periodo: non si vede proprio */
    const conta = el('div', 'ed-conta');
    const meno = edBottone(conta, '−', 'ed-piumeno', () => { w.conti[g] = Math.max(0, n - 1); edCambio(true); edPagina(); });
    meno.disabled = n <= 0;
    meno.setAttribute('aria-label', 'One workout less on ' + GIORNI_ED[g]);
    conta.appendChild(el('span', 'ed-conta-num', String(n)));
    const piu = edBottone(conta, '+', 'ed-piumeno', () => { w.conti[g] = Math.min(MAX_SLOT, n + 1); edCambio(true); edPagina(); });
    piu.disabled = n >= MAX_SLOT;
    piu.setAttribute('aria-label', 'One workout more on ' + GIORNI_ED[g]);
    testa.appendChild(conta);
    riga.appendChild(testa);

    const campi = el('div', 'ed-giorno-campi');
    if (!n) campi.appendChild(el('span', 'ed-riposo', 'Rest day'));
    for (let i = 0; i < n; i++) {
      const inp = el('input', 'campo');
      inp.type = 'text';
      inp.maxLength = 60;
      inp.placeholder = ORDINALI[i] + ' workout';
      const val = (w.workout[g] || [])[i] || '';
      /* una lista si vede come "Every day": quale sia, lo dice la pagina della lista */
      inp.value = eLista(val) ? EVERY : val;
      inp.classList.toggle('every', eLista(val));
      const salva = () => {
        const r = (w.workout[g] || []).slice();
        while (r.length <= i) r.push('');
        let scritto = inp.value.slice(0, 60).trim();
        /* "Every day" su un posto che ha gia' una lista: resta quella */
        const ora = (w.workout[g] || [])[i] || '';
        if (eLista(ora) && edNorm(scritto) === edNorm(EVERY)) { inp.value = EVERY; inp.classList.add('every'); return; }
        const l = listaDi(scritto);
        if (l) {
          r[i] = l.chiave;
          inp.value = EVERY;
        } else {
          /* un workout che c'e' gia', scritto con maiuscole diverse, e' quello:
             niente workout fantasma. Per i nomi simili c'e' la tendina */
          const esiste = edWorkout(f).find(n => edNorm(n) === edNorm(scritto));
          if (esiste) { scritto = esiste; inp.value = esiste; }
          r[i] = scritto;
        }
        if (r[i] === ora) { inp.classList.toggle('every', !!l); return; }
        while (r.length && !r[r.length - 1]) r.pop();
        if (r.length) w.workout[g] = r; else delete w.workout[g];
        inp.classList.toggle('every', !!l);
        edCambio(true);
      };
      inp.addEventListener('change', salva);
      campi.appendChild(edTendina(inp, voci, v => { inp.value = v; inp.blur(); salva(); }, { simili: true, nuova: 'New workout' }));
    }
    riga.appendChild(campi);
    box.appendChild(riga);
  });

  if (!f.base && f.settimane.length > 1) {
    const b = el('div', 'ed-azioni');
    edConferma(b, 'Delete week ' + (si + 1), () => {
      f.settimane.splice(si, 1);
      edVista = { pag: 'week', ctx: ctx, sett: Math.max(0, si - 1) };
      edCambio(true);
      edRidisegna();
    });
    box.appendChild(b);
  }
}

/* Quante settimane del calendario tocca una preparazione. */
const settimaneDel = p =>
  Math.floor(giorniFra(chiaveData(lunedi(daChiave(p.dal))), chiaveData(lunedi(daChiave(p.al)))) / 7) + 1;

/* I workout che somigliano a un nome scritto nella settimana, per la
   tendina: le stesse lettere a parte maiuscole, spazi e segni; una o due
   lettere diverse (un errore di battitura); o le stesse parole, accorciate
   o con qualche lettera sbagliata
   ("priv wing chun", "sat calistenics"). */
function edSimili(nomi, scritto) {
  const k = t => edNorm(t).replace(/[^a-z0-9]+/g, '');
  const parole = t => edNorm(t).replace(/[^a-z0-9 ]+/g, ' ').split(' ').filter(Boolean);
  const s = k(scritto);
  if (!s) return [];
  const soglia = s.length < 6 ? 1 : 2;
  const ps = parole(scritto);
  /* una parola scritta va bene se e' l'inizio di quella del workout, anche con
     una lettera sbagliata, o se e' quasi uguale; le parole corte solo se sono
     l'inizio esatto */
  const parola = (p, q) => p.indexOf(q) === 0 || (q.length >= 4 && (edDistanza(p.slice(0, q.length), q) <= 1 ||
                           edDistanza(p, q) <= (q.length < 6 ? 1 : 2)));
  return nomi.filter(n => {
    if (k(n) === s || edDistanza(k(n), s) <= soglia) return true;
    const pn = parole(n);
    return pn.length >= ps.length && ps.every((q, i) => parola(pn[i], q));
  });
}

/* Quante lettere vanno cambiate, aggiunte o tolte per passare da a a b. */
function edDistanza(a, b) {
  let prima = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const ora = [i];
    for (let j = 1; j <= b.length; j++) {
      ora[j] = Math.min(prima[j] + 1, ora[j - 1] + 1, prima[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prima = ora;
  }
  return prima[b.length];
}

/* --- la tendina sotto un campo --------------------------------------------
   Mentre si scrive, sotto il campo si apre l'elenco delle voci che
   contengono quello che si e' scritto: prima quelle che cominciano cosi'.
   Si sceglie col dito. `voci` e' una funzione che torna l'elenco; `scegli`
   riceve la voce toccata. Con `subito` la tendina si apre anche a campo
   vuoto, con tutte le voci. Torna il contenitore da mettere al posto del
   campo. */
function edTendina(inp, voci, scegli, opt) {
  opt = opt || {};
  const w = el('div', 'ed-tend-w' + (opt.cls ? ' ' + opt.cls : ''));
  const box = el('div', 'ed-tend');
  box.hidden = true;
  w.appendChild(inp);
  w.appendChild(box);
  const chiudi = () => { box.hidden = true; box.textContent = ''; };
  const apri = () => {
    const q = edNorm(inp.value);
    box.textContent = '';
    if (!q && !opt.subito) { chiudi(); return; }
    const tutte = voci();
    const inizio = [], dentro = [];
    for (const v of tutte) {
      const n = edNorm(v);
      if (!q || n.indexOf(q) === 0) inizio.push(v);
      else if (n.indexOf(q) > 0) dentro.push(v);
    }
    /* con `simili`, anche quelli che somigliano (lettere sbagliate, parole accorciate) */
    const simili = opt.simili ? edSimili(tutte, inp.value).filter(v => inizio.indexOf(v) < 0 && dentro.indexOf(v) < 0) : [];
    const trovate = inizio.concat(dentro, simili).slice(0, 60);
    for (const v of trovate) {
      const b = el('button', 'ed-tend-voce' + (edNorm(v) === q ? ' uguale' : ''), v);
      b.type = 'button';
      /* pointerdown tiene il fuoco nel campo; la scelta arriva col click, cosi'
         il tocco finisce qui e non cade sul tasto che c'e' sotto */
      b.addEventListener('pointerdown', ev => ev.preventDefault());
      b.addEventListener('click', ev => { ev.preventDefault(); ev.stopPropagation(); chiudi(); scegli(v); });
      box.appendChild(b);
    }
    const nuova = opt.nuova && q && !trovate.some(v => edNorm(v) === q);
    if (nuova) box.appendChild(el('p', 'ed-tend-vuota', opt.nuova + ': "' + inp.value.trim() + '"'));
    else if (!trovate.length) box.appendChild(el('p', 'ed-tend-vuota', opt.vuota || 'Not found'));
    box.hidden = false;
  };
  inp.setAttribute('autocomplete', 'off');
  inp.addEventListener('input', apri);
  inp.addEventListener('focus', () => { if (opt.subito || inp.value) apri(); });
  inp.addEventListener('blur', () => setTimeout(chiudi, 150));
  inp.addEventListener('keydown', ev => { if (ev.key === 'Escape') chiudi(); });
  return w;
}

/* Il padre di una variante, da scegliere cercando: la tendina di tutti gli
   esercizi principali. `vuoto` e' la voce in cima che vuol dire "nessuno". */
function edCercaPadre(k, attuale, scegli, vuoto) {
  const inp = el('input', 'campo ed-cerca-padre');
  inp.type = 'search'; inp.maxLength = 60;
  inp.placeholder = attuale || vuoto || 'Search the exercise…';
  inp.setAttribute('aria-label', 'Variant of');
  return edTendina(inp, () => (vuoto ? [vuoto] : []).concat(edPrincipali(k)),
                   v => scegli(v === vuoto ? '' : v), { subito: true, cls: 'ed-tend-padre' });
}

/* --- gli esercizi: la parte comune a FIRST 15' e ai workout -------------- */

/* Il gruppo Tabata o EMOM di una riga, col suo tipo. Un gruppo che e'
   Tabata o EMOM solo di nome riceve il suo tipo (dal nome) se `crea`. */
function edTipoRiga(sc, r, crea) {
  const tg = tipoDi(sc, r);
  if (tg) return tg;
  const g = r[2] || [];
  for (let d = g.length; d > 0; d--) {
    const dal = tipoDalNome(g[d - 1]);
    if (!dal || dal.t !== 'tabata') continue;      /* l'EMOM c'e' solo se il gruppo e' di tipo EMOM */
    const via = g.slice(0, d);
    if (!crea) return { via: via, tipo: dal };
    if (!sc.tipi) sc.tipi = {};
    sc.tipi[JSON.stringify(via)] = dal;
    return { via: via, tipo: dal };
  }
  return null;
}

/* L'ultima riga tolta da un workout, per poterla rimettere. */
let edTolto = null;

/* Le righe di una scheda da scrivere: nome, quantita', descrizione, frecce,
   croce. Il ▾ apre sotto la riga la descrizione e il video. */
function edEsercizi(box, ctx, nomeScheda, sc) {
  /* i nomi di tutti gli esercizi gia' scritti: la tendina sotto il campo */
  let nomiLib = null;
  const nomiTutti = () => nomiLib || (nomiLib = edLibreria().map(x => x.nome));
  /* appena tolta una riga: la si rimette com'era, al suo posto */
  if (edTolto && edTolto.sc === sc && Date.now() - edTolto.t < 10000) {
    const t = edTolto;
    const bar = el('div', 'ed-tolto');
    bar.appendChild(el('span', 'ed-tolto-t', '"' + (t.r[0] || 'Exercise') + '" removed from this workout'));
    edBottone(bar, 'Undo', 'ed-ok', () => {
      sc.es.splice(Math.min(t.i, sc.es.length), 0, t.r);
      edTolto = null;
      edCambio(false);
      edPagina();
    });
    box.appendChild(bar);
    setTimeout(() => bar.remove(), 10000 - (Date.now() - t.t));
  }
  const cont = el('div', 'ed-es-lista');
  box.appendChild(cont);
  sc.es.forEach((r, i) => {
    const chiave = ctx + '|' + nomeScheda + '|' + i;
    const aperto = edAperti.has(chiave);
    const es = el('div', 'ed-es' + (aperto ? ' aperto' : '') + (edSelezionata(sc, i) ? ' sel' : ''));
    const riga = el('div', 'ed-es-riga');

    /* sul telefono si sposta col dito, dalla maniglia; sul PC con le frecce */
    const man = el('span', 'ed-maniglia solo-tel', '⠿');
    man.setAttribute('aria-hidden', 'true');
    edTrascina(man, es, cont, sc, i);
    riga.appendChild(man);
    const nome = el('input', 'campo ed-es-nome');
    nome.type = 'text'; nome.maxLength = 60; nome.placeholder = 'exercise';
    nome.value = r[0] || '';
    nome.dataset.focus = chiave + '|0';
    nome.addEventListener('change', () => {
      const prima = r[0] || '';
      r[0] = nome.value.slice(0, 60).trim();
      const k = edNorm(r[0]);
      /* un nome mai scritto: si chiede se e' un esercizio o una variante */
      const chiedi = k && k !== edNorm(prima) && !edRigheDi(k).some(x => x !== r) && !edMeta(k).p;
      if (chiedi) edChiedi.add(k);
      /* ogni esercizio ha la sua scheda in libreria: descrizione e video
         stanno li'; se esiste gia', il nome si scrive come la'. Un nome nuovo
         entra in libreria solo quando si risponde alla domanda: cosi' un nome
         scritto a meta' non finisce in libreria */
      const L = k ? edLib(k, chiedi ? null : r[0]) : null;
      if (L) r[0] = L[0];
      edCambio(false);
      edPagina();
    });
    const qta = el('input', 'campo ed-es-qta');
    qta.type = 'text'; qta.maxLength = 60; qta.placeholder = 'how much';
    qta.value = r[1] || '';
    qta.addEventListener('change', () => { r[1] = qta.value.slice(0, 60).trim(); edCambio(false); });
    riga.appendChild(edTendina(nome, nomiTutti, v => { nome.value = v; nome.blur(); nome.dispatchEvent(new Event('change')); },
                               { cls: 'nome', nuova: 'New exercise, not in the library yet' }));
    riga.appendChild(qta);

    const tasti = el('div', 'ed-es-tasti');
    const L = edLib(edNorm(r[0]));
    const pieno = !!(r[3] || (L && (L[3] || L[4])));
    const d = edBottone(tasti, aperto ? '▴' : (L && L[4] ? '▶' : '▾'), 'ed-tasto ed-desc' + (pieno ? ' piena' : ''), () => {
      if (edAperti.has(chiave)) edAperti.delete(chiave); else edAperti.add(chiave);
      edPagina();
    });
    d.setAttribute('aria-label', 'Description, video and note');
    d.title = 'Description, video and note';
    if (L) {
      const pen = edBottone(tasti, '✎', 'ed-tasto solo-pc', () => edApriInLibreria(edNorm(r[0])));
      pen.setAttribute('aria-label', 'Edit in the library'); pen.title = 'Edit in the library';
    }
    const blk = edBlocco(sc, i);
    const su = edBottone(tasti, '↑', 'ed-tasto solo-pc', () => edSposta(sc, i, -1));
    su.disabled = blk[0] === 0; su.setAttribute('aria-label', 'Move up');
    const giu = edBottone(tasti, '↓', 'ed-tasto solo-pc', () => edSposta(sc, i, 1));
    giu.disabled = blk[blk.length - 1] === sc.es.length - 1; giu.setAttribute('aria-label', 'Move down');
    /* toglie la riga da questo workout e basta: in libreria l'esercizio resta,
       e resta negli altri workout. Per qualche secondo si puo' annullare. */
    const togli = () => {
      sc.es.splice(i, 1);
      edTolto = { sc: sc, i: i, r: r, t: Date.now() };
      edAperti = new Set();
      edCambio(false);
      edPagina();
    };
    /* due tocchi: il primo chiede conferma, il secondo toglie */
    const x = edBottone(tasti, '×', 'ed-tasto ed-x', () => {
      /* un doppio tocco per sbaglio (piu' veloce di mezzo secondo) non conta */
      if (x.dataset.sicuro) { if (Date.now() - +x.dataset.sicuro > 450) togli(); return; }
      x.dataset.sicuro = String(Date.now());
      x.textContent = 'Remove?';
      x.classList.add('sicuro');
      setTimeout(() => { if (x.isConnected) { delete x.dataset.sicuro; x.textContent = '×'; x.classList.remove('sicuro'); } }, 4000);
    });
    x.setAttribute('aria-label', 'Remove from this workout'); x.title = 'Remove from this workout';
    riga.appendChild(tasti);
    es.appendChild(riga);

    /* il gruppo in cui sta, se ci sta: si legge, si cambia dal bottone Groups */
    if ((r[2] || []).length) {
      const gl = el('div', 'ed-es-grp-riga');
      gl.appendChild(el('p', 'ed-es-grp', 'in ' + r[2].join(' › ')));
      /* in un Tabata o un EMOM: quanti lati ha l'esercizio. Il timer gli da'
         un intervallo per lato */
      const tl = edTipoRiga(sc, r);
      if (tl && r[0]) {
        const L = latiDi(tl.tipo, r[0]);
        const bl = edBottone(gl, L > 1 ? '↔ ' + L + ' sides' : '1 side', 'ed-lati' + (L > 1 ? ' on' : ''), () => {
          const t = edTipoRiga(sc, r, true).tipo;
          const k = normEs(r[0]);
          t.lati = Object.assign({}, t.lati || {});
          if (L > 1) delete t.lati[k]; else t.lati[k] = 2;
          if (!Object.keys(t.lati).length) delete t.lati;
          edCambio(false); edPagina();
        });
        bl.setAttribute('aria-label', 'Sides of ' + r[0] + ': tap to change');
      }
      es.appendChild(gl);
    }
    const kr = edNorm(r[0]);
    if (kr && edChiedi.has(kr)) es.appendChild(edDomanda(kr, r[0], sc));
    if (edChiediSel && edChiediSel.sc === sc && edChiediSel.r === r) es.appendChild(edDomandaGruppo(sc, i));
    /* il gruppo selezionato: sul primo esercizio, il tasto per lasciarlo */
    if (edSelGr && edSelGr.sc === sc && edTop(r) === edSelGr.g && edTop(sc.es[i - 1]) !== edSelGr.g) {
      const sb = el('div', 'ed-sel-barra');
      sb.appendChild(el('span', 'ed-sel-t', 'Group "' + edSelGr.g + '" selected'));
      edBottone(sb, 'Deselect', 'ed-sel-via', () => { edSelGr = null; edPagina(); });
      es.insertBefore(sb, es.firstChild);
    }

    /* aperta: quello che c'e' in libreria, da leggere, e la nota di questa
       riga sola */
    if (aperto) {
      es.appendChild(edNotaRiga(r, L));
      /* sul telefono la riga e' corta: togliere sta qui dentro */
      const az = el('div', 'ed-video-tasti ed-nota-az solo-tel');
      edConferma(az, 'Remove from this workout', togli);
      es.appendChild(az);
    }
    cont.appendChild(es);

    /* l'ultimo esercizio di un gruppo: sotto, il tasto per aggiungerne uno
       dentro lo stesso gruppo, subito qui */
    const g = r[2] || [], dopo = sc.es[i + 1];
    if (g.length && !(dopo && JSON.stringify(dopo[2] || []) === JSON.stringify(g))) {
      const piu = edBottone(cont, '+ in ' + g[g.length - 1], 'ed-aggiungi ed-in-gruppo', () => {
        sc.es.splice(i + 1, 0, ['', '', g.slice(), '', '']);
        edAperti = new Set();
        edPagina();
        const campi = $('edPane').querySelectorAll('.ed-es-nome');
        if (campi[i + 1]) campi[i + 1].focus();
      });
      piu.setAttribute('aria-label', 'Add an exercise in ' + g.join(' › '));
    }
  });

  edBottone(box, '+ Exercise', 'ed-aggiungi', () => {
    sc.es.push(['', '', [], '', '']);
    edPagina();
    const campi = $('edPane').querySelectorAll('.ed-es-nome');
    if (campi.length) campi[campi.length - 1].focus();
  });
  /* un gruppo copiato dal pannello Gruppi: si incolla qui, con i suoi esercizi */
  const ap = appuntiGruppo();
  if (ap) {
    edBottone(box, '📋 Paste the group "' + ap.nome + '" (' + ap.es.length + (ap.es.length === 1 ? ' exercise)' : ' exercises)'), 'ed-aggiungi ed-incolla', () => {
      const nome = incollaGruppo(sc);
      /* gli esercizi incollati hanno la loro scheda in libreria, come quando si scrivono */
      for (const r of sc.es) if (r[0] && (r[2] || [])[0] === nome) edLib(edNorm(r[0]), r[0]);
      edCambio(false);
      edPagina();
    });
  }
}

/* Selezionare un esercizio di un gruppo: si chiede se va preso tutto il
   gruppo. Preso il gruppo, si sposta tutto insieme nel workout. */
const ED_NONCHIEDERE_KEY = 'gwork-wk-gruppo-nonchiedere-v1';
let edSelGr = null;       /* { sc, g }: il gruppo selezionato */
let edSelRiga = null;     /* { sc, r }: un esercizio solo, senza il suo gruppo */
let edChiediSel = null;   /* { sc, r }: la riga che sta facendo la domanda */

/* il gruppo piu' esterno della riga: e' quello che si muove intero */
const edTop = r => (r && (r[2] || [])[0]) || '';
const edNonChiedere = () => { try { return localStorage.getItem(ED_NONCHIEDERE_KEY) === '1'; } catch (e) { return false; } };

/* le righe che si muovono insieme a quella: tutto il gruppo, se e' selezionato */
function edBlocco(sc, i) {
  const g = edTop(sc.es[i]);
  if (!g || !edSelGr || edSelGr.sc !== sc || edSelGr.g !== g) return [i];
  const b = [];
  sc.es.forEach((r, t) => { if (edTop(r) === g) b.push(t); });
  return b;
}

function edSelezionata(sc, i) {
  const r = sc.es[i];
  if (edSelGr && edSelGr.sc === sc && edTop(r) === edSelGr.g) return true;
  return !!(edSelRiga && edSelRiga.sc === sc && edSelRiga.r === r);
}

/* va chiesto? solo per una riga di un gruppo, non ancora scelta */
function edVaChiesto(sc, i) {
  const r = sc.es[i];
  if (!edTop(r) || edNonChiedere()) return false;
  return !edSelezionata(sc, i);
}

function edChiediGruppo(sc, i) {
  edChiediSel = { sc: sc, r: sc.es[i] };
  edPagina();
}

function edDomandaGruppo(sc, i) {
  const r = sc.es[i], g = edTop(r);
  const box = el('div', 'ed-domanda ed-domanda-gr');
  box.appendChild(el('p', 'ed-domanda-t', 'Select the whole group "' + g + '"?'));
  const t = el('div', 'ed-domanda-tasti');
  const fatto = () => { edChiediSel = null; edPagina(); };
  edBottone(t, 'Select the whole group', 'ed-ok', () => {
    edSelGr = { sc: sc, g: g }; edSelRiga = null;
    /* il gruppo si raccoglie tutto dove sta il suo primo esercizio */
    const b = edBlocco(sc, i);
    if (b[b.length - 1] - b[0] !== b.length - 1) {
      edMuoviBlocco(sc, b, sc.es.slice(0, b[0]).filter(x => edTop(x) !== g).length);
      edCambio(false);
    }
    fatto();
  });
  edBottone(t, 'Not the whole group', '', () => {
    edSelRiga = { sc: sc, r: r };
    if (edSelGr && edSelGr.sc === sc && edSelGr.g === g) edSelGr = null;
    fatto();
  });
  edBottone(t, 'Not the whole group, and don\'t ask again', '', () => {
    try { localStorage.setItem(ED_NONCHIEDERE_KEY, '1'); } catch (e) { /* niente */ }
    edSelRiga = { sc: sc, r: r };
    fatto();
  });
  box.appendChild(t);
  return box;
}

/* Le righe `b` (in ordine) vanno messe insieme, dopo `k` delle altre. */
function edMuoviBlocco(sc, b, k) {
  const set = new Set(b);
  const blocco = b.map(t => sc.es[t]);
  const altri = sc.es.filter((_, t) => !set.has(t));
  altri.splice(k, 0, ...blocco);
  sc.es.splice(0, sc.es.length, ...altri);
}

/* un gruppo che si muove non entra in mezzo a un altro gruppo */
const edSpezza = (sc, O, k) => k > 0 && k < O.length && edTop(sc.es[O[k - 1]]) &&
  edTop(sc.es[O[k - 1]]) === edTop(sc.es[O[k]]);

/* Trascinare una riga col dito, dalla maniglia: le altre si scostano per
   fargli posto; lasciata, la riga va li'. Vicino ai bordi la pagina scorre.
   Con il gruppo selezionato si trascina tutto il gruppo. */
function edTrascina(man, es, cont, sc, i) {
  man.addEventListener('pointerdown', ev => {
    ev.preventDefault();
    if (edVaChiesto(sc, i)) { edChiediGruppo(sc, i); return; }
    man.setPointerCapture(ev.pointerId);
    const pane = $('edPane');
    const carte = [...cont.querySelectorAll(':scope > .ed-es')];
    const rects = carte.map(c => c.getBoundingClientRect());
    const B = edBlocco(sc, i), inB = new Set(B);
    const O = carte.map((_, t) => t).filter(t => !inB.has(t));
    const gruppo = B.length > 1;
    const primo = rects[B[0]], ultimo = rects[B[B.length - 1]];
    const spazio = rects.length > 1 ? Math.max(0, rects[1].top - rects[0].bottom) : 6;
    const alto = ultimo.bottom - primo.top + spazio;
    const meta = (primo.top + ultimo.bottom) / 2;
    const a = O.filter(t => t < B[0]).length;
    const y0 = ev.clientY, s0 = pane.scrollTop;
    let k = a;
    for (const t of B) carte[t].classList.add('trascina');
    if (gruppo) cont.classList.add('trascina-gruppo');
    const muovi = e => {
      const bordo = pane.getBoundingClientRect();
      if (e.clientY > bordo.bottom - 40) pane.scrollTop += 14;
      else if (e.clientY < bordo.top + 40) pane.scrollTop -= 14;
      const dy = e.clientY - y0 + (pane.scrollTop - s0);
      for (const t of B) carte[t].style.transform = 'translateY(' + dy + 'px)';
      const centro = meta + dy;
      k = O.filter(t => centro > rects[t].top + rects[t].height / 2).length;
      if (gruppo) while (edSpezza(sc, O, k)) k += k > a ? -1 : 1;
      O.forEach((t, p) => {
        const sp = k < a && p >= k && p < a ? alto : k > a && p >= a && p < k ? -alto : 0;
        carte[t].style.transform = sp ? 'translateY(' + sp + 'px)' : '';
      });
    };
    const fine = () => {
      man.removeEventListener('pointermove', muovi);
      man.removeEventListener('pointerup', fine);
      man.removeEventListener('pointercancel', fine);
      for (const c of carte) { c.style.transform = ''; c.classList.remove('trascina'); }
      cont.classList.remove('trascina-gruppo');
      if (k !== a) {
        edMuoviBlocco(sc, B, k);
        edAperti = new Set();
        edCambio(false);
      }
      edPagina();
    };
    man.addEventListener('pointermove', muovi);
    man.addEventListener('pointerup', fine);
    man.addEventListener('pointercancel', fine);
  });
}

/* Le righe cambiano posto una alla volta. Un gruppo resta com'e': la riga
   spostata porta con se' il suo. Il gruppo selezionato si sposta intero, e
   salta un altro gruppo tutto in una volta. */
function edSposta(sc, i, dir) {
  if (edVaChiesto(sc, i)) { edChiediGruppo(sc, i); return; }
  const B = edBlocco(sc, i);
  if (B.length > 1) {
    const inB = new Set(B);
    const O = sc.es.map((_, t) => t).filter(t => !inB.has(t));
    const a = O.filter(t => t < B[0]).length;
    let k = a + dir;
    if (k < 0 || k > O.length) return;
    while (edSpezza(sc, O, k)) k += dir;
    edMuoviBlocco(sc, B, k);
  } else {
    const j = i + dir;
    if (j < 0 || j >= sc.es.length) return;
    const t = sc.es[i]; sc.es[i] = sc.es[j]; sc.es[j] = t;
  }
  edAperti = new Set();
  edCambio(false);
  edPagina();
}

let edAvvisoVideo = '';

/* Tutti i video gia' caricati, con gli esercizi che li usano; tranne `salta`. */
function edTuttiVideo(salta) {
  const m = new Map();
  const metti = x => {
    const vv = videiDi(x);
    vv.forEach((n, i) => {
      if (salta.indexOf(n) >= 0) return;
      if (!m.has(n)) m.set(n, []);
      const t = (x[0] || '') + (vv.length > 1 ? ' · video ' + (i + 1) + ' of ' + vv.length : '');
      const a = m.get(n);
      if (x[0] && a.indexOf(t) < 0) a.push(t);
    });
  };
  for (const x of tstore.libreria) metti(x);
  for (const o of [tstore].concat(tstore.prep)) for (const k of Object.keys(o.schede)) for (const x of o.schede[k].es) metti(x);
  return [...m.entries()].map(([nome, es]) => ({ nome: nome, es: es }))
    .sort((a, b) => (a.es[0] || '').localeCompare(b.es[0] || '', 'it', { sensitivity: 'base' }));
}

/* La scelta fra i video gia' caricati: si spuntano, si aggiungono insieme.
   L'anteprima c'e' se il video e' nel telefono; se no, si scarica al tocco. */
function edPannelloVideo(box, tutti, aggiungi, posto) {
  const scelti = new Set();
  const ok = el('button', 'schbtn ed-ok', 'Add');
  ok.type = 'button'; ok.disabled = true;
  const conta = () => { ok.textContent = scelti.size ? 'Add ' + scelti.size + (scelti.size === 1 ? ' video' : ' videos') : 'Add'; ok.disabled = !scelti.size; };
  if (posto < 6) box.appendChild(el('p', 'ed-sotto', 'Room for ' + posto + ' more videos.'));
  const az = el('div', 'ed-video-tasti');
  ok.addEventListener('click', () => aggiungi([...scelti]));
  az.appendChild(ok);
  box.appendChild(az);
  /* tanti video: si cercano per nome dell'esercizio che li usa */
  const cerca = el('input', 'campo ed-lib-cerca');
  cerca.type = 'search'; cerca.placeholder = 'Search the videos…';
  cerca.setAttribute('aria-label', 'Search the videos');
  box.appendChild(cerca);
  const nessuno = el('p', 'ed-sotto', 'No video with this name.');
  nessuno.hidden = true;
  box.appendChild(nessuno);
  const righe = [];
  cerca.addEventListener('input', () => {
    const q = edNorm(cerca.value);
    let n = 0;
    for (const { r, x } of righe) {
      const va = !q || edNorm(x.es.join(' ') + ' ' + x.nome).indexOf(q) >= 0 || scelti.has(x.nome);
      r.hidden = !va;
      if (va) n++;
    }
    nessuno.hidden = n > 0;
  });
  for (const x of tutti) {
    const r = el('div', 'ed-vpick-uno');
    righe.push({ r: r, x: x });
    const lab = el('label', 'ed-vpick-eti');
    const c = el('input'); c.type = 'checkbox';
    c.addEventListener('change', () => {
      if (c.checked && scelti.size >= posto) { c.checked = false; return; }
      if (c.checked) scelti.add(x.nome); else scelti.delete(x.nome);
      conta();
    });
    lab.appendChild(c);
    lab.appendChild(el('span', '', x.es.join(', ') || x.nome));
    r.appendChild(lab);
    const ant = el('div', 'ed-vpick-ant');
    const mostra = blob => {
      const u = URL.createObjectURL(blob); edUrl.push(u);
      const vid = el('video'); vid.src = u; vid.controls = true; vid.playsInline = true; vid.preload = 'metadata';
      ant.textContent = ''; ant.appendChild(vid);
    };
    vGet(x.nome).then(blob => {
      if (blob) { mostra(blob); return; }
      const b = el('button', 'schbtn', 'Show preview'); b.type = 'button';
      b.addEventListener('click', async () => { b.disabled = true; b.textContent = 'Loading…'; const bl = await prendiVideo(x.nome); if (bl) mostra(bl); else b.textContent = 'Not available yet'; });
      ant.appendChild(b);
    });
    r.appendChild(ant);
    box.appendChild(r);
  }
}

/* --- la libreria e' l'unico posto di descrizione e video -----------------
   Ogni esercizio ha una riga in tstore.libreria: [nome, '', [], descrizione,
   video]. Le righe dei workout tengono nome, quanto e gruppo; nella quarta
   casella, se c'e', una nota che vale solo li'. */

/* La riga di libreria di un nome; con `nuovo` la crea se manca. */
function edLib(n, nuovo) {
  if (!n) return null;
  let L = tstore.libreria.find(x => edNorm(x[0]) === n);
  if (!L && nuovo) { L = [nuovo, '', [], '', '']; tstore.libreria.push(L); }
  return L || null;
}

/* Dalla riga di un workout alla sua scheda in libreria, gia' aperta. */
let edLibVai = '';
function edApriInLibreria(n) {
  edLibAperti.add(n);
  edLibCerca = '';
  edLibSel = null;
  edLibVai = n;
  edVai({ pag: 'lib', ctx: 'base' });
}

/* Sotto la riga aperta: descrizione e video della libreria, da leggere, con
   il tasto per cambiarli la'; e la nota di questa riga sola. */
function edNotaRiga(r, L) {
  const box = el('div', 'ed-desc-box ed-nota-box');
  const n = edNorm(r[0]);
  /* descrizione e video si scrivono anche da qui, ma vanno nella libreria:
     valgono per questo esercizio in tutti i workout */
  if (n) {
    /* la scheda intera in libreria, a un tocco */
    const vai = el('div', 'ed-nota-lib');
    edBottone(vai, '✎ Go to the library', 'ed-nota-vai', () => edApriInLibreria(n));
    box.appendChild(vai);
    const fin = [r[0], '', [], (L && L[3]) || '', (L && L[4]) || ''];
    box.appendChild(edDescrizione(fin, () => {
      const X = edLib(n, r[0]);
      X[3] = fin[3] || ''; X[4] = fin[4] || '';
    }));
  }
  /* una nota scritta solo per questa riga, alla vecchia: resta, si legge e
     si cambia qui */
  if (r[3]) {
    box.appendChild(el('p', 'ed-eti', 'Note only for this workout'));
    const t = el('textarea', 'commento ed-desc-testo');
    t.value = r[3] || '';
    const alto = () => { t.rows = Math.max(2, Math.min(16, t.value.split('\n').length + 1)); };
    alto();
    t.addEventListener('input', alto);
    t.addEventListener('change', () => { r[3] = t.value.slice(0, 4000).trim(); edCambio(false); });
    box.appendChild(t);
  }
  return box;
}

/* Una volta sola (e di nuovo se arrivano dati scritti alla vecchia):
   descrizioni e video delle righe passano in libreria. Niente si perde: una
   descrizione uguale a quella della libreria sparisce dalla riga; se la
   contiene con qualcosa in piu', resta solo il di piu' come nota; se e' tutta
   diversa, resta intera come nota. I video vanno tutti in libreria. */
function edConverti() {
  const perNome = new Map();
  for (const L of tstore.libreria) {
    const n = edNorm(L[0]);
    if (n && !perNome.has(n)) perNome.set(n, { lib: L, righe: [] });
  }
  for (const o of [tstore].concat(tstore.prep)) {
    for (const k of Object.keys(o.schede)) {
      for (const r of o.schede[k].es) {
        const n = edNorm(r[0]);
        if (!n) continue;
        if (!perNome.has(n)) perNome.set(n, { lib: null, righe: [] });
        perNome.get(n).righe.push(r);
      }
    }
  }
  let cambiato = false;
  for (const x of perNome.values()) {
    if (!x.lib) { x.lib = [x.righe[0][0], '', [], '', '']; tstore.libreria.push(x.lib); cambiato = true; }
    const L = x.lib;
    if (!L[3]) {
      /* la descrizione della libreria: quella che sta dentro piu' righe
         (la base comune), poi la piu' usata */
      const tutte = x.righe.map(r => r[3]).filter(Boolean);
      const cand = [...new Set(tutte)];
      const dentro = a => cand.filter(c => c.indexOf(a) >= 0).length;
      const usata = a => tutte.filter(c => c === a).length;
      cand.sort((a, b) => dentro(b) - dentro(a) || usata(b) - usata(a));
      if (cand.length) { L[3] = cand[0]; cambiato = true; }
    }
    for (const r of x.righe) {
      if (r[3] && L[3]) {
        let nota = r[3];
        if (nota === L[3]) nota = '';
        else if (nota.indexOf(L[3]) >= 0) nota = nota.split(L[3]).join('\n').replace(/\n{3,}/g, '\n\n').trim();
        if (nota !== r[3]) { r[3] = nota; cambiato = true; }
      }
      if (r[4]) {
        L[4] = [...new Set(videiDi(L).concat(videiDi(r)))].slice(0, 6).join(',');
        /* un video che in libreria non ci sta (piu' di 6) resta nella riga */
        const resta = videiDi(r).filter(v => videiDi(L).indexOf(v) < 0).join(',');
        if (resta !== r[4]) { r[4] = resta; cambiato = true; }
      }
    }
  }
  if (cambiato) edCambio(false);
}

/* La descrizione di un esercizio, aperta sotto la sua riga: in cima il video,
   sotto il testo. Un link scritto da solo su una riga del testo e' un video
   anche lui, come prima. */
function edDescrizione(r, sync) {
  const box = el('div', 'ed-desc-box');
  /* dalla libreria: ogni modifica va anche in tutte le righe con lo stesso nome */
  const cambia = fn => { const d0 = r[3] || '', v0 = r[4] || ''; fn(); if (sync) sync(d0, v0); };

  const v = el('div', 'ed-video');
  /* uno o piu' video: ognuno con la sua anteprima e il suo Remove */
  const lista = videiDi(r);
  lista.forEach((nomeV, iv) => {
    const riga = el('div', 'ed-video-uno');
    if (lista.length > 1) riga.appendChild(el('p', 'ed-video-num', 'Video ' + (iv + 1) + ' of ' + lista.length));
    const st = el('p', 'ed-video-stato', 'Loading video…');
    riga.appendChild(st);
    (async () => {
      let blob = await vGet(nomeV);
      if (!blob) blob = await prendiVideo(nomeV);
      if (!blob) { st.textContent = 'Video not on this device yet.'; return; }
      const u = URL.createObjectURL(blob);
      edUrl.push(u);
      const vid = el('video');
      vid.src = u; vid.controls = true; vid.playsInline = true; vid.preload = 'metadata';
      st.replaceWith(vid);
    })();
    const az = el('div', 'ed-video-tasti');
    edConferma(az, 'Remove video', () => {
      cambia(() => { r[4] = videiDi(r).filter(x => x !== nomeV).join(','); });
      edCambio(false); edPagina();
    });
    riga.appendChild(az);
    v.appendChild(riga);
  });
  const tasti = el('div', 'ed-video-tasti');
  const file = el('input');
  file.type = 'file'; file.accept = 'video/*'; file.hidden = true; file.multiple = true;
  /* dalla galleria, anche piu' video insieme: si comprimono uno dopo l'altro */
  file.addEventListener('change', async () => {
    const posto = 6 - videiDi(r).length;
    const scelti = [...(file.files || [])].slice(0, Math.max(0, posto));
    const troppi = (file.files ? file.files.length : 0) - scelti.length;
    file.value = '';
    if (!scelti.length) return;
    /* la compressione puo' durare: si dice a che punto e', e i tasti aspettano */
    errore.classList.remove('err');
    errore.hidden = false;
    for (const b of tasti.querySelectorAll('button')) b.disabled = true;
    const nuovi = [], sbagli = [];
    for (let i = 0; i < scelti.length; i++) {
      const di = scelti.length > 1 ? ' ' + (i + 1) + ' of ' + scelti.length : '';
      errore.textContent = 'Compressing the video' + di + '…';
      const esito = await tieniVideo(scelti[i], x => { errore.textContent = 'Compressing the video' + di + '… ' + Math.min(99, Math.round(x * 100)) + '%'; });
      if (esito.errore) { sbagli.push(esito.errore); continue; }
      nuovi.push(esito.nome);
      if (daCaricare.indexOf(esito.nome) < 0) { daCaricare.push(esito.nome); salvaCoda(); }
    }
    for (const b of tasti.querySelectorAll('button')) b.disabled = false;
    errore.classList.add('err');
    const note = sbagli.concat(troppi > 0 ? [troppi + (troppi === 1 ? ' video left out' : ' videos left out') + ': at most 6 per exercise.'] : []);
    errore.textContent = note.join(' ');
    errore.hidden = !note.length;
    if (nuovi.length) {
      cambia(() => { r[4] = videiDi(r).concat(nuovi).slice(0, 6).join(','); });
      edCambio(false);
      edAvvisoVideo = note.join(' ');      /* dopo il ridisegno l'avviso resta */
      edPagina();
    }
    if (nuovi.length) codaVideo();  /* i video partono subito, mentre si continua a scrivere */
  });
  tasti.appendChild(file);
  const piu = edBottone(tasti, lista.length ? '+ More videos' : '+ Video', '', () => file.click());
  piu.disabled = lista.length >= 6;
  /* oppure fra quelli gia' caricati per altri esercizi */
  const gia = edTuttiVideo(videiDi(r));
  if (gia.length) {
    const sc = edBottone(tasti, 'From uploaded ones (' + gia.length + ')', '', () => {
      pannello.hidden = !pannello.hidden;
      if (!pannello.hidden && !pannello.children.length) edPannelloVideo(pannello, gia, nomi => {
        cambia(() => { r[4] = videiDi(r).concat(nomi).slice(0, 6).join(','); });
        edCambio(false); edPagina();
      }, 6 - lista.length);
    });
    sc.disabled = lista.length >= 6;
  }
  v.appendChild(tasti);
  const pannello = el('div', 'ed-vpick');
  pannello.hidden = true;
  v.appendChild(pannello);
  const errore = el('p', 'nota err');
  errore.hidden = !edAvvisoVideo;
  errore.textContent = edAvvisoVideo;
  edAvvisoVideo = '';
  v.appendChild(errore);
  box.appendChild(v);

  const t = el('textarea', 'commento ed-desc-testo');
  t.value = r[3] || '';
  const alto = () => { t.rows = Math.max(4, Math.min(24, t.value.split('\n').length + 1)); };
  alto();
  t.addEventListener('input', alto);
  t.addEventListener('change', () => { cambia(() => { r[3] = t.value.slice(0, 4000).trim(); }); edCambio(false); });
  box.appendChild(t);
  return box;
}

/* --- FIRST 15' ---------------------------------------------------------- */

function edPagMattina(box, ctx, listaId) {
  const f = edFonte(ctx);
  const o = f.obj;
  /* la prima lista sta nei campi di sempre; le altre nell'elenco `altre` */
  const a = listaId ? o.altre.find(x => x.id === listaId) : null;
  if (listaId && !a) { edVista = { pag: 'morning', ctx: ctx }; edPagina(); return; }
  const L = a ? {
    nome: () => a.nome || 'Every day', scrivi: v => { a.nome = v; }, ph: 'List name', valore: a.nome,
    via: () => a.via, spegni: v => { a.via = v; }, quando: a.quando, chiave: EV(a.id)
  } : {
    nome: () => nomeMattinaDi(o), scrivi: v => { o.mattina = v && v !== MATTINA_BASE ? v : ''; }, ph: MATTINA_BASE, valore: o.mattina,
    via: () => o.mattinaVia, spegni: v => { o.mattinaVia = v; }, quando: o.mattinaQuando, chiave: MORNING
  };
  edDove(box, ctx);
  box.appendChild(el('p', 'ed-sez-pag ed-cat', 'EVERY DAY'));
  edTitolo(box, L.nome(), '');
  const l = el('label', 'ed-spunta');
  const c = el('input', 'schsel');
  c.type = 'checkbox';
  c.checked = !L.via();
  c.addEventListener('change', () => { L.spegni(!c.checked); edCambio(true); });
  l.appendChild(c);
  l.appendChild(el('span', null, 'Show it in the app'));
  box.appendChild(l);
  edCampo(box, 'Name', L.valore, { max: 40, ph: L.ph }, (val) => {
    L.scrivi(validMattina(val));
    edCambio(true);
    edPagina();
  });

  edQuando(box, L.quando);
  edSettimanaLista(box, f, L.chiave);

  if (!f.schede[L.chiave]) f.schede[L.chiave] = { es: [], rec: '' };
  box.appendChild(el('p', 'ed-sez-pag', 'EXERCISES'));
  edEsercizi(box, ctx, L.chiave, f.schede[L.chiave]);
  edGruppiBottone(box, ctx, L.chiave);

  if (a) {
    const az = el('div', 'ed-azioni');
    edConferma(az, 'Delete this list', () => {
      o.altre = o.altre.filter(x => x !== a);
      delete f.schede[L.chiave];
      /* tolta anche dai giorni della Settimana in cui era scritta */
      for (const w of f.settimane) {
        for (const g of SETTIMANA) {
          const r = w.workout[g];
          if (!r) continue;
          for (let i = 0; i < r.length; i++) if (r[i] === L.chiave) r[i] = '';
          while (r.length && !r[r.length - 1]) r.pop();
          if (!r.length) delete w.workout[g];
        }
      }
      edVista = { pag: 'morning', ctx: ctx };
      edCambio(true);
      edRidisegna();
    });
    box.appendChild(az);
  }
}

/* Quando si vede una lista: tutti i giorni, certi giorni della settimana, un
   giorno si' e uno no (o ogni N), date precise scelte sul calendario, oppure
   un ritmo tutto suo (3 si', 2 no, 4 si', 1 no...). L'oggetto `q` si cambia
   sul posto. */
let edCalMese = null;           /* il primo del mese mostrato dal calendario */
function edQuando(box, q) {
  box.appendChild(el('p', 'ed-sez-pag', 'WHEN'));
  const modi = [['sempre', 'Every day'], ['giorni', 'Days of the week'], ['ogni', 'Every N days'], ['ciclo', 'Custom rhythm'], ['date', 'Specific dates']];
  const chips = el('div', 'chips ed-modi');
  for (const [m, n] of modi) {
    const b = el('button', 'chip' + (q.modo === m ? ' sel' : ''), n);
    b.type = 'button';
    b.addEventListener('click', () => {
      if (q.modo === m) return;
      for (const k of Object.keys(q)) delete q[k];
      q.modo = m;
      if (m === 'giorni') q.giorni = [1, 2, 3, 4, 5, 6, 0];
      if (m === 'ogni') { q.n = 2; q.dal = chiaveData(today()); }
      if (m === 'ciclo') { q.dal = chiaveData(today()); q.passi = [3, -2]; }
      if (m === 'date') q.date = [];
      edCambio(false);
      edPagina();
    });
    chips.appendChild(b);
  }
  box.appendChild(chips);

  if (q.modo === 'giorni') {
    const g = el('div', 'chips ed-giorni-sett');
    for (const d of SETTIMANA) {
      const on = q.giorni.indexOf(d) >= 0;
      const b = el('button', 'chip' + (on ? ' sel' : ''), GIORNI2[d]);
      b.type = 'button';
      b.addEventListener('click', () => {
        q.giorni = on ? q.giorni.filter(x => x !== d) : q.giorni.concat([d]).sort();
        edCambio(false);
        edPagina();
      });
      g.appendChild(b);
    }
    box.appendChild(g);
  }
  if (q.modo === 'ogni') {
    const r = el('div', 'ed-ogni');
    const n = edCampo(r, 'Every how many days', String(q.n), { type: 'number' }, val => {
      const x = Math.round(+val);
      q.n = x >= 2 && x <= 14 ? x : q.n;
      edCambio(false);
      edPagina();
    });
    n.min = 2; n.max = 14; n.inputMode = 'numeric';
    edCampo(r, 'Starting from', q.dal, { type: 'date' }, val => {
      if (dataOk(val)) { q.dal = val; edCambio(false); }
      edPagina();
    });
    box.appendChild(r);
    box.appendChild(el('p', 'ed-sotto', q.n === 2 ? 'One day yes, one day no.' : 'One day yes, then ' + (q.n - 1) + ' days no.'));
  }
  if (q.modo === 'ciclo') edCiclo(box, q);
  if (q.modo === 'date') {
    /* le date scelte, come piastrelle: un tocco la toglie */
    const lista = el('div', 'ed-prossimi');
    for (const d of q.date) {
      const b = el('button', 'ed-pross si', GIORNI2[daChiave(d).getDay()] + ' ' + dataCorta(d) + (daChiave(d).getFullYear() !== today().getFullYear() ? ' ' + daChiave(d).getFullYear() : '') + ' ×');
      b.type = 'button';
      b.setAttribute('aria-label', 'Remove ' + d);
      b.addEventListener('click', () => { q.date = q.date.filter(x => x !== d); edCambio(false); edPagina(); });
      lista.appendChild(b);
    }
    if (!q.date.length) box.appendChild(el('p', 'ed-sotto', 'No dates yet.'));
    else box.appendChild(lista);
    edCalendario(box, q);
  }
}

/* Quando si vede una lista, in breve: la regola e quante volte. */
function edQuandoBreve(q) {
  q = q || { modo: 'sempre' };
  const oggi = today();
  const volte = () => { let n = 0; for (let i = 0; i < 7; i++) if (quandoVale(q, chiaveData(piuGiorni(oggi, i)))) n++; return n; };
  const nei7 = () => { const n = volte(); return n === 1 ? 'once in the next 7 days' : n + ' times in the next 7 days'; };
  if (q.modo === 'giorni') {
    if (!q.giorni.length) return 'never';
    return SETTIMANA.filter(g => q.giorni.indexOf(g) >= 0).map(g => GIORNI2[g]).join(' ') + ' · ' + q.giorni.length + ' a week';
  }
  if (q.modo === 'ogni') return (q.n === 2 ? 'one day yes, one no' : 'every ' + q.n + ' days') + ' · ' + nei7();
  if (q.modo === 'ciclo') return q.passi.map(x => Math.abs(x) + (x > 0 ? ' yes' : ' no')).join(', ') + ' · ' + nei7();
  if (q.modo === 'date') {
    const k = chiaveData(oggi);
    const pross = q.date.find(d => d >= k);
    return (q.date.length === 1 ? '1 date' : q.date.length + ' dates') + ' · ' + (pross ? 'next ' + GIORNI2[daChiave(pross).getDay()] + ' ' + dataCorta(pross) : 'none coming');
  }
  return 'every day · 7 a week';
}

/* La settimana, da leggere mentre si scrive una lista: per ogni giorno i
   workout e le liste Ogni giorno che si vedono; quella aperta in evidenza. */
function edSettimanaLista(box, f, chiave) {
  const oggi = chiaveData(today());
  /* in una preparazione: la settimana di oggi se ci si e' dentro, se no la prima */
  const dentro = f.base || (f.prep.dal <= oggi && oggi <= f.prep.al);
  const lun = lunedi(dentro ? today() : daChiave(f.prep.dal));
  box.appendChild(el('p', 'ed-sez-pag', 'WEEK'));
  const tab = el('div', 'ed-sett-lista');
  SETTIMANA.forEach((g, pos) => {
    const k = chiaveData(piuGiorni(lun, pos));
    const fuori = !f.base && (k < f.prep.dal || k > f.prep.al);
    /* la lista c'e' quel giorno se "Quando" lo dice, o se e' scritta in uno
       dei posti della Settimana: prima quelle di "Quando", poi le altre */
    const wg = fuori ? null : f.settimane[f.base ? 0 : settimanaDi(f.prep, k)];
    const nelGiorno = wg ? (wg.workout[g] || []).slice(0, wg.conti[g] || 0) : [];
    const tutte = fuori ? [] : listeDi(f.obj).filter(l => !l.via);
    const perQuando = tutte.filter(l => quandoVale(l.quando, k));
    const liste = perQuando.concat(tutte.filter(l => perQuando.indexOf(l) < 0 && nelGiorno.indexOf(l.chiave) >= 0));
    const qui = liste.some(l => l.chiave === chiave);
    const riga = el('div', 'ed-sl-riga' + (qui ? ' qui' : '') + (fuori ? ' fuori' : '') + (k === oggi ? ' oggi' : ''));
    riga.appendChild(el('span', 'ed-sl-giorno', GIORNI2[g] + ' ' + daChiave(k).getDate()));
    const corpo = el('div', 'ed-sl-corpo');
    if (fuori) corpo.appendChild(el('span', 'ed-sl-wk', 'outside the preparation'));
    else {
      /* i workout del giorno; le liste messe nella Settimana stanno con le altre */
      const nomi = nelGiorno.filter(x => x && !eLista(x));
      corpo.appendChild(el('span', 'ed-sl-wk', nomi.length ? nomi.join(' + ') : 'Rest'));
      for (const l of liste) corpo.appendChild(el('span', 'ed-sl-lista' + (l.chiave === chiave ? ' on' : ''), l.nome));
    }
    riga.appendChild(corpo);
    tab.appendChild(riga);
  });
  box.appendChild(tab);
}

/* Il calendario, una settimana per riga (da lunedi'): si toccano i giorni,
   quanti se ne vuole, e si accendono o si spengono. */
function edCalendario(box, q) {
  if (!edCalMese) { const t = today(); edCalMese = new Date(t.getFullYear(), t.getMonth(), 1); }
  const m0 = edCalMese;
  const cal = el('div', 'ed-cal');
  const testa = el('div', 'ed-cal-testa');
  const vai = n => { edCalMese = new Date(m0.getFullYear(), m0.getMonth() + n, 1); edPagina(); };
  const pr = edBottone(testa, '‹', 'ed-tasto', () => vai(-1)); pr.setAttribute('aria-label', 'Previous month');
  testa.appendChild(el('span', 'ed-cal-mese', MESI3[m0.getMonth()] + ' ' + m0.getFullYear()));
  const nx = edBottone(testa, '›', 'ed-tasto', () => vai(1)); nx.setAttribute('aria-label', 'Next month');
  cal.appendChild(testa);
  const griglia = el('div', 'ed-cal-griglia');
  for (const g of SETTIMANA) griglia.appendChild(el('span', 'ed-cal-gs', GIORNI2[g]));
  const oggi = chiaveData(today());
  let d = lunedi(m0);
  const fine = new Date(m0.getFullYear(), m0.getMonth() + 1, 0);
  while (d <= fine) {
    for (let i = 0; i < 7; i++, d = piuGiorni(d, 1)) {
      const k = chiaveData(d);
      const on = q.date.indexOf(k) >= 0;
      const b = el('button', 'ed-cal-g' + (on ? ' si' : '') + (d.getMonth() !== m0.getMonth() ? ' fuori' : '') + (k === oggi ? ' oggi' : ''), String(d.getDate()));
      b.type = 'button';
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.addEventListener('click', () => {
        q.date = on ? q.date.filter(x => x !== k) : q.date.concat([k]).sort();
        edCambio(false);
        edPagina();
      });
      griglia.appendChild(b);
    }
  }
  cal.appendChild(griglia);
  box.appendChild(cal);
}

/* Il ritmo: una fila di passi, ognuno "N giorni si'" o "N giorni no", che
   si ripete da una data. Nel file: numeri positivi si', negativi no. */
function edCiclo(box, q) {
  const lista = el('div', 'ed-ciclo');
  q.passi.forEach((x, i) => {
    const r = el('div', 'ed-ciclo-passo');
    const n = el('input', 'campo ed-ciclo-n');
    n.type = 'number'; n.min = 1; n.max = 60; n.inputMode = 'numeric'; n.value = String(Math.abs(x));
    n.setAttribute('aria-label', 'How many days');
    n.addEventListener('change', () => {
      const v = Math.round(+n.value);
      if (v >= 1 && v <= 60) q.passi[i] = x > 0 ? v : -v;
      edCambio(false); edPagina();
    });
    r.appendChild(n);
    r.appendChild(el('span', 'ed-ciclo-eti', Math.abs(x) === 1 ? 'day' : 'days'));
    const si = el('button', 'chip' + (x > 0 ? ' sel' : ''), 'yes');
    si.type = 'button';
    si.addEventListener('click', () => { q.passi[i] = Math.abs(x); edCambio(false); edPagina(); });
    const no = el('button', 'chip' + (x < 0 ? ' sel' : ''), 'no');
    no.type = 'button';
    no.addEventListener('click', () => { q.passi[i] = -Math.abs(x); edCambio(false); edPagina(); });
    r.appendChild(si); r.appendChild(no);
    const via = edBottone(r, '×', 'ed-tasto ed-x', () => { q.passi.splice(i, 1); if (!q.passi.length) q.passi.push(1); edCambio(false); edPagina(); });
    via.setAttribute('aria-label', 'Remove this step');
    lista.appendChild(r);
  });
  box.appendChild(lista);
  const piu = edBottone(box, '+ Step', 'ed-aggiungi', () => {
    const ult = q.passi[q.passi.length - 1];
    q.passi.push(ult > 0 ? -1 : 1);
    edCambio(false); edPagina();
  });
  piu.disabled = q.passi.length >= 20;
  const r = el('div', 'ed-ogni');
  edCampo(r, 'Starting from', q.dal, { type: 'date' }, val => {
    if (dataOk(val)) { q.dal = val; edCambio(false); }
    edPagina();
  });
  box.appendChild(r);
  box.appendChild(el('p', 'ed-sotto', q.passi.map(x => Math.abs(x) + ' ' + (x > 0 ? 'yes' : 'no')).join(', ') + ', then again from the start.'));
}

/* --- un workout --------------------------------------------------------- */

function edPagWorkout(box, ctx, nome) {
  const f = edFonte(ctx);
  if (!f.schede[nome]) f.schede[nome] = { es: [], rec: '' };
  const sc = f.schede[nome];
  edDove(box, ctx);
  edTitolo(box, nome, edUsato(f, nome));

  const errore = el('p', 'nota err');
  errore.hidden = true;
  edCampo(box, 'Name', nome, { max: 60 }, (val, inp) => {
    const nuovo = val.slice(0, 60).trim();
    if (nuovo === nome) return;
    const msg = !nuovo ? 'A workout needs a name.'
      : nuovo === MORNING || f.schede[nuovo] || edWorkout(f).indexOf(nuovo) >= 0 ? 'There is already a workout called "' + nuovo + '".'
      : '';
    if (msg) { errore.textContent = msg; errore.hidden = false; inp.value = nome; return; }
    edRinomina(f, nome, nuovo);
    edVista = { pag: 'workout', ctx: ctx, nome: nuovo };
    edCambio(true);
    edPagina();
  });
  box.appendChild(errore);
  edCampo(box, 'Recovery', sc.rec, { max: 60, ph: 'e.g. 1’' }, (val) => {
    sc.rec = val.slice(0, 60).trim();
    edCambio(false);
  });

  box.appendChild(el('p', 'ed-sez-pag', 'EXERCISES'));
  edEsercizi(box, ctx, nome, sc);
  edGruppiBottone(box, ctx, nome);

  const az = el('div', 'ed-azioni');
  edConferma(az, 'Delete workout', () => {
    delete f.schede[nome];
    /* tolto anche dai giorni in cui era scritto */
    for (const w of f.settimane) {
      for (const g of SETTIMANA) {
        const r = w.workout[g];
        if (!r) continue;
        for (let i = 0; i < r.length; i++) if (r[i] === nome) r[i] = '';
        while (r.length && !r[r.length - 1]) r.pop();
        if (!r.length) delete w.workout[g];
      }
    }
    edVista = f.base ? { pag: 'week', ctx: ctx, sett: 0 } : { pag: 'prep', ctx: ctx };
    edCambio(true);
    edRidisegna();
  });
  box.appendChild(az);
}

/* In quali giorni c'e' un workout: si legge sotto il titolo. */
function edUsato(f, nome) {
  const giorni = [];
  f.settimane.forEach((w, i) => {
    for (const g of SETTIMANA) {
      if ((w.workout[g] || []).slice(0, w.conti[g] || 0).indexOf(nome) >= 0) {
        giorni.push((f.settimane.length > 1 ? 'W' + (i + 1) + ' ' : '') + GIORNI2[g]);
      }
    }
  });
  return giorni.length ? 'On: ' + giorni.join(', ') : 'Not in the week yet.';
}

/* Cambiare nome a un workout: la scheda passa sotto il nome nuovo, e i giorni
   in cui era scritto lo seguono. */
function edRinomina(f, vecchio, nuovo) {
  f.schede[nuovo] = f.schede[vecchio];
  delete f.schede[vecchio];
  for (const w of f.settimane) {
    for (const g of SETTIMANA) {
      const r = w.workout[g];
      if (r) for (let i = 0; i < r.length; i++) if (r[i] === vecchio) r[i] = nuovo;
    }
  }
  if (mostra.solo === vecchio) { mostra.solo = nuovo; salvaMostra(); }
}

function edGruppiBottone(box, ctx, nome) {
  const b = el('div', 'ed-azioni');
  edBottone(b, 'Groups', '', () => apriGruppi(ctx, nome, null));
  box.appendChild(b);
}

/* --- un workout nuovo --------------------------------------------------- */

function edPagNuovo(box, ctx) {
  const f = edFonte(ctx);
  edDove(box, ctx);
  edTitolo(box, 'New workout', '');
  const errore = el('p', 'nota err');
  errore.hidden = true;
  const inp = edCampo(box, 'Name', '', { max: 60, ph: 'e.g. CALI' }, () => {});
  box.appendChild(errore);
  const az = el('div', 'ed-azioni');
  /* Invio nel campo vale come Create */
  inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); crea.click(); } });
  const crea = edBottone(az, 'Create', 'ed-ok', () => {
    const nome = inp.value.slice(0, 60).trim();
    const msg = !nome ? 'Write a name first.'
      : f.schede[nome] || edWorkout(f).indexOf(nome) >= 0 ? 'There is already a workout called "' + nome + '".' : '';
    if (msg) { errore.textContent = msg; errore.hidden = false; inp.focus(); return; }
    f.schede[nome] = { es: [['', '', [], '', '']], rec: '' };
    edVista = { pag: 'workout', ctx: ctx, nome: nome };
    edCambio(true);
    edRidisegna();
  });
  box.appendChild(az);
  setTimeout(() => inp.focus(), 50);
}

/* --- le preparazioni ---------------------------------------------------- */

/* Le date di una preparazione vanno bene? Torna il problema, o ''. */
function edDateOk(dal, al, id) {
  if (!dataOk(dal) || !dataOk(al)) return 'Choose both dates.';
  if (al < dal) return 'The end is before the start.';
  const altra = tstore.prep.find(p => p.id !== id && p.dal <= al && dal <= p.al);
  if (altra) return 'These dates overlap "' + nomePrep(altra) + '" (' + datePrep(altra) + ').';
  return '';
}

/* Una preparazione nuova: una copia del piano di sempre, settimana, schede e
   FIRST 15', che poi si cambia. */
function edNuovaPrep(nome, dal, al) {
  const p = {
    id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    nome: nome, dal: dal, al: al,
    settimane: [{ workout: copia(tstore.workout), conti: copia(tstore.conti) }],
    schede: copia(tstore.schede),
    mattina: tstore.mattina, mattinaVia: tstore.mattinaVia,
    mattinaQuando: copia(tstore.mattinaQuando), altre: copia(tstore.altre)
  };
  tstore.prep.push(p);
  tstore.prep.sort((a, b) => a.dal < b.dal ? -1 : 1);
  return p;
}

function edPagNuovaPrep(box) {
  edTitolo(box, 'Add preparation', '');
  const k0 = chiaveData(today());
  const nome = edCampo(box, 'Name (optional)', '', { max: 50, ph: 'e.g. November exam' }, () => {});
  const dal = edCampo(box, 'From', k0, { type: 'date' }, () => {});
  const al = edCampo(box, 'To', chiaveData(piuGiorni(today(), 27)), { type: 'date' }, () => {});
  const errore = el('p', 'nota err');
  errore.hidden = true;
  box.appendChild(errore);
  const az = el('div', 'ed-azioni');
  edBottone(az, 'Create preparation', 'ed-ok', () => {
    const msg = edDateOk(dal.value, al.value, null);
    if (msg) { errore.textContent = msg; errore.hidden = false; return; }
    const p = edNuovaPrep(nome.value.slice(0, 50).trim(), dal.value, al.value);
    edVista = { pag: 'prep', ctx: p.id };
    edCambio(true);
    edRidisegna();
  });
  box.appendChild(az);
}

function edPagPrep(box, id) {
  const f = edFonte(id);
  const p = f.prep;
  const k0 = chiaveData(today());
  edDove(box, id);
  const stato = p.al < k0 ? 'Ended.' : p.dal <= k0 ? 'In progress: the app shows it now.' : 'Starts in ' + giorniFra(k0, p.dal) + ' days.';
  edTitolo(box, nomePrep(p), stato);

  const errore = el('p', 'nota err');
  errore.hidden = true;
  edCampo(box, 'Name', p.nome, { max: 50, ph: 'Preparation' }, (val) => {
    p.nome = val.slice(0, 50).trim();
    edCambio(true);
    edPagina();
  });
  const dal = edCampo(box, 'From', p.dal, { type: 'date' }, () => cambiaDate());
  const al = edCampo(box, 'To', p.al, { type: 'date' }, () => cambiaDate());
  box.appendChild(errore);
  /* l'ultimo giorno puo' essere il giorno dell'evento: si vede col suo nome */
  const lf = el('label', 'ed-spunta');
  const cf = el('input', 'schsel');
  cf.type = 'checkbox';
  cf.checked = !!p.nomeFine;
  cf.addEventListener('change', () => { p.nomeFine = cf.checked; edCambio(false); });
  lf.appendChild(cf);
  lf.appendChild(el('span', null, 'The last day (' + dataCorta(p.al) + ') shows the name "' + nomePrep(p) + '"'));
  box.appendChild(lf);
  function cambiaDate() {
    const msg = edDateOk(dal.value, al.value, p.id);
    if (msg) { errore.textContent = msg; errore.hidden = false; dal.value = p.dal; al.value = p.al; return; }
    p.dal = dal.value; p.al = al.value;
    tstore.prep.sort((a, b) => a.dal < b.dal ? -1 : 1);
    edCambio(true);
    edPagina();
  }

  /* le settimane: quante ne tocca il periodo, e quante sono scritte */
  const tot = settimaneDel(p);
  box.appendChild(el('p', 'ed-sez-pag', 'WEEKS'));
  box.appendChild(el('p', 'ed-sotto', 'The period touches ' + tot + (tot === 1 ? ' week' : ' weeks') +
    ' (Monday to Sunday). Written: ' + p.settimane.length + '.' +
    (p.settimane.length < tot ? ' The last one repeats until the end.' : '')));
  const lista = el('div', 'ed-lista-sett');
  p.settimane.forEach((w, i) => {
    const inizio = piuGiorni(lunedi(daChiave(p.dal)), 7 * i);
    const b = el('button', 'ed-voce', 'Week ' + (i + 1) + ' · ' + dataCorta(chiaveData(inizio)) + ' – ' + dataCorta(chiaveData(piuGiorni(inizio, 6))));
    b.type = 'button';
    b.addEventListener('click', () => edVai({ pag: 'week', ctx: id, sett: i }));
    lista.appendChild(b);
  });
  box.appendChild(lista);
  const az1 = el('div', 'ed-azioni');
  edBottone(az1, '+ Add week (copy of week ' + p.settimane.length + ')', '', () => {
    p.settimane.push(copia(p.settimane[p.settimane.length - 1]));
    edVista = { pag: 'week', ctx: id, sett: p.settimane.length - 1 };
    edCambio(true);
    edRidisegna();
  });
  box.appendChild(az1);

  const az2 = el('div', 'ed-azioni');
  edBottone(az2, 'Duplicate', '', () => {
    /* la copia parte il giorno dopo la fine, e dura uguale */
    const durata = giorniFra(p.dal, p.al);
    const dal2 = chiaveData(piuGiorni(daChiave(p.al), 1));
    const al2 = chiaveData(piuGiorni(daChiave(dal2), durata));
    const msg = edDateOk(dal2, al2, null);
    if (msg) { errore.textContent = 'The copy would start on ' + dataCorta(dal2) + ': ' + msg; errore.hidden = false; return; }
    const q = copia(p);
    q.id = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    q.nome = (p.nome || 'Preparation') + ' (copy)';
    q.dal = dal2; q.al = al2;
    tstore.prep.push(q);
    tstore.prep.sort((a, b) => a.dal < b.dal ? -1 : 1);
    edVista = { pag: 'prep', ctx: q.id };
    edCambio(true);
    edRidisegna();
  });
  edConferma(az2, 'Delete preparation', () => {
    tstore.prep = tstore.prep.filter(x => x.id !== p.id);
    edVista = { pag: 'week', ctx: 'base', sett: 0 };
    edCambio(true);
    edRidisegna();
  });
  box.appendChild(az2);
}

/* Girando il telefono o allargando la finestra l'editor cambia forma. */
if (stretto.addEventListener) stretto.addEventListener('change', () => { if (!stretto.matches) edInPagina = true; edRidisegna(); });

/* ------------------------------------------------ la libreria ---- */

/* Tutti gli esercizi scritti, nel piano e nelle preparazioni, uno per nome
   (senza badare a maiuscole e spazi). Di ognuno: la descrizione e i video
   trovati per primi, e dove compare. */
const edNorm = t => String(t || '').toLowerCase().replace(/\s+/g, ' ').trim();
function edNomeScheda(o, k) {
  if (k === MORNING) return nomeMattinaDi(o);
  if (k.indexOf('__ev_') === 0) { const a = (o.altre || []).find(x => EV(x.id) === k); return a ? (a.nome || 'Every day') : 'Every day'; }
  return k;
}
function edLibreria() {
  const m = new Map();
  const fonti = [{ nome: 'Plan', o: tstore }].concat(tstore.prep.map(p => ({ nome: nomePrep(p), o: p })));
  for (const r of tstore.libreria) {
    const n = edNorm(r[0]);
    if (!n) continue;
    m.set(n, { k: n, nome: r[0], desc: r[3] || '', video: r[4] || '', usi: [], mia: r });
  }
  for (const f of fonti) {
    for (const k of Object.keys(f.o.schede)) {
      for (const r of f.o.schede[k].es) {
        const n = edNorm(r[0]);
        if (!n) continue;
        let x = m.get(n);
        if (!x) { x = { k: n, nome: r[0], desc: '', video: '', usi: [] }; m.set(n, x); }
        const uso = f.nome + ' · ' + edNomeScheda(f.o, k);
        if (x.usi.indexOf(uso) < 0) x.usi.push(uso);
        x.posti = (x.posti || 0) + 1;
      }
    }
  }
  return [...m.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'it', { sensitivity: 'base' }));
}

/* Tutte le righe con quel nome: libreria, piano, preparazioni. */
function edRigheDi(n) {
  const out = [];
  for (const x of tstore.libreria) if (edNorm(x[0]) === n) out.push(x);
  for (const o of [tstore].concat(tstore.prep)) {
    for (const k of Object.keys(o.schede)) {
      for (const x of o.schede[k].es) if (edNorm(x[0]) === n) out.push(x);
    }
  }
  return out;
}

/* Il nome cambiato dalla libreria cambia in tutte le righe. Se il nome nuovo
   e' quello di un altro esercizio, i due diventano uno: le righe rimaste senza
   descrizione o video li prendono dall'altro. */
function edLibRinomina(n, nuovo) {
  const k = edNorm(nuovo);
  if (!k || k === n) {
    if (k === n) {
      for (const r of edRigheDi(n)) r[0] = nuovo;
      for (const x of Object.keys(tstore.esercizi)) if (edNorm(tstore.esercizi[x].p) === n) edMetaSet(x, 'p', nuovo);
    }
    return '';
  }
  const altro = edRigheDi(k);
  const nomeFinale = altro.length ? altro[0][0] : nuovo;
  const mioL = edLib(n), suoL = edLib(k);
  for (const r of edRigheDi(n)) r[0] = nomeFinale;
  /* in libreria ne resta uno solo: quello che c'era prende da questo quello
     che gli manca */
  if (mioL && suoL && mioL !== suoL) {
    if (!suoL[3]) suoL[3] = mioL[3];
    else if (mioL[3] && mioL[3] !== suoL[3]) suoL[3] = suoL[3] + '\n\n' + mioL[3];
    suoL[4] = [...new Set(videiDi(suoL).concat(videiDi(mioL)))].slice(0, 6).join(',');
    tstore.libreria = tstore.libreria.filter(r => r !== mioL);
  }
  /* variante e categoria: se l'altro non ne ha, prende queste */
  const m = tstore.esercizi[n];
  delete tstore.esercizi[n];
  if (m) {
    if (m.p && !edMeta(k).p && edNorm(m.p) !== k) edMetaSet(k, 'p', m.p);
    if (m.c && !edMeta(k).c) edMetaSet(k, 'c', m.c);
  }
  for (const x of Object.keys(tstore.esercizi)) if (edNorm(tstore.esercizi[x].p) === n) edMetaSet(x, 'p', x === k ? '' : nomeFinale);
  return altro.length ? nomeFinale : '';
}

/* --- varianti e categorie -------------------------------------------------
   Stanno in tstore.esercizi, per nome: p = il nome del padre, c = la
   categoria. Una variante e' un esercizio a se', con descrizione e video
   suoi: e' solo appesa a un padre. Un padre non e' mai a sua volta una
   variante. La categoria (c) resta nei dati scritti prima, ma l'editor non
   la mostra ne' la cambia piu'. */
const edMeta = n => tstore.esercizi[n] || {};
function edMetaSet(n, campo, v) {
  const x = Object.assign({}, tstore.esercizi[n] || {});
  if (v) x[campo] = v; else delete x[campo];
  if (x.p || x.c) tstore.esercizi[n] = x; else delete tstore.esercizi[n];
}

/* n diventa variante di `padre` (vuoto: torna esercizio principale). Le sue
   varianti passano al nuovo padre. */
function edFaiVariante(n, padre) {
  const pk = edNorm(padre);
  if (!pk || pk === n) { edMetaSet(n, 'p', ''); return; }
  if (edMeta(pk).p) return;
  edMetaSet(n, 'p', padre);
  for (const k of Object.keys(tstore.esercizi)) if (k !== n && edNorm(tstore.esercizi[k].p) === n) edMetaSet(k, 'p', padre);
}

/* Gli esercizi principali, per nome: quelli che possono fare da padre. */
const edPrincipali = salta => edLibreria().filter(x => !edMeta(x.k).p && x.k !== salta).map(x => x.nome);

/* I padri possibili per un nome nuovo: prima quelli scritti dentro il nome
   (parole intere), poi quelli con la stessa prima parola. Al massimo tre. */
function edPadriPossibili(nome) {
  const n = edNorm(nome);
  const w0 = n.split(' ')[0];
  const dentro = [], prima = [];
  for (const p of edPrincipali(n)) {
    const k = edNorm(p);
    if ((' ' + n + ' ').indexOf(' ' + k + ' ') >= 0) dentro.push(p);
    else if (w0.length > 2 && k.split(' ')[0] === w0) prima.push(p);
  }
  dentro.sort((a, b) => b.length - a.length);
  return dentro.concat(prima).slice(0, 3);
}

/* I nomi appena scritti per la prima volta: aspettano la risposta. */
let edChiedi = new Set();
function edDomanda(k, nome, sc) {
  const box = el('div', 'ed-domanda');
  box.appendChild(el('p', 'ed-domanda-t', '"' + nome + '" is new: a main exercise or a variant of another one?'));
  const t = el('div', 'ed-domanda-tasti');
  const fatto = () => {
    edChiedi.delete(k);
    edLib(k, nome);
    edCambio(false);
    edPagina();
  };
  edBottone(t, 'Main exercise', '', () => { edMetaSet(k, 'p', ''); fatto(); });
  const proposti = edPadriPossibili(nome);
  for (const p of proposti) edBottone(t, 'Variant of ' + p, '', () => { edFaiVariante(k, p); fatto(); });
  if (edPrincipali(k).length) {
    const cerca = edCercaPadre(k, '', p => { if (p) { edFaiVariante(k, p); fatto(); } });
    cerca.querySelector('input').placeholder = 'Variant of another one… search';
    t.appendChild(cerca);
  }
  box.appendChild(t);
  return box;
}

/* Via da tutto: libreria, piano, preparazioni. Le sue varianti restano, come
   esercizi principali. */
function edCancellaOvunque(n) {
  tstore.libreria = tstore.libreria.filter(r => edNorm(r[0]) !== n);
  for (const o of [tstore].concat(tstore.prep)) {
    for (const k of Object.keys(o.schede)) o.schede[k].es = o.schede[k].es.filter(r => edNorm(r[0]) !== n);
  }
  delete tstore.esercizi[n];
  for (const k of Object.keys(tstore.esercizi)) if (edNorm(tstore.esercizi[k].p) === n) edMetaSet(k, 'p', '');
  edChiedi.delete(n);
  edAperti = new Set();
}

let edLibAperti = new Set();
let edLibSel = null;            /* in modalita' Select: i nomi spuntati */
let edLibSenzaVideo = false;
let edLibCerca = '';
let edLibMsg = '';
function edPagLibreria(box) {
  const tutti = edLibreria();
  edTitolo(box, 'Exercise library', '');
  /* un esercizio nuovo, solo in libreria: il nome, poi video e descrizione */
  const nuovo = el('div', 'ed-lib-nuovo');
  const nomeN = el('input', 'campo');
  nomeN.type = 'text'; nomeN.maxLength = 60; nomeN.placeholder = 'New exercise name';
  nuovo.appendChild(edTendina(nomeN, () => tutti.map(x => x.nome), v => { nomeN.value = v; aggiungi(); },
                               { cls: 'nome', nuova: 'New exercise, not in the library yet' }));
  const errN = el('p', 'nota ed-lib-msg'); errN.hidden = !edLibMsg; errN.textContent = edLibMsg; edLibMsg = '';
  const aggiungi = () => {
    const nome = nomeN.value.slice(0, 60).trim();
    if (!nome) return;
    const k = edNorm(nome);
    if (edLibreria().some(x => edNorm(x.nome) === k)) {
      edLibMsg = '"' + nome + '" is already in the library: it is open below.';
      edLibAperti.add(k); edLibCerca = nome; edPagina();
      return;
    }
    tstore.libreria.push([nome, '', [], '', '']);
    edChiedi.add(k);
    edLibAperti.add(k); edLibCerca = '';
    edCambio(false);
    edPagina();
  };
  edBottone(nuovo, '+ Add to library', 'ed-ok', aggiungi);
  nomeN.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); aggiungi(); } });
  box.appendChild(nuovo);
  box.appendChild(errN);
  const cerca = el('input', 'campo ed-lib-cerca');
  cerca.type = 'search'; cerca.placeholder = 'Search an exercise…';
  cerca.value = edLibCerca;
  box.appendChild(cerca);
  const senza = tutti.filter(x => !x.video).length;
  const filtro = el('button', 'ed-lib-filtro' + (edLibSenzaVideo ? ' on' : ''), 'Without video · ' + senza);
  filtro.type = 'button';
  filtro.setAttribute('aria-pressed', edLibSenzaVideo ? 'true' : 'false');
  filtro.addEventListener('click', () => { edLibSenzaVideo = !edLibSenzaVideo; edPagina(); });
  box.appendChild(filtro);
  const selez = el('button', 'ed-lib-filtro' + (edLibSel ? ' on' : ''), edLibSel ? 'Done' : 'Select');
  selez.type = 'button';
  selez.addEventListener('click', () => { edLibSel = edLibSel ? null : new Set(); edPagina(); });
  box.appendChild(selez);
  const lista = el('div', 'ed-lib');
  box.appendChild(lista);
  const perNome = new Map(tutti.map(x => [x.k, x]));
  /* il padre di una voce, se c'e' davvero ed e' un esercizio principale */
  const padreDi = x => { const pk = edNorm(edMeta(x.k).p); const px = pk && pk !== x.k ? perNome.get(pk) : null; return px && !edMeta(pk).p ? px : null; };
  const figli = new Map();
  for (const x of tutti) { const px = padreDi(x); if (px) { if (!figli.has(px.k)) figli.set(px.k, []); figli.get(px.k).push(x); } }
  function disegna() {
    lista.textContent = '';
    const q = edNorm(edLibCerca);
    /* la ricerca guarda il nome e il nome del padre */
    const va = x => {
      if (edLibSenzaVideo && x.video) return false;
      if (!q) return true;
      const px = padreDi(x);
      return [x.nome, px ? px.nome : ''].some(t => edNorm(t).indexOf(q) >= 0);
    };
    const righe = [];
    for (const x of tutti) {
      if (padreDi(x)) continue;
      const vv = (figli.get(x.k) || []).filter(va);
      if (va(x) || vv.length) { righe.push({ x: x, v: false }); for (const y of vv) righe.push({ x: y, v: true }); }
    }
    lista.appendChild(el('p', 'ed-sotto', righe.length + (righe.length === 1 ? ' exercise' : ' exercises')));
    if (edLibSel) lista.appendChild(barraSel());
    for (const { x, v: variante } of righe) voce(x, variante);
    /* arrivati dal ✎ di un workout: la scheda aperta si porta in vista */
    if (edLibVai) {
      const i = righe.findIndex(y => y.x.k === edLibVai);
      edLibVai = '';
      const voci = lista.querySelectorAll('.ed-lib-voce');
      if (i >= 0 && voci[i]) requestAnimationFrame(() => voci[i].scrollIntoView({ block: 'start' }));
    }
  }
  /* in Select: quello che si fa sugli esercizi spuntati */
  function barraSel() {
    const b = el('div', 'ed-lib-sel');
    const n = edLibSel.size;
    b.appendChild(el('p', 'ed-sotto', n + ' selected'));
    if (!n) return b;
    const scelti = tutti.filter(x => edLibSel.has(x.k));
    const az = el('div', 'ed-lib-nuovo');
    const sel = edCercaPadre('', '', p => {
      if (!p) return;
      for (const x of scelti) if (x.k !== edNorm(p)) edFaiVariante(x.k, p);
      edCambio(false); edPagina();
    });
    sel.querySelector('input').placeholder = 'Make them variants of… search';
    az.appendChild(sel);
    edBottone(az, 'Make them main', '', () => { for (const x of scelti) edMetaSet(x.k, 'p', ''); edCambio(false); edPagina(); });
    b.appendChild(az);
    const via = el('div', 'ed-azioni');
    edConferma(via, 'Delete ' + n + ' everywhere', () => {
      edAnnullabile(n + ' exercises deleted everywhere', edFoto());
      for (const x of scelti) edCancellaOvunque(x.k);
      edLibSel = new Set();
      edCambio(false); edPagina();
    });
    b.appendChild(via);
    return b;
  }
  function voce(x, variante) {
      const k = x.k;
      const aperto = !edLibSel && edLibAperti.has(k);
      const v = el('div', 'ed-lib-voce' + (aperto ? ' aperto' : '') + (variante ? ' ed-lib-var' : ''));
      const t = el('button', 'ed-lib-testa');
      t.type = 'button';
      if (edLibSel) t.appendChild(el('span', 'ed-lib-spunta', edLibSel.has(k) ? '☑' : '☐'));
      const nm = el('span', 'ed-lib-nome', x.nome);
      if (variante) nm.prepend(el('span', 'ed-lib-freccia', '↳ '));
      t.appendChild(nm);
      const segni = (x.video ? '▶ ' : '') + (x.desc ? '¶' : '');
      if (segni) t.appendChild(el('span', 'ed-lib-segni', segni));
      if (!edLibSel) t.appendChild(el('span', 'ed-freccia' + (aperto ? ' open' : ''), '▾'));
      t.addEventListener('click', () => {
        if (edLibSel) { if (edLibSel.has(k)) edLibSel.delete(k); else edLibSel.add(k); disegna(); return; }
        if (aperto) edLibAperti.delete(k); else edLibAperti.add(k);
        disegna();
      });
      v.appendChild(t);
      if (aperto) {
        const c = el('div', 'ed-lib-corpo');
        if (edChiedi.has(k)) c.appendChild(edDomanda(k, x.nome, null));
        c.appendChild(el('p', 'ed-lib-usi', x.usi.length ? 'Used in: ' + x.usi.join(', ') : 'Only in the library, not in a workout yet.'));
        /* il nome: cambiarlo qui lo cambia ovunque */
        const nomeC = el('input', 'campo ed-lib-nomecampo');
        nomeC.type = 'text'; nomeC.maxLength = 60; nomeC.value = x.nome;
        nomeC.setAttribute('aria-label', 'Exercise name');
        nomeC.addEventListener('change', () => {
          const nuovo = nomeC.value.slice(0, 60).trim();
          if (!nuovo) { nomeC.value = x.nome; return; }
          /* un nome che c'e' gia': i due diventerebbero uno solo. Si chiede prima */
          const kn = edNorm(nuovo);
          if (kn !== k && edRigheDi(kn).length &&
              !confirm('"' + nuovo + '" already exists.\n\nMerge "' + x.nome + '" into it? They become one exercise everywhere; all videos and descriptions stay.')) {
            nomeC.value = x.nome; return;
          }
          const unito = edLibRinomina(k, nuovo);
          edLibAperti.delete(k); edLibAperti.add(edNorm(unito || nuovo));
          edLibMsg = unito ? '"' + x.nome + '" is now one exercise with "' + unito + '".' : '';
          if (edLibCerca) edLibCerca = unito || nuovo;
          edCambio(false); edPagina();
        });
        c.appendChild(nomeC);
        /* la postilla: il padre, da correggere qui */
        const meta = el('div', 'ed-lib-meta');
        const lp = el('div', 'ed-lib-postilla', 'Variant of ');
        const px = padreDi(x);
        lp.appendChild(edCercaPadre(k, px ? px.nome : '', p => { edFaiVariante(k, p); edCambio(false); edPagina(); }, '— main exercise'));
        meta.appendChild(lp);
        c.appendChild(meta);
        /* descrizione e video: una riga di lavoro con quelli mostrati; ogni
           modifica va in tutte le righe con questo nome */
        const r = [x.nome, '', [], x.desc, x.video];
        c.appendChild(edDescrizione(r, () => { const L = edLib(k, x.nome); L[3] = r[3] || ''; L[4] = r[4] || ''; }));
        const az = el('div', 'ed-azioni');
        c.appendChild(el('p', 'ed-lib-nota', 'Delete everywhere removes it from the library' + (x.usi.length ? ' and from: ' + x.usi.join(', ') : '') + '.'));
        edConferma(az, 'Delete everywhere', () => {
          edAnnullabile('"' + x.nome + '" deleted everywhere', edFoto());
          edCancellaOvunque(k); edLibAperti.delete(k); edCambio(false); edPagina();
        });
        c.appendChild(az);
        v.appendChild(c);
      }
      lista.appendChild(v);
  }
  cerca.addEventListener('input', () => { edLibCerca = cerca.value; disegna(); });
  disegna();
}
