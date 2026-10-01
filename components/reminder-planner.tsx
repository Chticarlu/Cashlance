'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { previewSchedule, scenarioPayload, scenarios, validCustomDays, type Scenario } from '@/lib/imports/model'

export default function ReminderPlanner({ invoiceId, due, initialEmail }: { invoiceId: string; due: string; initialEmail: string }) {
  const router = useRouter()
  const [scenario, setScenario] = useState<Scenario>('gentle')
  const [customDays, setCustomDays] = useState<number[]>([1, 7, 15])
  const [email, setEmail] = useState(initialEmail)
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const valid = scenario !== 'custom' || validCustomDays(customDays)
  const dates = previewSchedule(due, scenario, new Date(), customDays)
  const confirmationDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date())
  async function activate() {
    if (!confirmed || !valid || busy || !email.trim()) return
    setBusy(true); setError(''); setSuccess('')
    try {
      const res = await fetch('/api/imports/activate', {
        method:'POST', headers:{'content-type':'application/json'},
        body:JSON.stringify({ invoiceId, confirmed:true, email:email.trim(), scenario:scenarioPayload(scenario,customDays) }),
      })
      const data = await res.json().catch(()=>({}))
      if (!res.ok) throw new Error(data.error || 'Programmation impossible.')
      setSuccess(`${data.scheduled} relance(s) programmée(s). Aucun email n’a été envoyé lors de la confirmation.`)
      setConfirmed(false)
      router.refresh()
    } catch (e) { setError(e instanceof Error ? e.message : 'Réessayez plus tard.') }
    finally { setBusy(false) }
  }
  return <section className="card">
    <h2>Programmer les relances</h2>
    <p className="muted">Si l’échéance est passée, les délais débutent à la date de votre confirmation ; sinon ils sont calculés depuis l’échéance. Premier envoi au plus tôt 24 heures après validation.</p>
    <label>Email destinataire (à vérifier)<input className="field" type="email" required maxLength={300} value={email} onChange={e=>{setEmail(e.target.value);setConfirmed(false)}} /></label>
    <label>Scénario
      <select className="field" value={scenario} onChange={e=>{setScenario(e.target.value as Scenario);setConfirmed(false)}}>
        {Object.entries(scenarios).map(([key,value])=><option value={key} key={key}>{value.label}</option>)}
      </select>
    </label>
    {scenario==='custom'&&<div className="formGrid" role="group" aria-label="Délais personnalisés">
      {customDays.map((value,i)=><label key={i}>Relance {i+1} · jours après la date de référence
        <input className="field" type="number" min="1" max="60" step="1" value={Number.isFinite(value)?value:''} onChange={e=>{setCustomDays(a=>a.map((v,j)=>j===i?Number(e.target.value):v));setConfirmed(false)}} />
      </label>)}
      <div className="actions">
        <button className="btn alt" type="button" disabled={busy||customDays.length>=5||customDays[customDays.length-1]>=60} onClick={()=>{setCustomDays(a=>[...a,Math.min(60,a[a.length-1]+7)]);setConfirmed(false)}}>Ajouter une relance</button>
        <button className="btn alt" type="button" disabled={busy||customDays.length<=1} onClick={()=>{setCustomDays(a=>a.slice(0,-1));setConfirmed(false)}}>Retirer la dernière</button>
      </div>
      {!valid&&<p className="notice error">Saisissez 1 à 5 délais entiers strictement croissants, de 1 à 60 jours.</p>}
    </div>}
    <h3>Aperçu du calendrier</h3>
    <p className="muted">Référence : {due<confirmationDate?'confirmation du '+new Date().toLocaleDateString('fr-FR'):'échéance du '+new Date(due+'T12:00:00').toLocaleDateString('fr-FR')}.</p>
    {valid&&<ul>{dates.map(x=><li key={x.sequence}>{x.stage} — {new Date(x.at).toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'})}</li>)}</ul>}
    <label className="check"><input type="checkbox" checked={confirmed} disabled={busy||!valid} onChange={e=>setConfirmed(e.target.checked)} />Je confirme l’adresse et autorise la programmation de ces relances. Les emails seront envoyés ultérieurement selon le planning.</label>
    <button className="btn" type="button" disabled={!confirmed||!valid||busy||!email.trim()} onClick={()=>void activate()}>{busy?'Programmation…':'Confirmer et programmer'}</button>
    {success&&<p role="status" className="notice">{success}</p>}
    {error&&<p role="alert" className="notice error">{error}</p>}
  </section>
}
