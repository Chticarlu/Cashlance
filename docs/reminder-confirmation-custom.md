# Relances depuis confirmation & scénarios personnalisés

## Règle métier

Pour une facture dont l'échéance est **strictement antérieure** à la date de confirmation (fuseau Europe/Paris), l'ancre du calendrier est la date de confirmation ; sinon, l'ancre est l'échéance. Le premier envoi est toujours au plus tôt 24 h après validation. Les étapes suivantes sont espacées d'au moins 24 h.

- Progressif : J+1, J+7, J+15 par rapport à l'ancre.
- Complet si échéance future : J−3, J+1, J+7, J+15, J+30 (pré-échéance conservée).
- Complet si échéance passée : J+1, J+4, J+10, J+18, J+33 depuis confirmation (pas de rappel historique en rafale).
- Personnalisé : 1 à 5 délais **entiers, strictement croissants, entre 1 et 60 jours** depuis la même ancre. Transport API/BdD : `custom:2,5,10`. Le navigateur et le serveur valident ; la fonction SQL valide indépendamment.

Une activation confirmée programme seulement les lignes de relance. **Attention :** en Production, le cron peut ensuite envoyer les e-mails aux échéances programmées. Aucun email n'est envoyé par les tests ci-dessous.

## Vérification sécurisée

1. Appliquer, dans cet ordre et **uniquement à Supabase Test**, les migrations `20261001190000_confirmation_based_custom_reminders.sql`, `20261001191000_reminder_paris_timezone.sql` et `20261001192000_dynamic_reminder_stages.sql`.
2. Sur Preview, ouvrir une facture importée `open`, non encore programmée, et vérifier l'apparition du panneau « Programmer les relances ». Il n'apparaît pas pour une facture déjà traitée.
3. Choisir Personnalisé, saisir `2, 5, 10`, vérifier l'aperçu ; vérifier le refus de `5, 2`, `0`, `61`, des doublons et de plus de cinq délais.
4. Vérifier l'aperçu d'une facture déjà échue puis d'une facture future. Ne confirmer qu'avec une adresse de test que vous contrôlez. **Ne pas appeler le cron**.
5. Vérifier que l'import en lot utilise la même règle, et que l'import sans programmation reste possible.
6. Vérifier que les fonctions SQL refusent les intervalles personnalisés invalides.

SQL Test contrôlé le 1er octobre : offsets progressif ancien `{1,7,15}`, complet ancien `{1,4,10,18,33}`, complet futur `{-3,1,7,15,30}` et personnalisé `{2,5,10}`. Tests transactionnels de l'activation sur facture fictive réalisés avec `ROLLBACK`, aucun envoi.

## Production

Ne déployer qu'après validation Preview. Appliquer les trois migrations **avant** la fusion, puis déployer le code et contrôler le statut READY. Les factures déjà programmées ne sont ni recalculées ni réactivées. Ne jamais modifier ou réordonner les relances déjà envoyées.
