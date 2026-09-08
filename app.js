'use strict';

/* =========================================================================
   G Work — vista in sola lettura su routine fissa + calendario G WORK.
   Nessuna dipendenza. Nessuna scrittura verso Google.
   ========================================================================= */

const CHECKS_KEY  = 'gwork-checks-v1';
const RECORDS_KEY = 'gwork-records-v1';
const DIARIO_KEY  = 'gwork-diario-v1';
const LEGACY_KEY  = 'hs-personal-routine-v1';

/* Il serbatoio delle task. La copia che comanda sta nel telefono; Salva la
   manda su GitHub in un commit solo, sul branch "task", via API con il token
   incollato in Impostazioni. Leggere funziona anche senza token: il repo e'
   pubblico. */
const TASKS_KEY    = 'gwork-tasks-v1';       /* { tasks, sha, dirty, known } */
const TOKEN_KEY    = 'gwork-token-v1';
/* La chiave con cui si aprono calendario e task, quando sono cifrati. La stessa
   parola sta nel secret DATA_KEY del repository: la usa il workflow per
   chiudere il calendario, questa la usa il telefono per aprirlo. Senza chiave
   l'app funziona come prima, in chiaro. */
const CHIAVE_KEY   = 'gwork-chiave-v1';
const ARCHIVIO_KEY = 'gwork-taskfatte-v1';   /* task fatte uscite dalla finestra */
const MANCATE_KEY  = 'gwork-taskmancate-v1'; /* task lasciate indietro, giorno per giorno */
const TASK_BRANCH  = 'task';
const TASK_API     = 'https://api.github.com/repos/hsagency587/simorountine/contents/tasks.json';
const RANKS        = ['A', 'B', 'C'];

/* I clienti su cui possono stare le task. L'id e' quello che resta scritto
   dentro le task gia' fatte: non si cambia mai. Il nome invece si corregge
   quando si vuole. Per aggiungere un cliente si aggiunge una riga qui. */
const CLIENTI = [
  { id: 'hs-agency',    nome: 'HS Agency',              mia: true },
  { id: 'longkai',      nome: 'Lòngkai — Sifu Diego' },
  { id: 'di-nucci',     nome: 'Gioielleria Di Nucci',   tag: 'Top3' },
  { id: 'manuela-lovo', nome: 'Manuela Lovo Fotografa', tag: 'Top3' },
  { id: 'arbogreen',    nome: 'Arbogreen Service',      tag: 'Sito' },
  { id: 'omnia',        nome: 'Omnia Ristrutturazioni', tag: 'Top3' },
  { id: 'bergamaschi',  nome: 'Bergamaschi Giardini',   tag: 'Top3' },
  { id: 'fisio-leone',  nome: 'Fisio Leone',            tag: 'Top3' },
  { id: 'osteria-anna', nome: 'Osteria Da Anna',        tag: 'Top3 + ADS' }
];
const clienteNome = id => {
  const c = CLIENTI.find(x => x.id === id);
  return c ? c.nome : '';
};

/* Il nome corto, per le righe strette: via quello che sta fra parentesi, che
   dice il tipo di lavoro e dentro una sessione non serve. */
const clienteCorto = id => clienteNome(id).replace(/\s*\(.*$/, '').trim();

/* i clienti aperti nel menu': restano aperti fra un'apertura e l'altra */
const CLIAPERTI_KEY = 'gwork-clientiaperti-v1';
const CLIROOT_KEY   = 'gwork-radiciaperte-v1';

/* Le due tendine del menu': i clienti da una parte, le attivita' mie
   dall'altra. Un cliente finisce nell'una o nell'altra a seconda di `mia`. */
const RADICI = [
  { k: 'mie',     nome: 'MY COMPANIES', mie: true,  oro: true },
  { k: 'clienti', nome: 'CLIENTS',      mie: false, oro: true }
];
/* Il calendario sta sul branch "dati" e non dentro il sito: si aggiorna con un
   commit, non ripubblicando Pages. La cache di raw dura cinque minuti, che e'
   la vera freschezza del file. */
const CAL_URL = 'https://raw.githubusercontent.com/hsagency587/simorountine/dati/calendar.json';

/* Il battito non lo scrive nessuno: si chiede a GitHub quando il ponte ha
   girato l'ultima volta. E' una lettura pubblica di metadati — niente commit,
   niente deploy, nessuno dei tetti in cui siamo gia' finiti. Sessanta letture
   l'ora per indirizzo: l'app ne fa una all'apertura e una ogni due minuti
   mentre resta aperta, quindi trenta scarse. */
const RUNS_URL = 'https://api.github.com/repos/hsagency587/simorountine/actions/workflows/'
               + 'calendar.yml/runs?per_page=5&exclude_pull_requests=true';
const BEAT_MS  = 2 * 60 * 1000;

/* Le soglie del battito: fino a 10 minuti senza un giro riuscito e' normale,
   oltre 10 il ponte accumula ritardo, oltre 30 e' fermo davvero. */
const LATE_MS     = 10 * 60 * 1000;
const DOWN_MS     = 30 * 60 * 1000;

/* La giornata ha due forme. Da martedi' a venerdi' la sera e' occupata dal
   wing chun; lunedi', sabato e domenica hanno la sera piu' corta. Cambiano gli
   orari, non le tappe: gli id restano gli stessi, cosi' le spunte non si
   perdono passando da un giorno all'altro. */
const isWingChun = k => {
  const d = new Date(k + 'T00:00:00').getDay();   /* 0 domenica ... 6 sabato */
  return d >= 2 && d <= 5;                        /* martedi' - venerdi' */
};

/* Un evento del calendario finisce nella tappa che copre la sua ora di inizio,
   qualunque tappa sia: una sessione, il pranzo, il wing chun. Le finestre si
   ricavano dal campo `da` delle tappe — l'ora d'inizio in minuti dalla
   mezzanotte — e ognuna arriva fino all'inizio di quella dopo. La prima parte
   da mezzanotte e l'ultima ci arriva, cosi' nessun evento resta fuori. */
/* La durata dei due workout e' fissa: mezz'ora il primo, un'ora il secondo.
   Non si legge dagli orari della routine, che nei giorni di wing chun darebbero
   due ore. */
const DUR_WORKOUT = ['30\u2032', '1h'];

/* Quanto dura una tappa: la distanza dall'orario di quella dopo. Serve ai pasti,
   che durano quanto lo spazio che hanno. */
function durataTappa(k, i) {
  const f = finestre(k)[i];
  if (!f) return '';
  const m = f[1] - f[0];
  if (m <= 0 || m >= 300) return '';        /* le tappe lunghe non hanno bisogno di dirlo */
  return m < 60 ? m + '\u2032'
       : m % 60 === 0 ? (m / 60) + 'h'
       : Math.floor(m / 60) + 'h' + pad(m % 60);
}

function finestre(k) {
  const r = routineFor(k);
  return r.map((t, i) => [
    i === 0 ? 0 : t.da,
    i === r.length - 1 ? 1440 : r[i + 1].da
  ]);
}

/* Le finestre protette: sonno, workout e pranzo, sera dopo cena, notte.
   Nessun rapporto con le fasce, nessun nome visibile. */
const PROTETTE_WC  = [[0, 450], [750, 840], [1095, 1230], [1320, 1440]];
const PROTETTE_STD = [[0, 450], [750, 840], [1125, 1230], [1320, 1440]];
/* il sabato il pranzo comincia dopo e la cena si sposta: le finestre lo seguono */
const PROTETTE_SAB = [[0, 450], [765, 840], [1140, 1245], [1320, 1440]];
const protetteOf = k => isSabato(k) ? PROTETTE_SAB : isWingChun(k) ? PROTETTE_WC : PROTETTE_STD;

/* La routine fissa, giorno per giorno. Il totale del giorno si calcola da qui,
   non e' una costante. La parte fino alle 17:15 e' uguale per tutti i giorni;
   cambia solo la sera. */
const ROUTINE_GIORNO = [
  { id: 'sveglia', da: 405, t: '6:45 | WAKE UP + MORNING ROUTINE', sub: [
    { id: 'sveglia-finestra', t: 'OPEN WINDOW + MAKE BED + GET DRESSED' },
    { id: 'sveglia-acqua',    t: 'WATER + FIREBLOOD + TEETH' },
    { id: 'sveglia-walk',     t: 'WALK 15 MIN' }
  ]},
  { id: 'gws1', da: 450, t: '7:30 | 1ST G WORK SESSION', gws: 0 },
  { id: 'snack-mattina', da: 600, t: '10:00 | SNACK + REC', pasto: 'Morning snack', sub: [
    { id: 'snack-sole', t: '10’ OF SUN' }
  ]},
  { id: 'gws2', da: 615, t: '10:15 | 2ND G WORK SESSION', gws: 1 },
  { id: 'workout-1', da: 750, t: '12:30 | 1ST WORKOUT', slot: 0 },
  { id: 'pranzo', da: 780, t: '13:00 | LUNCH + ROUTINE', pasto: 'Lunch', sub: [
    { id: 'pranzo-doccia',    t: 'SHOWER' },
    { id: 'pranzo-movimento', t: '10’ OF MOVEMENT' }
  ]},
  { id: 'gws3', da: 840, t: '14:00 | 3RD G WORK SESSION', gws: 2 },
  { id: 'snack-pomeriggio', da: 1020, t: '17:00 | SNACK + REC', pasto: 'Afternoon snack', sub: [
    { id: 'snack-pomeriggio-sole', t: '10’ OF SUN' }
  ]}
];

const SERA_WC = [
  { id: 'gws4', da: 1035, t: '17:15 | 4TH G WORK SESSION', gws: 3 },
  { id: 'prep-cena', da: 1095, t: '18:15 | DINNER PREP' },
  { id: 'workout-2', da: 1110, t: '18:30 | 2ND WORKOUT', slot: 1 },
  { id: 'cena', da: 1230, t: '20:30 | DINNER', pasto: 'Dinner' },
  { id: 'gws5', da: 1260, t: '21:00 | 5TH G WORK SESSION', gws: 4 },
  { id: 'serale', da: 1320, t: '22:00 | EVENING ROUTINE', sub: [
    { id: 'serale-target',   t: "TOMORROW'S G WORK SESSION TARGET" },
    { id: 'serale-voto',     t: '(MINIMUM) SCORE + ONE LINE ON THE DAY' },
    { id: 'serale-gambe',    t: 'LEGS UP THE WALL' },
    { id: 'serale-telefono', t: 'PHONE AWAY FROM BED' }
  ]}
];

const SERA_STD = [
  { id: 'gws4', da: 1035, t: '17:15 | 4TH G WORK SESSION', gws: 3 },
  { id: 'prep-cena', da: 1125, t: '18:45 | DINNER PREP' },
  { id: 'workout-2', da: 1140, t: '19:00 | 2ND WORKOUT', slot: 1 },
  { id: 'cena', da: 1200, t: '20:00 | DINNER', pasto: 'Dinner' },
  { id: 'gws5', da: 1230, t: '20:30 | 5TH G WORK SESSION', gws: 4 },
  { id: 'serale', da: 1320, t: '22:00 | EVENING ROUTINE', sub: [
    { id: 'serale-target',   t: "TOMORROW'S G WORK SESSION TARGET" },
    { id: 'serale-voto',     t: '(MINIMUM) SCORE + ONE LINE ON THE DAY' },
    { id: 'serale-gambe',    t: 'LEGS UP THE WALL' },
    { id: 'serale-telefono', t: 'PHONE AWAY FROM BED' }
  ]}
];

/* Il sabato la giornata si stringe in due punti: la sessione prima del primo
   workout finisce alle 12:45, e il workout dura un quarto d'ora invece di
   mezz'ora; la sera il secondo workout finisce un quarto d'ora piu' tardi, e
   quel quarto d'ora lo perde la sessione che viene dopo. */
const SABATO = {
  'workout-1': { da: 765,  t: '12:45 | 1ST WORKOUT', dur: '15\u2032' },
  'workout-2': { dur: '1h15' },
  'cena':      { da: 1215, t: '20:15 | DINNER' },
  'gws5':      { da: 1245, t: '20:45 | 5TH G WORK SESSION' }
};
const isSabato = k => new Date(k + 'T00:00:00').getDay() === 6;

const routineFor = k => {
  const base = ROUTINE_GIORNO.concat(isWingChun(k) ? SERA_WC : SERA_STD);
  if (!isSabato(k)) return base;
  return base.map(t => SABATO[t.id] ? Object.assign({}, t, SABATO[t.id]) : t);
};

/* L'elenco di tutti gli id esistenti, per le ricerche che non dipendono dal
   giorno. Le due sere condividono gli id: cambia solo il testo. */
const ALL_TAPPE = ROUTINE_GIORNO.concat(SERA_WC);

/* La riga che chiude la giornata: spuntarla chiede il voto e il commento.
   Prima stava sulla tappa intera: i giorni chiusi allora vanno letti lo stesso. */
const CLOSE_ID  = 'serale-voto';
const CLOSE_OLD = 'serale';

/* ---------------------------------------------------------------- date --- */

const pad = n => String(n).padStart(2, '0');
const dayKey = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());

function shift(d, n) {
  const c = new Date(d.getTime());
  c.setDate(c.getDate() + n);
  return c;
}

function today() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

const fmtDate = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtTime = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });

/* Quanti giorni mancano da oggi a una data: serve alle scritte "in N days". */
const fraQuanti = k =>
  Math.round((new Date(k + 'T00:00:00') - today()) / 86400000);

/* La finestra si calcola in locale, non si legge dal file: se il ponte si
   ferma, oggi resta comunque spuntabile. Va da ieri a fra sette giorni: ieri
   per chiudere la giornata appena passata, sette avanti per vedere e spuntare
   quello che arriva. */
function windowKeys() {
  const t = today();
  return [-1, 0, 1, 2, 3, 4, 5, 6, 7].map(n => dayKey(shift(t, n)));
}

/* Unica regola per le spunte e per il registro: dentro la finestra si scrive,
   fuori si guarda e basta. Cosi' schermo e registro non possono divergere. */
const isEditable = k => windowKeys().indexOf(k) >= 0;

/* ------------------------------------------------------- archiviazione --- */

function readStore(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const v = JSON.parse(raw);
    return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
  } catch (e) {
    return {};                    /* JSON corrotto = stato vuoto, non app rotta */
  }
}

function writeStore(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch (e) {
    /* quota piena o modalita' privata: le spunte restano solo in memoria */
  }
}

let checks  = readStore(CHECKS_KEY);
let records = readStore(RECORDS_KEY);
let diario  = readStore(DIARIO_KEY);

const dayChecks = k => (checks[k] && typeof checks[k] === 'object') ? checks[k] : {};

/* Un giorno e' chiuso quando la tappa di chiusura e' spuntata e il voto c'e'.
   Togliendo la spunta il giorno si riapre, ma voto e commento restano scritti:
   tornano nel pop-up se la giornata si richiude. */
const isClosed = k => { const c = dayChecks(k); return !!((c[CLOSE_ID] || c[CLOSE_OLD]) && diario[k]); };

function setDiario(k, voto, commento) {
  if (!isEditable(k)) return;
  diario[k] = { voto: voto, commento: commento };
  writeStore(DIARIO_KEY, diario);
}

function setCheck(k, id, on) {
  if (!isEditable(k)) return;
  if (!checks[k] || typeof checks[k] !== 'object') checks[k] = {};
  if (on) checks[k][id] = 1;
  else delete checks[k][id];      /* esistono solo le spunte attive */
  if (Object.keys(checks[k]).length === 0) delete checks[k];
  writeStore(CHECKS_KEY, checks);
}

/* ------------------------------------------------------------ eventi ----- */

let cal = null;                   /* contenuto di calendar.json, oppure null */
let calAt  = 0;                   /* quando e' arrivata l'ultima lettura buona (ms) */
let calErr = false;               /* l'ultima lettura e' fallita: si tiene la copia buona */
let loaded = false;               /* true dopo il primo tentativo di lettura */

const isCovered = k => !!(cal && cal.days && Object.prototype.hasOwnProperty.call(cal.days, k));

const minutesOf = hhmm => (+hhmm.slice(0, 2)) * 60 + (+hhmm.slice(3, 5));

/* Gli orari nel JSON sono gia' in ora di Roma: si leggono dalla stringa, cosi'
   il risultato non dipende dal fuso orario del telefono. */
