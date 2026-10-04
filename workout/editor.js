'use strict';

/* =========================================================================
   L'editor: una schermata a parte, solo per chi ha il token. A sinistra
   l'elenco di tutto quello che si scrive (il piano di sempre e le
   preparazioni), a destra i campi di quello che si e' scelto. Sul telefono
   prima l'elenco, poi la pagina, con la freccia per tornare indietro.
   Ogni cambio resta subito nel telefono; chiudendo l'editor si salva su
   GitHub da solo.
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
      for (const v of (w.workout[g] || []).slice(0, w.conti[g] || 0)) if (v && v !== MORNING && out.indexOf(v) < 0) out.push(v);
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
  edVista = { pag: 'week', ctx: 'base', sett: 0 };
  edInPagina = !stretto.matches;
  edAperti = new Set();
  edBox.hidden = false;
  document.body.classList.add('ed-aperto');
  history.pushState({ ed: 1 }, '');
  edRidisegna();
}

/* Chiudendo si salva da solo, se c'e' qualcosa da salvare. */
function edChiudi(daIndietro) {
  if (edBox.hidden) return;
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  edBox.hidden = true;
  document.body.classList.remove('ed-aperto');
  edLibera();
  P.editor(false);
  paintW();
  salva();
  if (!daIndietro && history.state && history.state.ed) history.back();
}

