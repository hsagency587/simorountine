'use strict';

/* =========================================================================
   La forma del piano dei workout. Lo stesso file lo leggono due pagine: la
   Routine, che tiene il piano dentro il suo file delle task e scrive nella
   giornata cosa si fa nei due workout, e l'app dei workout che sta nella
   tendina. Tutto chiuso in WK: nella Routine ci sono gia' funzioni con gli
   stessi nomi, e devono restare sue. Le regole sono quelle dell'app dei
   workout (l'ultima versione online): se cambia la forma la', cambia qui.
   ========================================================================= */

const WK = (() => {

  /* Quanti workout al giorno si possono avere: da uno a quattro. Oltre, sul
     telefono le colonne della tabella diventano troppo strette per leggerle. */
  const MAX_SLOT = 4;
  const SLOT_BASE = 2;
  const ORDINALI = ['1st', '2nd', '3rd', '4th'];

  /* Il piano: fino a quattro caselle per giorno della settimana (0 domenica ...
     6 sabato), testo corto. Le caselle vuote in fondo non si scrivono. Anche le
     caselle oltre il numero scelto restano: togliendo una colonna il testo si
     nasconde, non si perde, e rimettendola torna. */
  function validWorkout(w) {
    const out = {};
    if (!w || typeof w !== 'object') return out;
    for (let g = 0; g < 7; g++) {
      const r = Array.isArray(w[g]) ? w[g] : [];
      const a = [];
      for (let i = 0; i < MAX_SLOT; i++) a.push(String(r[i] == null ? '' : r[i]).slice(0, 60).trim());
      while (a.length && !a[a.length - 1]) a.pop();
      if (a.length) out[g] = a;
    }
    return out;
  }

  function validSlot(n) {
    n = Math.round(+n);
    return n >= 1 && n <= MAX_SLOT ? n : SLOT_BASE;
  }

  /* Il nome della scheda del mattino: si cambia a mano. Vuoto vuol dire quello
     di fabbrica, e nel file non si scrive. */
  const MATTINA_BASE = 'Morning activity';
  const validMattina = v => String(v == null ? '' : v).slice(0, 40).trim();

  /* Quando si vede una lista Every day:
     { modo: 'sempre' }                         tutti i giorni
     { modo: 'giorni', giorni: [1, 3, 5] }      certi giorni della settimana (0 domenica)
     { modo: 'ogni', n: 2, dal: 'aaaa-mm-gg' }  un giorno si' e n-1 no, a partire da una data
     { modo: 'date', date: ['aaaa-mm-gg'] }     solo in certe date
     { modo: 'ciclo', dal: 'aaaa-mm-gg', passi: [3, -2, 4, -1] }
                                                un ritmo che si ripete: 3 giorni si',
                                                2 no, 4 si', 1 no, e daccapo */
  function validQuando(q) {
    if (!q || typeof q !== 'object') return { modo: 'sempre' };
    if (q.modo === 'giorni') {
      const g = [...new Set((Array.isArray(q.giorni) ? q.giorni : []).map(Number).filter(x => x >= 0 && x <= 6))].sort();
      return { modo: 'giorni', giorni: g };
    }
    if (q.modo === 'ogni') {
      const n = Math.round(+q.n);
      return { modo: 'ogni', n: n >= 2 && n <= 14 ? n : 2, dal: /^\d{4}-\d{2}-\d{2}$/.test(q.dal) ? q.dal : '2026-01-05' };
    }
    if (q.modo === 'date') {
      const d = [...new Set((Array.isArray(q.date) ? q.date : []).filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x)))].sort().slice(-400);
      return { modo: 'date', date: d };
    }
    if (q.modo === 'ciclo') {
      const p = (Array.isArray(q.passi) ? q.passi : []).map(x => Math.round(+x)).filter(x => x && Math.abs(x) <= 60).slice(0, 20);
      return { modo: 'ciclo', dal: /^\d{4}-\d{2}-\d{2}$/.test(q.dal) ? q.dal : '2026-01-05', passi: p.length ? p : [1, -1] };
    }
    return { modo: 'sempre' };
  }

  /* Le liste Every day in piu', oltre alla prima: ognuna con la sua scheda,
     sotto la chiave __ev_ e il suo id. */
  const EV = id => '__ev_' + id;
  function validAltre(l) {
    if (!Array.isArray(l)) return [];
    return l.slice(0, 10).map(x => {
      if (!x || typeof x !== 'object' || typeof x.id !== 'string' || !/^[a-z0-9]{3,20}$/.test(x.id)) return null;
      return { id: x.id, nome: validMattina(x.nome), via: !!x.via, quando: validQuando(x.quando) };
    }).filter(Boolean);
  }

  /* La via dei gruppi, ripulita: al massimo quattro scatole una dentro l'altra,
     nomi corti, niente vuoti in mezzo. */
  function viaGruppi(v) {
    const a = Array.isArray(v) ? v : (v ? [v] : []);
    return a.map(x => String(x == null ? '' : x).slice(0, 40).trim()).filter(Boolean).slice(0, 4);
  }

  /* Il nome di un video (o di un audio): lettere e numeri a caso, e
     l'estensione. Lo sceglie l'app quando si carica il file. */
  const nomeVideoOk = v => typeof v === 'string' && /^[a-z0-9]{6,30}\.(mp4|webm|mov|m4v|jpg|mp3|m4a|aac|ogg|wav)$/.test(v);
  /* I video di un esercizio: la quinta casella ne tiene uno o piu'. */
  const videiDi = r => String((r && r[4]) || '').split(',').filter(Boolean);

  const normEs = t => String(t || '').toLowerCase().replace(/\s+/g, ' ').trim();

  /* Il tipo di un gruppo di un workout: Tabata o EMOM, con i numeri che servono
     al timer. Sta nella scheda, per gruppo: la chiave e' la via del gruppo
     scritta come testo (JSON). Tabata: l = secondi di lavoro, r = secondi di
     recupero, g = giri (0: finche' non si ferma). EMOM: m = minuti (0: finche'
     non si ferma), a = i minuti di fila di ogni esercizio, in ordine. Un
     gruppo che non c'e' piu' nelle righe perde il suo tipo. lati: per
     esercizio quanti lati ha, se piu' di uno. */
  const intra = (x, min, max, def) => { const n = Math.round(+x); return n >= min && n <= max ? n : def; };
  function validLati(o) {
    const out = {};
    if (o && typeof o === 'object' && !Array.isArray(o)) {
      for (const k of Object.keys(o).slice(0, 40)) { const n = intra(o[k], 1, 4, 1); if (n > 1) out[normEs(k)] = n; }
    }
    return Object.keys(out).length ? out : undefined;
  }
  function validTipo(x) {
    if (!x || typeof x !== 'object') return null;
    let t = null;
    if (x.t === 'tabata') t = { t: 'tabata', l: intra(x.l, 1, 600, 20), r: intra(x.r, 0, 600, 10), g: intra(x.g, 0, 99, 0) };
    if (x.t === 'emom') {
      const a = (Array.isArray(x.a) ? x.a : []).slice(0, 20).map(n => intra(n, 1, 10, 1));
      t = { t: 'emom', m: intra(x.m, 0, 180, 0), a: a };
    }
    const lati = t && validLati(x.lati);
    if (lati) t.lati = lati;
    return t;
  }
  const latiDi = (t, nome) => (t && t.lati && t.lati[normEs(nome)]) || 1;
  function validTipi(t, es) {
    if (!t || typeof t !== 'object' || Array.isArray(t)) return null;
    const out = {};
    for (const k of Object.keys(t).slice(0, 40)) {
      let via;
      try { via = viaGruppi(JSON.parse(k)); } catch (e) { continue; }
      if (!via.length) continue;
      const usata = es.some(r => via.every((x, i) => (r[2] || [])[i] === x));
      const v = validTipo(t[k]);
      if (usata && v) out[JSON.stringify(via)] = v;
    }
    return Object.keys(out).length ? out : null;
  }

  /* Il tipo del gruppo piu' interno di una riga che ne ha uno, con la sua via. */
  function tipoDi(sc, r) {
    const g = (r && r[2]) || [];
    for (let d = g.length; d > 0; d--) {
      const t = sc && sc.tipi && sc.tipi[JSON.stringify(g.slice(0, d))];
      if (t) return { via: g.slice(0, d), tipo: t };
    }
    return null;
  }

  /* Quando un gruppo cambia via (nome, o dentro un altro), il suo tipo e
     quelli dei gruppi dentro lo seguono. */
  function spostaTipi(sc, vecchia, nuova) {
    if (!sc.tipi) return;
    const out = {};
    for (const k of Object.keys(sc.tipi)) {
      const v = JSON.parse(k);
      const dentro = vecchia.every((x, i) => v[i] === x) && v.length >= vecchia.length;
      out[JSON.stringify(dentro ? nuova.concat(v.slice(vecchia.length)) : v)] = sc.tipi[k];
    }
    sc.tipi = out;
  }

  /* Le schede: per ogni nome di allenamento un elenco di esercizi, il
     recupero e i tipi dei gruppi. Ogni esercizio e' [nome, quantita', via dei
     gruppi, nota (o descrizione, nei dati di prima), video]. Le righe vuote
     non si tengono. */
  function validSchede(w) {
    const out = {};
    if (!w || typeof w !== 'object') return out;
    for (const k of Object.keys(w)) {
      const nome = String(k).slice(0, 60).trim();
      if (!nome) continue;
      const v = w[k] || {};
      const es = (Array.isArray(v.es) ? v.es : []).map(r => [
        String((Array.isArray(r) ? r[0] : '') || '').slice(0, 60).trim(),
        String((Array.isArray(r) ? r[1] : '') || '').slice(0, 60).trim(),
        viaGruppi(Array.isArray(r) ? r[2] : null),
        String((Array.isArray(r) ? r[3] : '') || '').slice(0, 4000),
        /* uno o piu' video, separati da virgole */
        String((Array.isArray(r) ? r[4] : '') || '').split(',').filter(nomeVideoOk).slice(0, 6).join(',')
      ]).filter(r => r[0] || r[1]);
      const rec = String(v.rec == null ? '' : v.rec).slice(0, 60).trim();
      if (!es.length && !rec) continue;
      out[nome] = { es: es, rec: rec };
      const tipi = validTipi(v.tipi, es);
      if (tipi) out[nome].tipi = tipi;
    }
    return out;
  }

  /* Quanti workout ha ogni giorno: da zero a quattro, giorno per giorno. */
  function validConti(c, vecchio) {
    const out = {};
    const base = vecchio == null ? SLOT_BASE : validSlot(vecchio);
    for (let g = 0; g < 7; g++) {
      const n = c && typeof c === 'object' ? Math.round(+c[g]) : NaN;
      out[g] = n >= 0 && n <= MAX_SLOT ? n : base;
    }
    return out;
  }

  const dataOk = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

  /* Le preparazioni: un periodo da una data a un'altra, con un piano suo, fatto
     a settimane. La settimana 1 e' quella del calendario (lunedi'-domenica) in
     cui cade l'inizio; se le settimane scritte sono meno di quelle del periodo,
     l'ultima si ripete. nomeFine: l'ultimo giorno mostra il nome (l'evento). */
  function validPrep(l) {
    if (!Array.isArray(l)) return [];
    return l.map(x => {
      if (!x || typeof x !== 'object' || !dataOk(x.dal) || !dataOk(x.al) || x.al < x.dal) return null;
      const sett = (Array.isArray(x.settimane) ? x.settimane : []).slice(0, 26).map(w => ({
        workout: validWorkout(w && w.workout),
        conti: validConti(w && w.conti, 1)
      }));
      if (!sett.length) sett.push({ workout: {}, conti: validConti(null, 1) });
      return {
        id: typeof x.id === 'string' && /^[\w-]{3,30}$/.test(x.id) ? x.id : 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        nome: String(x.nome == null ? '' : x.nome).slice(0, 50).trim(),
        dal: x.dal, al: x.al,
        settimane: sett,
        schede: validSchede(x.schede),
        mattina: validMattina(x.mattina),
        mattinaVia: !!x.mattinaVia,
        mattinaQuando: validQuando(x.mattinaQuando),
        altre: validAltre(x.altre),
        nomeFine: !!x.nomeFine
      };
    }).filter(Boolean).sort((a, b) => a.dal < b.dal ? -1 : 1);
  }

  /* Le sorprese (easter egg) dell'app dei workout. Nella Routine non ci sono:
     se un file ne avesse, restano scritte com'erano, e basta. */
  function validSorprese(l) {
    if (!Array.isArray(l)) return [];
    return l.slice(0, 200).map(x => {
      if (!x || typeof x !== 'object' || !dataOk(x.giorno)) return null;
      const tipo = x.tipo === 'img' ? 'img' : x.tipo === 'nota' ? 'nota' : x.tipo === 'suono' ? 'suono' : null;
      if (!tipo) return null;
      const o = { id: typeof x.id === 'string' && /^[\w-]{3,30}$/.test(x.id) ? x.id : 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
                  tipo: tipo, giorno: x.giorno };
      if (tipo === 'img') {
        if (!nomeVideoOk(x.img)) return null;
        o.img = x.img;
      } else if (tipo === 'suono') {
        if (!nomeVideoOk(x.audio)) return null;
        o.audio = x.audio;
      } else {
        o.testo = String(x.testo == null ? '' : x.testo).slice(0, 300).trim();
        if (!o.testo) return null;
        o.dove = String(x.dove || 'top').slice(0, 80);
        o.colore = [0, 1, 2, 3].indexOf(x.colore) >= 0 ? x.colore : 0;
      }
      return o;
    }).filter(Boolean);
  }

  /* La libreria degli esercizi: una riga per esercizio, con la descrizione e
     i video (nome, '', [], descrizione, video). */
  const validLibreria = l => { const v = validSchede({ l: { es: Array.isArray(l) ? l : [], rec: '' } }).l; return v ? v.es.filter(r => r[0]) : []; };

  /* Di ogni esercizio, per nome (minuscolo, spazi puliti): di chi e' variante
     (p, il nome del padre) e la categoria (c). Serve solo all'editor. */
  function validEsercizi(o) {
    const out = {};
    if (!o || typeof o !== 'object' || Array.isArray(o)) return out;
    for (const k of Object.keys(o).slice(0, 2000)) {
      const n = normEs(k).slice(0, 60);
      const x = o[k] || {};
      const p = String(x.p == null ? '' : x.p).slice(0, 60).trim();
      const c = String(x.c == null ? '' : x.c).slice(0, 40).trim();
      if (!n || (!p && !c)) continue;
      out[n] = {};
      if (p && normEs(p) !== n) out[n].p = p;
      if (c) out[n].c = c;
      if (!out[n].p && !out[n].c) delete out[n];
    }
    return out;
  }

  /* Il contenuto del piano, e basta: serve a capire se due versioni sono uguali. */
  const contenuto = s => JSON.stringify({ workout: validWorkout(s.workout), schede: validSchede(s.schede),
                                           conti: validConti(s.conti, s.slot), mattina: validMattina(s.mattina),
                                           mattinaVia: !!s.mattinaVia, prep: validPrep(s.prep),
                                           mattinaQuando: validQuando(s.mattinaQuando), altre: validAltre(s.altre),
                                           sorprese: validSorprese(s.sorprese), libreria: validLibreria(s.libreria),
                                           esercizi: validEsercizi(s.esercizi), importati: !!s.importati });

  /* Il piano pulito, pronto per stare in memoria. */
  function valida(s) {
    s = s && typeof s === 'object' ? s : {};
    return { workout: validWorkout(s.workout), conti: validConti(s.conti, s.slot),
             schede: validSchede(s.schede), mattina: validMattina(s.mattina),
             mattinaVia: !!s.mattinaVia, mattinaQuando: validQuando(s.mattinaQuando),
             altre: validAltre(s.altre), prep: validPrep(s.prep),
             sorprese: validSorprese(s.sorprese), libreria: validLibreria(s.libreria),
             esercizi: validEsercizi(s.esercizi), importati: !!s.importati };
  }

  /* Il piano come si scrive nel file: quello che e' vuoto o di fabbrica resta
     fuori. */
  function daFile(s) {
    const v = valida(s);
    return { workout: v.workout, conti: v.conti, schede: v.schede,
             mattina: v.mattina || undefined,
             mattinaVia: v.mattinaVia || undefined,
             mattinaQuando: v.mattinaQuando.modo === 'sempre' ? undefined : v.mattinaQuando,
             altre: v.altre.length ? v.altre : undefined,
             prep: v.prep.length ? v.prep : undefined,
             sorprese: v.sorprese.length ? v.sorprese : undefined,
             libreria: v.libreria.length ? v.libreria : undefined,
             esercizi: Object.keys(v.esercizi).length ? v.esercizi : undefined,
             importati: v.importati || undefined };
  }

  /* L'attivita' del mattino ha una chiave fissa nel file, che non cambia mai. */
  const MORNING = '__morning';
  const MORNING_ROUTINE = 'Morning activity';

  /* Il piano scritto dalla Routine prima che l'app dei workout ci entrasse: due
     caselle per giorno, e le schede mescolate a quelle della dieta. Diventa un
     piano dell'app senza cambiare niente di quello che c'e' scritto: stessi
     workout negli stessi giorni, due al giorno, stesse schede. L'attivita' del
     mattino passa sotto la sua chiave fissa e si vede tutti i giorni, com'era.
     Le schede della dieta (`tenere`) restano alla Routine. */
  function migra(workout, schede, tenere) {
    const w = {};
    if (workout && typeof workout === 'object') {
      for (let g = 0; g < 7; g++) {
        const r = Array.isArray(workout[g]) ? workout[g] : [];
        w[g] = [r[0], r[1]];
      }
    }
    const sc = {};
    const tutte = schede && typeof schede === 'object' ? schede : {};
    for (const k of Object.keys(tutte)) {
      if (tenere.indexOf(String(k).trim()) >= 0) continue;
      sc[String(k).trim() === MORNING_ROUTINE ? MORNING : k] = tutte[k];
    }
    return valida({ workout: w, conti: validConti(null, 2), schede: sc });
  }

  /* Gli esercizi dell'app dei workout (workout/esercizi.json: nome, quanto,
     gruppi, descrizione, video) entrano nella libreria, una volta sola: poi
     il piano lo dice con `importati`, e un esercizio tolto dalla libreria non
     torna. Quelli che la libreria ha gia' restano come sono. */
  function importa(s, righe) {
    const ci = new Set((s.libreria || []).map(r => normEs(r[0])));
    const nuove = validLibreria(righe).filter(r => !ci.has(normEs(r[0])));
    s.libreria = (s.libreria || []).concat(nuove);
    s.importati = true;
    return nuove.length;
  }

  /* ------------------------------------------------ quale piano vale ---- */

  const pad2 = n => (n < 10 ? '0' : '') + n;
  const chiaveData = d => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  const daChiave = k => new Date(k + 'T00:00:00');
  function lunedi(d) { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
  const giorniFra = (a, b) => Math.round((daChiave(b) - daChiave(a)) / 86400000);

  function settimanaDi(p, k) {
    const i = Math.floor(giorniFra(chiaveData(lunedi(daChiave(p.dal))), chiaveData(lunedi(daChiave(k)))) / 7);
    return Math.max(0, Math.min(i, p.settimane.length - 1));
  }

  /* Il piano che vale in una data: quello della preparazione in corso, se ce
     n'e' una, altrimenti quello di sempre. */
  function pianoDi(s, k) {
    const p = (s.prep || []).find(x => x.dal <= k && k <= x.al);
    if (!p) return { workout: s.workout || {}, conti: s.conti || {}, mattina: s.mattina };
    const w = p.settimane[settimanaDi(p, k)];
    return { workout: w.workout, conti: w.conti, mattina: p.mattina };
  }

  /* Cosa si fa in quel workout (0 il primo, 1 il secondo...), quel giorno. */
  function workoutDi(s, k, slot) {
    if (!s) return '';
    const pi = pianoDi(s, k);
    const g = daChiave(k).getDay();
    const v = (pi.workout[g] || []).slice(0, pi.conti[g] || 0)[slot] || '';
    return v === MORNING ? (pi.mattina || MATTINA_BASE) : v;
  }

  return { MAX_SLOT, SLOT_BASE, ORDINALI, MATTINA_BASE, MORNING, EV,
           validWorkout, validSlot, validMattina, validQuando, validAltre, viaGruppi,
           validSchede, nomeVideoOk, videiDi, normEs, validConti, dataOk, validPrep,
           validSorprese, validLibreria, validEsercizi, validTipo, validTipi, latiDi,
           tipoDi, spostaTipi, contenuto, valida, daFile, migra, importa, workoutDi };
})();