function prepEvent(ev, k) {
  const start = String(ev.start || '');
  const sTxt = start.slice(11, 16);
  const sMin = minutesOf(sTxt);

  let eMin = sMin, eTxt = sTxt;
  if (ev.end) {
    if (String(ev.end).slice(0, 10) === start.slice(0, 10)) {
      eTxt = String(ev.end).slice(11, 16);
      eMin = minutesOf(eTxt);
    } else {
      eMin = 1440;                /* finisce oltre la mezzanotte, o dura tutto il giorno */
      eTxt = '24:00';
    }
  }

  const span = Math.max(eMin, sMin + 1);
  const fin = finestre(k);
  const fascia = fin.findIndex(f => sMin >= f[0] && sMin < f[1]);
  /* le tappe che l'evento attraversa: una riunione dalle 18:30 alle 21 tocca il
     workout, la cena e la quinta sessione, e va vista in tutte e tre */
  const fasce = fin.reduce((a, f, i) => (sMin < f[1] && span > f[0] ? a.concat(i) : a), []);

  return {
    id:     String(ev.id || (start + '|' + ev.title)),
    title:  String(ev.title || '(no title)'),
    desc:   String(ev.description || '').trim(),
    txt:    sTxt + '–' + eTxt,
    alarm:  protetteOf(k).some(w => sMin < w[1] && span > w[0]),
    fascia: fascia < 0 ? 0 : fascia,
    fasce:  fasce.length ? fasce : [fascia < 0 ? 0 : fascia]
  };
}

/* Le cinque fasce coprono le 24 ore: nessun evento puo' restare fuori. */
/* L'evento vivo dietro una riga 'ev:...', se il calendario copre ancora quel
   giorno. Null se il giorno non e' coperto o se l'evento non c'e' piu'. */
function eventoDi(x) {
  if (!x.evento || !isCovered(x.giorno)) return null;
  const raw = cal.days[x.giorno];
  if (!Array.isArray(raw)) return null;
  return raw.map(v => prepEvent(v, x.giorno)).find(v => v.id === x.evento) || null;
}

/* Le chiavi con cui un evento si spunta nella giornata: una per ogni tappa che
   attraversa. Con una tappa sola e' l'id dell'evento, com'e' sempre stato. */
function chiaviEvento(x) {
  const e = eventoDi(x);
  if (!e || e.fasce.length < 2) return [x.evento];
  return e.fasce.map(f => x.evento + '@' + f);
}

/* Il titolo salvato e' una copia presa quando si e' dato il cliente. Finche' il
   calendario copre quel giorno si rilegge da li': un evento rinominato su
   Google cambia nome anche nel menu'. */
function titoloEvento(x) {
  const e = x.evento ? eventoDi(x) : null;
  return e && e.title ? e.title : x.nome;
}

function groupEvents(k) {
  const out = routineFor(k).map(() => []);
  if (!isCovered(k)) return out;
  const list = Array.isArray(cal.days[k]) ? cal.days[k] : [];
  for (const raw of list) {
    const e = prepEvent(raw, k);
    const n = e.fasce.length;
    /* un pezzo per tappa. Con una tappa sola la chiave resta l'id dell'evento,
       com'e' sempre stata: le spunte gia' scritte continuano a valere. */
    e.fasce.forEach((f, j) => {
      out[f].push(Object.assign({}, e, {
        evId:   e.id,
        id:     n > 1 ? e.id + '@' + f : e.id,
        pezzi:  n,
        ultimo: j === n - 1
      }));
    });
  }
  return out;
}

/* Le task si schedulano ancora per sessione, non per ora: qui il numero della
   sessione diventa la posizione della sua tappa nell'elenco del giorno. */
function postoDellaSessione(k) {
  const posto = {};
  routineFor(k).forEach((t, i) => { if (t.gws != null) posto[t.gws] = i; });
  return posto;
}

/* Il contrario: dalla posizione nell'elenco al numero della sessione. */
function sessioneDelPosto(k) {
  const s = {};
  routineFor(k).forEach((t, i) => { if (t.gws != null) s[i] = t.gws; });
  return s;
}

/* Le sessioni di una task, sempre come elenco: nel file puo' esserci un numero
   solo, com'era prima, o l'elenco di adesso. */
const gwsDi = v => v == null ? [] : Array.isArray(v) ? v : [v];

/* Una task puo' stare su piu' sessioni, e in ognuna ha la sua spunta: la
   chiave se la porta dentro. Da qui passa ogni spunta di task, cosi' la
   giornata e il menu' non possono guardare due caselle diverse. */
const chiaveTask = (x, g) => x.id + '@' + g;

/* Fatta vuol dire fatta in tutte le sessioni su cui sta. */
const taskFatta = (x, c) => {
  const l = gwsDi(x.gws);
  return l.length > 0 && l.every(g => c[chiaveTask(x, g)]);
};

function dayTasks(k) {
  const out = routineFor(k).map(() => []);
  const posto = postoDellaSessione(k);
  for (const x of tstore.tasks) {
    if (x.giorno !== k) continue;
    for (const g of gwsDi(x.gws)) if (posto[g] != null) out[posto[g]].push(x);
  }
  for (const l of out) l.sort(byRank);
  return out;
}

/* Le figlie di una sessione: gli eventi nell'ordine del calendario, poi le
   task. Una task e' un evento senza orario e senza sirena: ha un id, si spunta,
   conta uno. Tutto il conteggio passa di qui, cosi' non puo' divergere. */
function childrenOf(k) {
  const g = groupEvents(k), t = dayTasks(k);
  const m = mancate[k] || [];
  /* le task lasciate indietro restano figlie del giorno, non fatte, con un id
     che nessuno spuntera' mai: cosi' il conteggio di ieri non cambia */
  const sess = sessioneDelPosto(k);
  return g.map((evs, i) => evs
    .concat(t[i].map(x => ({ id: chiaveTask(x, sess[i]), task: x })))
    .concat(m.filter(x => gwsDi(x.gws).indexOf(sess[i]) >= 0)
             .map((x, n) => ({ id: 'mancata:' + k + ':' + i + ':' + n, mancata: x }))));
}

/* ---------------------------------------------------------- conteggio --- */

/* Le figlie di una tappa: sottotappe, alternative ed eventi del calendario. */
function childState(t, c, evs) {
  let total = 0, done = 0;
  if (t.sub)    for (const s of t.sub) { total++; if (c[s.id]) done++; }
  if (t.choice) { total++; if (t.choice.some(o => c[o.id])) done++; }
  if (evs)      for (const e of evs) { total++; if (c[e.id]) done++; }
  return { total, done };
}

/* Spuntata la tappa, il blocco vale completo: le figlie rimaste indietro non
   pesano piu' sul totale della giornata. */
function tappaState(t, c, evs) {
  const ch = childState(t, c, evs);
  const total = ch.total + 1;
  return { total, done: c[t.id] ? total : ch.done };
}

function tally(k) {
  const c = dayChecks(k);
  const g = childrenOf(k);
  let total = 0, done = 0;
  routineFor(k).forEach((t, i) => {
    const st = tappaState(t, c, g[i]);
    total += st.total;
    done  += st.done;
  });
  return { total, done };
}

/* Il record si riscrive per i giorni della finestra, gli stessi in cui si
   puo' spuntare. Fuori resta congelato. Se calendar.json non copre un giorno della
   finestra i suoi eventi valgono zero: meglio un totale parziale che un buco nella
   serie quando il ponte si ferma. */
function refreshRecords() {
  if (!loaded) return;            /* prima della lettura non conosco ancora gli eventi */
  for (const k of windowKeys()) {
    const r = tally(k);
    records[k] = {
      fatte:       r.done,
      totale:      r.total,
      percentuale: r.total ? Math.round(r.done / r.total * 100) : 0,
      completo:    r.total > 0 && r.done === r.total
    };
  }
  writeStore(RECORDS_KEY, records);
}

/* La serie come stava quel giorno: zero se il giorno stesso non e' completo. */
function streakAt(k) {
  const complete = x => !!(records[x] && records[x].completo);
  let d = new Date(k + 'T00:00:00'), n = 0;
  while (complete(dayKey(d))) { n++; d = shift(d, -1); }
  return n;
}

function streak() {
  const t = today();
  /* oggi non ancora chiuso non azzera la serie: si guarda a ieri */
  return streakAt(dayKey(t)) || streakAt(dayKey(shift(t, -1)));
}

/* ------------------------------------------------------------ storico --- */

const MESI = ['January', 'February', 'March', 'April', 'May', 'June',
              'July', 'August', 'September', 'October', 'November', 'December'];

const monthKey  = k => k.slice(0, 7);
const monthName = m => MESI[+m.slice(5, 7) - 1] + ' ' + m.slice(0, 4);