$('edChiudi').addEventListener('click', () => edChiudi(false));
$('edSalva').addEventListener('click', () => {
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  salva();
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
    const nomi = (w.workout[g] || []).slice(0, w.conti[g] || 0).map(x => x === MORNING ? nomeMattinaDi(f.obj) : x).filter(Boolean);
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
      for (const v of (w.workout[g] || []).slice(0, w.conti[g] || 0)) if (v && v !== MORNING && out.indexOf(v) < 0) out.push(v);
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
  edVoceAnteprima(box, nomeMattinaDi(f.obj) + (f.obj.mattinaVia ? ' (hidden)' : ''), { pag: 'morning', ctx: ctx },
    v.pag === 'morning' && v.ctx === ctx && !v.lista, f.obj.mattinaVia ? 'spenta' : '',
    ctx + ':morning', pv => edAnteprimaScheda(pv, f.schede[MORNING]));
  for (const a of f.obj.altre) {
    edVoceAnteprima(box, (a.nome || 'Every day') + (a.via ? ' (hidden)' : ''), { pag: 'morning', ctx: ctx, lista: a.id },
      v.pag === 'morning' && v.ctx === ctx && v.lista === a.id, a.via ? 'spenta' : '',
      ctx + ':ev:' + a.id, pv => edAnteprimaScheda(pv, f.schede[EV(a.id)]));
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
  for (const n of edWorkoutElenco(f)) {
    edVoceAnteprima(box, n, { pag: 'workout', ctx: ctx, nome: n },
      v.pag === 'workout' && v.ctx === ctx && v.nome === n, 'wk', ctx + ':wk:' + n, pv => edAnteprimaScheda(pv, f.schede[n]));
  }
}

/* La preparazione aperta nell'elenco: il primo tocco la apre sotto, il
   secondo porta alla pagina per modificarla. */
let edPrepAperta = null;

function edElenco() {
  const nav = $('edNav');
  const y = nav.scrollTop;
  nav.textContent = '';

  /* sopra tutto: la libreria degli esercizi, da consultare */
  nav.appendChild(edVoce('Exercise library', { pag: 'lib', ctx: 'base' }, edVista.pag === 'lib', 'ed-lib-link'));
  nav.appendChild(el('p', 'ed-sez', 'PLAN'));
  const base = el('div', 'ed-gruppo');
  edVociFonte(base, 'base');
  nav.appendChild(base);

  nav.appendChild(el('p', 'ed-sez', 'PREPARATIONS'));
  const kOggi = chiaveData(today());
  for (const p of tstore.prep) {
    const stato = p.al < kOggi ? ' fatta' : (p.dal <= kOggi ? ' incorso' : '');
    const testa = el('button', 'ed-voce ed-prep' + stato +
      (edVista.pag === 'prep' && edVista.ctx === p.id ? ' on' : ''));
    testa.type = 'button';
    testa.appendChild(el('span', 'ed-prep-nome', nomePrep(p)));
    const aperta0 = edPrepAperta === p.id || edVista.ctx === p.id;
    testa.appendChild(el('span', 'ed-prep-date', datePrep(p) +
      (stato === ' incorso' ? ' · now' : stato === ' fatta' ? ' · ended' : '')));
    if (aperta0 && !(edVista.pag === 'prep' && edVista.ctx === p.id)) testa.appendChild(el('span', 'ed-prep-date ed-prep-hint', 'Tap again to edit it'));
    const aperta = edPrepAperta === p.id || edVista.ctx === p.id;
    testa.setAttribute('aria-expanded', aperta ? 'true' : 'false');
    testa.addEventListener('click', () => {
      if (!aperta) { edPrepAperta = p.id; edElenco(); return; }
      edPrepAperta = p.id;
      edVai({ pag: 'prep', ctx: p.id });
    });
    nav.appendChild(testa);
    /* le pagine della preparazione si vedono quando la si apre */
    if (aperta) {
      const g = el('div', 'ed-gruppo ed-figli');
      edVociFonte(g, p.id);
      nav.appendChild(g);
    }
  }
  nav.appendChild(edVoce('+ Add preparation', { pag: 'newprep', ctx: 'base' }, edVista.pag === 'newprep', 'piu'));
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
  else if (v.pag === 'egg') edPagEgg(pane);
  else if (v.pag === 'lib') edPagLibreria(pane);
  pane.scrollTop = y;
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
    edTitolo(box, 'Week', 'The plan that repeats every week. Tap − and + to choose how many workouts each day has; 0 is a rest day.');
  } else {
    const inizio = piuGiorni(lunedi(daChiave(f.prep.dal)), 7 * si);
    const fine = piuGiorni(inizio, 6);
    const ultima = si === f.settimane.length - 1;
    edTitolo(box, 'Week ' + (si + 1), dataCorta(chiaveData(inizio)) + ' – ' + dataCorta(chiaveData(fine)) +
      (ultima && f.settimane.length < settimaneDel(f.prep) ? ' · repeats until the end of the preparation' : ''));
  }

  /* i nomi gia' usati, da scegliere mentre si scrive */
  const lista = el('datalist');
  lista.id = 'edNomi';
  /* in cima la lista di tutti i giorni: scelta in un giorno, quel giorno
     porta il suo nome */
  const nomeEvery = nomeMattinaDi(f.obj);
  const EVERY = 'Every day';
  for (const n of [EVERY].concat(edWorkout(f))) { const o = el('option'); o.value = n; lista.appendChild(o); }
  box.appendChild(lista);
  box.appendChild(el('p', 'ed-sotto', 'Choose "' + EVERY + '" in a day: in the app that day shows "' + nomeEvery + '".'));

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
      inp.setAttribute('list', 'edNomi');
      inp.placeholder = ORDINALI[i] + ' workout';
      const val = (w.workout[g] || [])[i] || '';
      inp.value = val === MORNING ? EVERY : val;
      if (val === MORNING) inp.classList.add('every');
      inp.addEventListener('change', () => {
        const r = (w.workout[g] || []).slice();
        while (r.length <= i) r.push('');
        const scritto = inp.value.slice(0, 60).trim();
        const basso = scritto.toLowerCase();
        r[i] = scritto && (basso === EVERY.toLowerCase() || basso === 'everyday' || basso === nomeEvery.toLowerCase()) ? MORNING : scritto;
        if (r[i] === MORNING) inp.value = EVERY;
        while (r.length && !r[r.length - 1]) r.pop();
        if (r.length) w.workout[g] = r; else delete w.workout[g];
        inp.classList.toggle('every', r[i] === MORNING);
        edCambio(true);
      });
      campi.appendChild(inp);
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

/* --- gli esercizi: la parte comune a FIRST 15' e ai workout -------------- */

/* Le righe di una scheda da scrivere: nome, quantita', descrizione, frecce,
   croce. Il ▾ apre sotto la riga la descrizione e il video. */
function edEsercizi(box, ctx, nomeScheda, sc) {
  /* i nomi di tutti gli esercizi gia' scritti, suggeriti mentre si scrive */
  const lista = el('datalist');
  lista.id = 'edEsNomi';
  for (const x of edLibreria()) { const o = el('option'); o.value = x.nome; lista.appendChild(o); }
  box.appendChild(lista);
  const cont = el('div', 'ed-es-lista');
  box.appendChild(cont);
  sc.es.forEach((r, i) => {
    const chiave = ctx + '|' + nomeScheda + '|' + i;
    const aperto = edAperti.has(chiave);
    const es = el('div', 'ed-es' + (aperto ? ' aperto' : ''));
    const riga = el('div', 'ed-es-riga');

    const nome = el('input', 'campo ed-es-nome');
    nome.type = 'text'; nome.maxLength = 60; nome.placeholder = 'exercise';
    nome.value = r[0] || '';
    nome.dataset.focus = chiave + '|0';
    nome.setAttribute('list', 'edEsNomi');
    nome.addEventListener('change', () => {
      r[0] = nome.value.slice(0, 60).trim();
      /* un esercizio che esiste gia': descrizione e video arrivano da soli,
         se questa riga non ne ha */
      const preso = edPrendiDallaLibreria(r);
      edCambio(false);
      if (preso) edPagina();
    });
    const qta = el('input', 'campo ed-es-qta');
    qta.type = 'text'; qta.maxLength = 60; qta.placeholder = 'how much';
    qta.value = r[1] || '';
    qta.addEventListener('change', () => { r[1] = qta.value.slice(0, 60).trim(); edCambio(false); });
    riga.appendChild(nome);
    riga.appendChild(qta);

    const tasti = el('div', 'ed-es-tasti');
    const pieno = !!(r[3] || r[4]);
    const d = edBottone(tasti, aperto ? '▴' : (r[4] ? '▶' : '▾'), 'ed-tasto ed-desc' + (pieno ? ' piena' : ''), () => {
      if (edAperti.has(chiave)) edAperti.delete(chiave); else edAperti.add(chiave);
      edPagina();
    });
    d.setAttribute('aria-label', 'Description and video');
    d.title = 'Description and video';
    const su = edBottone(tasti, '↑', 'ed-tasto', () => edSposta(sc, i, -1));
    su.disabled = i === 0; su.setAttribute('aria-label', 'Move up');
    const giu = edBottone(tasti, '↓', 'ed-tasto', () => edSposta(sc, i, 1));
    giu.disabled = i === sc.es.length - 1; giu.setAttribute('aria-label', 'Move down');
    const x = edBottone(tasti, '×', 'ed-tasto ed-x', () => {
      sc.es.splice(i, 1);
      edAperti = new Set();
      edCambio(false);
      edPagina();
    });
    x.setAttribute('aria-label', 'Remove this exercise');
    riga.appendChild(tasti);
    es.appendChild(riga);

    /* il gruppo in cui sta, se ci sta: si legge, si cambia dal bottone Groups */
    if ((r[2] || []).length) es.appendChild(el('p', 'ed-es-grp', 'in ' + r[2].join(' › ')));

    /* stesso nome, stesso esercizio: quello che si scrive o si carica qui va
       anche nelle altre righe con questo nome, dove era vuoto o uguale */
    if (aperto) es.appendChild(edDescrizione(r, (d0, v0) => edLibApplica(edNorm(r[0]), d0, v0, r[3] || '', r[4] || '')));
    cont.appendChild(es);
  });

  edBottone(box, '+ Exercise', 'ed-aggiungi', () => {
    sc.es.push(['', '', [], '', '']);
    edPagina();
    const campi = $('edPane').querySelectorAll('.ed-es-nome');
    if (campi.length) campi[campi.length - 1].focus();
  });
}

/* Le righe cambiano posto una alla volta. Un gruppo resta com'e': la riga
   spostata porta con se' il suo. */
function edSposta(sc, i, dir) {
  const j = i + dir;
  if (j < 0 || j >= sc.es.length) return;
  const t = sc.es[i]; sc.es[i] = sc.es[j]; sc.es[j] = t;
  edAperti = new Set();
  edCambio(false);
  edPagina();
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
    edBottone(az, 'Remove video', 'btn-del', () => {
      cambia(() => { r[4] = videiDi(r).filter(x => x !== nomeV).join(','); });
      edCambio(false); edPagina();
    });
    riga.appendChild(az);
    v.appendChild(riga);
  });
  const tasti = el('div', 'ed-video-tasti');
  const file = el('input');
  file.type = 'file'; file.accept = 'video/*'; file.hidden = true;
  file.addEventListener('change', async () => {
    const f = file.files && file.files[0];
    file.value = '';
    if (!f) return;
    /* la compressione puo' durare: si dice a che punto e', e i tasti aspettano */
    errore.classList.remove('err');
    errore.hidden = false;
    errore.textContent = 'Compressing the video…';
    for (const b of tasti.querySelectorAll('button')) b.disabled = true;
    const esito = await tieniVideo(f, x => { errore.textContent = 'Compressing the video… ' + Math.min(99, Math.round(x * 100)) + '%'; });
    for (const b of tasti.querySelectorAll('button')) b.disabled = false;
    errore.classList.add('err');
    errore.hidden = true;
    if (esito.errore) { errore.textContent = esito.errore; errore.hidden = false; return; }
    cambia(() => { r[4] = videiDi(r).concat([esito.nome]).slice(0, 6).join(','); });
    if (daCaricare.indexOf(esito.nome) < 0) { daCaricare.push(esito.nome); salvaCoda(); }
    edCambio(false);
    edPagina();
    codaVideo();                  /* il video parte subito, mentre si continua a scrivere */
  });
  tasti.appendChild(file);
  const piu = edBottone(tasti, lista.length ? '+ Another video' : '+ Video', '', () => file.click());
  piu.disabled = lista.length >= 6;
  v.appendChild(tasti);
  const errore = el('p', 'nota err');
  errore.hidden = true;
  v.appendChild(errore);
  box.appendChild(v);

  const t = el('textarea', 'commento ed-desc-testo');
  t.placeholder = 'How it goes, what to watch out for. Lines starting with - become a list; a video link on its own line (YouTube, Vimeo, Wistia, Loom, Drive, Patreon…) goes in the video slot at the top.';
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
  edTitolo(box, L.nome(), 'A fixed list shown above the workouts, on the days you choose below. Untick "Show it in the app" to hide it: what is written stays.');
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

  if (!f.schede[L.chiave]) f.schede[L.chiave] = { es: [], rec: '' };
  box.appendChild(el('p', 'ed-sez-pag', 'EXERCISES'));
  edEsercizi(box, ctx, L.chiave, f.schede[L.chiave]);
  edGruppiBottone(box, ctx, L.chiave);

  if (a) {
    const az = el('div', 'ed-azioni');
    edConferma(az, 'Delete this list', () => {
      o.altre = o.altre.filter(x => x !== a);
      delete f.schede[L.chiave];
      edVista = { pag: 'morning', ctx: ctx };
      edCambio(true);
      edRidisegna();
    });
    box.appendChild(az);
  }
}

