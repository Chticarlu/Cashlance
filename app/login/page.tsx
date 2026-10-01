'use client'

import { FormEvent, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { attribution } from '@/lib/funnel'

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [company, setCompany] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [tips, setTips] = useState(false)
  const [termsAccepted, setTermsAccepted] = useState(false)
  useEffect(() => { if (new URLSearchParams(location.search).get('mode') === 'signup') setMode('signup') }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    if (mode === 'signup' && !termsAccepted) { setMessage('Vous devez accepter les CGV et les CGU pour créer un compte.'); setLoading(false); return }

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
      setMessage('Mode démo : ajoute les variables Supabase pour activer les comptes réels.')
      setLoading(false)
      return
    }

    try {
    const supabase = createClient()
    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setMessage(error.message)
      else {
        router.replace(new URLSearchParams(location.search).get('next') === 'import' ? '/auth/continue?next=import' : '/auth/continue')
        router.refresh()
      }
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${location.origin}/auth/callback`, data: { company_name: company.trim(), attribution: attribution(), onboarding_emails: tips, legal_terms_version: '2026-10-01-draft', legal_terms_accepted_at: new Date().toISOString() } },
      })
      if (error) setMessage(error.message)
      else if (data.session) {
        router.push('/onboarding')
        router.refresh()
      } else {
        setMessage('Compte créé. Vérifie ton e-mail pour confirmer ton inscription.')
      }
    }
    } catch { setMessage('Connexion indisponible. Réessayez dans un instant.') }
    finally { setLoading(false) }
  }

  return (
    <main className="wrap">
      <div className="login">
        <div className="brand">Cash<b>lance</b></div>
        <h1>{mode === 'login' ? 'Connexion' : 'Créer mon compte'}</h1>
        <p className="muted">{mode === 'login' ? 'Accédez à vos factures et relances.' : '14 jours pour tester le suivi et la relance de vos factures.'}</p>
        <div className="switcher">
          <button className={mode === 'login' ? 'switch active' : 'switch'} onClick={() => setMode('login')}>Connexion</button>
          <button className={mode === 'signup' ? 'switch active' : 'switch'} onClick={() => setMode('signup')}>Inscription</button>
        </div>
        <form onSubmit={submit}>
          {mode === 'signup' && <><label>Entreprise</label><input className="field" value={company} onChange={e => setCompany(e.target.value)} required placeholder="Nom de votre entreprise" /></>}
          <label>Email</label>
          <input className="field" value={email} onChange={e => setEmail(e.target.value)} type="email" required placeholder="vous@entreprise.fr" />
          <label>Mot de passe</label>
          <input className="field" value={password} onChange={e => setPassword(e.target.value)} minLength={8} type="password" required placeholder="8 caractères minimum" />
          {mode === 'signup' && <label className="check"><input type="checkbox" required checked={termsAccepted} onChange={e => setTermsAccepted(e.target.checked)} />J’ai lu et j’accepte les <Link href="/cgv" target="_blank">CGV</Link> et les <Link href="/cgu" target="_blank">CGU</Link>. Voir aussi la <Link href="/confidentialite" target="_blank">politique de confidentialité</Link>.</label>}
          {mode === 'signup' && <label className="check"><input type="checkbox" checked={tips} onChange={e => setTips(e.target.checked)} />Recevoir quelques rappels utiles pour démarrer et avant la fin de l’essai. Désactivable dans le tableau de bord.</label>}
          <button disabled={loading} className="btn full">{loading ? 'Chargement…' : mode === 'login' ? 'Se connecter' : 'Commencer mes 14 jours gratuits'}</button>
        </form>
        {message && <p className="notice">{message}</p>}
        <p><Link href="/">← Retour à l’accueil</Link></p>
      </div>
    </main>
  )
}
