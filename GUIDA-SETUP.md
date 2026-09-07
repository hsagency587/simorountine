# Routine — guida di impianto per una nuova persona

Questo pacchetto contiene il codice dell'app "G Work" (cartella `routine/`)
e queste istruzioni. Serve a mettere in piedi una copia **tua**: repository
tuo, calendario tuo, cron tuo, token tuoi, tappe tue. Niente di quello che
farai tocca l'impianto di chi te l'ha passato.

La guida e' scritta per due lettori insieme: **tu** e **il tuo Claude**, a cui
darai questo zip. Le parti marcate `[Claude]` sono operazioni sul codice che
fa lui; le parti marcate `[tu]` sono cose che puoi fare solo tu, perche'
passano da account, pannelli e password. Seguite l'ordine: ogni passo dipende
da quello prima.

---

## 0. Cos'e' e come gira (leggere prima, 3 minuti)

Una PWA statica (HTML, JS, CSS: nessun framework, nessun server) pubblicata
su GitHub Pages e installata su un telefono Android come app. Mostra una
routine giornaliera fissa con tappe e sottotappe da spuntare, sei "G Work
Session" dentro cui finiscono gli eventi del calendario Google del giorno, una
percentuale, una serie di giorni completi, un pop-up di chiusura giornata con
voto e commento, uno storico mensile esportabile, e un Menu' Task (serbatoio
di cose da fare, schedulabili nelle sessioni).

Le parti in movimento:

```
Google Calendar (indirizzo iCal segreto)
        |  ogni 2 minuti
cron esterno  ->  chiama l'API di GitHub (repository_dispatch)
        |
GitHub Actions (calendar.yml)  ->  scarica l'iCal, produce calendar.json
        |                            (ieri, oggi, domani, dopodomani)
commit sul branch orfano "dati"  <- SOLO se gli eventi sono cambiati
        |
raw.githubusercontent.com  ->  il telefono lo rilegge ogni 30 s
```