/* Quando si vede una lista: tutti i giorni, certi giorni della settimana, un
   giorno si' e uno no (o ogni N), oppure date precise. Sotto, i prossimi 14
   giorni, per vedere subito il risultato. L'oggetto `q` si cambia sul posto. */
function edQuando(box, q) {
  box.appendChild(el('p', 'ed-sez-pag', 'WHEN'));
  const modi = [['sempre', 'Every day'], ['giorni', 'Days of the week'], ['ogni', 'Every N days'], ['date', 'Specific dates']];
  const chips = el('div', 'chips');
  for (const [m, n] of modi) {
    const b = el('button', 'chip' + (q.modo === m ? ' sel' : ''), n);
    b.type = 'button';
    b.addEventListener('click', () => {
      if (q.modo === m) return;
      for (const k of Object.keys(q)) delete q[k];
      q.modo = m;
      if (m === 'giorni') q.giorni = [1, 2, 3, 4, 5, 6, 0];
      if (m === 'ogni') { q.n = 2; q.dal = chiaveData(today()); }
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
  if (q.modo === 'date') {
    const lista = el('div', 'chips');
    for (const d of q.date) {
      const b = el('button', 'chip sel', dataCorta(d) + ' ' + daChiave(d).getFullYear() + '  ×');
      b.type = 'button';
      b.setAttribute('aria-label', 'Remove ' + d);
      b.addEventListener('click', () => { q.date = q.date.filter(x => x !== d); edCambio(false); edPagina(); });
      lista.appendChild(b);
    }
    if (!q.date.length) lista.appendChild(el('span', 'ed-sotto', 'No dates yet: the list is not shown.'));
    box.appendChild(lista);
    const r = el('div', 'ed-ogni');
    const nuova = edCampo(r, 'Add a date', '', { type: 'date' }, val => {
      if (dataOk(val) && q.date.indexOf(val) < 0) { q.date = q.date.concat([val]).sort(); edCambio(false); }
      edPagina();
    });
    nuova.value = '';
    box.appendChild(r);
  }

  /* i prossimi 14 giorni: acceso dove la lista si vede */
  box.appendChild(el('p', 'ed-sotto', 'Next 14 days:'));
  const prossimi = el('div', 'ed-prossimi');
  const t0 = today();
  for (let i = 0; i < 14; i++) {
    const d = piuGiorni(t0, i);
    const k = chiaveData(d);
    const si = quandoVale(q, k);
    prossimi.appendChild(el('span', 'ed-pross' + (si ? ' si' : ''), GIORNI2[d.getDay()] + ' ' + d.getDate()));
  }
  box.appendChild(prossimi);
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
  return giorni.length ? 'On: ' + giorni.join(', ') : 'Not in the week yet: write its name on a day in Week.';
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
  edTitolo(box, 'New workout', 'Give it a name, then write it on the days in Week.');
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
  edTitolo(box, 'Add preparation', 'Choose the dates: the preparation starts as a copy of the plan, then you change what changes. In those days the app shows the preparation; the day after the end, the plan comes back by itself.');
  const k0 = chiaveData(today());
  const nome = edCampo(box, 'Name (optional)', '', { max: 50, ph: 'e.g. Exam November' }, () => {});
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

/* ------------------------------------------------ easter egg ---- */

/* Cose divertenti, solo nel giorno scelto: un'immagine a tutto schermo alla
   prima apertura, e postille colorate che spariscono al primo tocco. */
$('edEgg').addEventListener('click', () => edVai({ pag: 'egg', ctx: 'base' }));

const EGG_COLORI = ['Yellow', 'Pink', 'Blue', 'Green'];

/* I posti della pagina dove puo' stare una postilla. */
function eggPosti() {
  const posti = [['top', 'Top of the page'], ['week', 'Above the Scheduling table'],
                 ['every', 'Above the Every day list'], ['oggi', 'Above today\'s workouts'],
                 ['wk', 'Above the WORKOUTS bar']];
  const nomi = [];
  for (const f of [edFonte('base')].concat(tstore.prep.map(p => edFonte(p.id)))) {
    for (const n of edWorkout(f)) if (nomi.indexOf(n) < 0) nomi.push(n);
  }
  for (const n of nomi) posti.push(['w:' + n, 'Above workout "' + n + '"']);
  return posti;
}

/* Una foto ridotta prima di tenerla: 1600 pixel bastano per uno schermo. */
async function eggRiduci(f) {
  const bm = await createImageBitmap(f);
  const k = Math.min(1, 1600 / Math.max(bm.width, bm.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bm.width * k); c.height = Math.round(bm.height * k);
  c.getContext('2d').drawImage(bm, 0, 0, c.width, c.height);
  return await new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.85));
}

function edPagEgg(box) {
  edTitolo(box, 'Easter eggs', 'Fun things, only on the day you choose. Every phone sees each one once: the first time the app opens that day.');
  const oggi = chiaveData(today());
  const tutte = tstore.sorprese;

  /* --- le immagini --- */
  box.appendChild(el('p', 'ed-sez-pag', 'IMAGE OF THE DAY'));
  box.appendChild(el('p', 'ed-sotto', 'Full screen, before anything else. Tap to close.'));
  tutte.forEach((x, i) => {
    if (x.tipo !== 'img') return;
    const r = el('div', 'egg-riga');
    const mini = el('div', 'egg-mini');
    (async () => {
      const b = (await vGet(x.img)) || (await prendiVideo(x.img));
      if (!b || !mini.isConnected) return;
      const u = URL.createObjectURL(b); edUrl.push(u);
      const im = el('img'); im.src = u; im.alt = ''; mini.appendChild(im);
    })();
    r.appendChild(mini);
    const dx = el('div', 'egg-dx');
    edCampo(dx, 'Day', x.giorno, { type: 'date' }, val => { if (dataOk(val)) { x.giorno = val; edCambio(false); } });
    const az = el('div', 'ed-azioni');
    edBottone(az, 'Preview', '', () => controllaSorprese(x));
    edConferma(az, 'Delete', () => { tutte.splice(i, 1); edCambio(false); edPagina(); });
    dx.appendChild(az);
    r.appendChild(dx);
    box.appendChild(r);
  });
  const errore = el('p', 'nota err');
  errore.hidden = true;
  const file = el('input');
  file.type = 'file'; file.accept = 'image/*'; file.hidden = true;
  file.addEventListener('change', async () => {
    const f = file.files && file.files[0];
    file.value = '';
    if (!f) return;
    try {
      const b = await eggRiduci(f);
      const nome = 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8) + '.jpg';
      await vPut(nome, b);
      tutte.push({ id: 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), tipo: 'img', giorno: oggi, img: nome });
      if (daCaricare.indexOf(nome) < 0) { daCaricare.push(nome); salvaCoda(); }
      edCambio(false);
      edPagina();
      codaVideo();
    } catch (e) {
      errore.textContent = 'This image could not be read.';
      errore.hidden = false;
    }
  });
  box.appendChild(file);
  const az1 = el('div', 'ed-azioni');
  edBottone(az1, '+ Image', '', () => file.click());
  box.appendChild(az1);
  box.appendChild(errore);

  /* --- le postille --- */
  box.appendChild(el('p', 'ed-sez-pag', 'NOTES'));
  box.appendChild(el('p', 'ed-sotto', 'A bright sticky note where you want. It goes away at the first tap, scroll, or when the app is closed.'));
  const posti = eggPosti();
  tutte.forEach((x, i) => {
    if (x.tipo !== 'nota') return;
    const r = el('div', 'egg-nota');
    const anteprima = el('div', 'postilla c' + (x.colore || 0), x.testo || '…');
    r.appendChild(anteprima);
    const t = el('textarea', 'commento ed-desc-testo');
    t.rows = 2; t.maxLength = 300; t.placeholder = 'What the note says';
    t.value = x.testo || '';
    t.addEventListener('input', () => { anteprima.textContent = t.value || '…'; });
    t.addEventListener('change', () => { x.testo = t.value.slice(0, 300).trim(); edCambio(false); });
    r.appendChild(t);
    edCampo(r, 'Day', x.giorno, { type: 'date' }, val => { if (dataOk(val)) { x.giorno = val; edCambio(false); } });
    const l = el('label', 'ed-campo');
    l.appendChild(el('span', 'ed-eti', 'Where'));
    const sel = el('select', 'campo');
    for (const [v, n] of posti) { const o = el('option', null, n); o.value = v; sel.appendChild(o); }
    if (!posti.some(p => p[0] === x.dove)) { const o = el('option', null, x.dove); o.value = x.dove; sel.appendChild(o); }
    sel.value = x.dove || 'top';
    sel.addEventListener('change', () => { x.dove = sel.value; edCambio(false); });
    l.appendChild(sel);
    r.appendChild(l);
    const col = el('div', 'chips');
    EGG_COLORI.forEach((c, ci) => {
      const b = el('button', 'chip' + ((x.colore || 0) === ci ? ' sel' : ''), c);
      b.type = 'button';
      b.addEventListener('click', () => { x.colore = ci; edCambio(false); edPagina(); });
      col.appendChild(b);
    });
    r.appendChild(col);
    const az = el('div', 'ed-azioni');
    edConferma(az, 'Delete', () => { tutte.splice(i, 1); edCambio(false); edPagina(); });
    r.appendChild(az);
    box.appendChild(r);
  });
  const az2 = el('div', 'ed-azioni');
  edBottone(az2, '+ Note', '', () => {
    tutte.push({ id: 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), tipo: 'nota', giorno: oggi, testo: '', dove: 'top', colore: 0 });
    edCambio(false);
    edPagina();
  });
  box.appendChild(az2);
}

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
    m.set(n, { nome: r[0], desc: r[3] || '', video: r[4] || '', usi: [], mia: r });
  }
  for (const f of fonti) {
    for (const k of Object.keys(f.o.schede)) {
      for (const r of f.o.schede[k].es) {
        const n = edNorm(r[0]);
        if (!n) continue;
        let x = m.get(n);
        if (!x) { x = { nome: r[0], desc: '', video: '', usi: [] }; m.set(n, x); }
        if (!x.desc && r[3]) x.desc = r[3];
        if (!x.video && r[4]) x.video = r[4];
        const uso = f.nome + ' · ' + edNomeScheda(f.o, k);
        if (x.usi.indexOf(uso) < 0) x.usi.push(uso);
        x.posti = (x.posti || 0) + 1;
      }
    }
  }
  return [...m.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'it', { sensitivity: 'base' }));
}

