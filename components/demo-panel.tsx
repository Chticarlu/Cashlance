'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { track } from '@/lib/funnel'
export default function DemoPanel({ start = false }: { start?: boolean }) {
  const [active, setActive] = useState(start)
  const [ready, setReady] = useState(false)
  useEffect(() => { try { if (sessionStorage.getItem('cashlance:demo')) setActive(true) } catch {} }, [])
  function begin() { setActive(true); track('demo_started'); try { sessionStorage.setItem('cashlance:demo','1') } catch {} }
  function remove() { setActive(false); setReady(false); try { sessionStorage.removeItem('cashlance:demo') } catch {} }
  if (!active) return <button className="btn alt" onClick={begin}>Tester avec un exemple</button>
  return <section className="card demo-card" aria-label="Démonstration sans envoi">
    <span className="badge">Démonstration — aucune donnée réelle, aucun email envoyé</span>
    <h2>Entreprise Démo SARL</h2><p>Facture DEMO-001 · <strong>1 280 €</strong> · Échéance dépassée</p>
    <p>Adresse fictive : comptabilite@example.invalid</p>
    <ol><li>Demain : premier rappel courtois.</li><li>Dans 7 jours : suivi de la facture.</li><li>Dans 15 jours : nouvelle relance.</li></ol>
    {ready ? <p role="status">Votre démonstration est prête. Lorsque vous aurez vos documents, importez vos vraies factures.</p>
      : <button className="btn" onClick={() => setReady(true)}>Simuler la programmation</button>}
    <div className="actions"><Link className="btn" href="/import">Importer mes documents</Link><button className="btn alt" onClick={remove}>Supprimer la démonstration</button></div>
  </section>
}
