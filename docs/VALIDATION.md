# Validation locale — 29 septembre 2026

- Node.js 24.20.0, npm 11.19.0, Next.js 16.3.6.
- `npm test` : 48 tests réussis, 5 fichiers (Vitest 5.0.2).
- `npm run typecheck` : succès.
- `npm run build` : succès Turbopack et génération des 12 pages, aucune clé nécessaire.
- `npm run start -- --hostname 127.0.0.1 --port 3100` : démarrage du build compilé.
- HTTP local : /, /login, /pricing, /dashboard → 200 ; cron sans authentification → 401.
- Les tests de routes simulent les services externes. Les tests n'effectuent aucune requête réelle vers Stripe, Supabase, Resend ou OpenAI.
- Analyse des motifs de secrets sur les fichiers destinés à Git : aucun motif détecté. .env.local, .env.production et .vercel/project.json sont ignorés.
- Aucun changement dans supabase/migrations ; aucune commande SQL ni écriture vers une base existante.

Le build local sans secrets présente le dashboard en mode démo. Les parcours authentifiés et les intégrations hébergées restent à valider séparément, dans un environnement de test autorisé. Ce document ne certifie pas un déploiement de production.

Archives sources (SHA-256) :
- cashlance-v16-fretixo.zip : 81026F64545A6D174EE68AE0A2A8F825D58C6210CDEBEE2B2DE861978A4B21AE
- fretixo-portal.zip : 04738E2129BC4EBC578B876DB0F7C1DCA417674DDFBCF9997072D8972C6056BB
