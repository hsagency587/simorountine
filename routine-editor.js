'use strict';

/* =========================================================================
   L'editor della routine giornaliera.

   Sta in un file suo, staccato dal resto, perche' e' l'unica cosa che mette
   le mani sulla routine stessa: se qui si rompe qualcosa, l'app parte lo
   stesso e la giornata resta quella scritta nel codice.

   Si sceglie prima il giorno, in cima:
   - un giorno della settimana: la modifica si ripete ogni settimana, viaggia
     nel file delle task col tasto Salva e lascia una riga nel registro;
   - una data: la modifica vale solo quel giorno, vince sul giorno della
     settimana e resta solo in questo telefono. E' temporanea: non va nel file
     e non va nel registro.

   Di ogni tappa si cambia l'orario, il nome e le sottotappe. Cambiato un
   orario, le tappe si rimettono in ordine da sole.

   Quello che si scrive qui finisce in tstore.routine.giorni (il giorno della
   settimana) o in routineDate (la data), e si applica in routineFor(), che
   sta in app.js.
   ========================================================================= */

(function () {

const NOMI_G = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const CORTI_G = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

/* Il giorno scelto: { g: 0..6 } oppure { d: 'YYYY-MM-DD' }. Si parte da oggi. */
let rtSel = { g: today().getDay() };

/* La data su cui si guarda la routine. Per un giorno della settimana, il
   primo da oggi in avanti che cade quel giorno. */
function rtK() {
  if (rtSel.d) return rtSel.d;
  let d = today();
  for (let n = 0; n < 7 && d.getDay() !== rtSel.g; n++) d = shift(today(), n + 1);
  return dayKey(d);
}

/* Il testo di una tappa e' "orario | NOME". */
function rtNomeDi(t) {
  const i = t.t.indexOf('|');
  return i >= 0 ? t.t.slice(i + 1).trim() : t.t.trim();
}

const rtHHMM = m => pad(Math.floor(m / 60)) + ':' + pad(m % 60);

/* Com'e' la routine adesso, quel giorno, e com'era sotto il livello che si
   sta toccando: per un giorno della settimana la fabbrica, per una data la
   fabbrica col giorno della settimana sopra. Serve a capire quando una
   modifica torna uguale a quello che c'era e puo' sparire. */
const rtAdesso = () => routineFor(rtK());
function rtSotto() {
  const k = rtK();
  return rtSel.d ? applicaRoutine(fabbricaFor(k), routineOv(k, true)) : fabbricaFor(k);
}
const rtTrova = (l, id) => l.find(t => t.id === id) || null;

/* Il posto dove sta scritto il livello scelto. */
function rtStore() {
  if (!tstore.routine || typeof tstore.routine !== 'object') tstore.routine = { giorni: {}, log: [] };
  if (!tstore.routine.giorni || typeof tstore.routine.giorni !== 'object') tstore.routine.giorni = {};
  if (!Array.isArray(tstore.routine.log)) tstore.routine.log = [];
  return tstore.routine;
}
function rtLivello() {
  if (rtSel.d) return routineDate[rtSel.d] || {};
  return rtStore().giorni[rtSel.g] || {};
}
function rtSetLivello(v) {
  const vuoto = !Object.keys(v).length;
  if (rtSel.d) {
    if (vuoto) delete routineDate[rtSel.d]; else routineDate[rtSel.d] = v;
  } else {
    const s = rtStore();
    if (vuoto) delete s.giorni[rtSel.g]; else s.giorni[rtSel.g] = v;
  }
}

/* Come si chiama il giorno scelto, nel registro e nella nota */
function rtEtichetta() {
  if (!rtSel.d) return NOMI_G[rtSel.g];
  return fmtDate.format(new Date(rtSel.d + 'T00:00:00'));
}

/* Una riga nel registro: quando, e cosa. Le ultime stanno in cima. Solo per i
   giorni della settimana: le date sono temporanee. */
function rtLog(testo) {
  if (rtSel.d) return;
  const s = rtStore();
  s.log.unshift({ q: new Date().toISOString(), t: rtEtichetta() + ': ' + testo });
  s.log = s.log.slice(0, 200);
}

/* Si scrive la modifica di una tappa nel livello scelto. Un campo a undefined
   sparisce: torna a valere quello di sotto. */
function rtScrivi(id, patch, testoLog) {
  const liv = Object.assign({}, rtLivello());
  const o = Object.assign({}, liv[id] || {}, patch);
  for (const f of Object.keys(o)) if (o[f] === undefined) delete o[f];
  if (Object.keys(o).length) liv[id] = o; else delete liv[id];
  rtSetLivello(liv);
  rtSalva(testoLog);
}

function rtSalva(testoLog) {
  if (rtSel.d) {
    salvaRoutineDate();          /* resta nel telefono, niente Salva */
  } else {
    if (testoLog) rtLog(testoLog);
    touch();
  }
  render();
  rtDisegna();
}

/* un id nuovo per una sottotappa scritta a mano: non deve mai finire addosso a
   una spunta gia' scritta */
const rtNuovoId = () => 'rt' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

const rtData = q => {
  const d = new Date(q);
  return isNaN(d) ? q : d.toLocaleString('en-GB', { day: '2-digit', month: '2-digit',
                                                    hour: '2-digit', minute: '2-digit' });
};

/* ------------------------------------------------------------ disegno --- */

function rtDisegnaGiorni() {
  const box = document.getElementById('rtGiorni');
  box.textContent = '';
  for (const g of [1, 2, 3, 4, 5, 6, 0]) {
    const c = el('button', 'chip' + (!rtSel.d && rtSel.g === g ? ' sel' : ''), CORTI_G[g]);
    c.type = 'button';
    c.dataset.rtg = g;
    c.setAttribute('aria-label', NOMI_G[g]);
    box.appendChild(c);
  }
  const d = el('button', 'chip' + (rtSel.d ? ' sel' : ''), rtSel.d ? rtEtichetta() : 'Date');
  d.type = 'button';
  d.dataset.rtd = '1';
  box.appendChild(d);

  const inp = document.getElementById('rtData');
  inp.hidden = !rtSel.d;
  inp.min = dayKey(today());
  if (rtSel.d) inp.value = rtSel.d;

  document.getElementById('rtNota').textContent = rtSel.d
    ? 'Only ' + rtEtichetta() + '. Temporary: it stays on this phone and is not saved to GitHub.'
    : 'Every ' + NOMI_G[rtSel.g] + '. Repeats every week and goes to GitHub with Save.';
  document.getElementById('rtTutto').textContent = 'Restore this day';
}

function rtDisegna() {
  const box = document.getElementById('rtLista');
  if (!box) return;
  rtDisegnaGiorni();
  box.textContent = '';
  const liv = rtLivello();

  for (const t of rtAdesso()) {
    const cassa = el('div', 'schapri rtblocco');

    /* la testata: l'orario, che si cambia, e il ripristino */
    const tab = el('div', 'tab');
    const capo = el('div', 'tabr capo');
    const ora = el('input', 'wcampo rtora');
    ora.type = 'time';
    ora.dataset.rtda = t.id;
    ora.value = rtHHMM(t.da);
    ora.setAttribute('aria-label', 'Start time');
    capo.appendChild(ora);
    if (liv[t.id]) {
      const cb = el('div', 'tabc tabbtn');
      const b = el('button', 'schbtn', 'restore');
      b.type = 'button';
      b.dataset.rtreset = t.id;
      cb.appendChild(b);
      capo.appendChild(cb);
    }
    tab.appendChild(capo);
    cassa.appendChild(tab);

    /* il nome della tappa */
    const nrow = el('div', 'wrow');
    const nin = el('input', 'wcampo rtnome');
    nin.type = 'text';
    nin.maxLength = 80;
    nin.dataset.rtnome = t.id;
    nin.value = rtNomeDi(t);
    nin.placeholder = 'name of the step';
    nrow.appendChild(nin);
    cassa.appendChild(nrow);

    /* le sottotappe: una riga ciascuna, con le frecce per l'ordine e la croce */
    (t.sub || []).forEach((s, i) => {
      const row = el('div', 'wrow');
      const inp = el('input', 'wcampo');
      inp.type = 'text';
      inp.maxLength = 80;
      inp.dataset.rtsub = t.id;
      inp.dataset.riga = i;
      inp.value = s.t;
      inp.placeholder = 'what you do';
      row.appendChild(inp);
      for (const f of [['su', '↑', 'Move up'], ['giu', '↓', 'Move down']]) {
        const m = el('button', 'schbtn schfrec rtfrec', f[1]);
        m.type = 'button';
        m.dataset.rtsposta = t.id + '|' + i + '|' + (f[0] === 'su' ? -1 : 1);
        m.setAttribute('aria-label', f[2]);
        row.appendChild(m);
      }
      const x = el('button', 'schx', '×');
      x.type = 'button';
      x.dataset.rttogli = t.id + '|' + i;
      x.setAttribute('aria-label', 'Remove this line');
      row.appendChild(x);
      cassa.appendChild(row);
    });

    const piu = el('button', 'lpiu', '+  Add a line');
    piu.type = 'button';
    piu.dataset.rtpiu = t.id;
    cassa.appendChild(piu);

    box.appendChild(cassa);
  }

  rtDisegnaLog();
}

function rtDisegnaLog() {
  const box = document.getElementById('rtLog');
  if (!box) return;
  box.textContent = '';
  const l = rtStore().log;
  if (!l.length) {
    box.appendChild(el('p', 'vuoto', 'Nothing changed yet'));
    return;
  }
  const ul = el('ul', 'rtlog');
  for (const v of l) {
    const li = el('li');
    li.appendChild(el('span', 'rtlogq', rtData(v.q)));
    li.appendChild(el('span', 'rtlogt', v.t));
    ul.appendChild(li);
  }
  box.appendChild(ul);
}

/* -------------------------------------------------------------- mosse --- */

/* Le sottotappe nuove di una tappa. Tornate uguali a quelle di sotto, la
   modifica sparisce invece di restare scritta uguale. */
function rtSetSub(id, lista, testoLog) {
  const sotto = rtTrova(rtSotto(), id);
  const base = JSON.stringify(((sotto && sotto.sub) || []).map(x => ({ id: x.id, t: x.t })));
  const nuova = lista.map(x => ({ id: x.id, t: x.t }));
  rtScrivi(id, { sub: JSON.stringify(nuova) === base ? undefined : nuova }, testoLog);
}

document.getElementById('rtGiorni').addEventListener('click', ev => {
  const g = ev.target.closest('button[data-rtg]');
  if (g) { rtSel = { g: +g.dataset.rtg }; rtDisegna(); return; }
  const d = ev.target.closest('button[data-rtd]');
  if (d) {
    if (!rtSel.d) rtSel = { d: dayKey(today()) };
    rtDisegna();
    const inp = document.getElementById('rtData');
    try { inp.showPicker(); } catch (e) { inp.focus(); }
  }
});

document.getElementById('rtData').addEventListener('change', ev => {
  const v = ev.target.value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || v < dayKey(today())) { ev.target.value = rtSel.d; return; }
  rtSel = { d: v };
  rtDisegna();
});

document.getElementById('rtLista').addEventListener('change', ev => {
  const i = ev.target.closest('input.wcampo');
  if (!i) return;

  if (i.dataset.rtda) {
    const id = i.dataset.rtda;
    const t = rtTrova(rtAdesso(), id);
    const m = /^(\d{1,2}):(\d{2})$/.exec(i.value);
    if (!t || !m) { if (t) i.value = rtHHMM(t.da); return; }
    const da = +m[1] * 60 + +m[2];
    if (da === t.da) return;
    const sotto = rtTrova(rtSotto(), id);
    rtScrivi(id, { da: sotto && sotto.da === da ? undefined : da },
             rtNomeDi(t) + ' now at ' + rtHHMM(da));
    return;
  }

  if (i.dataset.rtnome) {
    const id = i.dataset.rtnome;
    const t = rtTrova(rtAdesso(), id);
    if (!t) return;
    const v = i.value.slice(0, 80).trim();
    const prima = rtNomeDi(t);
    if (!v) { i.value = prima; return; }        /* senza nome non si resta */
    if (v === prima) return;
    const sotto = rtTrova(rtSotto(), id);
    rtScrivi(id, { nome: sotto && rtNomeDi(sotto) === v ? undefined : v },
             'renamed "' + prima + '" to "' + v + '"');
    return;
  }

  if (i.dataset.rtsub) {
    const t = rtTrova(rtAdesso(), i.dataset.rtsub);
    if (!t) return;
    const n = +i.dataset.riga;
    const l = (t.sub || []).slice();
    if (!l[n]) return;
    const v = i.value.slice(0, 80).trim();
    if (!v || v === l[n].t) { i.value = l[n].t; return; }
    const prima = l[n].t;
    l[n] = { id: l[n].id, t: v };
    rtSetSub(t.id, l, rtNomeDi(t) + ': "' + prima + '" is now "' + v + '"');
  }
});

document.getElementById('rtLista').addEventListener('click', ev => {

  /* una riga in piu' */
  const p = ev.target.closest('button[data-rtpiu]');
  if (p) {
    const t = rtTrova(rtAdesso(), p.dataset.rtpiu);
    if (!t) return;
    const l = (t.sub || []).concat([{ id: rtNuovoId(), t: 'NEW LINE' }]);
    rtSetSub(t.id, l, rtNomeDi(t) + ': added a line');
    return;
  }

  /* una riga via. Due tocchi: la croce e' piccola e si sbaglia. */
  const x = ev.target.closest('button[data-rttogli]');
  if (x) {
    if (!x.classList.contains('conferma')) {
      x.classList.add('conferma');
      x.textContent = '?';
      setTimeout(() => { x.classList.remove('conferma'); x.textContent = '×'; }, 3000);
      return;
    }
    const q = x.dataset.rttogli.split('|');
    const t = rtTrova(rtAdesso(), q[0]);
    if (!t) return;
    const l = (t.sub || []).slice();
    const via = l.splice(+q[1], 1)[0];
    rtSetSub(t.id, l, rtNomeDi(t) + ': removed "' + (via ? via.t : '') + '"');
    return;
  }

  /* l'ordine */
  const m = ev.target.closest('button[data-rtsposta]');
  if (m) {
    const q = m.dataset.rtsposta.split('|');
    const t = rtTrova(rtAdesso(), q[0]);
    if (!t) return;
    const n = +q[1], d = +q[2], dove = n + d;
    const l = (t.sub || []).slice();
    if (dove < 0 || dove >= l.length) return;
    const tmp = l[n]; l[n] = l[dove]; l[dove] = tmp;
    rtSetSub(t.id, l, rtNomeDi(t) + ': moved "' + tmp.t + '"');
    return;
  }

  /* la tappa torna com'era sotto questo livello */
  const r = ev.target.closest('button[data-rtreset]');
  if (r) {
    if (r.textContent !== 'Sure?') { r.textContent = 'Sure?'; return; }
    const id = r.dataset.rtreset;
    const t = rtTrova(rtAdesso(), id);
    const liv = Object.assign({}, rtLivello());
    delete liv[id];
    rtSetLivello(liv);
    rtSalva((t ? rtNomeDi(t) : id) + ': back to the original');
  }
});

/* --------------------------------------------------------- la finestra --- */

const rtDlg = document.getElementById('routineEd');

function rtApri() {
  rtSel = { g: today().getDay() };
  rtDisegna();
  rtDlg.showModal();
}

document.getElementById('routineBtn').addEventListener('click', rtApri);
document.getElementById('rtChiudi').addEventListener('click', () => rtDlg.close());

/* il giorno scelto torna tutto com'era. Il registro resta: dice cosa era
   stato cambiato. */
document.getElementById('rtTutto').addEventListener('click', ev => {
  const b = ev.currentTarget;
  if (b.textContent !== 'Sure?') { b.textContent = 'Sure?'; return; }
  b.textContent = 'Restore this day';
  if (!Object.keys(rtLivello()).length) return;
  rtSetLivello({});
  rtSalva('the whole day went back to the original');
});

/* il bottone esiste solo se questo file c'e': senza, resta nascosto e non c'e'
   niente da premere a vuoto */
document.getElementById('routineBtn').hidden = false;

})();
