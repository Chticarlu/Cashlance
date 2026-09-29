# Cashlance V15 — correctifs ciblés

- Stripe: après `checkout.session.completed`, relit la Subscription Stripe réelle avant de synchroniser `plan` et `subscription_status`.
- Stripe: toute erreur d’écriture Supabase déclenche désormais une réponse HTTP 500 afin que Stripe puisse retenter le webhook.
- Réponses email: règles FR élargies + extraction de dates courantes.
- Réponses email: fallback IA optionnel pour les formulations ambiguës (`OPENAI_REPLY_CLASSIFIER_ENABLED=true` + `OPENAI_API_KEY`).
- Sécurité: une déclaration client de paiement reste une simple classification `paid`; aucune facture n’est marquée payée automatiquement.
- Sécurité: les instructions contenues dans les emails sont traitées comme données non fiables.
