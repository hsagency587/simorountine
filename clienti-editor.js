'use strict';

/* =========================================================================
   L'editor dei clienti e delle mie attivita'.

   Sta in un file suo, come l'editor della routine: se qui si rompe qualcosa,
   l'app parte lo stesso coi clienti di fabbrica scritti in app.js.

   Due elenchi: My companies e Clients. Di ognuno si scrive il nome e la
   targhetta (il tipo di lavoro: Top3, Sito...), se ne aggiunge uno nuovo in
   fondo, e con la croce se ne toglie uno. L'id non si vede e non cambia mai:
   e' quello che resta scritto dentro le task.

   Togliere un cliente non toglie le sue task: tornano senza cliente. Gli
   eventi del calendario a cui era stato dato quel cliente tornano semplici
   eventi, come prima di darglielo.

   Quello che si scrive qui finisce in tstore.clienti e viaggia nel file delle
   task, col tasto Salva come tutto il resto.
   ========================================================================= */

(function () {

const SEZIONI = [
  { mia: true,  tit: 'My companies', nuovo: 'new company' },
  { mia: false, tit: 'Clients',      nuovo: 'new client' }
];

/* un id nuovo: non deve mai finire addosso a un cliente che c'era */
const clNuovoId = () => 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

/* Si scrive l'elenco com'e' adesso e si ridisegna tutto: menu', giornata e
   questa finestra. */
function clScrivi() {
  tstore.clienti = CLIENTI.map(c => Object.assign({}, c));
  touch();
  render();
  paintDrawer();
  clDisegna();
}

/* ------------------------------------------------------------ disegno --- */

function clDisegna() {
  const box = document.getElementById('clLista');
  if (!box) return;
  box.textContent = '';

  for (const sz of SEZIONI) {
    box.appendChild(el('h3', 'rtsez', sz.tit));
    const cassa = el('div', 'schapri rtblocco clblocco');

    const l = CLIENTI.filter(c => !!c.mia === sz.mia);
    if (!l.length) cassa.appendChild(el('p', 'vuoto', 'Nobody yet'));
    for (const c of l) {
      const row = el('div', 'wrow');
      const n = el('input', 'wcampo');
      n.type = 'text';
      n.maxLength = 60;
      n.dataset.clnome = c.id;
      n.value = c.nome;
      n.placeholder = 'name';
      n.setAttribute('aria-label', 'Name');
      row.appendChild(n);
      const t = el('input', 'wcampo');
      t.type = 'text';
      t.maxLength = 30;
      t.dataset.cltag = c.id;
      t.value = c.tag || '';
      t.placeholder = 'tag';
      t.setAttribute('aria-label', 'Tag');
      row.appendChild(t);
      const x = el('button', 'schx', '×');
      x.type = 'button';
      x.dataset.cltogli = c.id;
      x.setAttribute('aria-label', 'Delete ' + c.nome);
      row.appendChild(x);
      cassa.appendChild(row);
    }

    /* la riga per aggiungerne uno: si scrive il nome e si preme add */
    const row = el('div', 'wrow clnuovo');
    const n = el('input', 'wcampo');
    n.type = 'text';
    n.maxLength = 60;
    n.dataset.clnuovo = sz.mia ? 'mia' : 'cli';
    n.placeholder = sz.nuovo;
    n.setAttribute('aria-label', sz.nuovo);
    row.appendChild(n);
    const b = el('button', 'schbtn', 'add');
    b.type = 'button';
    b.dataset.cladd = sz.mia ? 'mia' : 'cli';
    row.appendChild(b);
    cassa.appendChild(row);

    box.appendChild(cassa);
  }
}

/* -------------------------------------------------------------- mosse --- */

const clTrova = id => CLIENTI.find(c => c.id === id) || null;

function clAggiungi(tipo) {
  const inp = document.querySelector('#clLista input[data-clnuovo="' + tipo + '"]');
  const v = inp ? inp.value.slice(0, 60).trim() : '';
  if (!v) { if (inp) inp.focus(); return; }
  const c = { id: clNuovoId(), nome: v };
  if (tipo === 'mia') c.mia = true;
  CLIENTI.push(c);
  clScrivi();
}

document.getElementById('clLista').addEventListener('change', ev => {
  const i = ev.target.closest('input.wcampo');
  if (!i) return;

  if (i.dataset.clnome) {
    const c = clTrova(i.dataset.clnome);
    if (!c) return;
    const v = i.value.slice(0, 60).trim();
    if (!v) { i.value = c.nome; return; }        /* senza nome non si resta */
    if (v === c.nome) return;
    c.nome = v;
    clScrivi();
    return;
  }

  if (i.dataset.cltag) {
    const c = clTrova(i.dataset.cltag);
    if (!c) return;
    const v = i.value.slice(0, 30).trim();
    if (v === (c.tag || '')) return;
    if (v) c.tag = v; else delete c.tag;
    clScrivi();
  }
});

/* invio nella riga nuova vale come add */
document.getElementById('clLista').addEventListener('keydown', ev => {
  const i = ev.target.closest('input[data-clnuovo]');
  if (!i || ev.key !== 'Enter') return;
  ev.preventDefault();
  clAggiungi(i.dataset.clnuovo);
});

document.getElementById('clLista').addEventListener('click', ev => {

  const a = ev.target.closest('button[data-cladd]');
  if (a) { clAggiungi(a.dataset.cladd); return; }

  /* uno via. Due tocchi: la croce e' piccola e si sbaglia. */
  const x = ev.target.closest('button[data-cltogli]');
  if (x) {
    if (!x.classList.contains('conferma')) {
      x.classList.add('conferma');
      x.textContent = '?';
      setTimeout(() => { x.classList.remove('conferma'); x.textContent = '×'; }, 3000);
      return;
    }
    const id = x.dataset.cltogli;
    const n = CLIENTI.findIndex(c => c.id === id);
    if (n < 0) return;
    CLIENTI.splice(n, 1);
    /* le sue task restano, senza cliente; i suoi eventi tornano del calendario */
    tstore.tasks = tstore.tasks.filter(t => !(t.evento && t.cliente === id));
    for (const t of tstore.tasks) if (t.cliente === id) t.cliente = null;
    clScrivi();
  }
});

/* --------------------------------------------------------- la finestra --- */

const clDlg = document.getElementById('clientiEd');

document.getElementById('clientiBtn').addEventListener('click', () => {
  clDisegna();
  clDlg.showModal();
});
document.getElementById('clChiudi').addEventListener('click', () => clDlg.close());

/* il bottone esiste solo se questo file c'e' */
document.getElementById('clientiBtn').hidden = false;

})();
