'use client'

import { FormEvent, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [company, setCompany] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
      setMessage('Mode démo : ajoute les variables Supabase pour activer les comptes réels.')
      setLoading(false)
      return
    }

    const supabase = createClient()
    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setMessage(error.message)
      else {
        router.push('/dashboard')
        router.refresh()
      }
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { company_name: company.trim() } },
      })
      if (error) setMessage(error.message)
      else if (data.session) {
        router.push('/dashboard')
        router.refresh()
      } else {
        setMessage('Compte créé. Vérifie ton e-mail pour confirmer ton inscription.')
      }
    }
    setLoading(false)
  }

  return (
    <main className="wrap">
      <div className="login">
        <div className="brand">Cash<b>lance</b></div>
        <h1>{mode === 'login' ? 'Connexion' : 'Créer mon compte'}</h1>
        <p className="muted">{mode === 'login' ? 'Accédez à vos factures et relances.' : '14 jours pour tester le recouvrement automatisé.'}</p>
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
          <button disabled={loading} className="btn full">{loading ? 'Chargement…' : mode === 'login' ? 'Se connecter' : 'Créer mon compte'}</button>
        </form>
        {message && <p className="notice">{message}</p>}
        <p><Link href="/">← Retour à l’accueil</Link></p>
      </div>
    </main>
  )
}
