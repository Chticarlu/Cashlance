import Link from 'next/link'
export default function LegalDocument({title,updated='1 octobre 2026',children}:{title:string,updated?:string,children:React.ReactNode}) {
  return <main className="wrap" style={{maxWidth:860}}>
    <nav className="nav"><Link href="/" className="brand">Cash<b>lance</b></Link><Link href="/pricing">Offres</Link></nav>
    <article className="section legal-content"><p className="badge">Documentation contractuelle — version à valider avant publication</p><h1>{title}</h1><p className="muted">Projet rédigé le {updated}. Certains champs d'identification et durées de conservation nécessitent une validation par l'éditeur et son conseil juridique avant mise en production.</p>{children}</article>
  </main>
}
