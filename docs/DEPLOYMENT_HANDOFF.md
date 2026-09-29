# Migration multi-services — conditions de déploiement

## Préparation locale

`npm ci`, `npm test`, `npm run typecheck`, `npm run build`.
Les tests isolent Stripe, Resend et Supabase ; aucune donnée de production n'est utilisée.
Les secrets restent dans les variables de l'hébergeur ou des fichiers .env ignorés.
Le fichier .env.example ne doit pas écraser les valeurs existantes.

## État DNS observé le 29 septembre 2026 (lecture seule)

- fretixo.fr : MX mx1.mail.ovh.net (1), mx2.mail.ovh.net (5), mx3.mail.ovh.net (100).
- inbound.fretixo.fr : MX inbound-smtp.eu-west-1.amazonaws.com (10).
- transport.fretixo.fr et cashlance.fretixo.fr : NXDOMAIN lors de la vérification.

Ces observations ne sont pas une autorisation de modifier le DNS.

## Ordre obligatoire

1. Identifier les projets Vercel existants et leurs domaines sans toucher aux réglages.
2. Faire confirmer les seules entrées DNS nécessaires à transport.fretixo.fr et cashlance.fretixo.fr, avec les valeurs exactes demandées par les projets correspondants.
3. Pour Cashlance, définir NEXT_PUBLIC_APP_URL=https://cashlance.fretixo.fr dans la configuration de production. Conserver CASHLANCE_INBOUND_DOMAIN=inbound.fretixo.fr, l'expéditeur Resend et les secrets existants. Ne jamais appliquer les migrations SQL historiques aux bases existantes.
4. Vérifier les URL de callback/auth Supabase existantes avec le propriétaire. Toute modification de configuration nécessite une autorisation spécifique ; aucune base ni donnée de production ne doit être modifiée.
5. Valider transport.fretixo.fr (accueil, authentification et parcours métier) et cashlance.fretixo.fr (pages, authentification, Checkout, portail Stripe, webhooks). Utiliser un environnement de test distinct pour les parcours qui écrivent des données. Ne pas envoyer de relances réelles pour tester.
6. Vérifier les destinations des webhooks Stripe et Resend ; conserver les anciens endpoints tant que le nouvel endpoint n'est pas validé. Ne jamais modifier le domaine de réception inbound.
7. Préparer le portail dans un projet distinct. Ne rattacher fretixo.fr qu'après validation explicite des deux applications et confirmation du changement DNS.

## Limites préexistantes à vérifier avant exploitation

- Une validation locale ne certifie ni les identifiants hébergés ni les parcours payants en production.
- Le dashboard propose encore certaines entrées non implémentées ; les quotas et les fonctions multi-utilisateurs annoncés ne sont pas contrôlés dans ce MVP.
- Le cron historique ne possède pas de verrou transactionnel d'envoi : éviter les exécutions concurrentes et ne pas le déclencher sur la production pour tester.
- Les mises à jour de statut email sont idempotentes mais non transactionnelles ; deux réponses différentes simultanées demandent une stratégie de concurrence ultérieure.
- Les événements Stripe hors ordre et les factures Stripe hors abonnement ne disposent pas d'un journal d'événements dédié dans ce schéma historique.
- La classification par règles n'est pas une preuve de paiement. Le fallback IA reste désactivé et n'a pas été validé contre une API réelle.

Références : [webhooks Stripe](https://docs.stripe.com/webhooks), [abonnements Stripe](https://docs.stripe.com/billing/subscriptions/webhooks), [webhooks Resend](https://resend.com/docs/webhooks/introduction).
