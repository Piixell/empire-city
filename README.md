# Empire City

Gioco da tavolo immobiliare **multiplayer online fino a 6 giocatori**, giocabile da browser, con plancia maxi da **48 caselle**, aste in tempo reale, costruzioni, ipoteche, trattative, carte evento e bancarotta. Grafica, nomi e contenuti sono originali.

Stack: **Next.js 16 (App Router) · TypeScript · React 19 · Tailwind CSS 4 · componenti stile shadcn/ui (Radix) · Framer Motion · Lucide · Supabase (Postgres, Auth anonima, Realtime) · Vercel**.

---

## Indice

1. [Architettura](#architettura)
2. [Struttura del progetto](#struttura-del-progetto)
3. [Avvio rapido in locale (senza Supabase)](#avvio-rapido-in-locale-senza-supabase)
4. [Configurazione Supabase](#configurazione-supabase)
5. [Deploy su Vercel](#deploy-su-vercel)
6. [Test](#test)
7. [Regole implementate](#regole-implementate)
8. [Sicurezza](#sicurezza)
9. [Limiti noti e verifiche manuali](#limiti-noti-e-verifiche-manuali)

---

## Architettura

```
 Browser (React)                         Vercel (funzioni serverless)                 Supabase
 ───────────────                         ────────────────────────────                 ────────
 1. Auth anonima  ───────────────────────────────────────────────────────────────▶  Auth (JWT)
 2. GET  /api/rooms/:code   ──▶  verifica JWT ─▶ snapshot completo  ◀──────────────  Postgres
 3. POST /api/games/:id/command { commandId, command }
                                 │ BEGIN
                                 │ SELECT … FROM game_sessions … FOR UPDATE   (lock riga)
                                 │ idempotenza: game_actions(game_id, command_id)
                                 │ carica stato normalizzato → motore puro TS → salva diff
                                 │ COMMIT  ───────────────────────────────────────▶  Postgres
 4. Realtime postgres_changes  ◀────────────────────────────────────────────────  Realtime (RLS)
    (game_sessions.public_state + version, room_players, chat_messages)
```

Principi chiave:

- **Il server è autorevole.** Dadi (`crypto.randomInt`), mescolamento dei mazzi, denaro, proprietà, turni, edifici e vincitore sono calcolati dal **motore di gioco puro** (`src/lib/game/engine.ts`) eseguito *solo* sul server, dentro una transazione Postgres con lock della riga della partita. Il browser visualizza e basta.
- **Transazioni atomiche e serializzate.** Ogni comando apre una transazione, blocca `game_sessions` con `SELECT … FOR UPDATE`, valida il comando sullo stato più recente e scrive tutte le tabelle coinvolte prima del `COMMIT`. Due richieste concorrenti vengono quindi applicate una dopo l'altra: la seconda viene validata sullo stato già aggiornato (niente doppi acquisti / doppi lanci).
- **Idempotenza.** Ogni comando ha un `commandId` (UUID) generato dal client; il vincolo `unique(game_id, command_id)` in `game_actions` garantisce che una richiesta ripetuta (retry di rete, doppio clic) restituisca lo stesso esito senza riapplicarla. I retry di rete del client riusano lo stesso id.
- **Database normalizzato come fonte di verità** (`game_players`, `property_ownership`, `game_decks`, `game_auctions`, `auction_bids`, `trade_offers`, `game_turns`, `game_events`…). `game_sessions.public_state` è una proiezione pubblica (senza l'ordine segreto dei mazzi) scritta nella stessa transazione e distribuita da **Supabase Realtime**.
- **Sincronizzazione robusta.** Al caricamento il client legge uno snapshot completo, poi si sottoscrive a Realtime; a ogni (ri)connessione, focus o ritorno online rilegge lo snapshot. Gli stati sono applicati solo se la `version` è più recente (nessun rollback visivo con messaggi fuori ordine). Un polling di sicurezza (15 s con Realtime attivo, 3 s se Realtime cade) chiude ogni buco residuo.
- **Timer senza server persistente.** Le scadenze (turno, aste, debiti) sono salvate nel database. Quando scadono, qualunque client connesso invia `TIMEOUT`; il server verifica con il **proprio orologio** (`clock_timestamp()`) che la scadenza sia davvero passata e applica la procedura automatica (lancio, rinuncia, chiusura asta, liquidazione debiti, fine turno). Richieste multiple sono innocue grazie al lock. Compatibile al 100% con Vercel (nessun processo sempre attivo, nessun WebSocket server proprio).
- **Animazioni solo visive.** Le pedine camminano casella per casella seguendo gli eventi `move`/`jail`, ma la posizione ufficiale è sempre quella del server; se un client ha perso eventi (riconnessione) le pedine si riallineano direttamente.

## Struttura del progetto

```
src/
  app/
    page.tsx                         Home (crea / unisciti)
    room/[code]/page.tsx             Stanza: join → lobby → partita → risultati
    api/rooms/route.ts               POST crea stanza
    api/rooms/[code]/route.ts        GET snapshot (membri) / anteprima (non membri)
    api/rooms/[code]/[action]/       join | profile | ready | settings | start | leave | rematch | chat
    api/games/[gameId]/command/      POST comando di gioco (idempotente)
  lib/game/                          Motore puro e condiviso
    types.ts  board.ts  cards.ts  rules.ts  engine.ts  rng.ts
  lib/server/                        Solo server
    db.ts            postgres.js (produzione) / PGlite (locale e test)
    game-service.ts  load/save normalizzato + applicazione comandi in transazione
    rooms.ts         stanze, lobby, chat, host, rivincita
    auth.ts          verifica JWT Supabase (o identità di sviluppo in locale)
    validation.ts    schemi zod + sanitizzazione
  lib/client/                        session (auth anonima), api (retry idempotenti)
  hooks/useRoom.ts                   snapshot + Realtime + presence + polling di sicurezza
  components/
    lobby/  room/  game/ (Board, Tile, Dice, PlayersPanel, ActionPanel, dialogs, Results)  ui/
supabase/
  migrations/                        schema, RLS, Realtime, seed plancia/carte
  setup.sql                          tutte le migrazioni in un unico file (npm run db:bundle)
tests/
  engine.test.ts                     regole di gioco + simulazione casuale a 6 giocatori
  integration.test.ts                backend reale (SQL + servizi) su Postgres PGlite
```

## Avvio rapido in locale (senza Supabase)

Requisiti: **Node.js 20+** (testato con Node 26).

```bash
npm install
npm run dev
```

Apri http://localhost:3000. Senza variabili Supabase l'app parte in **modalità locale**:

- database **PGlite** (Postgres in WebAssembly) salvato in `./.data/pglite`, con le stesse migrazioni SQL di produzione;
- un'identità di sviluppo **per scheda** del browser: apri più schede (o finestre in incognito) per simulare più giocatori sullo stesso PC;
- sincronizzazione tramite polling ogni ~1,2 s (Realtime non è disponibile senza Supabase).

La modalità locale è disattivata automaticamente in produzione (`NODE_ENV=production`).

## Configurazione Supabase

1. **Crea un progetto** su https://supabase.com (scegli la regione più vicina ai giocatori; userai la stessa per Vercel).
2. **Abilita l'accesso anonimo**: *Authentication → Sign In / Providers → Anonymous sign-ins → Enable*. (Consigliato: attiva anche la protezione CAPTCHA/rate limit di Supabase Auth se il sito sarà pubblico.)
3. **Applica le migrazioni** (una delle due):
   - *SQL Editor*: incolla il contenuto di `supabase/setup.sql` ed esegui; oppure
   - *Supabase CLI*: `npx supabase link --project-ref <ref>` e poi `npx supabase db push`.
4. **Realtime**: la migrazione `…_realtime.sql` aggiunge `game_rooms`, `room_players`, `game_sessions`, `chat_messages` alla publication `supabase_realtime`. Verifica in *Database → Publications* (o *Realtime → Settings*) che siano presenti.
5. **RLS**: è già attiva su tutte le tabelle (migrazione `…_rls.sql`). I ruoli `anon`/`authenticated` possono solo **leggere** le righe delle stanze di cui sono membri attivi; nessuna scrittura è consentita dal browser. `game_room_secrets` (hash password), `game_decks` (ordine segreto delle carte) e `game_actions` non sono leggibili dai client.
6. **URL di autenticazione** (*Authentication → URL Configuration*):
   - *Site URL*: `https://<tuo-progetto>.vercel.app` (o il tuo dominio);
   - *Redirect URLs*: aggiungi il dominio di produzione e, se usi le preview di Vercel, `https://*-<tuo-team>.vercel.app/**`.
   L'accesso anonimo non usa redirect, ma configurarli evita problemi se in futuro aggiungi login via email/OAuth.
7. **Chiavi** (*Project Settings → API* e *Database*):
   - `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` (chiave pubblica/anon);
   - `DATABASE_URL`: *Connect → Transaction pooler* (porta **6543**), es. `postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres`.

> La **Service Role Key non serve** e non va mai inserita in variabili `NEXT_PUBLIC_*`. Le scritture passano dalle API server tramite `DATABASE_URL`, che resta solo lato server.

Per sviluppare in locale contro Supabase, copia `.env.example` in `.env.local` e compila i valori.

## Deploy su Vercel

1. Pubblica il repository su GitHub/GitLab e importalo su https://vercel.com/new (framework rilevato: Next.js).
2. In *Settings → Environment Variables* aggiungi per Production (e Preview):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `DATABASE_URL` (transaction pooler, porta 6543)

   In alternativa usa l'integrazione **Supabase del Vercel Marketplace** (*Storage → Create Database → Supabase*): crea il progetto e inietta da sola `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` e `POSTGRES_URL`, che l'app usa al posto di `DATABASE_URL`. Restano da fare a mano le migrazioni SQL e l'abilitazione dell'accesso anonimo.
3. In *Settings → Functions → Function Region* scegli la **stessa regione** del database Supabase (ogni comando esegue ~10 query in transazione: la latenza tra Vercel e il DB conta).
4. Deploy. Aggiorna il *Site URL* di Supabase con il dominio finale.

Build di produzione locale: `npm run build && npm start` (richiede le variabili Supabase; per provare la build in modalità locale: `EMPIRE_ALLOW_LOCAL=1 npm start`).

## Test

```bash
npm test          # vitest: motore + integrazione backend
npm run typecheck # TypeScript strict
```

- `tests/engine.test.ts` — 31 test sulle regole: composizione plancia e mazzi, acquisto, affitti (anche quartiere completo, trasporti, servizi), doppi e tre doppi, prigione (tentativi, cauzione, carta), aste (rilanci, minimi, saldo, timeout, nessuna offerta), costruzione uniforme fino alla torre, vendita edifici, ipoteca/riscatto con interessi, scambi atomici con invalidazione delle offerte in conflitto e controfferte, debiti con liquidazione, bancarotta verso giocatore e verso banca, vittoria per ultimo superstite e per limite di tempo, timeout AFK, carte. Include una **simulazione casuale di 10 partite a 6 giocatori** che verifica a ogni passo gli invarianti (saldi ≥ 0, edifici coerenti, nessuna proprietà a giocatori eliminati, conservazione delle carte).
- `tests/integration.test.ts` — 18 test che eseguono **le vere migrazioni SQL e i servizi del server** su Postgres (PGlite), coprendo gli scenari richiesti: 6 giocatori che entrano insieme, colori unici, avvio solo da host con tutti pronti, capitale iniziale, lancio e movimento (stato e versione aggiornati), acquisto, affitto, scambio, asta, riconnessione con la stessa sessione, **richieste duplicate e simultanee senza duplicazione di denaro**, timeout validati dal server, bancarotte e fine partita con vincitore, rivincita e passaggio dell'host, RLS (non membri non vedono la stanza, segreti illeggibili), rate limit della chat.
- `tests/seed.test.ts` — verifica che il seed SQL sia allineato a `board.ts`/`cards.ts`.

## Regole implementate

| Elemento | Valore |
|---|---|
| Caselle | 48 (13 per lato): 26 proprietà in 8 quartieri (6×3, 2×4), 5 trasporti, 3 servizi, 4 Evento Urbano, 3 Fondo Cittadino, 3 tasse, 4 angoli |
| Capitale iniziale | 2.000 cr (configurabile) |
| Bonus Partenza | 250 cr (configurabile) |
| Affitti | base; ×2 con quartiere completo senza edifici; 1–4 case; torre |
| Costruzioni | solo con quartiere completo e senza ipoteche, costruzione/vendita uniforme, max 4 case + torre, vendita al 50% |
| Ipoteca | 50% del prezzo; riscatto = ipoteca + 10%; niente affitto se ipotecata |
| Trasporti | 30 / 60 / 120 / 240 / 400 in base al numero posseduto |
| Servizi | dadi × 5 / 12 / 20 |
| Prigione | cauzione 60 cr, carta "esci gratis", doppio; al 3° tentativo fallito cauzione obbligatoria |
| Doppi | tiro extra; tre doppi consecutivi = prigione |
| Aste | rilancio minimo 10 cr (primo) / +5 cr, timer 20 s prolungato di 8 s a ogni offerta, offerte ≤ saldo |
| Debiti | fase dedicata: vendi edifici, ipoteca, tratta, paga o dichiara bancarotta |
| Bancarotta | verso un giocatore: liquidità, proprietà (ipotecate restano tali) e carte al creditore; verso la banca: proprietà tornano libere |
| Fine partita | ultimo giocatore attivo; con durata massima: patrimonio netto più alto (liquidità + valore proprietà + edifici) |
| Timer turno | 120 s (configurabile); allo scadere il turno prosegue automaticamente |

## Sicurezza

- Tutte le scritture passano da API server che verificano il JWT Supabase (`auth.getUser`), l'appartenenza alla stanza e il turno/fase.
- Input validati con **zod**; chat sanitizzata (caratteri di controllo/invisibili, `<`/`>`, max 300 caratteri) e con rate limit (5 messaggi / 10 s); React esegue l'escaping in rendering.
- Password delle stanze con **scrypt** + salt, confronto a tempo costante, in tabella non leggibile dai client.
- Vincoli di integrità nel database: saldo ≥ 0, edifici 0–5, niente edifici su proprietà ipotecate, colori unici per stanza, una sola asta aperta per partita, idempotenza dei comandi.
- Header di sicurezza (`X-Frame-Options`, `nosniff`, `Referrer-Policy`).

## Limiti noti e verifiche manuali

Verificato in questo ambiente: build/typecheck, test automatici (motore + backend su PGlite) e una partita a 4 giocatori giocata nel browser in modalità locale (lobby, avvio, dadi, movimento animato, acquisto, asta con timeout, scambio, gestione proprietà, layout desktop e mobile).

**Non verificabile senza un progetto Supabase reale** (da controllare dopo il primo deploy):

1. Realtime `postgres_changes` + RLS e presence (online/disconnesso) con 6 browser su reti diverse.
2. Contesa dei lock con connessioni Postgres realmente parallele (PGlite serializza le transazioni: l'idempotenza e la validazione sono testate, il comportamento `FOR UPDATE` sotto carico va confermato su Supabase).
3. Latenza Vercel ↔ Supabase e dimensionamento del pooler.

Checklist manuale consigliata (6 dispositivi): crea stanza con password → 5 amici entrano dal link → colori/pedine diversi e aggiornati in tempo reale → tutti pronti → avvio → verificare 2.000 cr ciascuno → lanci e movimento visibili a tutti → acquisto → affitto → scambio → asta → chiudere e riaprire il browser di un giocatore (rientra nella stessa partita) → doppio clic veloce su "Lancia i dadi" (un solo lancio) → bancarotta → schermata finale → "Nuova partita con gli stessi giocatori".

Semplificazioni consapevoli: non è modellata la scorta limitata di case/torri della banca; le proprietà tornate alla banca dopo una bancarotta non vengono messe all'asta; il trasferimento di proprietà ipotecate tramite scambio non applica la commissione del 10%.
# empire-city