const fmtLong = new Intl.DateTimeFormat('en-GB',
  { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

/* Un giorno entra nello storico se ha lasciato una traccia: almeno una spunta,
   oppure una chiusura. I giorni vuoti non si scrivono. */
const hasTrace = k => !!((records[k] && records[k].fatte > 0) || diario[k]
                         || (archivio[k] && archivio[k].length)
                         || (mancate[k] && mancate[k].length));

function storicoDays(m) {
  const set = {};
  for (const k of Object.keys(records))  if (monthKey(k) === m && hasTrace(k)) set[k] = 1;
  for (const k of Object.keys(diario))   if (monthKey(k) === m) set[k] = 1;
  for (const k of Object.keys(archivio)) if (monthKey(k) === m) set[k] = 1;
  for (const k of Object.keys(mancate))  if (monthKey(k) === m) set[k] = 1;
  return Object.keys(set).sort();
}

function storicoMonths() {
  const set = {};
  for (const k of Object.keys(records))  if (hasTrace(k)) set[monthKey(k)] = 1;
  for (const k of Object.keys(diario))   set[monthKey(k)] = 1;
  for (const k of Object.keys(archivio)) set[monthKey(k)] = 1;
  for (const k of Object.keys(mancate))  set[monthKey(k)] = 1;
  return Object.keys(set).sort().reverse();   /* il mese in corso per primo */
}

/* Le task fatte in un giorno: quelle gia' in archivio piu' quelle ancora nel
   file, se il giorno e' in finestra e la spunta c'e'. */
function doneTasks(k) {
  const c = dayChecks(k);
  const vive = tstore.tasks.filter(x => x.giorno === k && taskFatta(x, c))
                           .map(x => ({ nome: x.nome, rank: x.rank, gws: x.gws }));
  return (archivio[k] || []).concat(vive).sort(byRank);
}

/* Un mese, un file. I giorni uno sotto l'altro invece che in tabella: cosi' si
   legge ordinato sul telefono anche senza niente che interpreti il Markdown. */
function monthMarkdown(m) {
  const days   = storicoDays(m);
  const chiuse = days.filter(isClosed);

  let voti = 0, pct = 0;
  for (const k of chiuse) voti += diario[k].voto;
  for (const k of days)   pct  += (records[k] ? records[k].percentuale : 0);

  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const out = ['# G Work history — ' + monthName(m), ''];

  out.push('Days with activity: ' + days.length
    + ' · days closed: ' + chiuse.length
    + (chiuse.length ? ' · average score: ' + (voti / chiuse.length).toFixed(1) : '')
    + (days.length   ? ' · average completion: ' + Math.round(pct / days.length) + '%' : ''));

  for (const k of days) {
    const r = records[k] || { fatte: 0, totale: 0, percentuale: 0 };
    const d = isClosed(k) ? diario[k] : null;

    out.push('', '---', '');
    out.push('## ' + cap(fmtLong.format(new Date(k + 'T00:00:00'))));
    out.push('');
    out.push((d ? 'Score ' + d.voto.toFixed(1) : 'Day not closed')
      + ' · ' + r.percentuale + '% (' + r.fatte + ' of ' + r.totale + ')'
      + ' · streak ' + streakAt(k));

    const c = d && String(d.commento || '').trim();
    if (c) out.push('', c);

    const fatte = doneTasks(k);
    if (fatte.length) {
      out.push('', 'Tasks done: ' + fatte.map(x => '[' + x.rank + '] ' + x.nome).join(' · '));
    }
    const lasciate = (mancate[k] || []).slice().sort(byRank);
    if (lasciate.length) {
      out.push('', 'Tasks left behind: ' + lasciate.map(x => '[' + x.rank + '] ' + x.nome).join(' · '));
    }
  }

  return out.join('\n') + '\n';
}

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type: type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ------------------------------------------------------------- pagina --- */

const $ = id => document.getElementById(id);

let view = today();
let viewKey = dayKey(view);
let rows = [];                    /* [{ t, el, evs }] per gli aggiornamenti mirati */

function el(tag, cls, txt) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (txt != null) n.textContent = txt;
  return n;
}

function checkRow(id, label, cls, on, choiceOf) {
  const l = el('label', 'row' + (cls ? ' ' + cls : '') + (on ? ' on' : ''));
  const i = el('input');
  i.type = 'checkbox';
  i.checked = on;
  i.dataset.key = id;
  if (choiceOf) i.dataset.choice = choiceOf;
  l.appendChild(i);
  l.appendChild(el('span', 'ttl', label));
  return l;
}

function eventNode(e, on) {
  const li = el('li', 'ev' + (e.alarm ? ' alarm' : ''));
  const bar = el('div', 'evrow');

  const l = el('label', 'row' + (on ? ' on' : ''));
  const i = el('input');
  i.type = 'checkbox';
  i.checked = on;
  i.dataset.key = e.id;           /* la chiave e' l'id dell'evento, mai il titolo */
  if (e.pezzi > 1) {
    /* pezzo di un evento lungo: si spunta da solo, e l'ultimo puo' chiudere
       tutta la serie in un colpo */
    i.dataset.serie = e.evId;
    if (e.ultimo) i.dataset.ultimo = '1';
  }
  l.appendChild(i);
  l.appendChild(el('span', 'time', e.txt));
  /* se all'evento e' stato dato un cliente, il nome sta davanti al titolo,
     come nelle task dentro la sessione */
  const rec = findTask('ev:' + (e.evId || e.id));
  const cli = rec ? clienteCorto(rec.cliente) : '';
  if (cli) {
    l.appendChild(el('span', 'tcli', cli));
    l.appendChild(el('span', 'tsep', '|'));
  }
  l.appendChild(el('span', 'ttl', e.title));
  bar.appendChild(l);

  if (e.desc) {
    const b = el('button', 'toggle', '▼');
    b.type = 'button';
    b.dataset.role = 'desc';
    b.setAttribute('aria-expanded', 'false');
    b.setAttribute('aria-label', 'Show the description');
    bar.appendChild(b);
  }

  /* i tre puntini: all'evento si puo' dare un cliente, e basta */
  if (isEditable(viewKey)) {
    const m = el('button', 'more', '⋯');
    m.type = 'button';
    m.dataset.evento = e.evId || e.id;
    m.setAttribute('aria-label', 'Assign a client');
    bar.appendChild(m);
  }

  li.appendChild(bar);

  if (e.desc) {
    const p = el('p', 'desc', e.desc);   /* textContent: il testo di Google non e' HTML */
    p.hidden = true;
    li.appendChild(p);
  }
  return li;
}

/* Una task dentro la sessione: come un evento, con la lettera del rank al
   posto dell'orario e i tre puntini che aprono l'editor. Tutta la riga spunta. */
function taskNode(x, on, key) {
  const li = el('li', 'ev task');
  const bar = el('div', 'evrow');

  const l = el('label', 'row' + (on ? ' on' : ''));
  const i = el('input');
  i.type = 'checkbox';
  i.checked = on;
  i.dataset.key = key;
  l.appendChild(i);
  /* niente rank qui: A, B e C dicono quanto una cosa puo' aspettare, e una
     task messa su un giorno non aspetta piu'. Servono nel menu', dove si
     decide cosa fare prima. */
  /* dentro la sessione il cliente sta davanti al titolo: qui non c'e' il
     gruppo del menu' a dire di chi e' la task */
  const cli = clienteCorto(x.cliente);
  if (cli) {
    /* la barra sta fuori dal nome: cosi' quando il nome e' lungo e viene
       tagliato, la barra resta comunque visibile e si capisce dove finisce
       il cliente e dove comincia il titolo */
    l.appendChild(el('span', 'tcli', cli));
    l.appendChild(el('span', 'tsep', '|'));
  }
  l.appendChild(el('span', 'ttl', x.nome));
  bar.appendChild(l);

  if (x.desc) {
    const b = el('button', 'toggle', '▼');
    b.type = 'button';
    b.dataset.role = 'desc';
    b.setAttribute('aria-expanded', 'false');
    b.setAttribute('aria-label', 'Show the description');
    bar.appendChild(b);
  }

  const m = el('button', 'more', '⋯');
  m.type = 'button';
  m.dataset.task = x.id;
  m.setAttribute('aria-label', 'Edit the task');
  bar.appendChild(m);

  li.appendChild(bar);

  if (x.desc) {
    /* aperta, la descrizione porta sopra il titolo intero: nella riga sta
       stretto e viene tagliato, qui c'e' posto */
    const p = el('p', 'desc');
    p.appendChild(el('span', 'desctit', x.nome));
    p.appendChild(document.createTextNode(x.desc));
    p.hidden = true;
    li.appendChild(p);
  }
  return li;
}

/* Una task lasciata indietro: a mezzanotte e' tornata nel serbatoio, ma il
   giorno la ricorda com'era, non fatta. Si guarda e basta: la casella e'
   spenta per sempre, e lockRow la lascia stare. */
function ghostNode(x, id) {
  const li = el('li', 'ev task mancata');
  const bar = el('div', 'evrow');
  const l = el('label', 'row');
  const i = el('input');
  i.type = 'checkbox';
  i.disabled = true;
  i.dataset.key = id;
  i.dataset.mancata = '1';
  l.appendChild(i);
  l.appendChild(el('span', 'ttl', x.nome));
  l.appendChild(el('span', 'twhen', 'in the pool'));
  bar.appendChild(l);
  li.appendChild(bar);
  return li;
}

let renderedDay = null;           /* il giorno "oggi" dell'ultimo disegno */

function render() {
  /* La mezzanotte si scopre qui, da chiunque ridisegni: se si stava guardando
     oggi si passa al nuovo oggi. E' sicuro anche sotto un dialogo aperto: il
     pop-up di chiusura ricorda il suo giorno, l'editor e la pesca guardano
     l'oggi vero al momento della conferma. */
  const t = dayKey(today());
  if (renderedDay && t !== renderedDay && viewKey === renderedDay) {
    view = today();
    viewKey = t;
  }
  renderedDay = t;
  tidyTasks();                    /* mezzanotte: chi torna nel serbatoio, chi va in archivio */
  const c = dayChecks(viewKey);
  const g = childrenOf(viewKey);
  const covered = isCovered(viewKey);
  const list = $('list');

  list.textContent = '';
  rows = [];

  routineFor(viewKey).forEach((t, i) => {
    const evs = g[i];
    const li = el('li', 'tappa');

    if (t.gws != null) {
      /* il + sta fuori dalla label: toccarlo non deve spuntare la sessione */
      const head = el('div', 'head');
      head.appendChild(checkRow(t.id, t.t, 'row-t', !!c[t.id]));
      if (canSchedule(viewKey)) {
        const b = el('button', 'plus', '+');
        b.type = 'button';
        b.dataset.gws = t.gws;
        b.setAttribute('aria-label', 'Add a task to the session');
        head.appendChild(b);
      }
      li.appendChild(head);
    } else {
      const riga = checkRow(t.id, t.t, 'row-t', !!c[t.id]);
      /* solo sui workout: dice quanto dura lo slot, piccolo e grigio in fondo */
      if (t.slot != null) riga.appendChild(el('span', 'dur', t.dur || DUR_WORKOUT[t.slot]));
      li.appendChild(riga);
    }

    if (t.choice) {
      const box = el('div', 'choice');
      for (const o of t.choice) box.appendChild(checkRow(o.id, o.t, null, !!c[o.id], t.id));
      li.appendChild(box);
    }

    /* la nota: dice cosa si fa in quella tappa, non e' una cosa da spuntare.
       Sta nel suo riquadro come le sottotappe, ma non conta nel totale. */
    const nota = t.nota
              || (t.slot != null && mostra.w ? workoutDi(viewKey, t.slot) : '')
              || (t.pasto && mostra.d ? (tstore.dieta[t.id] || '') : '');
    if (nota) {
      const ul = el('ul', 'sub info');
      const nli = el('li');
      const r = el('div', 'row');
      r.appendChild(el('span', 'pallino'));
      r.appendChild(el('span', 'ttl', nota));
      nli.appendChild(r);
      ul.appendChild(nli);
      li.appendChild(ul);
    }

    if (t.sub) {
      const ul = el('ul', 'sub');
      for (const s of t.sub) {
        const sli = el('li');
        sli.appendChild(checkRow(s.id, s.t, null, !!c[s.id]));
        ul.appendChild(sli);
      }
      li.appendChild(ul);
    }

    {
      /* prima del primo caricamento non si annuncia ancora niente; l'avviso sta
         solo sulle sessioni, dove il calendario e' la cosa che ci si aspetta */
      if (t.gws != null && !covered && loaded) li.appendChild(el('p', 'nocov', 'Events not covered for this date'));
      if (evs.length) {
        const ul = el('ul', 'evs');
        for (const e of evs) {
          ul.appendChild(e.mancata ? ghostNode(e.mancata, e.id)
                       : e.task    ? taskNode(e.task, !!c[e.id], e.id)
                       :             eventNode(e, !!c[e.id]));
        }
        li.appendChild(ul);
      }
    }

    list.appendChild(li);
    rows.push({ t: t, el: li, evs: evs });
  });

  /* fuori dalla finestra si consulta soltanto */
  const readOnly = !isEditable(viewKey);
  list.classList.toggle('ro', readOnly);
  if (readOnly) {
    list.querySelectorAll('input[type=checkbox]').forEach(i => { i.disabled = true; });
  }

  paintDate();
  syncDerived();          /* accende o spegne anche la sirena */
}

function paintDate() {
  $('dateMain').textContent = fmtDate.format(view);
  const t0 = today();
  const rel = $('dateRel');
  const readOnly = !isEditable(viewKey);
  rel.classList.toggle('ro', readOnly);
  rel.textContent = readOnly                     ? 'read only'
            : viewKey === dayKey(t0)             ? 'today'
            : viewKey === dayKey(shift(t0, -1))  ? 'yesterday'
            : viewKey === dayKey(shift(t0,  1))  ? 'tomorrow'
            :                                      'in ' + fraQuanti(viewKey) + ' days';
}

/* La sirena gira finche' resta almeno un evento in finestra protetta da spuntare.
   Spuntati tutti, sparisce. Chiusa la tappa non suona piu': quegli eventi ormai
   sono congelati e non si possono piu' spuntare. Il margine rosso invece resta:
   dice dov'era il conflitto. */
function paintSiren(c) {
  const any = rows.some(r => r.evs && !c[r.t.id] && r.evs.some(e => e.alarm && !c[e.id]));
  $('siren').hidden = !any;
  $('top').classList.toggle('has-siren', any);
}

/* Tappa spuntata: resta segnata come chiusa (il + della sessione sparisce),
   ma le figlie restano spuntabili. Si blocca solo fuori dalla finestra dei
   la finestra, dove tutto e' in sola lettura. */
function lockRow(r, closed, ro) {
  r.el.classList.toggle('closed', closed);
  r.el.querySelectorAll('input[data-key]').forEach(i => {
    if (i.dataset.key !== r.t.id && !i.dataset.mancata) i.disabled = ro;
  });
}

function syncDerived() {
  const c = dayChecks(viewKey);
  const ro = !isEditable(viewKey);
  let total = 0, done = 0, active = null;

  for (const r of rows) {
    const st = tappaState(r.t, c, r.evs);
    total += st.total;
    done  += st.done;
    const full = !!c[r.t.id];        /* la tappa spuntata e' chiusa, comunque stiano le figlie */
    lockRow(r, full, ro);
    r.el.classList.toggle('done', full);
    r.el.classList.remove('active');
    if (!active && !full) active = r;
  }
  if (active) active.el.classList.add('active');

  paintSiren(c);

  const pct = total ? Math.round(done / total * 100) : 0;
  $('pct').textContent = pct + '%';
  $('progFill').style.width = pct + '%';
  $('act').textContent = active ? active.t.t : 'day complete';

  refreshRecords();
  paintMesi();

  const n = streak();
  const s = $('streak');
  s.textContent = 'streak ' + n;
  s.classList.toggle('hot', n > 0);
}

/* firma dell'elenco: non si ridisegna a ogni spunta. Parte da null perche' la
   firma dell'elenco vuoto e' la stringa vuota, e il primo giro deve passare. */
let mesiSig = null;

function paintMesi() {
  const ms  = storicoMonths();
  const sig = ms.join(',');
  if (sig === mesiSig) return;
  mesiSig = sig;

  const sel = $('mese');
  const cur = sel.value;
  sel.textContent = '';
  for (const m of ms) {
    const o = el('option', null, monthName(m));
    o.value = m;
    sel.appendChild(o);
  }
  if (!ms.length) sel.appendChild(el('option', null, 'no history'));
  if (ms.indexOf(cur) >= 0) sel.value = cur;   /* il mese scelto non salta via */

  sel.disabled = !ms.length;
  $('scarica').disabled = !ms.length;
}

/* Solo la durata, senza "fa": la frase intorno cambia da un caso all'altro. */
function durata(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 60) return m + ' min';
  const h = Math.floor(m / 60);
  if (h < 24) return h + ' h';
  return Math.floor(h / 24) + ' d';
}

/* Il battito: l'ultimo giro riuscito, l'esito dell'ultimo giro finito e l'ora
   dell'ultimo giro partito, qualunque fine abbia fatto. Bastano questi tre per
   distinguere "il ponte e' vivo" da "gira ma fallisce" da "non parte piu'". */
let beat   = null;
let beatOk = false;               /* l'ultima interrogazione e' riuscita */
let beatAuth  = true;             /* col token si usa la quota personale (5000/ora) */
let beatQuota = 0;                /* quota anonima esaurita: fino a quando (ms) */
let beatSkew  = 0;                /* ora del server meno ora del telefono (ms): il giudice e' il server */

/* L'ora vera la dice il server del sito: un telefono con l'orologio sbagliato
   non deve vedere in ritardo un ponte sano. L'API di GitHub non espone la sua
   Date al browser, la stessa origine si': un file piccolo, senza cache. */
async function leggiOra() {
  try {
    const r = await fetch('manifest.webmanifest', { cache: 'no-store' });
    const d = new Date(r.headers.get('date') || '');
    if (!isNaN(d.getTime())) beatSkew = d.getTime() - Date.now();
  } catch (e) { /* si resta con l'ora del telefono */ }
}

async function loadBeat() {
  await leggiOra();
  if (beatQuota && Date.now() < beatQuota) { paintFresh(); return; }
  beatQuota = 0;
  try {
    let r = await fetch(RUNS_URL, { cache: 'no-store', headers: beatAuth && token ? ghHeaders() : {} });
    /* un fine-grained token senza il permesso Actions puo' rispondere 403
       anche su un repo pubblico: si riprova anonimi e si resta anonimi */
    if ((r.status === 401 || r.status === 403) && beatAuth && token) {
      beatAuth = false;
      r = await fetch(RUNS_URL, { cache: 'no-store' });
    }
    /* la quota anonima e' per indirizzo, e sul 5G l'indirizzo e' condiviso:
       finita, si aspetta l'ora del reset invece di gridare al lupo */
    if ((r.status === 403 || r.status === 429) && r.headers.get('x-ratelimit-remaining') === '0') {
      const reset = (+r.headers.get('x-ratelimit-reset') || 0) * 1000;
      beatQuota = reset > Date.now() ? reset : Date.now() + 5 * 60000;
      throw new Error('quota');
    }
    if (!r.ok) throw new Error(String(r.status));
    const j = await r.json();
    const runs = Array.isArray(j.workflow_runs) ? j.workflow_runs : [];
    const ms = s => { const d = new Date(s); return isNaN(d.getTime()) ? null : d.getTime(); };

    const finiti = runs.filter(x => x.status === 'completed');
    const buono  = finiti.find(x => x.conclusion === 'success');

    beat = {
      ok:      buono       ? ms(buono.updated_at)   : null,
      partito: runs.length ? ms(runs[0].created_at) : null
    };
    beatOk = true;
  } catch (e) {
    beatOk = false;               /* non lo so: e' diverso da "e' rotto" */
  }
  paintFresh();
}

function paintFresh() {
  const f = $('fresh');
  f.classList.remove('stale', 'down', 'muto');
  const now = Date.now() + beatSkew;
  const eta = cal && calAt ? ' \u00b7 events from ' + durata(Math.max(0, Date.now() - calAt)) + ' ago' : '';

  /* Senza rete non e' rotto niente: si aspetta, e si dice quanto sono vecchi
     gli eventi che si stanno guardando. */
  if (navigator.onLine === false) {
    f.classList.add('muto');
    f.textContent = 'You are offline' + eta;
    return;
  }

  /* Prima i dati: se il calendario non e' mai arrivato, il resto e' accademia. */
  if (loaded && !cal) {
    f.classList.add('down');
    f.textContent = 'Calendar unreachable';
    return;
  }

  /* la rete c'e' ma GitHub non risponde: si tiene l'ultima copia buona */
  if (loaded && calErr) {
    f.classList.add('stale');
    f.textContent = 'GitHub not responding' + eta;
    return;
  }

  if (beatQuota && Date.now() < beatQuota) {
    f.classList.add('muto');
    f.textContent = 'API quota spent until ' + fmtTime.format(new Date(beatQuota));
    return;
  }

  if (!beatOk || !beat) {
    f.classList.add('muto');
    f.textContent = 'Heartbeat not verifiable';
    return;
  }

  const ok  = beat.ok;

  if (ok && now - ok <= LATE_MS) {
    f.textContent = 'Updated at ' + fmtTime.format(new Date(ok));
    return;
  }

  /* Da qui in giu' qualcosa non va, e la differenza dice cosa: se i giri
     partono ancora il guasto e' dentro — iCal irraggiungibile, secret
     revocato; se non parte piu' niente, e' la sveglia esterna che si e'
     fermata. */
  const sveglia = beat.partito && now - beat.partito <= LATE_MS;
  f.classList.add(!ok || now - ok > DOWN_MS ? 'down' : 'stale');

  if (!ok) {
    f.textContent = 'No successful run among the last checked';
  } else if (sveglia) {
    f.textContent = 'Runs are failing — last good one at '
      + fmtTime.format(new Date(ok)) + ' (' + durata(now - ok) + ' ago)';
  } else {
    f.textContent = 'STOPPED — no run for ' + durata(now - (beat.partito || ok));
  }
}

/* ---------------------------------------------------------- interazioni --- */

$('list').addEventListener('change', ev => {
  const i = ev.target;
  if (!i.dataset || !i.dataset.key) return;
  const key = i.dataset.key;

  /* la giornata finisce qui: la spunta si scrive solo dopo voto e commento,
     cosi' se l'app muore col pop-up aperto non resta una chiusura senza voto */
  if (key === CLOSE_ID && i.checked) {
    i.closest('.row').classList.add('on');
    openChiusura();
    return;
  }

  setCheck(viewKey, key, i.checked);

  /* FULL e MED sono alternative: spuntarne una esclude l'altra */
  if (i.checked && i.dataset.choice) {
    const sel = 'input[data-choice="' + i.dataset.choice + '"]';
    $('list').querySelectorAll(sel).forEach(o => {
      if (o !== i && o.checked) {
        o.checked = false;
        o.closest('.row').classList.remove('on');
        setCheck(viewKey, o.dataset.key, false);
      }
    });
  }

  i.closest('.row').classList.toggle('on', i.checked);

  syncDerived();

  /* Un evento lungo e' spezzato su piu' tappe, una spunta per tappa. Spuntando
     l'ultimo pezzo si puo' chiudere tutta la serie in un colpo: si chiede,
     perche' lasciare i pezzi rimasti da spuntare resta una scelta legittima. */
  if (i.checked && i.dataset.ultimo === '1' && i.dataset.serie) {
    const altri = [].slice.call($('list').querySelectorAll('input[data-serie="' + i.dataset.serie + '"]'))
                    .filter(o => o !== i && !o.checked && !o.disabled);
    if (altri.length) chiediSerie(altri);
  }
});

