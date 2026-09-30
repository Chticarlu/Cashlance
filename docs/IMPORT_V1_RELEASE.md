# CashLance — import V1, 30 septembre 2026

## Reprise et résultat

Base conservée : V16 `4e1681e`, puis `b668eb3`. Aucun développement CashLance inachevé dans le dépôt à la reprise. L’audit de migration racine reste bloqué par les réglages Auth hébergés et l’identification du compte Stripe Transport (voir `RESUME_2026_09_30.md`). Aucun domaine déplacé.

Parcours livré : landing → inscription / essai 14 jours → import ou exemple → analyse locale → correction / validation explicite → création atomique clients + factures → programmation. L’ancien endpoint de saisie manuelle utilise désormais le même traitement sécurisé.

- Démonstration exclusivement dans le navigateur : entreprise/facture fictives, suppression immédiate, aucun email ni facture en base.
- PDF texte, PDF scannés courts, JPG/PNG avec OCR français local, plusieurs documents, XLSX multi-feuilles et CSV avec mapping modifiable.
- Émetteur et débiteur séparés ; les propositions restent « à vérifier ». Aucun nom de client déduit du seul premier nom d’entreprise. Les informations manquantes ne sont pas inventées.
- Brouillon privé sauvegardé ; email facultatif pour enregistrer, obligatoire pour programmer. Reprise et activation depuis le dashboard.
- Validation transactionnelle, isolation RLS, dédoublonnage client/référence et reprise idempotente du même lot. Première relance au plus tôt 24 h après validation, puis au moins 24 h entre étapes en retard.
- Les nouveaux imports ne sont envoyés que pendant l’essai local de 14 jours ou un abonnement/essai Stripe actif. Le comportement Stripe et les relances historiques sont conservés.
- UTM dans les métadonnées Auth à l’inscription ; événements authentifiés dans `funnel_events`. Activation unique par utilisateur et abonnement mesuré via la synchronisation existante Stripe. Aucun contenu de facture dans les événements. Les visites anonymes ne sont pas agrégées côté serveur dans cette V1.
- Emails de démarrage, import à vérifier, facture à programmer, activation et fin d’essai : consentement facultatif, maximum un par jour et par étape, drapeau global désactivé par défaut. Aucun envoi pendant les tests.

## Fichiers principaux

`app/page.tsx`, `app/login/page.tsx`, `app/auth/callback/route.ts`, `app/onboarding/page.tsx`, `app/import/page.tsx`, `app/dashboard/page.tsx`, `components/import-workspace.tsx`, `components/demo-panel.tsx`, `lib/imports/*`, `app/api/imports/*`, `lib/onboarding-emails.ts`, `app/api/cron/reminders/route.ts`.

Les dépendances ajoutées servent à lire les documents sur l’appareil (PDF.js, Tesseract français, read-excel-file). Les moteurs sont servis par le même domaine via `prebuild` ; aucun CDN tiers et aucun nouvel OCR payant. Les documents bruts ne quittent pas le navigateur et ne sont pas conservés. Seuls le brouillon extrait et les données validées sont enregistrés avec RLS.

## Migration et mise en ligne — non exécutées

Migration additive : `supabase/migrations/20260930000000_import_funnel.sql`. Ajoute les colonnes d’import aux factures, brouillons/lots privés, événements, préférences et suivi des emails, les fonctions de validation/activation et le filtre de sélection cron. Aucun effacement de données.

**Ne pas déployer ce code avant la migration.** Le nouveau dashboard et le cron utilisent les nouvelles colonnes/fonctions. Aucun push automatique effectué pour éviter un déploiement Git/Vercel prématuré.

Ordre recommandé, après autorisation d’écrire dans l’environnement concerné :

