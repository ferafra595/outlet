# Gestionale MB

PWA mobile-first per gestione magazzino, vendite, resi e provvigioni progressive.

## Funzioni incluse
- Area Store semplice e area Admin protetta
- Scanner barcode con fotocamera e scansione continua
- Caricamento e modifica prodotti
- Importazione CSV/XLSX
- Carrello multi-prodotto e prezzo finale modificabile
- Scarico automatico magazzino
- Resi e annullamenti con storico completo
- Provvigioni mensili progressive: 10% fino a 5.000 €, 12% da 5.001 a 7.500 €, 15% oltre 7.500 €
- Dashboard, movimenti, prodotti fermi, report XLSX/PDF
- Modalità offline con coda di sincronizzazione
- Installabile su iPhone come PWA

## Installazione locale
1. Installa Node.js 20 o superiore.
2. Esegui `npm install`.
3. Copia `.dev.vars.example` in `.dev.vars` e imposta password e segreto.
4. Crea il database locale: `npm run db:migrate:local`.
5. Avvia worker e frontend: `npm run dev`.

Il frontend Vite usa la porta 5173; il Worker Wrangler normalmente la 8787. Per test completo in locale conviene eseguire prima `npm run build` e poi `npm run dev:worker`, aprendo l'indirizzo indicato da Wrangler.

## Pubblicazione Cloudflare
1. Accedi a Cloudflare da terminale: `npx wrangler login`.
2. Crea D1: `npx wrangler d1 create gestionale-mb-db`.
3. Copia il `database_id` ottenuto dentro `wrangler.toml`.
4. Applica le migrazioni: `npm run db:migrate:remote`.
5. Imposta i segreti:
   - `npx wrangler secret put ADMIN_PASSWORD`
   - `npx wrangler secret put SESSION_SECRET`
   - opzionale: `npx wrangler secret put RESEND_API_KEY`
6. Per le email, modifica in `wrangler.toml` o nei secrets:
   - `EMAIL_FROM`
   - `ALERT_EMAIL`
7. Pubblica: `npm run deploy`.

## GitHub
Crea un repository vuoto e carica tutti i file della cartella. Per il deploy automatico puoi collegare il repository a Cloudflare Workers Builds oppure usare GitHub Actions.

## Formato importazione
Intestazioni riconosciute:
`barcode, internal_code, name, brand, category, model, color, size, season, list_price, cost_price, quantity, notes`

## Note importanti
- Il codice a barre recupera automaticamente i dati solo se il prodotto è già stato registrato nel database.
- Se il codice non esiste, viene aperta la scheda di creazione prodotto.
- L'area Store è volutamente senza login, come richiesto. L'URL va trattato come gestionale interno. Prima di un uso pubblico è consigliato aggiungere almeno un PIN Store.
- La modalità offline salva le operazioni sul singolo dispositivo e le invia quando torna la connessione. Evitare di usare contemporaneamente più dispositivi offline.
- Per usare la fotocamera il sito deve essere servito in HTTPS; Cloudflare lo fa automaticamente.