/* Le due strade, con il pannello di scelta che l'app usa gia'. */
function chiediSerie(altri) {
  apriPicker('Event', [
    { k: 'solo',  lab: 'Only this one' },
    { k: 'tutti', lab: 'Tick the other ' + altri.length + (altri.length > 1 ? ' parts' : ' part') }
  ], 'solo', v => {
    if (v !== 'tutti') return;
    for (const o of altri) {
      o.checked = true;
      o.closest('.row').classList.add('on');
      setCheck(viewKey, o.dataset.key, true);
    }
    syncDerived();
  });
}

$('list').addEventListener('click', ev => {
  const more = ev.target.closest('button.more[data-task]');
  if (more) { openEditor(more.dataset.task); return; }

  const evm = ev.target.closest('button.more[data-evento]');
  if (evm) { openEvento(evm.dataset.evento); return; }

  const plus = ev.target.closest('button.plus[data-gws]');
  if (plus) { openPesca(+plus.dataset.gws); return; }

  const b = ev.target.closest('button[data-role="desc"]');
  if (!b) return;
  const open = b.getAttribute('aria-expanded') === 'true';
  b.setAttribute('aria-expanded', open ? 'false' : 'true');
  b.setAttribute('aria-label', open ? 'Show the description' : 'Hide the description');
  b.closest('.ev').querySelector('.desc').hidden = open;
});

function goTo(d) {
  view = d;
  viewKey = dayKey(view);
  render();
}

/* E' scattata la mezzanotte con l'app aperta, o ripresa dallo sfondo? Basta
   ridisegnare: e' render() a spostare la vista sul nuovo oggi e ad applicare
   la regola di mezzanotte. Un confronto di stringhe, nessuna rete. */
function checkDay() {
  if (dayKey(today()) !== renderedDay) render();
}

$('prev').addEventListener('click', () => goTo(shift(view, -1)));
$('next').addEventListener('click', () => goTo(shift(view, 1)));
$('dateBtn').addEventListener('click', () => goTo(today()));

$('scarica').addEventListener('click', () => {
  const m = $('mese').value;
  if (!m) return;
  download('history-' + m + '.md', monthMarkdown(m), 'text/markdown;charset=utf-8');
});

/* ------------------------------------------------------------ chiusura --- */

const dlg = $('chiusura');

/* Dal rosso dell'1 al verde del 10: il numero e il cursore prendono lo stesso
   colore, cosi' il voto si legge anche senza guardare la cifra. */
function paintVoto(v) {
  $('votoNum').textContent = v.toFixed(1);
  const q = (v - 1) / 9;                 /* 0 in fondo alla scala, 1 in cima */
  const r = document.documentElement.style;
  /* dal rosso caldo al verde dell'app, meno acceso di prima: il colore deve
     dire com'e' andata, non gridarlo */
  r.setProperty('--voto-col', 'hsl(' + Math.round(6 + q * 141) + ' 64% 56%)');
  r.setProperty('--voto-pct', (q * 100).toFixed(1) + '%');
}

let chiusuraKey = null;           /* il giorno per cui il pop-up e' aperto */

function openChiusura() {
  chiusuraKey = viewKey;
  const d = diario[viewKey] || {};
  const v = typeof d.voto === 'number' ? d.voto : 5.5;   /* il centro esatto della scala */
  $('voto').value = v;
  paintVoto(v);
  $('commento').value = d.commento || '';
  $('chiusuraDay').textContent = fmtLong.format(view);
  dlg.returnValue = '';
  dlg.showModal();
}

$('voto').addEventListener('input', e => paintVoto(+e.target.value));

/* Annullare — bottone o tasto Esc — vuol dire che la giornata non e' chiusa:
   la spunta torna indietro. Voto e commento gia' scritti restano dov'erano. */
/* La casella sullo schermo segue lo stato scritto, ma solo se la lista mostra
   ancora il giorno del pop-up: un ridisegno nel frattempo l'ha ricreata dallo
   storage, spenta, e va riaccesa. */
function paintClose(on) {
  if (viewKey !== chiusuraKey) return;
  const box = $('list').querySelector('input[data-key="' + CLOSE_ID + '"]');
  if (!box) return;
  box.checked = on;
  box.closest('.row').classList.toggle('on', on);
}

function annullaChiusura() {
  setCheck(chiusuraKey || viewKey, CLOSE_ID, false);
  paintClose(false);
  syncDerived();
}

/* Confermare scrive la spunta di chiusura insieme a voto e commento, sul
   giorno per cui il pop-up era stato aperto: a cavallo della mezzanotte non
   e' detto che sia ancora quello mostrato. */
function confermaChiusura() {
  const k = chiusuraKey || viewKey;
  setCheck(k, CLOSE_ID, true);
  setDiario(k, +$('voto').value, $('commento').value);
  paintClose(true);
  syncDerived();
}

$('chiusuraForm').addEventListener('submit', confermaChiusura);

$('chiusuraAnnulla').addEventListener('click', () => {
  annullaChiusura();
  dlg.close();
});

/* Esc, e sul telefono il tasto indietro: il dialogo si chiude comunque, ma la
   chiusura esplicita vale anche dove il browser non la fa da solo. */
dlg.addEventListener('cancel', () => {
  annullaChiusura();
  dlg.close();
});

/* Rete di sicurezza: se il dialogo si chiude per una via che non ho previsto,
   quello che conta e' se la conferma e' passata o no. Le due strade qui sopra
   sono ripetibili senza danno, quindi ripassarci non cambia niente. */
dlg.addEventListener('close', () => {
  if (dlg.returnValue === 'ok') confermaChiusura();
  else annullaChiusura();
});

/* ---------------------------------------------------------------- task --- */

/* Il serbatoio. La copia che comanda e' quella nel telefono: ogni tocco e'
   istantaneo e resta qui anche se non salvi. Le spunte sulle task stanno con
   le altre spunte, in locale: nel file una task e' solo cosa, quanto conta e
   quando. */
let tstore = readStore(TASKS_KEY);
if (!Array.isArray(tstore.tasks)) tstore = { tasks: [], sha: null, dirty: false, known: [] };
if (!Array.isArray(tstore.known)) tstore.known = [];
/* Il piano dei workout: due caselle per giorno della settimana, scritte a mano.
   Non ha date: e' un'abitudine, e torna ogni settimana finche' non si cambia. */
/* Piano, dieta e limiti: la forma buona la danno le tre funzioni piu' sotto,
   chiamate appena esistono. Fino ad allora bastano tre contenitori vuoti. */
if (!tstore.workout || typeof tstore.workout !== 'object') tstore.workout = {};
if (!tstore.dieta || typeof tstore.dieta !== 'object') tstore.dieta = {};
if (!Array.isArray(tstore.limiti)) tstore.limiti = [];
/* Le schede: per ogni allenamento diverso scritto nel piano, gli esercizi e il
   recupero. La chiave e' il nome dell'allenamento. */
if (!tstore.schede || typeof tstore.schede !== 'object') tstore.schede = {};

let archivio = readStore(ARCHIVIO_KEY);
let mancate  = readStore(MANCATE_KEY);

let token = '';
try { token = localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { /* niente token */ }
let chiave = '';
let chiaveKo = false;          /* l'ultima lettura non si e' aperta */
try { chiave = localStorage.getItem(CHIAVE_KEY) || ''; } catch (e) { /* niente chiave */ }

const newId    = () => 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const findTask = id => tstore.tasks.find(x => x.id === id) || null;
const byRank   = (a, b) => a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : a.nome.localeCompare(b.nome);
/* Dove sta una task nel tempo, come testo che si ordina da solo: il giorno e
   la prima sessione. Il serbatoio non ha data e torna null. */
const quandoTask = x => x.giorno ? x.giorno + ':' + String(gwsDi(x.gws)[0]).padStart(2, '0') : null;

/* Dentro lo stesso rank vengono prima le cose che hanno una data, dalla piu'
   vicina alla piu' lontana; poi il serbatoio, che una data non ce l'ha. */
function byQuando(a, b) {
  const A = quandoTask(a), B = quandoTask(b);
  if (A === B) return 0;
  if (A === null) return 1;
  if (B === null) return -1;
  return A < B ? -1 : 1;
}

/* Nel menu' gli eventi del calendario vengono prima di tutto, in ordine di
   giorno e ora; poi le task, per rank e dentro il rank per orario. */
const byMenu   = (a, b) => (a.evento ? 0 : 1) - (b.evento ? 0 : 1)
  || (a.evento && b.evento ? (a.giorno + a.ora).localeCompare(b.giorno + b.ora) : 0)
  || (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0)
  || byQuando(a, b)
  || a.nome.localeCompare(b.nome);

/* Si schedula da oggi in avanti, dentro la finestra. Ieri no. */
const canSchedule = k => isEditable(k) && k >= dayKey(today());

/* Un file arrivato da fuori si prende con le pinze: solo campi noti, nella
   forma attesa. Quello che non torna si ripulisce, non si scarta. */
function validTask(x) {
  if (!x || typeof x !== 'object' || typeof x.id !== 'string' || typeof x.nome !== 'string') return null;
  /* Un evento del calendario a cui si e' dato un cliente: sta nel file come una
     task di rank A, col giorno e l'orario di Google. Senza cliente o senza
     giorno non ha senso, e non c'e'. */
  const evento = typeof x.evento === 'string' && x.evento ? x.evento : null;
  const cliente = CLIENTI.some(c => c.id === x.cliente) ? x.cliente : null;
  /* le sessioni: un numero solo nei file di prima, un elenco adesso. Ordinate
     e senza doppioni, cosi' due file con le stesse sessioni sono lo stesso
     file e non si committa per niente. */
  const s = gwsDi(x.gws).filter(n => Number.isInteger(n) && n >= 0 && n <= 4);
  const gws = s.length ? s.filter((n, i) => s.indexOf(n) === i).sort((a, b) => a - b) : null;
  const giorno = typeof x.giorno === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x.giorno)
                 && (gws != null || evento) ? x.giorno : null;
  if (evento && (!giorno || !cliente)) return null;
  const out = {
    id:     x.id,
    nome:   x.nome,
    desc:   typeof x.desc === 'string' ? x.desc : '',
    rank:   evento ? 'A' : RANKS.indexOf(x.rank) >= 0 ? x.rank : 'B',
    cliente: cliente,
    giorno: giorno,
    gws:    giorno && !evento ? gws : null,
    creata: typeof x.creata === 'string' ? x.creata : ''
  };
  if (evento) { out.evento = evento; out.ora = typeof x.ora === 'string' ? x.ora : ''; }
  return out;
}

const sameTasks = (a, b) => JSON.stringify((a || []).map(validTask)) === JSON.stringify((b || []).map(validTask));

/* Il piano che arriva dal file: solo i sette giorni, due caselle, testo corto.
   Le caselle vuote non si scrivono, cosi' un piano vuoto e' un oggetto vuoto. */
function validWorkout(w) {
  const out = {};
  if (!w || typeof w !== 'object') return out;
  for (let g = 0; g < 7; g++) {
    const r = Array.isArray(w[g]) ? w[g] : [];
    const a = [0, 1].map(i => String(r[i] == null ? '' : r[i]).slice(0, 60).trim());
    if (a[0] || a[1]) out[g] = a;
  }
  return out;
}

/* Un limite e' due testi liberi: a sinistra la cosa, a destra il limite.
   Nessun tipo da scegliere: si scrive come si vuole, e la forma resta la stessa
   perche' a disporli e' la tabella, non il testo. */

/* I limiti che arrivano dal file. I file scritti prima avevano un 'tipo' e il
   valore senza la parolina davanti: si convertono, cosi' non si perde niente. */
function validLimiti(l) {
  if (!Array.isArray(l)) return [];
  const vecchio = { until: 'until ', max: 'max ' };
  return l.map(x => {
    if (!x || typeof x !== 'object') return null;
    let cosa = String(x.cosa == null ? '' : x.cosa).slice(0, 40).trim();
    let valore = String(x.valore == null ? '' : x.valore).slice(0, 40).trim();
    if (x.tipo) {
      if (x.tipo === 'stop' && !cosa) cosa = 'Nothing after';
      else if (vecchio[x.tipo]) valore = vecchio[x.tipo] + valore;
    }
    if (!cosa && !valore) return null;
    return { id: typeof x.id === 'string' && x.id ? x.id : newId(), cosa: cosa, valore: valore };
  }).filter(Boolean);
}

/* La dieta che arriva dal file: una casella per pasto, testo corto. */
function validDieta(w) {
  const out = {};
  if (!w || typeof w !== 'object') return out;
  for (const t of PASTI) {
    const v = String(w[t.id] == null ? '' : w[t.id]).slice(0, 120).trim();
    if (v) out[t.id] = v;
  }
  return out;
}

/* Le schede che arrivano dal file: per ogni nome, un elenco di esercizi (due
   testi liberi ciascuno) e il recupero. Le righe vuote non si tengono. */
function validSchede(w) {
  const out = {};
  if (!w || typeof w !== 'object') return out;
  for (const k of Object.keys(w)) {
    const nome = String(k).slice(0, 60).trim();
    if (!nome) continue;
    const v = w[k] || {};
    const es = (Array.isArray(v.es) ? v.es : []).map(r => [
      String((Array.isArray(r) ? r[0] : '') || '').slice(0, 60).trim(),
      String((Array.isArray(r) ? r[1] : '') || '').slice(0, 60).trim()
    ]).filter(r => r[0] || r[1]);
    const rec = String(v.rec == null ? '' : v.rec).slice(0, 60).trim();
    if (es.length || rec) out[nome] = { es: es, rec: rec };
  }
  return out;
}

/* I pasti della giornata, nell'ordine in cui capitano. Uguali tutti i giorni:
   si prendono dalla routine standard, che li ha tutti. */
const PASTI = ROUTINE_GIORNO.concat(SERA_STD).filter(t => t.pasto);

/* Anche quello che sta gia' nel telefono passa dal controllo, non solo quello
   che arriva dal file: cosi' un piano scritto da una versione precedente si
   converte all'apertura invece di restare a meta'. Sta qui e non piu' in alto
   perche' le tre funzioni hanno bisogno di PASTI e di newId. */
tstore.workout = validWorkout(tstore.workout);
tstore.dieta   = validDieta(tstore.dieta);
tstore.limiti  = validLimiti(tstore.limiti);
tstore.schede  = validSchede(tstore.schede);

/* Cosa si fa in quel workout, quel giorno: la casella del piano, se c'e'. */
function workoutDi(k, slot) {
  const g = new Date(k + 'T00:00:00').getDay();
  const r = tstore.workout[g];
  return r && r[slot] ? r[slot] : '';
}

function saveLocal() { writeStore(TASKS_KEY, tstore); }

/* Ogni modifica passa di qui: si segna, e compare Salva. */
function touch() {
  tstore.dirty = true;
  saveLocal();
  paintSalva();
  paintSync();
}

/* A mezzanotte le task lasciate indietro tornano nel serbatoio: il giorno
   passato resta contato com'era, non fatta. Quelle fatte restano nel loro
   giorno finche' e' in finestra, poi passano in archivio, da dove le legge lo
   storico del mese. */
function tidyTasks() {
  const t0 = dayKey(today());
  const win = windowKeys();
  let changed = false;

  tstore.tasks = tstore.tasks.filter(x => {
    /* un evento del calendario vive quanto la finestra, e
       solo finche' esiste su Google: cancellato la', qui non ha piu' niente a
       cui appartenere. Se il calendario non copre quel giorno non si tocca:
       assente non vuol dire cancellato. */
    if (x.evento) {
      if (win.indexOf(x.giorno) < 0 || (isCovered(x.giorno) && !eventoDi(x))) {
        changed = true;
        return false;
      }
      return true;
    }
    if (!x.giorno) return true;
    if (taskFatta(x, dayChecks(x.giorno))) {
      if (win.indexOf(x.giorno) >= 0) return true;
      if (!archivio[x.giorno]) archivio[x.giorno] = [];
      archivio[x.giorno].push({ nome: x.nome, rank: x.rank, gws: x.gws });
      changed = true;
      return false;
    }
    if (x.giorno < t0) {
      /* il giorno la ricorda com'era, non fatta: il conteggio di ieri non cambia */
      if (!mancate[x.giorno]) mancate[x.giorno] = [];
      mancate[x.giorno].push({ nome: x.nome, rank: x.rank, gws: x.gws });
      x.giorno = null; x.gws = null; changed = true;
    }
    return true;
  });

  if (changed) {
    writeStore(ARCHIVIO_KEY, archivio);
    writeStore(MANCATE_KEY, mancate);
    touch();
  }
}

