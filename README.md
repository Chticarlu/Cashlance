# Cashlance V16 — service FRETIXO

Production cible : https://cashlance.fretixo.fr. Réception Resend conservée sur inbound.fretixo.fr.

Installation et validation : `npm ci`, `npm test`, `npm run typecheck`, `npm run build`.

Voir [la comparaison V16](docs/V16_REVIEW.md) et [les conditions de déploiement](docs/DEPLOYMENT_HANDOFF.md). Les informations historiques ci-dessous ne constituent pas une validation des comptes ou services actuels. Ne pas réexécuter les migrations SQL sur les bases existantes.

SaaS B2B de relance amiable automatisée pour TPE/PME.

## Stack
- Next.js App Router
- Supabase Auth + PostgreSQL + RLS
- Stripe Billing + Checkout + Customer Portal
- Resend pour les emails sortants/entrants
- Vercel pour l'hébergement et le cron

## Fonctionnalités principales
- Authentification et organisation par compte
- Clients, factures et relances J-3 / J+1 / J+7 / J+15 / J+30
- Envoi de relances via Resend
- Réception et classification sûre des réponses client
- Abonnements Stripe mensuels avec essai gratuit 14 jours
- Portail Stripe pour moyen de paiement, factures, changement d'offre et résiliation
- Synchronisation du statut d'abonnement dans Supabase par webhook

## Stripe V8
Cashlance utilise désormais des Products/Prices Stripe persistants, recommandés pour un SaaS à tarifs fixes.

Offres de test :
- Solo — 19 € HT/mois — `price_1UKgqAEeUQED7nKDyQmEuxmP`
- Pro — 39 € HT/mois — `price_1UKgqBEeUQED7nKDAxapy4OI`
- Équipe — 79 € HT/mois — `price_1UKgqDEeUQED7nKDBu3F5RGS`

Ces Price IDs ne sont pas secrets. Les clés `STRIPE_SECRET_KEY` et `STRIPE_WEBHOOK_SECRET` doivent rester exclusivement côté serveur.

Checkout :
- mode `subscription`
- essai 14 jours
- collecte du moyen de paiement pendant l'inscription
- collecte du numéro fiscal activée
- tarifs HT (`tax_behavior=exclusive` dans Stripe)
- Stripe Tax activable avec `STRIPE_AUTOMATIC_TAX_ENABLED=true` après configuration fiscale du compte

Webhook Stripe recommandé :
`https://VOTRE-DOMAINE/api/stripe/webhook`

Événements :
- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

## Important sur Stripe Tax
Le compte Stripe de test Cashlance a actuellement Stripe Tax en statut `pending` car l'adresse du siège (`head_office`) n'est pas encore renseignée. Le code garde donc le calcul automatique des taxes désactivé par défaut. Il faut compléter Stripe Tax avant de passer cette variable à `true`.

## Variables
Copier `.env.example` vers `.env.local` en local, puis ajouter les mêmes variables dans Vercel.

Ne jamais exposer au navigateur :
- `SUPABASE_SECRET_KEY`
- `RESEND_API_KEY`
- `RESEND_WEBHOOK_SECRET`
- `CRON_SECRET`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

## Sécurité des réponses email
Les emails entrants sont considérés comme non fiables. Cashlance ne suit jamais des instructions arbitraires contenues dans un email client. Un message disant « payé » est uniquement classé comme déclaration et ne constitue jamais une preuve de paiement.


## Vercel deployment

The project is configured for Vercel. Preserve existing secrets and sender settings when reviewing `.env.example`. The daily `/api/cron/reminders` route (07:00 UTC) validates `Authorization: Bearer $CRON_SECRET`. Review existing Stripe and Resend webhook destinations before any deployment; do not create duplicates or change inbound DNS.
