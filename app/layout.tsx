import './globals.css'

export const metadata = {
  metadataBase: new URL('https://cashlance.fretixo.fr'),
  title: 'Cashlance — Relances intelligentes pour TPE',
  description: 'Automatisez vos relances de factures et suivez les promesses de paiement avec Cashlance, un service FRETIXO.',
  alternates: { canonical: '/' },
}

export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="fr" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{__html:"try{document.documentElement.dataset.theme=localStorage.getItem('cashlance-theme')==='light'?'light':'dark'}catch(e){}"}} /></head><body>{children}<footer className="site-legal-footer"><p>CashLance · Un service FRETIXO destiné aux professionnels.</p><nav aria-label="Informations juridiques"><a href="/mentions-legales">Mentions légales</a><a href="/cgv">CGV</a><a href="/cgu">CGU</a><a href="/confidentialite">Confidentialité</a><a href="/cookies">Cookies</a></nav></footer></body></html>}