/* Una sessione gia' chiusa che riceve una task non e' piu' finita: si riapre,
   cosi' la task si puo' spuntare e non nasce gia' contata come fatta. */
function riapriSessione(x) {
  if (!x.giorno) return;
  for (const g of gwsDi(x.gws)) {
    const t = routineFor(x.giorno).find(r => r.gws === g);
    if (t && dayChecks(x.giorno)[t.id]) setCheck(x.giorno, t.id, false);
  }
}

/* Le spunte di una task dove sta adesso: si tolgono quando cambia giorno,
   quando torna nel serbatoio e quando la task viene eliminata. */
function togliSpunte(x) {
  if (!x.giorno) return;
  for (const g of gwsDi(x.gws)) setCheck(x.giorno, chiaveTask(x, g), false);
}

/* ------------------------------------------------------------- menu' ---- */

let tutte = false;               /* l'interruttore "mostra anche le schedulate" */

/* Il filtro "Calendar": acceso, gli eventi del calendario a cui si e' dato un
   cliente entrano nel menu', con giorno e ora, primi fra i rank A. Spento, nel
   menu' non esistono: stanno gia' nella giornata. Si ricorda. */
/* Piano e dieta si possono spegnere: la tabella resta scritta, ma sotto le
   tappe non compare niente. E' una preferenza di questo schermo, quindi sta nel
   telefono e non nel file: spegnerla qui non accende il tasto Salva. */
const MOSTRA_KEY = 'gwork-mostra-v1';
let mostra = (() => {
  try {
    const v = JSON.parse(localStorage.getItem(MOSTRA_KEY) || 'null');
    if (v && typeof v === 'object')
      return { w: v.w !== false, d: v.d !== false, mw: !!v.mw, md: !!v.md, sch: !!v.sch,
               off: (Array.isArray(v.off) ? v.off : []).map(String) };
  } catch (e) { /* si parte accesi, e senza i campi per scrivere */ }
  return { w: true, d: true, mw: false, md: false, sch: false, off: [] };
})();
function salvaMostra() {
  try { localStorage.setItem(MOSTRA_KEY, JSON.stringify(mostra)); } catch (e) {}
}
/* i campi per scrivere si vedono solo con l'interruttore Edit acceso: di norma
   il pannello e' una cosa da leggere */
const modifica = () => wTab === 'w' ? mostra.mw : mostra.md;

const CALENDAR_KEY = 'gwork-calendar-v1';
let calendar = (() => {
  try { return localStorage.getItem(CALENDAR_KEY) === '1'; } catch (e) { return false; }
})();

function openMenu(on) {
  $('drawer').classList.toggle('open', on);
  $('velo').hidden = !on;
  document.body.classList.toggle('menu-open', on);
  $('menuBtn').setAttribute('aria-expanded', on ? 'true' : 'false');
  if (on) paintDrawer();
}

function whenText(x) {
  const t0 = today();
  const lab = x.giorno === dayKey(t0)            ? 'today'
            : x.giorno === dayKey(shift(t0, 1))  ? 'tomorrow'
            : x.giorno === dayKey(shift(t0, -1)) ? 'yesterday'
            : fraQuanti(x.giorno) > 0            ? 'in ' + fraQuanti(x.giorno) + ' days'
            : fmtDate.format(new Date(x.giorno + 'T00:00:00'));
  return lab + ' · ' + (x.evento ? x.ora
                                 : 'GWS ' + gwsDi(x.gws).map(g => g + 1).join('+'));
}

/* Una riga del menu' (o dell'elenco da cui pescare, senza i tre puntini). */
function trowNode(x, pick) {
  /* il colore del bordino: verde se e' una task messa su un giorno, blu se e'
     un evento del calendario, rosso se quell'evento cade in finestra protetta —
     gli stessi colori che ha nella giornata */
  const ev = x.evento ? eventoDi(x) : null;
  const li = el('li', 'trow' + (x.evento ? (ev && ev.alarm ? ' evento alarm' : ' evento')
                                         : x.giorno ? ' sched' : ''));
  li.dataset.task = x.id;

  const riga = li;

  if (!pick) {
    /* la casella per spuntarla senza aprirla: sta fuori dall'area che apre
       l'editor, cosi' un tocco storto non fa l'una per l'altra */
    const i = el('input', 'tcheck');
    i.type = 'checkbox';
    i.dataset.tcheck = x.id;
    i.checked = !!(x.giorno && (x.evento ? chiaviEvento(x).every(kk => dayChecks(x.giorno)[kk])
                                         : taskFatta(x, dayChecks(x.giorno))));
    i.disabled = !!(x.giorno && !isEditable(x.giorno));
    i.setAttribute('aria-label', 'Mark done');
    riga.appendChild(i);
  }
  riga.appendChild(el('span', 'rank r' + x.rank, x.rank));
  riga.appendChild(el('span', 'tname', titoloEvento(x)));
  if (x.giorno) riga.appendChild(el('span', 'twhen', whenText(x)));
  if (!pick) {
    const b = el('button', 'more', '⋯');
    b.type = 'button';
    b.dataset.task = x.id;
    b.setAttribute('aria-label', 'Edit the task');
    riga.appendChild(b);
  }
  return li;
}

/* Il menu': A, B, C. Di base solo il serbatoio; con l'interruttore anche le
   schedulate, col bordino giallo. */
/* Quali clienti sono aperti nel menu'. Piu' di uno alla volta: aprendone uno
   gli altri restano come stanno, l'elenco si allunga e si scorre. */
let cliAperti = (() => {
  try {
    const v = JSON.parse(localStorage.getItem(CLIAPERTI_KEY));
    return new Set(Array.isArray(v) ? v : []);
  } catch (e) { return new Set(); }
})();

/* Quali delle due tendine sono aperte. Chiuse tutte e due, il menu' comincia
   con due righe sole. */
let rootAperte = (() => {
  try {
    const v = JSON.parse(localStorage.getItem(CLIROOT_KEY));
    return new Set(Array.isArray(v) ? v : []);
  } catch (e) { return new Set(); }
})();

function salvaAperti() {
  try {
    localStorage.setItem(CLIAPERTI_KEY, JSON.stringify([...cliAperti]));
    localStorage.setItem(CLIROOT_KEY, JSON.stringify([...rootAperte]));
  } catch (e) {}
}

/* L'ordine dei gruppi e' quello di CLIENTI, con le task senza cliente in
   fondo. Dentro un gruppo l'ordine resta quello di sempre: prima il rank. */
/* Tutti i clienti compaiono sempre, anche quelli senza niente dentro: l'elenco
   e' anche la mappa di chi si sta seguendo. Le task senza cliente qui non
   entrano: stanno nel serbatoio qui sotto, che le mostra tutte. */
function gruppiCliente(list, mie) {
  return CLIENTI.filter(c => !!c.mia === mie).map(c => ({
    g: { k: c.id, nome: c.nome, tag: c.tag },
    tasks: list.filter(x => x.cliente === c.id).sort(byMenu)
  }));
}

function paintDrawer() {
  const box = $('drawerList');
  box.textContent = '';
  /* le task del serbatoio, o anche le schedulate. Nei blocchi RANK qui sotto
     gli eventi del calendario entrano solo col filtro Calendar; dentro un
     cliente ci sono sempre, come le schedulate. */
  const list = tstore.tasks.filter(x => !x.evento && (tutte || !x.giorno));
  const eventi = tstore.tasks.filter(x => x.evento);
  const evs  = calendar ? eventi : [];
  const tutto = list.concat(evs);
  /* Dentro un cliente si vede sempre tutto: il serbatoio e anche quello che e'
     gia' su un giorno, che si riconosce dal bordino verde. L'interruttore delle
     schedulate vale per i blocchi RANK qui sotto, non per i clienti: aprire un
     cliente e' gia' chiedere di vedere le sue cose. */
  const perCli = tstore.tasks.filter(x => !x.evento).concat(eventi);
  /* Quello che si e' gia' letto dentro un cliente aperto non si ripete nei
     blocchi RANK: aprire un cliente e' gia' averlo guardato. Chiuso il cliente,
     le sue task tornano sotto. */
  const gia = new Set();

  for (const rad of RADICI) {
    const gruppi = gruppiCliente(perCli, rad.mie);
    if (!gruppi.length) continue;
    const aperta = rootAperte.has(rad.k);

    const r = el('button', 'grp grpcli grproot' + (rad.oro ? ' oro' : '') + (aperta ? ' open' : ''));
    r.type = 'button';
    r.dataset.root = rad.k;
    r.setAttribute('aria-expanded', aperta ? 'true' : 'false');
    r.appendChild(el('span', 'grpfrec', aperta ? '\u25be' : '\u25b8'));
    r.appendChild(el('span', 'grpnome', rad.nome));
    box.appendChild(r);

    for (const o of aperta ? gruppi : []) {
      const open = cliAperti.has(o.g.k);
      const h = el('button', 'grp grpcli grpfiglio' + (open ? ' open' : ''));
      h.type = 'button';
      h.dataset.cli = o.g.k;
      h.setAttribute('aria-expanded', open ? 'true' : 'false');
      h.appendChild(el('span', 'grpfrec', open ? '\u25be' : '\u25b8'));
      h.appendChild(el('span', 'grpnome', o.g.nome));
      if (o.g.tag) h.appendChild(el('span', 'grptag', o.g.tag));
      box.appendChild(h);
      if (!open) continue;
      if (!o.tasks.length) {
        box.appendChild(el('p', 'vuoto vuotocli', 'No tasks'));
        continue;
      }
      const ul = el('ul', 'trows');
      for (const x of o.tasks) { gia.add(x.id); ul.appendChild(trowNode(x, false)); }
      box.appendChild(ul);
    }
  }

  /* Sotto le tendine, il resto diviso per rank come e' sempre stato. Quello che
     si e' gia' visto dentro un cliente aperto non si ripete qui: si guarda una
     cosa sola per volta. Chiuso il cliente, le sue task tornano. */
  for (const r of RANKS) {
    const l = tutto.filter(x => x.rank === r && !gia.has(x.id)).sort(byMenu);
    if (!l.length) continue;
    box.appendChild(el('p', 'grp', 'RANK ' + r));
    /* dentro il rank, le task dello stesso cliente stanno insieme e il nome si
       scrive una volta sola sopra il gruppo, invece che su ogni riga. L'ordine
       dei gruppi e' quello della prima task di ognuno, cioe' sempre per data. */
    const ordine = [], per = new Map();
    for (const x of l) {
      const c = x.cliente || '';
      if (!per.has(c)) { per.set(c, []); ordine.push(c); }
      per.get(c).push(x);
    }
    /* quelle senza cliente per prime: non hanno un nome sopra, e sotto il nome
       di un cliente ci deve stare solo roba sua */
    ordine.sort((a, b) => (a ? 1 : 0) - (b ? 1 : 0));
    for (const c of ordine) {
      if (c) box.appendChild(el('p', 'grpsub', clienteCorto(c)));
      const ul = el('ul', 'trows');
      for (const x of per.get(c)) ul.appendChild(trowNode(x, false));
      box.appendChild(ul);
    }
  }

  if (!tutto.length) box.appendChild(el('p', 'vuoto', tutte ? 'No tasks' : 'Pool empty'));
  paintSync();
}

/* Il menu' si apre e si chiude anche con il dito. Entra da destra, quindi il
   dito va a sinistra per aprirlo e a destra per chiuderlo.

   Il gesto vale da qualunque punto dello schermo. Partire dal bordo destro non
   funziona: su Android quella striscia e' della navigazione di sistema, e il
   dito che parte da li' fa "indietro" prima che la pagina se ne accorga.

   Per non aprirlo per sbaglio mentre si scorre l'elenco, il movimento deve
   essere lungo e deciso: almeno 70 pixel, e almeno una volta e mezza piu'
   orizzontale che verticale. Con una finestra aperta il gesto e' spento. */
(function () {
  const CORSA = 70;               /* quanto deve correre il dito per contare */
  const DECISO = 1.5;             /* quanto dev'essere piu' orizzontale che verticale */
  let x0 = 0, y0 = 0, valido = false;

  const aperto  = () => $('drawer').classList.contains('open');
  const apertoW = () => $('wdrawer').classList.contains('open');

  document.addEventListener('touchstart', ev => {
    if (ev.touches.length !== 1 || document.querySelector('dialog[open]')) {
      valido = false;
      return;
    }
    x0 = ev.touches[0].clientX;
    y0 = ev.touches[0].clientY;
    valido = true;
  }, { passive: true });

  document.addEventListener('touchend', ev => {
    if (!valido) return;
    valido = false;
    const dx = ev.changedTouches[0].clientX - x0;
    const dy = ev.changedTouches[0].clientY - y0;
    if (Math.abs(dx) < CORSA || Math.abs(dx) < Math.abs(dy) * DECISO) return;
    /* Verso sinistra il Menu Task, verso destra il piano. Col Menu Task aperto,
       il gesto contrario lo chiude. Col piano aperto il gesto scorre fra le due
       sezioni, e solo dall'ultima chiude: Workout -> Diet -> chiuso, e
       all'indietro Diet -> Workout. */
    if (aperto()) { if (dx > 0) openMenu(false); return; }
    if (apertoW()) {
      if (dx < 0) { if (wTab === 'w') setTab('d'); else openW(false); }
      else if (wTab === 'd') setTab('w');
      return;
    }
    if (dx < 0) openMenu(true); else openW(true);
  }, { passive: true });
})();

/* ------------------------------------------------ piano dei workout ---- */

const GIORNI = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const GIORNI2 = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

/* Una riga di tabella: le celle in ordine, ognuna con le sue classi. */
function tabRiga(celle, cls) {
  const r = el('div', 'tabr' + (cls ? ' ' + cls : ''));
  for (const c of celle) {
    const d = el('div', 'tabc' + (c.cls ? ' ' + c.cls : ''), c.t);
    if (c.k) d.dataset.cella = c.k;
    r.appendChild(d);
  }
  return r;
}

/* Scrivendo in una casella si aggiorna solo la sua cella nella tabella: rifare
   la tabella intera cancellerebbe quello che si sta scrivendo accanto. */
function aggiornaCella(k, v) {
  const c = $('wlist').querySelector('.tabc[data-cella="' + k + '"]');
  if (!c) return;
  c.textContent = v || '—';
  c.classList.toggle('vuota', !v);
}

/* Il pannello ha due sezioni: il piano dei workout e la dieta. */
let wTab = 'w';

function openW(on) {
  $('wdrawer').classList.toggle('open', on);
  $('velo').hidden = !on;
  document.body.classList.toggle('menu-open', on);
  if (on) { paintSwitch(); paintW(); riportaSu(); }
}

function setTab(t) {
  wTab = t;
  $('tabW').classList.toggle('on', t === 'w');
  $('tabD').classList.toggle('on', t === 'd');
  $('tabW').setAttribute('aria-pressed', t === 'w' ? 'true' : 'false');
  $('tabD').setAttribute('aria-pressed', t === 'd' ? 'true' : 'false');
  paintSwitch();
  paintW();
  riportaSu();
}

function paintSwitch() {
  $('wMostra').checked = wTab === 'w' ? mostra.w : mostra.d;
  const b = $('wMod');
  b.textContent = modifica() ? 'done' : 'edit';
  b.classList.toggle('on', modifica());
}

$('wMostra').addEventListener('change', e => {
  if (wTab === 'w') mostra.w = e.target.checked; else mostra.d = e.target.checked;
  salvaMostra();
  render();
});

$('wMod').addEventListener('click', () => {
  const v = !modifica();
  if (wTab === 'w') mostra.mw = v; else mostra.md = v;
  salvaMostra();
  paintSwitch();
  paintW();
});

$('tabW').addEventListener('click', () => setTab('w'));
$('tabD').addEventListener('click', () => setTab('d'));

/* Sette giorni, due caselle per giorno. La durata di ogni casella si legge
   dalla routine di quel giorno: il secondo workout del wing chun e' piu' lungo
   di quello degli altri giorni, e la tabella lo dice invece di fingere. */