- Il **sito** (il guscio dell'app) si pubblica con `pages.yml` solo quando
  cambia il codice su `main`. Mai ogni due minuti: e' stato provato, dopo sei
  ore Pages smette di applicare i deploy continuando a dichiararli riusciti.
- Il **battito** (la riga in alto: "Aggiornato alle…", "FERMO…") si legge
  dall'API pubblica dei run di Actions, non da un file.
- Le **task** vivono in `tasks.json` sul branch orfano `task`, letto e scritto
  **dal telefono** via API con un token personale. Local-first: ogni tocco e'
  istantaneo, il tasto verde Salva fa un commit, alla chiusura dell'app parte un
  salvataggio di sicurezza.
- Le **spunte**, i record, il diario e lo storico stanno nel localStorage del
  telefono. Non escono mai, se non nel Markdown che scarichi tu.

Tutto e' documentato nei commenti del codice, in italiano: `[Claude]` leggi
per intero `app.js`, `sw.js`, `.github/workflows/calendar.yml` e `pages.yml`
prima di toccare qualsiasi cosa.

---

## 1. Il repository `[tu]`

1. Nell'account GitHub dell'agenzia: **New repository**, nome a piacere
   (es. `Routine-<tuo-nome>`), **Public** (Pages gratis vuole il pubblico:
   la routine, gli eventi e le task saranno leggibili da chi trova il repo;
   il sito e' escluso dai motori di ricerca con un meta noindex, il repo no).
   Nessun README, nessun .gitignore: il pacchetto ha gia' tutto.
2. Sul PC: scompatta lo zip, entra in `routine/`, e:

       git init
       git add -A
       git commit -m "Impianto iniziale"
       git branch -M main
       git remote add origin https://github.com/<account>/<repo>.git
       git push -u origin main

3. **Settings > Pages > Build and deployment > Source: GitHub Actions.**
   Senza questo il deploy fallisce.

Da qui in poi `<account>/<repo>` e' il tuo (es. `hsagency587/Routine-marco`).

## 2. I riferimenti nel codice `[Claude]`

Il codice ha il repository scritto dentro in **quattro punti**. Vanno tutti
cambiati con `<account>/<repo>`:

- `app.js` — `TASK_API`, `CAL_URL`, `RUNS_URL` (righe vicine all'inizio)
- `sw.js` — `CAL_URL`

Cerca `hsagency587/Routine` e sostituisci: non deve restarne nessuno.
Poi in `manifest.webmanifest` e `index.html` il nome dell'app ("G Work") se
lo si vuole cambiare; le icone `icon-*.png` si sostituiscono a piacere,
stesse dimensioni. Commit e push.

## 3. Le tue tappe `[tu + Claude]`

Consegna al tuo Claude il PDF con le tappe personali. La routine sta in
`app.js`, costante `ROUTINE`: un elenco ordinato di tappe. Ogni tappa ha:

- `id` — una parola, unica, stabile (le spunte in localStorage sono legate
  all'id: cambiarlo dopo vuol dire perdere le spunte gia' date);
- `t` — il testo mostrato;
- opzionale `sub: [...]` — sottotappe, ognuna con `id` e `t`;
- opzionale `choice: [...]` — alternative che si escludono a vicenda (es.
  FULL / MED) e contano come una figlia sola;
- opzionale `gws: N` (0..5) — la tappa e' una G Work Session: ci finiscono gli
  eventi del calendario della fascia N e le task schedulate li'.

Regole che il codice si aspetta:

- Le **sei fasce** orarie delle sessioni sono in `FASCE`, in minuti dalla
  mezzanotte, e devono coprire le 24 ore senza buchi. Le **finestre protette**
  (la sirena suona se un evento ci cade dentro) sono in `PROTETTE`. Adattale
  agli orari di chi usa l'app.
- La tappa che **chiude la giornata** (spuntandola si apre il pop-up con voto
  e commento) e' quella con l'id in `CLOSE_ID`. Ce ne deve essere una.
- Ordine dell'elenco = ordine sullo schermo. La "tappa attiva" e' la prima
  non chiusa.

`[Claude]`: traduci il PDF in `ROUTINE`, rispetta le regole sopra, non toccare
il resto della logica. Commit e push. Ogni push su `main` ripubblica il sito.

## 4. Il calendario Google `[tu]`

1. Google Calendar sul PC > impostazioni del calendario che vuoi mostrare >
   in fondo, **"Indirizzo segreto in formato iCal"**. Copialo. E' un segreto:
   chi lo ha legge il tuo calendario.
2. GitHub > il tuo repo > **Settings > Secrets and variables > Actions > New
   repository secret**: nome esattamente `GCAL_ICAL_URL`, valore l'indirizzo.

Il workflow `calendar.yml` legge quel secret. Se manca, i run falliscono con
un messaggio chiaro nel log ("Il secret GCAL_ICAL_URL non e' impostato").

## 5. La sveglia: il cron esterno `[tu]`

GitHub Actions ha un cron interno (`*/5` nel workflow) ma e' inaffidabile:
salta esecuzioni a piacere. Per questo la sveglia vera e' un servizio esterno
che ogni 2 minuti chiama l'API di GitHub. Serve:

1. Un **token** con permesso di scrittura sul repo (fine-grained: Settings
   dell'account > Developer settings > Personal access tokens > Fine-grained >
   Generate; *Only select repositories* > il tuo repo; *Repository
   permissions > Contents: Read and write*; nient'altro). Questo token vive
   nel servizio cron, non nel telefono.
2. Nel servizio cron (quello che usi tu — cron-job.org o simile), un job ogni
   2 minuti che faccia:

       POST https://api.github.com/repos/<account>/<repo>/dispatches
       Header  Authorization: Bearer <token>
       Header  Accept: application/vnd.github+json
       Body    {"event_type":"refresh-calendar"}

   `refresh-calendar` e' il nome che `calendar.yml` ascolta: non cambiarlo.

Prova che funziona: GitHub > Actions > "Aggiorna calendario" deve mostrare un
run ogni 2 minuti, verde. Il primo run riuscito crea da solo il branch `dati`.

## 6. Il branch delle task `[Claude, sul PC di chi ha il repo]`

Le task si salvano su un branch orfano `task` che **deve esistere prima del
primo Salva**, altrimenti l'app dice "branch task assente". Si crea una volta,
dalla cartella del repo:

    printf '{\n  "tasks": []\n}\n' > /tmp/tasks.json
    BLOB=$(git hash-object -w /tmp/tasks.json)
    TREE=$(printf '100644 blob %s\ttasks.json\n' "$BLOB" | git mktree)
    COMMIT=$(git commit-tree "$TREE" -m "Il serbatoio delle task, vuoto")
    git branch task "$COMMIT"
    git push origin task

(Con git bash su Windows funziona uguale.) Il branch non va **mai** unito a
`main`: e' un archivio, non codice.

## 7. Il token del telefono `[tu]`

Un **secondo** token fine-grained, identico al primo come permessi (solo il
tuo repo, solo *Contents: Read and write*), ma separato: se il telefono si
perde revochi questo e il cron continua a girare.

Sul telefono, nell'app: **☰ > Impostazioni > incolla > Salva token**. La riga
in fondo al menu' deve dire "token accettato". Leggere le task funziona anche
senza token; e' scrivere che lo richiede.

Il token e' una chiave di scrittura sul repository: chi lo ha puo' pushare su
tutti i branch, `main` compreso. Se si vuole chiudere quella porta: Settings
> Rules > Rulesets > ruleset su `main` con *Require a pull request before
merging* (required approvals **0**) e *Restrict deletions*, bypass list vuota.
Da quel momento su `main` si arriva solo via PR.

## 8. Il telefono `[tu]`

Chrome su Android > `https://<account>.github.io/<repo>/` > menu' ⋮ >
*Aggiungi a schermata Home* / *Installa app*. Poi il token (passo 7).

Prova completa: crea una task dal **+** del menu', premi il **Salva** verde: se
sparisce e in fondo al menu' compare "salvato alle …", il giro e' chiuso. Su
GitHub, branch `task`, c'e' il tuo commit.

---

## 9. Come si capisce se qualcosa non va

La riga in alto nell'app dice quattro cose diverse:

| Riga | Vuol dire | Dove guardare |
|---|---|---|
| **Aggiornato alle HH:MM** | tutto vivo | — |
| **I giri falliscono — ultimo riuscito alle …** | la sveglia batte, il workflow fallisce | Actions > log del run: quasi sempre l'iCal (secret sbagliato o revocato) |
| **FERMO — nessun giro da …** | la sveglia esterna e' morta | il servizio cron: token scaduto, job disattivato |
| **Battito non verificabile** (grigio) | non lo so, non e' un allarme | rete, o quota API anonima esaurita (indirizzo condiviso in 4G/5G): passa da sola |
| **Calendario non raggiungibile** (rosso) | il file su `dati` non arriva | il branch `dati` non esiste ancora, o rete assente |

Tre controlli dal PC, senza credenziali (repo pubblico):

    # i run girano e come finiscono
    curl -s "https://api.github.com/repos/<account>/<repo>/actions/workflows/calendar.yml/runs?per_page=5" | grep -E '"(created_at|conclusion)"'

    # il sito servito e' quello nuovo (dopo ogni push su main)
    curl -sI https://<account>.github.io/<repo>/index.html | grep -i last-modified

    # il dato pubblicato
    curl -s https://raw.githubusercontent.com/<account>/<repo>/dati/calendar.json | head -3

Regola imparata a caro prezzo: **un run verde non vuol dire sito aggiornato**.
La prova e' sempre quello che il sito serve davvero.

## 10. Cose da non fare

- Non rimettere la pubblicazione di Pages dentro il giro dei due minuti
  (cioe' non far fare a `calendar.yml` un deploy). Pages si blocca in silenzio.
- Non committare `calendar.json` o `tasks.json` su `main`: sono in
  `.gitignore` apposta. Vivono su `dati` e `task`.
- Non unire `dati` o `task` a `main`.
- Non cambiare il nome di `calendar.yml`: il battito nell'app cerca i run di
  quel file per nome.
- Non mettere l'indirizzo iCal o i token nel codice: secret di GitHub, servizio
  cron, Impostazioni dell'app. Tre posti, tre chiavi diverse.

## 11. Per Claude: l'ordine di lavoro

1. Leggi tutto il codice, i commenti spiegano ogni scelta.
2. Passo 2 (riferimenti al repo) prima di qualunque altra modifica.
3. Passo 3 (tappe) dal PDF, rispettando `FASCE`, `PROTETTE`, `CLOSE_ID`.
4. Passo 6 (branch `task`) sul PC di chi ha il repo.
5. Verifica con i tre `curl` del passo 9 dopo il primo push e dopo il primo
   giro del cron.
6. Non aggiungere dipendenze, framework, build step. Il sistema e' volutamente
   senza: e' quello che lo tiene in piedi.