/* Una riga nuova con il nome di un esercizio che esiste gia': prende
   descrizione e video dagli altri, se lei non ne ha. Torna true se ha preso. */
function edPrendiDallaLibreria(r) {
  const n = edNorm(r[0]);
  if (!n || r[3] || r[4]) return false;
  let desc = '', video = '', nome = '';
  for (const x of tstore.libreria) {
    if (x === r || edNorm(x[0]) !== n) continue;
    if (!nome) nome = x[0];
    if (!desc && x[3]) desc = x[3];
    if (!video && x[4]) video = x[4];
  }
  for (const o of [tstore].concat(tstore.prep)) {
    for (const k of Object.keys(o.schede)) {
      for (const x of o.schede[k].es) {
        if (x === r || edNorm(x[0]) !== n) continue;
        if (!nome) nome = x[0];
        if (!desc && x[3]) desc = x[3];
        if (!video && x[4]) video = x[4];
      }
    }
  }
  if (!desc && !video) return false;
  r[0] = nome;                  /* scritto come nella libreria */
  r[3] = desc; r[4] = video;
  return true;
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

/* Una modifica fatta dalla libreria va in tutte le righe con quel nome.
   La descrizione: dove era uguale alla vecchia, o vuota, diventa la nuova;
   dove la vecchia sta dentro un testo piu' lungo (per esempio una premessa
   scritta per la montagna) si cambia solo quel pezzo. Un testo tutto suo
   resta com'e'. I video: dove erano gli stessi, o nessuno, diventano i nuovi. */
function edLibApplica(n, d0, v0, d1, v1) {
  let fuori = 0;
  for (const r of edRigheDi(n)) {
    const d = r[3] || '', v = r[4] || '';
    if (d !== d1) {
      if (d === d0 || !d) r[3] = d1;
      else if (d0 && d.indexOf(d0) >= 0) r[3] = d.split(d0).join(d1);
      else fuori++;
    }
    if (v !== v1 && (v === v0 || !v)) r[4] = v1;
  }
  return fuori;
}

/* Il nome cambiato dalla libreria cambia in tutte le righe. Se il nome nuovo
   e' quello di un altro esercizio, i due diventano uno: le righe rimaste senza
   descrizione o video li prendono dall'altro. */
function edLibRinomina(n, nuovo) {
  const k = edNorm(nuovo);
  if (!k || k === n) {
    if (k === n) for (const r of edRigheDi(n)) r[0] = nuovo;
    return '';
  }
  const altro = edRigheDi(k);
  const nomeFinale = altro.length ? altro[0][0] : nuovo;
  let desc = '', video = '';
  for (const r of altro) { if (!desc && r[3]) desc = r[3]; if (!video && r[4]) video = r[4]; }
  const mie = edRigheDi(n);
  for (const r of mie) {
    r[0] = nomeFinale;
    if (!r[3] && desc) r[3] = desc;
    if (!r[4] && video) r[4] = video;
  }
  /* e le righe dell'altro, senza descrizione o video, li prendono da queste */
  let d2 = '', v2 = '';
  for (const r of mie) { if (!d2 && r[3]) d2 = r[3]; if (!v2 && r[4]) v2 = r[4]; }
  for (const r of altro) { if (!r[3] && d2) r[3] = d2; if (!r[4] && v2) r[4] = v2; }
  /* in libreria ne resta uno solo */
  const lib = tstore.libreria.filter(r => edNorm(r[0]) === k);
  if (lib.length > 1) tstore.libreria = tstore.libreria.filter(r => edNorm(r[0]) !== k || r === lib[0]);
  return altro.length ? nomeFinale : '';
}

let edLibAperti = new Set();
let edLibSenzaVideo = false;
let edLibCerca = '';
let edLibMsg = '';
function edPagLibreria(box) {
  const tutti = edLibreria();
  edTitolo(box, 'Exercise library', 'Every exercise written in the plan and in the preparations, once, plus the ones you add here. When you write one of these names in a workout, its description and videos come along by themselves.');
  /* un esercizio nuovo, solo in libreria: il nome, poi video e descrizione */
  const nuovo = el('div', 'ed-lib-nuovo');
  const nomeN = el('input', 'campo');
  nomeN.type = 'text'; nomeN.maxLength = 60; nomeN.placeholder = 'New exercise name';
  nuovo.appendChild(nomeN);
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
  const lista = el('div', 'ed-lib');
  box.appendChild(lista);
  function disegna() {
    lista.textContent = '';
    const q = edNorm(edLibCerca);
    const visti = tutti.filter(x => (!q || edNorm(x.nome).indexOf(q) >= 0) && (!edLibSenzaVideo || !x.video));
    lista.appendChild(el('p', 'ed-sotto', visti.length + (visti.length === 1 ? ' exercise' : ' exercises')));
    for (const x of visti) {
      const k = edNorm(x.nome);
      const aperto = edLibAperti.has(k);
      const v = el('div', 'ed-lib-voce' + (aperto ? ' aperto' : ''));
      const t = el('button', 'ed-lib-testa');
      t.type = 'button';
      t.appendChild(el('span', 'ed-lib-nome', x.nome));
      const segni = (x.video ? '▶ ' : '') + (x.desc ? '¶' : '');
      if (segni) t.appendChild(el('span', 'ed-lib-segni', segni));
      t.appendChild(el('span', 'ed-freccia' + (aperto ? ' open' : ''), '▾'));
      t.addEventListener('click', () => { if (aperto) edLibAperti.delete(k); else edLibAperti.add(k); disegna(); });
      v.appendChild(t);
      if (aperto) {
        const c = el('div', 'ed-lib-corpo');
        c.appendChild(el('p', 'ed-lib-usi', (x.mia ? 'Written in the library' + (x.usi.length ? ' · also used in: ' : '') : 'Used in: ') + x.usi.join(', ')));
        /* il nome: cambiarlo qui lo cambia ovunque */
        const nomeC = el('input', 'campo ed-lib-nomecampo');
        nomeC.type = 'text'; nomeC.maxLength = 60; nomeC.value = x.nome;
        nomeC.setAttribute('aria-label', 'Exercise name');
        nomeC.addEventListener('change', () => {
          const nuovo = nomeC.value.slice(0, 60).trim();
          if (!nuovo) { nomeC.value = x.nome; return; }
          const unito = edLibRinomina(k, nuovo);
          edLibAperti.delete(k); edLibAperti.add(edNorm(unito || nuovo));
          edLibMsg = unito ? '"' + x.nome + '" is now one exercise with "' + unito + '".' : '';
          if (edLibCerca) edLibCerca = unito || nuovo;
          edCambio(false); edPagina();
        });
        c.appendChild(nomeC);
        const posti = (x.posti || 0) + (x.mia ? 1 : 0);
        if (posti > 1) c.appendChild(el('p', 'ed-lib-nota', 'Changes here go to all ' + posti + ' places where it is written.'));
        /* descrizione e video: una riga di lavoro con quelli mostrati; ogni
           modifica va in tutte le righe con questo nome */
        const r = [x.nome, '', [], x.desc, x.video];
        c.appendChild(edDescrizione(r, (d0, v0) => {
          const fuori = edLibApplica(k, d0, v0, r[3] || '', r[4] || '');
          if (fuori) edLibMsg = fuori + (fuori === 1 ? ' place has' : ' places have') + ' its own description for "' + x.nome + '": left as it was.';
        }));
        if (x.mia) {
          const az = el('div', 'ed-azioni');
          edConferma(az, 'Remove from library', () => {
            tstore.libreria = tstore.libreria.filter(y => y !== x.mia);
            edCambio(false); edPagina();
          });
          c.appendChild(az);
        }
        v.appendChild(c);
      }
      lista.appendChild(v);
    }
  }
  cerca.addEventListener('input', () => { edLibCerca = cerca.value; disegna(); });
  disegna();
}
