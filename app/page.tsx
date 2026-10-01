import Link from 'next/link'
import FunnelTracker from '@/components/funnel-tracker'

const steps = [
  { title: '1. Importez votre facture', body: 'PDF, JPG, PNG ou fichier Excel/CSV. L’IA aide à relever les informations des PDF et photos ; les tableaux sont lus sur votre appareil.' },
  { title: '2. Corrigez si nécessaire', body: 'Contrôlez le débiteur, le montant restant dû, l’échéance et surtout l’adresse e-mail. Les données absentes ou incertaines restent à compléter.' },
  { title: '3. Choisissez votre calendrier', body: 'Sélectionnez un scénario de relance, puis confirmez. Le traitement automatique suit ensuite le calendrier prévu, sans envoi immédiat à l’import.' },
]

const audiences = [
  { title: 'Vous avez déjà un logiciel de facturation ?', body: 'Conservez-le. CashLance est un espace complémentaire pour importer les factures à suivre, programmer les rappels et centraliser leur historique.' },
  { title: 'Vous relancez encore à la main ?', body: 'Retrouvez les factures ouvertes au même endroit au lieu de chercher les échéances et les échanges dans plusieurs fichiers et boîtes mail.' },
  { title: 'Vous craignez de relancer un client à tort ?', body: 'Aucune relance ne part à l’import. Vérifiez les données et actualisez le statut d’une facture réglée. Les réponses ambiguës demandent une revue humaine.' },
]

export default function Home() {
  return <main className="wrap">
    <div className="nav"><div><a className="ecosystem" href="https://fretixo.fr">← FRETIXO</a><div className="brand">Cash<b>lance</b></div></div><div className="actions"><Link className="btn alt" href="/pricing">Tarifs</Link><Link className="btn alt" href="/login">Connexion</Link></div></div>
    <FunnelTracker />
    <section className="hero">
      <div>
        <span className="badge">Suivi et relances des factures pour TPE</span>
        <h1>Vos factures sont faites. Ne perdez plus leur suivi.</h1>
        <p className="lead">Importez vos factures existantes. CashLance extrait les informations avec l’IA, vous laisse les vérifier, puis programme vos rappels selon le calendrier choisi. Sans changer votre logiciel de facturation.</p>
        <div className="actions"><Link className="btn" href="/login?mode=signup" data-trial-cta>Essayer 14 jours gratuitement</Link><Link className="btn alt" href="/pricing">Comparer les offres</Link></div>
        <p className="muted">Sans carte bancaire à l’inscription · Dès 19 € HT/mois après l’essai · Résiliation depuis votre espace client.</p>
      </div>
      <div className="panel" aria-label="Exemple illustratif fictif">
        <span className="badge">Exemple fictif — aucun message envoyé</span>
        <h2>Une facture. Un suivi clair.</h2>
        <div className="row"><span>Document importé</span><strong>DEMO-001.pdf</strong></div>
        <div className="row"><span>Montant proposé</span><strong>1 280 €</strong></div>
        <div className="row"><span>Client et e-mail</span><strong>À vérifier</strong></div>
        <div className="row"><span>Scénario</span><strong>Choisi par vous</strong></div>
        <div className="row"><span>Envoi</span><span className="status">Après validation, à l’échéance prévue</span></div>
        <p className="muted">Vous gardez la décision sur la facture et les relances.</p>
      </div>
    </section>

    <section className="section">
      <h2>La relance ne devrait pas exiger une deuxième comptabilité.</h2>
      <p className="lead">CashLance prend le relais sur le suivi de vos créances, sans remplacer la création de factures ni votre outil comptable.</p>
      <div className="grid3">{audiences.map(item=><div className="card" key={item.title}><h3>{item.title}</h3><p>{item.body}</p></div>)}</div>
    </section>
    <section className="section">
      <h2>Du document au rappel, en trois étapes</h2>
      <div className="grid3">{steps.map(item=><div className="card" key={item.title}><h3>{item.title}</h3><p>{item.body}</p></div>)}</div>
      <p className="muted">Formats : PDF, JPG, PNG (analyse IA, 3 Mo et 3 pages maximum par document) ; XLSX et CSV pour les listes de factures.</p>
    </section>
    <section className="section">
      <h2>Ce que vous retrouvez dans un seul espace</h2>
      <div className="grid3">
        <div className="card"><h3>Un suivi des échéances</h3><p>Factures ouvertes, calendriers personnalisés et rappels programmés après votre confirmation.</p></div>
        <div className="card"><h3>Une trace des échanges</h3><p>Historique des envois, statuts techniques de livraison et réponses reçues lorsqu’elles peuvent être associées à la facture.</p></div>
        <div className="card"><h3>Des décisions humaines</h3><p>Vous pouvez mettre à jour les règlements et examiner les réponses ambiguës. Une déclaration de paiement par e-mail ne vaut pas confirmation bancaire.</p></div>
      </div>
    </section>
    <section className="section">
      <h2>Un essai pour juger sur vos propres factures</h2>
      <p className="lead">Solo 19 € HT/mois pour 20 factures actives · Pro 39 € HT/mois pour 100 · Équipe 79 € HT/mois pour les volumes supérieurs, selon les conditions de l’offre.</p>
      <div className="actions"><Link className="btn" href="/login?mode=signup" data-trial-cta>Démarrer les 14 jours gratuits</Link><Link className="btn alt" href="/pricing">Détail des trois offres</Link></div>
    </section>
    <section className="section">
      <h2>Questions avant de commencer</h2>
      <details><summary>Dois-je changer mon logiciel de facturation ?</summary><p>Non. Importez vos documents ou vos exports existants dans CashLance. Il ne remplace ni votre comptabilité ni une plateforme agréée de facturation électronique.</p></details>
      <details><summary>Est-ce que l’IA envoie elle-même les relances ?</summary><p>Non. OpenAI sert à proposer l’extraction des données des PDF et images. Vous vérifiez les informations puis confirmez le scénario. Les messages suivent ensuite une programmation automatique.</p></details>
      <details><summary>Un e-mail part-il dès que je dépose une facture ?</summary><p>Non. L’import seul ne déclenche aucun envoi. Après confirmation, les relances éligibles sont traitées lors du passage automatique programmé.</p></details>
      <details><summary>Et si une facture est déjà réglée ou contestée ?</summary><p>Actualisez son statut avant le prochain envoi. Les déclarations de paiement et réponses ambiguës peuvent demander une vérification humaine ; elles ne constituent pas une preuve bancaire.</p></details>
      <details><summary>Que se passe-t-il si l’analyse du document se trompe ?</summary><p>Vous pouvez corriger chaque champ avant l’enregistrement. Les données absentes ou ambiguës ne doivent pas être considérées comme confirmées. Une saisie manuelle reste possible.</p></details>
      <details><summary>Mes documents sont-ils utilisés pour l’analyse IA ?</summary><p>Les PDF et images sont transmis à OpenAI pour extraire les données ; CashLance ne conserve pas le fichier original lors de ce traitement. Les données extraites sont enregistrées dans votre espace privé. Les fichiers Excel et CSV sont lus sur votre appareil.</p></details>
    </section>
    <section className="section"><h2>Commencez par une facture, pas par une migration complète.</h2><Link className="btn" href="/login?mode=signup" data-trial-cta>Essayer CashLance pendant 14 jours</Link></section>
  </main>
}
