# CashLance — analyse OpenAI, Preview uniquement

## Livraison locale

Branche `preproduction-import-v1`. Aucun push, déploiement ou changement externe par Codex.
Cette note remplace les descriptions d'OCR local de `IMPORT_V1_RELEASE.md` pour les PDF/images.

- PDF/JPG/PNG → route authentifiée `/api/imports/analyze` → OpenAI → brouillon non confirmé.
- Excel/CSV restent dans le moteur existant. Démonstration inchangée, sans appel OpenAI.
- Fournisseur et débiteur séparés. Champs absents/ambigus vides. Le TTC n'est pas assimilé automatiquement au restant dû.
- Conditions de paiement conservées dans les informations complémentaires. Une échéance absente reste à compléter.
- La route d'analyse ne crée ni client, ni facture, ni relance. La confirmation utilisateur existante reste obligatoire.
- Plus de PDF.js/Tesseract dans le parcours navigateur : PDF.js sert uniquement au contrôle serveur des pages.
- Aucun défaut de positionnement iOS établi : aucun changement de design ou de marges arbitraire.

## Configurations à effectuer personnellement

1. Dans **cashlance-test uniquement**, appliquer le fichier
   `supabase/migrations/20260930124759_openai_import_analysis.sql` après les migrations déjà présentes.
   Il ajoute une table privée `import_analyses` et une fonction `reserve_import_analysis`.
   Pas de modification des tables métier, de Storage, de données existantes ou de règles Auth.
   RLS activée ; lecture/écriture/fonction réservées au serveur `service_role`, aucune permission navigateur.
   Les contrôles échouent sans appeler OpenAI si cette migration manque.

   Vérification SQL en lecture seule :

   ```sql
   select relrowsecurity from pg_class where oid='public.import_analyses'::regclass;
   select has_table_privilege('authenticated','public.import_analyses','SELECT');
   select has_function_privilege('authenticated','public.reserve_import_analysis(uuid,text)','EXECUTE');
   ```

   Résultats attendus : `true`, `false`, `false`.

2. Créer votre clé dans un projet OpenAI dédié au test, avec accès à Responses et au modèle ci-dessous.
   Ajouter **une seule nouvelle variable** Vercel : `OPENAI_API_KEY`, secrète, portée **Preview**,
   idéalement limitée à la branche `preproduction-import-v1`. Jamais `NEXT_PUBLIC_OPENAI_API_KEY`.
   Aucun nom de modèle, URL de fournisseur ou paramètre de quota n'est configurable depuis le navigateur.
   Pour un essai local réel facultatif : `.env.local` ignoré par Git ; ne jamais envoyer la clé dans le chat.

3. Conserver les variables existantes Preview :
   `NEXT_PUBLIC_SUPABASE_URL=https://nropdaayfhfuftyuacgt.supabase.co`,
   les clés Supabase **test**, et
   `NEXT_PUBLIC_APP_URL=https://cashlancev1-git-preproduction-import-v1-fretixo.vercel.app`.
   Ne pas connecter Resend production ; conserver `CASHLANCE_ONBOARDING_EMAILS=false`.
   L'ancien classificateur de réponses utilise aussi `OPENAI_API_KEY` mais seulement si
   `OPENAI_REPLY_CLASSIFIER_ENABLED=true` : laisser ce drapeau absent ou `false` en Preview
   pour limiter les appels payants aux imports. Aucun nouveau drapeau n'est nécessaire.
   Aucun changement Stripe, webhook ou domaine n'est requis pour cette intégration.

4. Mettre à jour l'information de confidentialité **avant les premiers documents réels** (voir ci-dessous).
   Publier vous-même la branche lorsque la migration et la clé Preview sont prêtes :

   ```powershell
   cd C:\FRETIXO\Cashlance
   git switch preproduction-import-v1
   git status
   git log -3 --oneline
   git push origin preproduction-import-v1
   ```

   Ce push peut déclencher automatiquement la Preview du projet existant `cashlancev1`.
   Utiliser Node.js 24 dans le projet existant ; la lecture PDF serveur nécessite une version Node compatible avec PDF.js.
   Ne pas fusionner `main`, promouvoir en Production ou déplacer un domaine.

## Limites et coût

- 10 fichiers par sélection / 25 Mo par lot ; analyse séquentielle, un document par requête.
- PDF/image : 3 Mo ; PDF : 3 pages et 50 000 caractères extraits maximum ; image : 20 mégapixels, 10 000 pixels par côté maximum.
- Excel/CSV : limite existante de 10 Mo, 200 lignes ; aucun appel OpenAI.
- Par utilisateur confirmé : 10 réservations/minute, 20/24 h ; une analyse en cours à la fois.
- Plafond partagé : 200 réservations/24 h, sur l'environnement Supabase concerné.
- Les tentatives échouées comptent aussi. Aucune relance automatique d'appel API ; une nouvelle tentative manuelle peut être facturée.
- SHA-256 du document + propriétaire : résultat terminé réutilisé pendant 24 h, même après reconnexion ou changement d'instance Vercel.
  Un document modifié a une nouvelle empreinte. Les corrections manuelles n'appellent jamais OpenAI.