function paintW() {
  if (wTab === 'd') return paintD();
  const box = $('wlist');
  box.textContent = '';
  const t0 = today();
  const oggi = t0.getDay();

  /* o la tabella, per leggere la settimana in un colpo, o i campi per
     scriverla: mai tutte e due insieme */
  if (!modifica()) {
    const tab = el('div', 'tab tab-w');
    tab.appendChild(tabRiga([{ t: '' }, { t: '1st' }, { t: '2nd' }], 'capo'));
    for (const g of [1, 2, 3, 4, 5, 6, 0]) {
      const r = tstore.workout[g] || [];
      tab.appendChild(tabRiga([
        { t: GIORNI2[g], cls: 'eti' },
        { t: r[0] || '—', cls: r[0] ? '' : 'vuota', k: 'w' + g + '-0' },
        { t: r[1] || '—', cls: r[1] ? '' : 'vuota', k: 'w' + g + '-1' }
      ], g === oggi ? 'oggi' : ''));
    }
    box.appendChild(tab);
    paintSchede(box);
    return;
  }
  /* Il piano e' generico, non parte da oggi: da lunedi' a domenica, sempre
     uguale. Per gli orari serve pero' una data vera con quel giorno della
     settimana, e la si pesca nei sette giorni davanti. */
  for (const g of [1, 2, 3, 4, 5, 6, 0]) {
    let d = t0;
    for (let n = 0; n < 7 && d.getDay() !== g; n++) d = shift(t0, n + 1);
    const k = dayKey(d);
    box.appendChild(el('p', 'wgiorno', GIORNI[g]));
    const r = routineFor(k);
    for (const slot of [0, 1]) {
      const t = r.find(v => v.slot === slot);
      const ora = t ? t.t.split('|')[0].trim() : '';
      const capo = el('p', 'wcapo', (slot === 0 ? '1st workout' : '2nd workout'));
      capo.appendChild(el('span', 'dora', '  ' + ora + ' \u00b7 ' + (t && t.dur || DUR_WORKOUT[slot])));
      box.appendChild(capo);
      const row = el('div', 'wrow');
      const inp = el('input', 'wcampo');
      inp.type = 'text';
      inp.maxLength = 60;
      inp.dataset.g = g;
      inp.dataset.slot = slot;
      inp.value = (tstore.workout[g] || [])[slot] || '';
      inp.placeholder = 'What you do';
      row.appendChild(inp);
      box.appendChild(row);
    }
  }
  paintSchede(box);
}

/* Gli allenamenti diversi scritti nel piano, nell'ordine in cui compaiono.
   Non si scrivono qui: si leggono dalle quattordici caselle. */
function allenamenti() {
  const out = [];
  for (const g of [1, 2, 3, 4, 5, 6, 0]) {
    for (const v of (tstore.workout[g] || [])) {
      if (v && out.indexOf(v) < 0) out.push(v);
    }
  }
  return out;
}

/* Quale scheda si sta scrivendo, o null: una per volta. */
let scheda = null;

/* Le schede, sotto la tabella del piano. Chiuse si leggono come tabelle; con il
   loro bottone si aprono i campi, e ogni esercizio e' due testi liberi. */
function paintSchede(box) {
  const apri = el('button', 'grp grpcli grproot' + (mostra.sch ? ' open' : ''));
  apri.type = 'button';
  apri.dataset.schroot = '1';
  apri.setAttribute('aria-expanded', mostra.sch ? 'true' : 'false');
  apri.appendChild(el('span', 'grpfrec', mostra.sch ? '\u25be' : '\u25b8'));
  apri.appendChild(el('span', 'grpnome', 'WORKOUTS'));
  box.appendChild(apri);
  if (!mostra.sch) return;

  const nomi = allenamenti();
  if (!nomi.length) {
    box.appendChild(el('p', 'vuoto', 'Nothing in the plan yet'));
    return;
  }

  /* Non tutti gli allenamenti del piano hanno esercizi da scrivere: il wing
     chun, per dire, non ne ha nessuno. Le pastiglie qui sopra dicono quali
     schede si vedono; toccarne una la toglie o la rimette, e la scelta resta
     nel telefono senza toccare il file. */
  const chips = el('div', 'chips chipsch');
  for (const nome of nomi) {
    const acceso = mostra.off.indexOf(nome) < 0;
    const c = el('button', 'chip chipw' + (acceso ? ' sel' : ''), nome);
    c.type = 'button';
    c.dataset.chipsch = nome;
    c.setAttribute('aria-pressed', acceso ? 'true' : 'false');
    chips.appendChild(c);
  }
  box.appendChild(chips);

  const visti = nomi.filter(x => mostra.off.indexOf(x) < 0);
  if (!visti.length) {
    box.appendChild(el('p', 'vuoto', 'No workout chosen'));
    return;
  }

  for (const nome of visti) {
    const sc = tstore.schede[nome] || { es: [], rec: '' };
    const apertaSc = scheda === nome;

    /* Il nome della scheda sta nella riga grigia in alto della sua tabella,
       come 1st e 2nd nel piano. Il bottone per modificarla sta in fondo alla
       stessa riga. */
    const tab = el('div', 'tab tab-i');
    const cap = el('div', 'tabr capo schcapo');
    cap.appendChild(el('div', 'tabc', nome));
    const cb = el('div', 'tabc tabbtn');
    const b = el('button', 'schbtn', apertaSc ? 'done' : 'edit');
    b.type = 'button';
    b.dataset.scheda = nome;
    cb.appendChild(b);
    cap.appendChild(cb);
    tab.appendChild(cap);

    if (!apertaSc) {
      /* il recupero e' la prima riga, staccata da quelle degli esercizi */
      tab.appendChild(tabRiga([
        { t: 'Recovery', cls: 'eti' },
        { t: sc.rec || '—', cls: sc.rec ? 'val' : 'val vuota' }
      ], 'rec'));
      for (const r of sc.es) {
        tab.appendChild(tabRiga([
          { t: r[0] || '—', cls: r[0] ? 'eti' : 'eti vuota' },
          { t: r[1] || '—', cls: r[1] ? 'val' : 'val vuota' }
        ]));
      }
      if (!sc.es.length) tab.appendChild(tabRiga([{ t: '—', cls: 'vuota' }, { t: '' }]));
      box.appendChild(tab);
      continue;
    }
    box.appendChild(tab);

    /* aperta: prima il recupero, poi una riga per esercizio con due campi
       liberi e la croce per toglierla */
    const rrow = el('div', 'wrow wrec');
    rrow.appendChild(el('span', 'wslot', 'Rec.'));
    const rin = el('input', 'wcampo');
    rin.type = 'text';
    rin.maxLength = 60;
    rin.dataset.rec = nome;
    rin.value = sc.rec || '';
    rin.placeholder = 'recovery';
    rrow.appendChild(rin);
    box.appendChild(rrow);

    for (let i = 0; i < sc.es.length; i++) {
      const row = el('div', 'wrow');
      for (const j of [0, 1]) {
        const inp = el('input', 'wcampo');
        inp.type = 'text';
        inp.maxLength = 60;
        inp.dataset.sch = nome;
        inp.dataset.riga = i;
        inp.dataset.col = j;
        inp.value = sc.es[i][j] || '';
        inp.placeholder = j === 0 ? 'exercise' : 'how much';
        row.appendChild(inp);
      }
      const x = el('button', 'schx', '\u00d7');
      x.type = 'button';
      x.dataset.togli = nome;
      x.dataset.riga = i;
      row.appendChild(x);
      box.appendChild(row);
    }
    const piu = el('button', 'lpiu', '+  Add an exercise');
    piu.type = 'button';
    piu.dataset.piues = nome;
    box.appendChild(piu);
  }
}

/* La dieta: un pasto per riga, con il suo orario e quanto dura. Non ha giorni:
   i pasti sono uguali tutti i giorni. Gli orari si leggono dalla routine di
   oggi, cosi' non c'e' un secondo posto dove tenerli aggiornati. */
function paintD() {
  const box = $('wlist');
  box.textContent = '';
  const k = dayKey(today());
  const r = routineFor(k);

  /* o la tabella dei pasti, o i campi per riempirla */
  if (!modifica()) {
    const tab = el('div', 'tab tab-d');
    tab.appendChild(tabRiga([{ t: 'Meal' }, { t: 'Time', cls: 'ora' }, { t: 'What' }], 'capo'));
    for (const t of PASTI) {
      const i = r.findIndex(v => v.id === t.id);
      const ora = (i >= 0 ? r[i] : t).t.split('|')[0].trim();
      const v = tstore.dieta[t.id] || '';
      tab.appendChild(tabRiga([
        { t: t.pasto.split(' ')[0], cls: 'eti' },
        { t: ora, cls: 'ora' },
        { t: v || '—', cls: v ? '' : 'vuota', k: 'd' + t.id }
      ]));
    }
    box.appendChild(tab);
  } else {
    for (const t of PASTI) {
      const i = r.findIndex(v => v.id === t.id);
      const tappa = i >= 0 ? r[i] : t;
      const ora = tappa.t.split('|')[0].trim();
      const dur = i >= 0 ? durataTappa(k, i) : '';
      const tit = el('p', 'wcapo', t.pasto);
      tit.appendChild(el('span', 'dora', '  ' + ora + (dur ? ' \u00b7 ' + dur : '')));
      box.appendChild(tit);
      const row = el('div', 'wrow');
      const inp = el('input', 'wcampo');
      inp.type = 'text';
      inp.maxLength = 120;
      inp.dataset.pasto = t.id;
      inp.value = tstore.dieta[t.id] || '';
      inp.placeholder = 'What you eat';
      row.appendChild(inp);
      box.appendChild(row);
    }
  }

  /* le info: cose che non stanno dentro un pasto. Stanno in una tabella come i
     pasti, e si toccano per cambiarle. */
  const ti = el('div', 'tab tab-i');
  ti.appendChild(tabRiga([{ t: 'Info' }, { t: '' }], 'capo'));
  for (const x of tstore.limiti) {
    const riga = tabRiga([
      { t: x.cosa || '—', cls: x.cosa ? 'eti' : 'eti vuota' },
      { t: x.valore || '—', cls: x.valore ? 'val' : 'val vuota' }
    ], 'tocca');
    riga.dataset.limite = x.id;
    ti.appendChild(riga);
  }
  if (!tstore.limiti.length) ti.appendChild(tabRiga([{ t: '—', cls: 'vuota' }, { t: '' }]));
  box.appendChild(ti);

  /* il bottone per aggiungerne una sta solo in modifica, come i campi */
  if (modifica()) {
    const piu = el('button', 'lpiu', '+  Add info');
    piu.type = 'button';
    piu.dataset.piulimite = '1';
    box.appendChild(piu);
  }
}

/* Si scrive quando si esce dalla casella: cosi' non si segna il file da salvare
   a ogni lettera battuta. */
$('wlist').addEventListener('change', ev => {
  const i = ev.target.closest('input.wcampo');
  if (!i) return;
  /* un esercizio, o il recupero: due testi liberi, nessuna forma imposta */
  if (i.dataset.sch || i.dataset.rec) {
    const n = i.dataset.sch || i.dataset.rec;
    const sc = tstore.schede[n] || { es: [], rec: '' };
    const v = i.value.slice(0, 60).trim();
    if (i.dataset.rec) { if (sc.rec === v) return; sc.rec = v; }
    else {
      const r = +i.dataset.riga, c = +i.dataset.col;
      if (!sc.es[r]) sc.es[r] = ['', ''];
      if (sc.es[r][c] === v) return;
      sc.es[r][c] = v;
    }
    if (sc.es.some(r => r[0] || r[1]) || sc.rec) tstore.schede[n] = sc;
    else delete tstore.schede[n];
    touch();
    return;
  }
  if (i.dataset.pasto) {
    const v = i.value.slice(0, 120).trim();
    if ((tstore.dieta[i.dataset.pasto] || '') === v) return;
    if (v) tstore.dieta[i.dataset.pasto] = v; else delete tstore.dieta[i.dataset.pasto];
    touch();
    aggiornaCella('d' + i.dataset.pasto, v);
    render();
    return;
  }
  const g = +i.dataset.g, slot = +i.dataset.slot;
  const r = (tstore.workout[g] || ['', '']).slice();
  const v = i.value.slice(0, 60).trim();
  if (r[slot] === v) return;
  r[slot] = v;
  if (r[0] || r[1]) tstore.workout[g] = r; else delete tstore.workout[g];
  touch();
  aggiornaCella('w' + g + '-' + slot, v);
  /* si ridisegna solo la giornata: rifare la tabella qui cancellerebbe quello
     che si sta scrivendo nella casella accanto */
  render();
});

/* Scorrendo in giu' l'interruttore si ritira, come una barra che si toglie di
   mezzo; risalendo torna. In cima c'e' sempre. */
let wY = 0;
$('wlist').addEventListener('scroll', () => {
  const y = $('wlist').scrollTop;
  const sw = $('wdrawer').querySelector('.wswitch');
  if (y > wY + 4 && y > 24) sw.classList.add('via');
  else if (y < wY - 4 || y <= 4) sw.classList.remove('via');
  wY = y;
}, { passive: true });

function riportaSu() {
  wY = 0;
  $('wlist').scrollTop = 0;
  $('wdrawer').querySelector('.wswitch').classList.remove('via');
}

/* ------------------------------------------------ i limiti della dieta ---- */

const dlgLim = $('limite');
let lim = null;                   /* il limite che si sta scrivendo, o null */

/* Prima si sceglie che tipo di limite e', poi si riempie: i campi cambiano di
   conseguenza, cosi' non si chiede un orario a chi vuole dire "tre cucchiai". */
function apriLimite(id) {
  const x = id ? tstore.limiti.find(v => v.id === id) : null;
  lim = x ? { id: x.id } : { id: null };
  $('limiteTit').textContent = x ? 'Info' : 'New info';
  $('lCosa').value = x ? x.cosa : '';
  $('lVal').value = x ? x.valore : '';
  $('lElimina').hidden = !x;
  $('lElimina').textContent = 'Delete';
  dlgLim.showModal();
  dlgLim.focus();                 /* niente tastiera addosso appena si apre */
}

$('limiteForm').addEventListener('submit', ev => {
  if (!lim) return;
  const cosa = $('lCosa').value.slice(0, 40).trim();
  const valore = $('lVal').value.slice(0, 40).trim();
  if (!cosa && !valore) {
    /* vuoto da tutte e due le parti: la finestra resta aperta */
    ev.preventDefault();
    $('lCosa').focus();
    return;
  }
  const x = lim.id ? tstore.limiti.find(v => v.id === lim.id) : null;
  if (x) { x.cosa = cosa; x.valore = valore; }
  else tstore.limiti.push({ id: newId(), cosa: cosa, valore: valore });
  lim = null;
  touch();
  paintW();
});

$('lAnnulla').addEventListener('click', () => { lim = null; dlgLim.close(); });
dlgLim.addEventListener('cancel', () => { lim = null; });

/* due tocchi per eliminare: il primo chiede, il secondo fa */
$('lElimina').addEventListener('click', () => {
  const b = $('lElimina');
  if (b.textContent !== 'Sure?') { b.textContent = 'Sure?'; return; }
  if (lim && lim.id) tstore.limiti = tstore.limiti.filter(v => v.id !== lim.id);
  lim = null;
  dlgLim.close();
  touch();
  paintW();
});

$('wlist').addEventListener('click', ev => {
  if (ev.target.closest('button[data-piulimite]')) { apriLimite(null); return; }

  /* l'interruttore delle schede */
  if (ev.target.closest('button[data-schroot]')) {
    mostra.sch = !mostra.sch;
    salvaMostra();
    paintW();
    return;
  }
  /* una pastiglia: quel workout si vede o non si vede fra le schede */
  const ch = ev.target.closest('button[data-chipsch]');
  if (ch) {
    const n = ch.dataset.chipsch;
    const i = mostra.off.indexOf(n);
    if (i < 0) { mostra.off = mostra.off.concat([n]); if (scheda === n) scheda = null; }
    else mostra.off = mostra.off.filter(x => x !== n);
    salvaMostra();
    paintW();
    return;
  }
  /* il bottone di una scheda: apre i campi, o li chiude e lascia la tabella */
  const sb = ev.target.closest('button[data-scheda]');
  if (sb) {
    scheda = scheda === sb.dataset.scheda ? null : sb.dataset.scheda;
    paintW();
    return;
  }
  /* un esercizio in piu' */
  const pe = ev.target.closest('button[data-piues]');
  if (pe) {
    const n = pe.dataset.piues;
    const sc = tstore.schede[n] || { es: [], rec: '' };
    sc.es = sc.es.concat([['', '']]);
    tstore.schede[n] = sc;
    touch();
    paintW();
    return;
  }
  /* una riga in meno */
  const tg = ev.target.closest('button[data-togli]');
  if (tg) {
    const n = tg.dataset.togli, i = +tg.dataset.riga;
    const sc = tstore.schede[n];
    if (sc) {
      sc.es = sc.es.filter((r, j) => j !== i);
      if (!sc.es.length && !sc.rec) delete tstore.schede[n];
      touch();
      paintW();
    }
    return;
  }
  const r = ev.target.closest('[data-limite]');
  if (r) apriLimite(r.dataset.limite);
});