1. Appliquer les migrations existantes puis la nouvelle migration à une base de test isolée ; configurer une preview Vercel avec cette base et les intégrations de test existantes.
2. Vérifier Auth : `Site URL=https://cashlance.fretixo.fr` en production et autoriser exactement `https://cashlance.fretixo.fr/auth/callback` ; ajouter uniquement les URL de preview nécessaires à la base de test. Conserver provisoirement l’ancienne URL Cashlance dans l’allowlist. Vérifier les modèles Auth et leurs liens de confirmation/récupération. La dernière lecture hébergée montrait encore `cashlancev1.vercel.app` : aucune correction distante faite ici.
3. Tester confirmation email réelle, RLS sur deux utilisateurs, création/retour Checkout test, Portal et webhooks sur les comptes déjà identifiés. Les tests locaux ne remplacent pas ce contrôle hébergé.
4. Après accord, appliquer la migration additive en production, puis pousser/déployer sur le projet existant `fretixo/cashlancev1`. Conserver `NEXT_PUBLIC_APP_URL=https://cashlance.fretixo.fr` et toutes les clés/prices existants. Ne changer aucun webhook Cashlance pendant la bascule : ils restent sur `cashlancev1.vercel.app`.
5. Laisser `CASHLANCE_ONBOARDING_EMAILS=false` jusqu’à validation de l’expéditeur et du consentement ; `true` active les rappels pour les seuls utilisateurs ayant opté pour ces emails. Aucun nouveau cron nécessaire : utilisation du cron existant. Les erreurs d’envoi sont enregistrées, sans répétition automatique aveugle.

Rollback applicatif : restaurer le déploiement Vercel précédent ; garder les colonnes/tables additives et toutes les données. **Attention :** l’ancien cron ne connaît pas la limite de l’essai des nouveaux imports. S’il faut revenir en arrière après des imports réels, prévoir une correction ciblée du cron ou sa suspension autorisée avant le rollback ; ne pas annoncer un rollback transparent des envois. Ne pas supprimer les données ni inverser brutalement la migration.

`fretixo.fr`, `www`, `inbound.fretixo.fr`, les MX, Resend et les configurations Supabase/Stripe hébergées n’ont pas été modifiés.

## Vérification locale

Résultat final : **93 tests unitaires/intégration PostgreSQL et 6 parcours navigateur réussis**, TypeScript et build de production valides. Commit fonctionnel : `a819966`. Une vérification ciblée supplémentaire confirme l’arrêt propre du serveur de test Windows et la landing finale.

- `npm test` : tests existants V16, Stripe Checkout/Portal/retours, signatures webhooks Stripe/Resend, classification, parsing et validation, emails optionnels, transactions PostgreSQL locales et RLS entre deux utilisateurs.
- `npm run test:e2e` : navigateur Chromium/Edge, viewport mobile 390 px et desktop ; signup simulé et UTM, démo sans mutation, CSV, deux PDF, XLSX sans email puis activation, PNG et JPG OCR réels sur factures synthétiques, dashboard, absence de débordement et redirection anonyme. Les services distants sont simulés sur loopback uniquement.
- `npm run typecheck`, `npm run build` : vérification TypeScript et production. `npm install` : aucune vulnérabilité signalée.
- Fixtures synthétiques dans `tests/fixtures`. Capture mobile et desktop sous `test-results` (ignoré par Git). Régénération facultative via `tests/fixtures/generate.py` avec Pillow/reportlab/openpyxl. Pour un autre OS, adapter le canal navigateur de `playwright.config.ts`.

Limites assumées : EUR uniquement ; 10 fichiers/25 Mo par sélection, 10 Mo par fichier, 200 créances par lot, PDF 10 pages maximum ou 3 pages scannées. Une facture par PDF. Les grands livres PDF complexes, HEIC natif, Sage/EBP/API comptables et OCR avancé restent hors V1. La qualité OCR dépend de la photo ; vérifier et corriger reste obligatoire. Pas de conservation du PDF original ni de calcul automatique du restant dû depuis des lignes comptables débit/crédit. Safari/iPhone physique et les écritures réelles en sandbox restent à valider avant mise en production.
