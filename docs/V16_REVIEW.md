# Revue avant intégration V16 — 29 septembre 2026

Base locale et origin/main vérifiées après git fetch : 4a54f0a272c09c313504027a0444656da53a09c9. Arbre initial propre.

## Comparaison des archives

La V16 est une évolution de la V14 du dépôt, pas une nouvelle application. Les différences de fins de ligne ne constituent pas des changements fonctionnels.

- package.json : version 0.1.4 → 0.1.6, dépendances identiques ; aucun lockfile ni test dans les deux versions.
- app/layout.tsx, app/page.tsx, app/globals.css : métadonnées cashlance.fretixo.fr et retour vers FRETIXO.
- app/api/stripe/webhook/route.ts : lecture de la Subscription après Checkout, identifiants développés pris en charge, erreurs Supabase remontées en HTTP 500.
- lib/reminders.ts : règles françaises, dates, confiance et fallback IA optionnel désactivé par défaut.
- app/api/webhooks/resend/route.ts : classification asynchrone et indicateur de revue manuelle (la V16 extrait les dates mais ne les persiste pas encore dans invoices.promise_date).
- Ajouts : .env.example, V15_CHANGES.md, V16_DOMAIN_MIGRATION.md.
- Migrations SQL, clients Supabase, cron quotidien, routes facture/checkout/portail et écrans métier inchangés.
- Quatre doublons à la racine (page.tsx, layout.tsx, globals.css, route.ts) sont absents de V16 et inutilisés par App Router ; leur suppression sera conservée dans Git.

## Points à corriger et tester

- « après-demain » doit être testé avant « demain ».
- Dates impossibles, négations et texte cité ne doivent pas déclencher des actions automatiques erronées.
- Une classification incertaine doit demander une revue avant modification métier.
- Stripe : état réel, erreurs de lecture/écriture, objets développés, facture d'essai à zéro et absence de subscription.
- Les tests doivent utiliser des doubles locaux sans réseau vers les services de production.

## Portail

Archive autonome Next.js, deux cartes vers transport.fretixo.fr et cashlance.fretixo.fr, aucun backend ni secret. Préparation dans un dépôt indépendant après validation locale Cashlance.

## Contraintes de migration

Ne modifier ni inbound.fretixo.fr, ni les MX de fretixo.fr, ni les bases Supabase, ni les données de production. Ne pas exécuter les migrations SQL historiques. Ne pas remplacer l'expéditeur Resend existant par celui du fichier exemple. Conserver le fallback IA désactivé : aucune clé créée, aucune requête réelle nécessaire à cette intégration.

URL Cashlance cible : https://cashlance.fretixo.fr. Aucun rattachement de fretixo.fr au portail avant déploiement et validation de Transport et Cashlance. Les actions DNS et authentifications nouvelles nécessitent confirmation.
