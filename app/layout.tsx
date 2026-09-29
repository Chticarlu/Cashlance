import './globals.css'

export const metadata = {
  metadataBase: new URL('https://cashlance.fretixo.fr'),
  title: 'Cashlance — Relances intelligentes pour TPE',
  description: 'Automatisez vos relances de factures et suivez les promesses de paiement avec Cashlance, un service FRETIXO.',
  alternates: { canonical: '/' },
}

export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="fr"><body>{children}</body></html>}