- Timeout OpenAI 45 s, inspection PDF 8 s, fonction Vercel 60 s ; aucun outil externe ni réponse stockée via Responses (`store:false`).
- Modèle fixé : `gpt-4.1-mini-2025-04-14`, compatible images, PDF et Structured Outputs.
  [Tarif officiel vérifié le 30/09/2026](https://developers.openai.com/api/docs/models/gpt-4.1-mini) :
  **0,40 USD / million de tokens entrants, 1,60 USD / million sortants**.
  Exemple estimatif : 3 000 entrants + 700 sortants = **0,00232 USD/facture**.
  Prévoir environ **0,002–0,006 USD** pour une facture courte courante, hors taxes/change ;
  ce n'est pas une moyenne mesurée ni un plafond. Les PDF denses ou longs coûtent davantage.
  Les pages PDF incluent texte et images dans le calcul des tokens.
  Mettre des alertes de budget OpenAI ; ne pas supposer qu'une simple alerte bloque les dépenses.

## Informations pour la confidentialité

Le texte public et la zone d'import mentionnent désormais explicitement OpenAI.
Avant production, votre politique doit préciser : finalité d'extraction des factures, catégories transmises
(noms, coordonnées, identifiants professionnels, montants, dates et contenu du document), OpenAI comme
prestataire, fondement juridique retenu, droits des personnes/contact, éventuels transferts et garanties contractuelles.
Vérifier votre accord de traitement et la région de traitement OpenAI : Paris pour Supabase ne garantit pas un traitement OpenAI en Europe.

Les fichiers transitent en mémoire par le serveur puis sont transmis en ligne à Responses, sans Files API,
stockage public ni conservation du fichier original par CashLance. Aucun contenu de facture ou réponse fournisseur n'est journalisé par notre code.
Les données extraites rejoignent le brouillon privé et, après validation, les tables métier existantes.
Le cache privé conserve aussi le résultat d'extraction pour éviter une nouvelle facturation pendant 24 h.
L'expiration est **paresseuse** : résultat inutilisable après 24 h, effacé lors de la prochaine réservation ;
les métadonnées de quota de plus de 7 jours sont purgées au même moment. Sans nouvel import, la purge est différée.
Si votre politique exige un délai de suppression strict, planifier personnellement une purge quotidienne de cette table
dans l'environnement concerné avant de l'annoncer ; ne pas promettre une suppression physique instantanée à 24 h.

Selon la [documentation OpenAI](https://developers.openai.com/api/docs/guides/your-data),
les données API ne servent pas à l'entraînement par défaut. `store:false` désactive le stockage applicatif de la réponse,
mais **ne garantit pas une rétention nulle** : les journaux de surveillance des abus peuvent conserver des données jusqu'à 30 jours,
avec exceptions notamment pour sécurité et certains fichiers/images. Les contrôles de rétention et les conditions applicables
doivent être vérifiés sur votre compte. Ne pas annoncer Zero Data Retention sans activation éligible.

## Validation à réaliser après votre déploiement

Les tests locaux utilisent exclusivement des réponses OpenAI simulées : ils valident le traitement, la sécurité et le parcours,
**pas la précision réelle du modèle sur vos documents**. Aucun appel payant n'a été effectué.

Validation locale : 67 tests ciblés distincts réussis (extraction, routes, transactions existantes,
analyse OpenAI simulée et quotas/RLS), 10 parcours navigateur réussis, TypeScript et build production réussis.
Le contrôle de paquetage a nécessité l'inclusion explicite du worker PDF et de son support natif serveur,
puis une nouvelle vérification du build. Aucun moteur PDF/OCR ni code d'appel OpenAI n'est présent dans le JavaScript client.

Sur Safari iPhone : connexion avec email confirmé, puis les factures fictives de `tests/fixtures/` :
`invoice.pdf`, `scanned.pdf`, `invoice.jpg`, `french-screenshot.png`, `missing-email.pdf`, `missing-due.pdf`.
Contrôler fournisseur/débiteur, montant, échéance, manque d'information ; corriger puis valider explicitement.
Importer deux factures, un XLSX et un CSV. Réimporter la même facture doit réutiliser le résultat ;
la corriger ne doit créer aucun nouvel appel dans OpenAI. Aucun envoi Resend réel pendant ces essais.
Si un champ IA est faux, ne pas le valider : corriger manuellement. Les gardes ne peuvent pas garantir l'absence d'erreur sémantique du modèle.

Les validations externes Stripe/Resend/Auth complètes restent à votre charge.
Point connu avant cette reprise : webhook Stripe Preview bloqué par HTTP 401 Vercel ; ne pas désactiver globalement la protection.
Le mode démo, les relances, Stripe et les configurations externes n'ont pas été modifiés dans cette livraison.