$('wBtn').addEventListener('click', () => openW(true));
$('chiudiW').addEventListener('click', () => openW(false));

$('menuBtn').addEventListener('click', () => openMenu(true));
$('chiudiMenu').addEventListener('click', () => openMenu(false));
$('velo').addEventListener('click', () => { openMenu(false); openW(false); });
$('tutte').addEventListener('change', e => { tutte = e.target.checked; paintDrawer(); });
$('calendar').checked = calendar;
$('calendar').addEventListener('change', e => {
  calendar = e.target.checked;
  try { localStorage.setItem(CALENDAR_KEY, calendar ? '1' : '0'); } catch (e2) {}
  paintDrawer();
});
$('nuova').addEventListener('click', () => openEditor(null));
$('impostazioniBtn').addEventListener('click', openImpostazioni);

/* tutta la riga apre l'editor: i tre puntini sono il segnale, non l'unico posto */
/* Spuntare una task dal menu'. Se e' gia' su un giorno, e' come spuntarla nella
   giornata. Se sta nel serbatoio non ha un giorno dove segnare la spunta:
   spuntandola qui va su oggi, prima sessione, e da li' segue la strada di
   sempre — a mezzanotte finisce in archivio. */
function spuntaDalMenu(id, on) {
  const x = findTask(id);
  if (!x) return;
  if (!x.giorno) {
    if (!on) return;
    x.giorno = dayKey(today());
    x.gws = [0];
    riapriSessione(x);
    setCheck(x.giorno, chiaveTask(x, 0), true);
    touch();
  } else {
    if (!isEditable(x.giorno)) return;
    /* un evento si spunta con la chiave che usa la giornata, non con l'id
       della riga: cosi' menu' e giornata restano la stessa spunta. Nel menu'
       una task ha una riga sola anche se sta su piu' sessioni: di li' si
       spunta tutta in una volta. */
    /* un evento lungo ha una spunta per ogni tappa che attraversa: dal menu'
       si chiudono tutte insieme */
    if (x.evento) for (const kk of chiaviEvento(x)) setCheck(x.giorno, kk, on);
    else for (const g of gwsDi(x.gws)) setCheck(x.giorno, chiaveTask(x, g), on);
  }
  render();
  paintDrawer();
}

$('drawerList').addEventListener('change', ev => {
  const i = ev.target.closest('input[data-tcheck]');
  if (i) spuntaDalMenu(i.dataset.tcheck, i.checked);
});

$('drawerList').addEventListener('click', ev => {
  /* la casella si occupa da sola: non deve aprire anche l'editor */
  if (ev.target.closest('input[data-tcheck]')) return;
  const root = ev.target.closest('button.grproot');
  if (root) {
    const k = root.dataset.root;
    if (rootAperte.has(k)) rootAperte.delete(k); else rootAperte.add(k);
    salvaAperti();
    paintDrawer();
    return;
  }
  const g = ev.target.closest('button.grpcli');
  if (g) {
    const k = g.dataset.cli;
    if (cliAperti.has(k)) cliAperti.delete(k); else cliAperti.add(k);
    salvaAperti();
    paintDrawer();
    return;
  }
  const li = ev.target.closest('.trow[data-task]');
  if (li) openEditor(li.dataset.task);
});

/* ------------------------------------------------------------ editor ---- */

const dlgEd = $('editor');
let ed = null;                   /* { id, rank, cliente, giorno, gws }: lo stato dell'editor aperto */

/* I giorni su cui si puo' mettere una task. Se la task sta gia' su un giorno
   che non e' piu' fra questi, quel giorno si mostra com'e': si puo' lasciare
   o togliere, non rimettere. */
/* I giorni lontani della finestra: da fra 3 a fra 7. I primi tre stanno gia'
   nel campo Day, questi sono quelli che restano. */
function giorniOltre() {
  const t0 = today();
  return [3, 4, 5, 6, 7].map(n => ({ k: dayKey(shift(t0, n)), lab: 'In ' + n + ' days' }));
}

function dayChoices(current) {
  const t0 = today();
  const out = [{ k: '', lab: 'Not scheduled' }];
  [['Today', 0], ['Tomorrow', 1], ['In 2 days', 2]].forEach(p => out.push({ k: dayKey(shift(t0, p[1])), lab: p[0] }));
  /* e i cinque giorni lontani, di seguito agli altri: la finestra arriva a sette */
  for (const o of giorniOltre()) out.push(o);
  if (current && !out.some(o => o.k === current)) {
    out.push({ k: current, lab: fmtDate.format(new Date(current + 'T00:00:00')) });
  }
  return out;
}

/* Il pannello di scelta. La tendina di sistema non si puo' vestire: su Android
   arriva bianca, con il suo carattere, e stona con tutto il resto. Qui il campo
   e' un bottone che apre un pannello fatto con gli stessi pezzi del resto
   dell'app. Un tocco per aprire, un tocco per scegliere: come prima. */
const dlgPick = $('picker');
let pickCb = null;

function apriPicker(titolo, items, sel, cb) {
  $('pickerTit').textContent = titolo;
  const ul = $('pickList');
  ul.textContent = '';
  for (const it of items) {
    const li = el('li', 'pickrow' + (it.k === sel ? ' sel' : ''), it.lab);
    li.dataset.v = it.k;
    ul.appendChild(li);
  }
  pickCb = cb;
  dlgPick.showModal();
}

function chiudiPicker() {
  pickCb = null;
  dlgPick.close();
}

$('pickList').addEventListener('click', ev => {
  const li = ev.target.closest('li[data-v]');
  if (!li) return;
  const v = li.dataset.v;
  const cb = pickCb;
  pickCb = null;
  dlgPick.close();
  if (cb) cb(v);
});

$('pickAnnulla').addEventListener('click', chiudiPicker);
dlgPick.addEventListener('cancel', () => { pickCb = null; });

/* Le voci delle due scelte, in un posto solo: le usa il pannello e le usa
   l'etichetta del campo, cosi' non possono dire cose diverse. */
const vociCliente = () => [{ k: '', lab: 'None' }]
  .concat(CLIENTI.map(c => ({ k: c.id, lab: c.nome })));

const etichetta = (items, k) => (items.find(o => o.k === k) || items[0]).lab;

/* sel e' la voce scelta, oppure l'elenco delle voci scelte dove se ne puo'
   segnare piu' d'una. */
function chips(box, items, sel) {
  box.textContent = '';
  for (const it of items) {
    const on = Array.isArray(sel) ? sel.indexOf(it.k) >= 0 : it.k === sel;
    const b = el('button', 'chip' + (on ? ' sel' : ''), it.lab);
    b.type = 'button';
    b.dataset.v = it.k;
    box.appendChild(b);
  }
}

function paintEditor() {
  $('tCliente').textContent = etichetta(vociCliente(), ed.cliente || '');
  if (ed.evento) return;          /* di un evento si sceglie soltanto il cliente */
  chips($('tRank'), RANKS.map(r => ({ k: r, lab: r })), ed.rank);
  $('tGiorno').textContent  = etichetta(dayChoices(ed.giorno), ed.giorno || '');
  const sched = !!ed.giorno;
  $('tGwsLab').hidden = !sched;
  $('tGws').hidden = !sched;
  if (sched) chips($('tGws'), [0, 1, 2, 3, 4].map(i => ({ k: String(i), lab: String(i + 1) })),
                   ed.gws.map(String));
}

function openEditor(id, preset) {
  const x = id ? findTask(id) : null;
  if (x && x.evento) {
    ed = { id: x.id, evento: x.evento, giorno: x.giorno, nome: titoloEvento(x),
           ora: (eventoDi(x) || x).txt || x.ora, cliente: x.cliente };
    apriEditor(false);
    return;
  }
  ed = x ? { id: x.id, rank: x.rank, cliente: x.cliente, giorno: x.giorno, gws: gwsDi(x.gws) }
         : { id: null, rank: 'B', cliente: null,
             giorno: (preset && preset.giorno) || null,
             gws: preset && preset.gws != null ? [preset.gws] : [] };
  if (ed.giorno && !ed.gws.length) ed.gws = [0];

  $('tNome').value = x ? x.nome : '';
  $('tDesc').value = x ? x.desc : '';
  apriEditor(!x);
}

/* Un evento del calendario dalla giornata: si puo' solo dargli un cliente.
   Titolo, giorno e orario sono di Google e restano in sola lettura. */
function openEvento(eid) {
  const k = viewKey;
  const raw = cal && cal.days && Array.isArray(cal.days[k]) ? cal.days[k] : [];
  const e = raw.map(v => prepEvent(v, k)).find(v => v.id === eid);
  if (!e) return;
  const rec = findTask('ev:' + eid);
  ed = { id: 'ev:' + eid, evento: eid, giorno: k, nome: e.title, ora: e.txt,
         cliente: rec ? rec.cliente : null };
  apriEditor(false);
}

/* La finestra, per una task o per un evento: per l'evento restano solo il
   titolo, la riga con giorno e ora, e la tendina del cliente. */
function apriEditor(nuova) {
  const ev = !!ed.evento;
  $('editorTit').textContent = ev ? ed.nome : nuova ? 'New task' : 'Edit task';
  $('tEvento').hidden = !ev;
  $('tEvento').textContent = ev ? whenText(ed) : '';
  $('tCampiTask').hidden = ev;
  $('tCampiGiorno').hidden = ev;
  $('tNome').disabled = ev;       /* e' required: nascosto, non deve bloccare il form */
  $('tElimina').hidden = ev || nuova;
  $('tElimina').textContent = 'Delete';
  paintEditor();
  dlgEd.showModal();
  /* Il fuoco resta sul dialogo. Senza questa riga showModal lo mette sul primo
     campo, e sul telefono la tastiera sale e copre meta' finestra prima ancora
     di aver deciso cosa scrivere. */
  dlgEd.focus();
}

$('editorForm').addEventListener('click', ev => {
  const b = ev.target.closest('button.chip');
  if (!b || !ed) return;
  const v = b.dataset.v;
  const box = b.parentNode.id;
  if (box === 'tRank') ed.rank = v;
  else if (box === 'tGws') {
    /* si accende e si spegne. L'ultima accesa non si spegne: una task messa
       su un giorno deve stare almeno in una sessione. */
    if (ed.gws.indexOf(+v) < 0) ed.gws = ed.gws.concat(+v).sort((a, b) => a - b);
    else if (ed.gws.length > 1) ed.gws = ed.gws.filter(g => g !== +v);
  }
  paintEditor();
});

/* I due campi a tendina aprono il pannello di scelta. Cambiando giorno la
   sessione compare o sparisce, come prima. */
$('tCliente').addEventListener('click', () => {
  if (!ed) return;
  apriPicker('Client', vociCliente(), ed.cliente || '', v => {
    ed.cliente = v || null;
    paintEditor();
  });
});

$('tGiorno').addEventListener('click', () => {
  if (!ed) return;
  apriPicker('Day', dayChoices(ed.giorno), ed.giorno || '', v => {
    ed.giorno = v || null;
    ed.gws = ed.giorno ? (ed.gws.length ? ed.gws : [0]) : [];
    paintEditor();
  });
});

$('editorForm').addEventListener('submit', ev => {
  if (ed && ed.evento) {
    /* un evento: si scrive o si toglie solo il cliente. Con "None" la riga
       sparisce dal file, l'evento resta nella giornata com'era. */
    let x = findTask(ed.id);
    const prima = x ? x.cliente : null;
    if (ed.cliente) {
      if (!x) { x = { id: ed.id, creata: new Date().toISOString() }; tstore.tasks.push(x); }
      x.evento = ed.evento; x.nome = ed.nome; x.ora = ed.ora; x.desc = '';
      x.rank = 'A'; x.cliente = ed.cliente; x.giorno = ed.giorno; x.gws = null;
    } else if (x) {
      tstore.tasks = tstore.tasks.filter(t => t.id !== ed.id);
    }
    const cambiato = prima !== ed.cliente;
    ed = null;
    if (cambiato) { touch(); render(); paintDrawer(); }
    return;
  }
  const nome = $('tNome').value.trim();
  if (!nome) {
    /* soli spazi: required passa, ma il dialogo resta aperto e niente si perde */
    ev.preventDefault();
    $('tNome').focus();
    return;
  }
  if (!ed) return;
  let x = ed.id ? findTask(ed.id) : null;
  if (!x) {
    x = { id: newId(), creata: new Date().toISOString() };
    tstore.tasks.push(x);
  }
  /* l'editor puo' restare aperto oltre la mezzanotte: un giorno scelto come
     "oggi" che nel frattempo e' diventato ieri si sposta sull'oggi vero. Una
     task che stava gia' su quel giorno invece puo' restarci. */
  const t0 = dayKey(today());
  if (ed.giorno && ed.giorno < t0 && ed.giorno !== x.giorno) ed.giorno = t0;
  const mossa = !ed.id || x.giorno !== ed.giorno
                || gwsDi(x.gws).join() !== ed.gws.join();
  /* Cambiando giorno, o tornando nel serbatoio, le vecchie spunte non seguono.
     Restando sullo stesso giorno se ne va solo quella delle sessioni lasciate:
     se un domani la task ci torna, non deve trovarsi gia' spuntata. */
  if (x.giorno && x.giorno !== ed.giorno) togliSpunte(x);
  else if (x.giorno) {
    for (const g of gwsDi(x.gws)) {
      if (ed.gws.indexOf(g) < 0) setCheck(x.giorno, chiaveTask(x, g), false);
    }
  }
  x.nome = nome;
  x.desc = $('tDesc').value;
  x.rank = ed.rank;
  x.cliente = ed.cliente;
  x.giorno = ed.giorno;
  x.gws = ed.giorno ? ed.gws.slice() : null;
  /* solo una task nuova o spostata riapre la sessione: un ritocco al nome no */
  if (mossa) riapriSessione(x);
  ed = null;
  touch(); render(); paintDrawer();
});

$('tAnnulla').addEventListener('click', () => { ed = null; dlgEd.close(); });
dlgEd.addEventListener('cancel', () => { ed = null; });

/* due tocchi per eliminare: il primo chiede, il secondo fa */
$('tElimina').addEventListener('click', () => {
  const b = $('tElimina');
  if (b.textContent !== 'Sure?') { b.textContent = 'Sure?'; return; }
  if (ed && ed.id) {
    const old = findTask(ed.id);
    if (old) togliSpunte(old);                       /* niente spunte orfane */
    tstore.tasks = tstore.tasks.filter(x => x.id !== ed.id);
  }
  ed = null;
  dlgEd.close();
  touch(); render(); paintDrawer();
});

/* ------------------------------------------------------------- pesca ---- */

const dlgPesca = $('pesca');
let pescaGws = null;

/* Il + della sessione: una task nuova gia' li' dentro, oppure una pescata dal
   serbatoio con un tocco. */
function openPesca(g) {
  pescaGws = g;
  $('pescaDay').textContent = 'GWS ' + (g + 1) + ' · ' + fmtLong.format(view);
  const box = $('pescaList');
  box.textContent = '';
  const list = tstore.tasks.filter(x => !x.giorno).sort(byRank);
  if (!list.length) {
    box.appendChild(el('p', 'vuoto', 'Pool empty'));
  } else {
    const ul = el('ul', 'trows');
    for (const x of list) ul.appendChild(trowNode(x, true));
    box.appendChild(ul);
  }
  dlgPesca.showModal();
}

$('pescaList').addEventListener('click', ev => {
  const li = ev.target.closest('.trow[data-task]');
  const x = li && findTask(li.dataset.task);
  if (!x) return;
  /* se nel frattempo il giorno mostrato e' diventato ieri, la task va su oggi */
  x.giorno = canSchedule(viewKey) ? viewKey : dayKey(today());
  x.gws = [pescaGws];
  riapriSessione(x);
  dlgPesca.close();
  touch(); render(); paintDrawer();
});
$('pescaNuova').addEventListener('click', () => {
  dlgPesca.close();
  openEditor(null, { giorno: viewKey, gws: pescaGws });
});
$('pescaAnnulla').addEventListener('click', () => dlgPesca.close());

