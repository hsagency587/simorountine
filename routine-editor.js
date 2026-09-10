'use strict';

/* =========================================================================
   L'editor della routine giornaliera.

   Sta in un file suo, staccato dal resto, perche' e' l'unica cosa che mette
   le mani sulla routine stessa: se qui si rompe qualcosa, l'app parte lo
   stesso e la giornata resta quella scritta nel codice.

   Cosa si cambia: il nome di una tappa e le sue sottotappe — quelle della
   routine del mattino, della sera, e quelle dentro pranzo e cena. Gli orari
   no: cambiano da un giorno all'altro (sabato, martedi', le sere di wing
   chun) e restano decisi dal codice.

   Ogni modifica lascia una riga nel registro, in fondo alla finestra: cosa e'
   cambiato e quando. Il registro non si cancella.

   Quello che si scrive qui finisce in tstore.routine, viaggia nel file delle
   task e si applica in applicaRoutine(), che sta in app.js.
   ========================================================================= */

(function () {

/* La routine di fabbrica, quella scritta nel codice: la sera standard, che ha
   tutte le tappe. Le altre sere cambiano gli orari, non le tappe. */
const rtBase = () => ROUTINE_GIORNO.concat(SERA_STD);

/* Il testo di una tappa e' "orario | NOME": l'orario resta al codice, il nome
   e' quello che si scrive qui. */
function rtOra(t) {
  const i = t.t.indexOf('|');
  return i >= 0 ? t.t.slice(0, i).trim() : '';
}

function rtNomeBase(t) {
  const i = t.t.indexOf('|');
  return i >= 0 ? t.t.slice(i + 1).trim() : t.t.trim();
}

/* Il posto dove sta scritto quello che si e' cambiato. Se manca, si crea
   vuoto: routine di fabbrica. */
function rtStore() {
  if (!tstore.routine || typeof tstore.routine !== 'object') tstore.routine = { tappe: {}, log: [] };
  if (!tstore.routine.tappe || typeof tstore.routine.tappe !== 'object') tstore.routine.tappe = {};
  if (!Array.isArray(tstore.routine.log)) tstore.routine.log = [];
  return tstore.routine;
}

const rtOv = id => rtStore().tappe[id] || null;

/* Il nome e le sottotappe come sono adesso: quello scritto a mano se c'e',
   altrimenti quello di fabbrica. */
function rtNome(t) {
  const o = rtOv(t.id);
  return (o && o.nome) || rtNomeBase(t);
}

function rtSub(t) {
  const o = rtOv(t.id);
  if (o && Array.isArray(o.sub)) return o.sub;
  return (t.sub || []).map(s => ({ id: s.id, t: s.t }));
}

const rtCambiata = t => {
  const o = rtOv(t.id);
  return !!(o && (o.nome || Array.isArray(o.sub)));
};

/* Una riga nel registro: quando, e cosa. Le ultime stanno in cima. */
function rtLog(testo) {
  const s = rtStore();
  s.log.unshift({ q: new Date().toISOString(), t: testo });
  s.log = s.log.slice(0, 200);
}

/* Si scrive la modifica, si segna nel registro, si ridisegna la giornata. */
function rtScrivi(id, patch, testoLog) {
  const s = rtStore();
  const o = Object.assign({}, s.tappe[id] || {}, patch);
  if (!o.nome && !Array.isArray(o.sub)) delete s.tappe[id];
  else s.tappe[id] = o;
  if (testoLog) rtLog(testoLog);
  touch();
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

function rtDisegna() {
  const box = document.getElementById('rtLista');
  if (!box) return;
  box.textContent = '';

  for (const t of rtBase()) {
    const cassa = el('div', 'schapri rtblocco');

    /* la testata: l'orario, che qui si legge e basta, e il ripristino */
    const tab = el('div', 'tab');
    const capo = el('div', 'tabr capo');
    capo.appendChild(el('div', 'tabc rtora', rtOra(t) || '—'));
    if (rtCambiata(t)) {
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
    nin.value = rtNome(t);
    nin.placeholder = 'name of the step';
    nrow.appendChild(nin);
    cassa.appendChild(nrow);

    /* le sottotappe: una riga ciascuna, con le frecce per l'ordine e la croce */
    const sub = rtSub(t);
    sub.forEach((s, i) => {
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

function rtTappa(id) { return rtBase().find(t => t.id === id) || null; }

function rtSetSub(id, lista, testoLog) {
  rtScrivi(id, { sub: lista.map(x => ({ id: x.id, t: x.t })) }, testoLog);
}

document.getElementById('rtLista').addEventListener('change', ev => {
  const i = ev.target.closest('input.wcampo');
  if (!i) return;

  if (i.dataset.rtnome) {
    const t = rtTappa(i.dataset.rtnome);
    if (!t) return;
    const v = i.value.slice(0, 80).trim();
    const prima = rtNome(t);
    if (!v) { i.value = prima; return; }        /* senza nome non si resta */
    if (v === prima) return;
    /* tornato al nome di fabbrica, la modifica sparisce invece di restare
       scritta uguale */
    rtScrivi(t.id, { nome: v === rtNomeBase(t) ? '' : v },
             'renamed "' + prima + '" to "' + v + '"');
    return;
  }

  if (i.dataset.rtsub) {
    const t = rtTappa(i.dataset.rtsub);
    if (!t) return;
    const n = +i.dataset.riga;
    const l = rtSub(t).slice();
    if (!l[n]) return;
    const v = i.value.slice(0, 80).trim();
    if (!v || v === l[n].t) { i.value = l[n].t; return; }
    const prima = l[n].t;
    l[n] = { id: l[n].id, t: v };
    rtSetSub(t.id, l, rtNome(t) + ': "' + prima + '" is now "' + v + '"');
  }
});

document.getElementById('rtLista').addEventListener('click', ev => {

  /* una riga in piu' */
  const p = ev.target.closest('button[data-rtpiu]');
  if (p) {
    const t = rtTappa(p.dataset.rtpiu);
    if (!t) return;
    const l = rtSub(t).concat([{ id: rtNuovoId(), t: 'NEW LINE' }]);
    rtSetSub(t.id, l, rtNome(t) + ': added a line');
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
    const t = rtTappa(q[0]);
    if (!t) return;
    const l = rtSub(t).slice();
    const via = l.splice(+q[1], 1)[0];
    rtSetSub(t.id, l, rtNome(t) + ': removed "' + (via ? via.t : '') + '"');
    return;
  }

  /* l'ordine */
  const m = ev.target.closest('button[data-rtsposta]');
  if (m) {
    const q = m.dataset.rtsposta.split('|');
    const t = rtTappa(q[0]);
    if (!t) return;
    const n = +q[1], d = +q[2], dove = n + d;
    const l = rtSub(t).slice();
    if (dove < 0 || dove >= l.length) return;
    const tmp = l[n]; l[n] = l[dove]; l[dove] = tmp;
    rtSetSub(t.id, l, rtNome(t) + ': moved "' + tmp.t + '"');
    return;
  }

  /* la tappa torna com'era di fabbrica */
  const r = ev.target.closest('button[data-rtreset]');
  if (r) {
    if (r.textContent !== 'Sure?') { r.textContent = 'Sure?'; return; }
    const t = rtTappa(r.dataset.rtreset);
    if (!t) return;
    const s = rtStore();
    delete s.tappe[t.id];
    rtLog(rtNomeBase(t) + ': back to the original');
    touch();
    render();
    rtDisegna();
  }
});

/* --------------------------------------------------------- la finestra --- */

const rtDlg = document.getElementById('routineEd');

function rtApri() {
  rtDisegna();
  rtDlg.showModal();
}

document.getElementById('routineBtn').addEventListener('click', rtApri);
document.getElementById('rtChiudi').addEventListener('click', () => rtDlg.close());

/* tutto com'era, di fabbrica. Il registro resta: dice cosa era stato cambiato. */
document.getElementById('rtTutto').addEventListener('click', ev => {
  const b = ev.currentTarget;
  if (b.textContent !== 'Sure?') { b.textContent = 'Sure?'; return; }
  b.textContent = 'Restore everything';
  const s = rtStore();
  if (!Object.keys(s.tappe).length) return;
  s.tappe = {};
  rtLog('the whole routine went back to the original');
  touch();
  render();
  rtDisegna();
});

/* il bottone esiste solo se questo file c'e': senza, resta nascosto e non c'e'
   niente da premere a vuoto */
document.getElementById('routineBtn').hidden = false;

})();
