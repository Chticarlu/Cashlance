# Cashlance V16 — intégration FRETIXO

Cette version ne fusionne pas Cashlance avec FRETIXO Transport. Elle prépare simplement Cashlance pour le domaine `cashlance.fretixo.fr`.

Changements :
- canonical et metadata sur `https://cashlance.fretixo.fr`;
- lien de retour vers le portail `https://fretixo.fr`;
- `.env.example` préparé avec `NEXT_PUBLIC_APP_URL=https://cashlance.fretixo.fr`;
- inbound Resend conservé sur `inbound.fretixo.fr`;
- expéditeur d'exemple préparé sur `relances@fretixo.fr`.

Avant production, Work/Codex doit vérifier la vraie adresse d'expédition Resend configurée dans Vercel et ne pas l'écraser si elle diffère.
