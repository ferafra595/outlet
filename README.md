# Gestionale MB

Gestionale mobile-first per magazzino, vendite, resi e provvigioni progressive.

## Stack

- Vite + JavaScript
- Cloudflare Workers
- Cloudflare D1
- PWA installabile su iPhone
- Scanner barcode tramite fotocamera

## Struttura corretta del repository

Nella cartella principale devono esserci direttamente:

- `index.html`
- `package.json`
- `package-lock.json`
- `vite.config.js`
- `wrangler.toml`
- `src/`
- `public/`
- `worker/`
- `migrations/`

Non devono esserci file `main.jsx` dentro `migrations`, `public` o `worker`.

## Pubblicazione Cloudflare

### 1. Crea D1

Cloudflare → Storage & Databases → D1 → Create database

Nome database:

`gestionale-mb-db`

### 2. Crea le tabelle

Apri il database → Console → incolla tutto il contenuto di:

`migrations/0001_initial.sql`

Esegui il codice SQL.

### 3. Inserisci il Database ID

Apri `wrangler.toml` e sostituisci:

`INSERISCI_DATABASE_ID`

con il Database ID reale mostrato da Cloudflare.

### 4. Collega GitHub

Cloudflare → Workers & Pages → Crea applicazione → Continue with GitHub.

Seleziona il repository e usa:

- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- Root directory: `/`

### 5. Variabili segrete

Nel Worker → Settings → Variables and Secrets, aggiungi come Secret:

- `ADMIN_PASSWORD`: password amministratore
- `SESSION_SECRET`: stringa lunga e casuale

Variabili opzionali per email tramite Resend:

- `RESEND_API_KEY`
- `EMAIL_FROM`
- `ALERT_EMAIL=effestrategy@gmail.com`

### 6. Binding D1

Nel Worker → Settings → Bindings deve essere presente:

- Variable name: `DB`
- D1 database: `gestionale-mb-db`

## Accesso amministratore

Email predefinita:

`effestrategy@gmail.com`

La password è il valore impostato in `ADMIN_PASSWORD`.

## Test eseguiti

- `npm install`
- `npm run build`
- `wrangler deploy --dry-run`

Tutti completati correttamente.