/* ------------------------------------------------------ impostazioni ---- */

const dlgImp = $('impostazioni');

function openImpostazioni() {
  $('tokenInput').value = token;
  $('chiaveInput').value = chiave;
  const s = $('tokenStato');
  s.className = 'nota';
  s.textContent = token ? 'Token set.' : 'No token: tasks can be read but not saved.';
  const c = $('chiaveStato');
  c.className = 'nota';
  c.textContent = chiaveKo ? 'The last file would not open: key missing or wrong.'
                : chiave   ? 'Key set.'
                :            'No key: calendar and tasks travel in the clear.';
  dlgImp.showModal();
}

$('impostazioniForm').addEventListener('submit', () => {
  token = $('tokenInput').value.trim();
  chiave = $('chiaveInput').value.trim();
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
    if (chiave) localStorage.setItem(CHIAVE_KEY, chiave);
    else localStorage.removeItem(CHIAVE_KEY);
  } catch (e) { /* restano solo in memoria */ }
  /* con la chiave nuova si riprova ad aprire quello che non si apriva */
  chiaveKo = false;
  loadCalendar();
  pullTasks();
  salvaErr = '';
  beatAuth = true;                /* col token nuovo il battito riprova la quota personale */
  beatQuota = 0;
  loadBeat();                     /* subito, senza aspettare il tick */
  paintSalva();
  if (token) provaToken();
  else paintSync('no token');
});
$('tokenAnnulla').addEventListener('click', () => dlgImp.close());

/* Una lettura autenticata: se passa, il token e' buono. Scrivere lo si
   scopre al primo Salva, e se manca il permesso lo dice lui. */
async function provaToken() {
  try {
    const r = await fetch(TASK_API + '?ref=' + TASK_BRANCH, { headers: ghHeaders(), cache: 'no-store' });
    if (r.status === 401) paintSync('token rejected', true);
    else if (r.ok || r.status === 404) paintSync('token accepted');
    else paintSync('token: error ' + r.status, true);
  } catch (e) {
    paintSync('no network', true);
  }
}

/* -------------------------------------------------------------- sync ----- */

let salvando = false, salvaErr = '';
let syncMsg = '', syncErr = false;

function ghHeaders() {
  const h = { Accept: 'application/vnd.github+json' };
  if (token) h.Authorization = 'Bearer ' + token;
  return h;
}

/* ----------------------------------------------------------- cifratura --- */

/* Il repository e' pubblico: chi lo trova legge calendario e task. Con una
   chiave impostata i due file diventano un pacchetto illeggibile — AES-GCM a
   256 bit, chiave ricavata dalla parola con PBKDF2. Senza chiave non cambia
   niente: si scrive e si legge in chiaro, come e' sempre stato.

   Il formato: { enc:1, fp, salt, iv, ct }. `fp` e' l'impronta del contenuto in
   chiaro e serve al workflow per capire se gli eventi sono cambiati senza
   doverlo aprire. Un file senza `enc` e' in chiaro e si legge com'e': cosi' il
   passaggio da chiaro a cifrato non rompe niente. */

const ITER = 150000;

const bytesB64 = u => { let s = ''; for (const b of u) s += String.fromCharCode(b); return btoa(s); };
const b64Bytes = b => {
  const bin = atob(String(b).replace(/\s/g, ''));
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
};

async function derivaChiave(pass, salt) {
  const base = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt, iterations: ITER, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/* Senza chiave il testo passa com'e': l'app resta quella di prima. */
async function cifra(testo, fp) {
  if (!chiave) return testo;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv   = crypto.getRandomValues(new Uint8Array(12));
  const k    = await derivaChiave(chiave, salt);
  const ct   = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, k,
                                           new TextEncoder().encode(testo));
  /* l'impronta la mette solo chi ne ha bisogno: al workflow serve per capire
     se gli eventi sono cambiati, alle task no — e un'impronta in meno e' una
     cosa in meno che si puo' leggere da fuori */
  const p = { enc: 1, salt: bytesB64(salt), iv: bytesB64(iv), ct: bytesB64(new Uint8Array(ct)) };
  if (fp) p.fp = fp;
  return JSON.stringify(p, null, 2) + '\n';
}

/* Torna il testo in chiaro. Un file gia' in chiaro torna identico.
   Se il pacchetto e' cifrato e la chiave manca o non e' quella, lancia. */
async function decifra(testo) {
  let p = null;
  try { p = JSON.parse(testo); } catch (e) { return testo; }
  if (!p || p.enc !== 1) return testo;
  if (!chiave) throw new Error('key missing');
  const k = await derivaChiave(chiave, b64Bytes(p.salt));
  const buf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64Bytes(p.iv) },
                                          k, b64Bytes(p.ct));
  return new TextDecoder().decode(buf);
}

/* base64 di testo UTF-8, in entrambe le direzioni: btoa da solo si rompe
   sugli accenti. */
function b64enc(s) {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
function b64dec(b) {
  const bin = atob(String(b).replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/* Le ultime sha viste: una risposta dell'API rimasta in cache non deve
   sovrascrivere il telefono con una versione vecchia. */
function rememberSha(sha) {
  tstore.sha = sha;
  tstore.known = [sha].concat(tstore.known.filter(x => x !== sha)).slice(0, 4);
}

/* Due bottoni, uno stato: in alto nella pagina e in testa al menu'. */
function paintSalva() {
  for (const b of [$('salva'), $('salvaMenu')]) {
    b.hidden = !tstore.dirty;
    b.disabled = salvando;
    b.classList.toggle('err', !!salvaErr);
    b.textContent = salvando ? 'Saving…' : salvaErr ? 'Save — ' + salvaErr : 'Save';
  }
}

function paintSync(msg, err) {
  if (msg !== undefined) { syncMsg = msg; syncErr = !!err; }
  const s = $('sync');
  s.textContent = syncErr ? syncMsg : tstore.dirty ? 'unsaved changes' : syncMsg;
  s.classList.toggle('err', syncErr);
}

/* Il file dal branch task. Senza token si legge lo stesso. Se il telefono ha
   modifiche non salvate, vince il telefono: online si guarda soltanto. */
async function pullTasks() {
  let r;
  try {
    r = await fetch(TASK_API + '?ref=' + TASK_BRANCH, { headers: ghHeaders(), cache: 'no-store' });
  } catch (e) {
    return;                       /* offline: si va avanti con la copia locale */
  }
  /* token scaduto o revocato: lo si dice, ma leggere si puo' lo stesso, anonimi.
     L'avviso resta anche dopo la rilettura, altrimenti "allineato" lo coprirebbe. */
  let tokenKo = false;
  if (r.status === 401 && token) {
    tokenKo = true;
    paintSync('token rejected', true);
    try {
      r = await fetch(TASK_API + '?ref=' + TASK_BRANCH, { cache: 'no-store', headers: { Accept: 'application/vnd.github+json' } });
    } catch (e) { return; }
  }
  const fine = msg => paintSync(tokenKo ? 'token rejected' : msg, tokenKo);
  if (r.status === 404) { if (!tstore.sha) fine('no file online yet'); return; }
  if (!r.ok) return;

  let j;
  try { j = await r.json(); } catch (e) { return; }
  if (!j || !j.sha || tstore.known.indexOf(j.sha) >= 0) return;   /* gia' vista */

  let data;
  try {
    data = JSON.parse(await decifra(b64dec(j.content)));
  } catch (e) {
    paintSync('tasks encrypted: key missing or wrong', true);
    chiaveKo = true;
    return;
  }
  const remote = Array.isArray(data.tasks) ? data.tasks.map(validTask).filter(Boolean) : [];
  const piano  = validWorkout(data.workout);
  const dieta  = validDieta(data.dieta);
  const limiti = validLimiti(data.limiti);
  const schede = validSchede(data.schede);

  if (tstore.dirty) {
    /* e' la nostra stessa versione, salvata dal salvagente senza risposta? */
    if (sameTasks(remote, tstore.tasks)) {
      rememberSha(j.sha); tstore.dirty = false; saveLocal(); paintSalva();
      fine('in sync');
    } else {
      fine('a different version is online: saving overwrites it');
    }
    return;
  }

  tstore.tasks = remote;
  tstore.workout = piano;
  tstore.dieta = dieta;
  tstore.limiti = limiti;
  tstore.schede = schede;
  rememberSha(j.sha);
  tstore.dirty = false;
  saveLocal();
  tidyTasks(); render(); paintDrawer(); paintSalva();
  fine('in sync at ' + fmtTime.format(new Date()));
}

/* Un commit solo, con tutto dentro. */
async function pushTasks(opts) {
  opts = opts || {};
  if (!tstore.dirty || salvando) return;
  if (!token) { salvaErr = 'token missing'; paintSalva(); paintSync('token missing', true); return; }

  salvando = true; salvaErr = ''; salvaRetry = false;
  paintSalva();

  /* la fotografia di cio' che parte: se nel frattempo si tocca qualcosa,
     dirty deve restare acceso anche a salvataggio riuscito */
  const sent = JSON.stringify(tstore.tasks);
  const n = tstore.tasks.filter(x => !x.giorno).length;
  /* con la chiave impostata il file parte chiuso; senza, in chiaro come prima */
  const testo = JSON.stringify({ tasks: tstore.tasks, workout: tstore.workout,
                                 dieta: tstore.dieta, limiti: tstore.limiti,
                                 schede: tstore.schede }, null, 2) + '\n';
  let corpo;
  try {
    corpo = await cifra(testo);
  } catch (e) {
    salvando = false; salvaErr = 'encryption failed'; paintSalva();
    paintSync('encryption failed: check the key', true);
    return;
  }
  const payload = {
    message: 'task: ' + n + ' in serbatoio, ' + (tstore.tasks.length - n) + ' schedulate',
    content: b64enc(corpo),
    branch:  TASK_BRANCH
  };
  if (tstore.sha) payload.sha = tstore.sha;
  const body = JSON.stringify(payload);

  const salvato = () => {
    if (JSON.stringify(tstore.tasks) === sent) tstore.dirty = false;
    saveLocal(); paintSalva();
    paintSync('saved at ' + fmtTime.format(new Date()));
  };

  let r;
  try {
    r = await fetch(TASK_API, {
      method: 'PUT',
      headers: Object.assign({ 'Content-Type': 'application/json' }, ghHeaders()),
      body: body,
      /* keepalive rifiuta corpi oltre 64 KiB: sopra soglia meglio un tentativo
         normale che un rifiuto certo spacciato per rete assente */
      keepalive: !!opts.keepalive && body.length < 60000
    });
  } catch (e) {
    salvando = false; salvaErr = 'no network'; salvaRetry = true; paintSalva(); return;
  }
  salvando = false;

  /* sha vecchia: online e' cambiato qualcosa nel frattempo — di solito e' il
     salvagente di una chiusura precedente, arrivato senza che lo sapessimo.
     Si rilegge, e se e' la nostra stessa versione si e' gia' a posto;
     altrimenti si riprova una volta con la sha giusta. Vince il telefono. */
  if ((r.status === 409 || r.status === 422) && !opts.retry) {
    try {
      const cur = await fetch(TASK_API + '?ref=' + TASK_BRANCH, { headers: ghHeaders(), cache: 'no-store' });
      if (cur.status === 404) {
        /* non e' un conflitto: manca il branch, o il file */
        salvaErr = 'task branch missing'; paintSalva(); paintSync(salvaErr, true);
        return;
      }
      if (cur.ok) {
        const j = await cur.json();
        rememberSha(j.sha);
        let data = null;
        try { data = JSON.parse(await decifra(b64dec(j.content))); } catch (e) { /* si riprova comunque */ }
        if (data && sameTasks(data.tasks, tstore.tasks)) { salvato(); return; }
        return pushTasks(Object.assign({}, opts, { retry: true }));
      }
    } catch (e) { /* si cade nell'errore qui sotto */ }
    salvaErr = 'conflict online'; paintSalva(); paintSync(salvaErr, true);
    return;
  }

  if (!r.ok) {
    salvaErr = r.status === 401 ? 'token rejected'
             : r.status === 403 ? 'token without permission'
             : r.status === 404 ? 'task branch missing'
             :                    'error ' + r.status;
    salvaRetry = r.status >= 500;   /* un guasto di GitHub passa; un token no */
    paintSalva(); paintSync(salvaErr, true);
    return;
  }

  let j = null;
  try { j = await r.json(); } catch (e) { /* salvato comunque */ }
  if (j && j.content && j.content.sha) rememberSha(j.content.sha);
  salvato();
}

/* Il salvagente: si chiama chiudendo l'app. keepalive chiede al browser di
   finire la richiesta anche se la pagina muore. Di solito basta, non sempre:
   per questo la copia locale resta comunque, e Salva ricompare alla riapertura. */
function salvagente() {
  if (!tstore.dirty || !token || salvando) return;
  pushTasks({ keepalive: true });
}

/* Un salvataggio caduto per la rete, o per un 5xx di GitHub, si riprova da
   solo: quando la rete torna, a ogni riapertura, e al passo del battito
   mentre l'app resta aperta. Token rifiutato o senza permesso no: quelli li
   sistema la persona, riprovare sarebbe solo rumore. */
let salvaRetry = false;
function riprovaSalva() {
  if (tstore.dirty && salvaRetry && !salvando && token) pushTasks();
}

$('salva').addEventListener('click', () => pushTasks());
$('salvaMenu').addEventListener('click', () => pushTasks());

/* ---------------------------------------------------------- avviamento --- */

try {
  localStorage.removeItem(LEGACY_KEY);   /* lo storico precedente va eliminato, non migrato */
} catch (e) {
  /* niente da rimuovere */
}

async function loadCalendar() {
  const before = cal ? cal.generatedAt : null;
  try {
    const r = await fetch(CAL_URL, { cache: 'no-store' });
    if (!r.ok) throw new Error(String(r.status));
    /* il file puo' essere cifrato: si legge come testo e si apre con la chiave */
    const j = JSON.parse(await decifra(await r.text()));
    if (!(j && typeof j === 'object' && j.days && typeof j.days === 'object')) throw new Error('forma');
    cal = j; calAt = Date.now(); calErr = false;
    chiaveKo = false;
  } catch (e) {
    /* Una lettura fallita non cancella il calendario: si tiene l'ultima copia
       buona e la riga in alto dice da quanto e' vecchia. Meglio un calendario
       di due ore fa che una giornata vuota. */
    calErr = true;
    /* la chiave sbagliata o assente si distingue da una rete che non va: sono
       due guasti diversi e si sistemano in due posti diversi */
    chiaveKo = /chiave|decrypt|operation-specific/i.test(String(e && e.message)) || e instanceof DOMException;
    if (chiaveKo) { cal = null; paintSync('calendar encrypted: key missing or wrong', true); }
  }
  const first = !loaded;
  loaded = true;
  refreshRecords();
  paintFresh();
  /* stesso file: non si ridisegna, cosi' le descrizioni aperte restano aperte */
  if (first || !cal || cal.generatedAt !== before) render();
}

render();
paintDrawer();
paintSalva();
loadCalendar();
loadBeat();                       /* subito, all'apertura */
pullTasks();                      /* il serbatoio, subito */

setInterval(() => { checkDay(); paintFresh(); }, 30000);   /* invecchia la riga, e vede la mezzanotte */
setInterval(loadCalendar, 30000);
setInterval(() => { loadBeat(); riprovaSalva(); }, BEAT_MS);   /* solo mentre l'app resta aperta */

/* Riaprendola si ricontrolla tutto: e' il momento in cui la barra serve.
   Chiudendola parte il salvagente: un tentativo di salvare quello che e'
   rimasto in sospeso, nei pochi istanti che il browser concede. */
document.addEventListener('visibilitychange', () => {
  if (document.hidden) salvagente();
  else { checkDay(); loadCalendar(); loadBeat(); pullTasks(); riprovaSalva(); }
});
window.addEventListener('pagehide', salvagente);

/* La rete che va e viene: appena torna si rilegge tutto e si riprova il
   salvataggio rimasto in sospeso; appena manca la riga in alto lo dice. */
window.addEventListener('online', () => { loadCalendar(); loadBeat(); pullTasks(); riprovaSalva(); });
window.addEventListener('offline', paintFresh);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
