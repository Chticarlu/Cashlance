# Cashlance — Checklist production V8

## Déjà opérationnel
- [x] Projet Supabase Cashlance créé en eu-west-3
- [x] Tables métier et billing créées
- [x] RLS activé sur les tables publiques
- [x] Auth email/password prévue
- [x] Création client + facture
- [x] Relances J-3 / J+1 / J+7 / J+15 / J+30
- [x] Webhook Resend codé et signé
- [x] Cron de relance codé
- [x] Stripe connecté en mode test
- [x] Products Stripe Solo / Pro / Équipe créés
- [x] Prices persistants 19 / 39 / 79 € HT/mois créés
- [x] Customer Portal Stripe configuré
- [x] Résiliation Stripe en fin de période
- [x] Changement d'offre autorisé dans le portail
- [x] Checkout 14 jours d'essai codé
- [x] Webhook Stripe codé pour Checkout / Subscription / Invoice

## Variables Stripe de test
STRIPE_PRICE_SOLO=price_1UKgqAEeUQED7nKDyQmEuxmP
STRIPE_PRICE_PRO=price_1UKgqBEeUQED7nKDAxapy4OI
STRIPE_PRICE_TEAM=price_1UKgqDEeUQED7nKDBu3F5RGS
STRIPE_AUTOMATIC_TAX_ENABLED=false

## Secrets à créer dans Vercel
SUPABASE_SECRET_KEY=
RESEND_API_KEY=
RESEND_WEBHOOK_SECRET=
CASHLANCE_FROM_EMAIL=
CASHLANCE_INBOUND_DOMAIN=
CRON_SECRET=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

## Bloquants externes restants
1. Créer/mettre à disposition un dépôt GitHub `cashlance` pour le déploiement Vercel.
2. Déployer le projet sur Vercel et définir `NEXT_PUBLIC_APP_URL`.
3. Ajouter toutes les variables d'environnement dans Vercel.
4. Créer le webhook Stripe vers `/api/stripe/webhook` et récupérer son secret `whsec_...`.
5. Choisir/vérifier le domaine Cashlance dans Resend, puis créer le webhook entrant Resend.
6. Compléter les réglages Stripe Tax (adresse du siège et inscriptions TVA applicables) avant d'activer `STRIPE_AUTOMATIC_TAX_ENABLED=true`.
7. Effectuer un parcours de test complet : inscription → Checkout → essai → portail → facture → relance → réponse.
8. Avant production : créer les Products/Prices en mode live et remplacer les Price IDs de test par les IDs live.
