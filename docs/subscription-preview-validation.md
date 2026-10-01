# Validation du tunnel CashLance

Cette branche ne modifie pas la Production. La migration `subscription_funnel` doit être appliquée avant le code, uniquement à Supabase Test pour la validation. La Preview refuse les clés Stripe Live et les écritures admin sur un autre Supabase que `nropdaayfhfuftyuacgt`.

## Parcours attendu

1. Avec un utilisateur fictif déjà confirmé dans Supabase Test, se connecter : sans abonnement Stripe, destination `/pricing`.
2. Ouvrir directement `/dashboard`, `/import` ou une facture : accès refusé et retour aux offres. Les API payantes répondent 402, même sans navigation par l’interface.
3. Choisir une offre : Checkout Stripe Test propose 14 jours pour un premier abonnement. Un ancien abonné ne reçoit pas un nouvel essai ; `canceled` et `cancelled` sont reconnus.
4. Annuler Checkout : retour `/pricing`, aucun accès accordé.
5. Finaliser uniquement un Checkout Test : le retour `/billing/return` vérifie la session, le client et l’organisation, récupère l’abonnement Stripe et confirme la sauvegarde en base avant `/dashboard`.
6. Si Stripe ou la sauvegarde est indisponible, la page de facturation explique l’échec. Aucun paramètre `billing=success` ne peut accorder l’accès.
7. Un abonné `active` ou `trialing` accède au dashboard et aux imports. `past_due` accède à la facturation pour régulariser. Un compte résilié peut consulter la facturation et reprendre une offre. Aucun de ces écrans ne redirige automatiquement vers l’autre.
8. Les webhooks récupèrent l’état courant, enregistrent l’événement et le statut atomiquement, ignorent les doublons et les snapshots anciens. Une facture à 0 € ne transforme pas un essai en abonnement actif. Un échec de sauvegarde renvoie 500 pour permettre une nouvelle livraison.

## Tests sans services réels

`npm ci --ignore-scripts`, `npm run typecheck`, `npm test`, `npm run build`, puis `npm run test:e2e`.

Les tests unitaires bloquent le réseau. Les tests SQL utilisent PostgreSQL embarqué. Les tests navigateur utilisent localhost, des utilisateurs fictifs et des fournisseurs simulés ; toute autre sortie réseau est refusée. Ils ne déclenchent aucun email, paiement ou cron réel.

Ne jamais utiliser une carte réelle sur la Preview et ne pas appeler `/api/cron/reminders`. Le cron est désactivé en Preview. La fusion et la migration Production restent à valider après les résultats Preview.

Un endpoint Stripe Test dédié à cette branche a été préparé pour les événements Checkout, abonnement et facture. Son secret de signature est limité à la branche Preview ; les autres environnements ne sont pas modifiés. L’endpoint et le compte fictif peuvent être supprimés après la validation.
