'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { dateISO, Draft, draftErrors, emptyDraft, Field, fields, MAX_FILES, MAX_ROWS, previewSchedule, Scenario, scenarios } from '@/lib/imports/model'
import { mappedRows, suggestMapping, Table } from '@/lib/imports/tabular'
import { track } from '@/lib/funnel'

export default function ImportWorkspace() {
  const [rows, setRows] = useState<Draft[]>([])
  const [tables, setTables] = useState<Table[]>([])
  const [mapping, setMapping] = useState<Record<string, Field | ''>>({})
  const [batchId, setBatchId] = useState('')
  const [busy, setBusy] = useState(false), [saving, setSaving] = useState(false)
  const [progress, setProgress] = useState(''), [error, setError] = useState('')
  const [scenario, setScenario] = useState<Scenario>('gentle'), [schedule, setSchedule] = useState(true), [reviewed, setReviewed] = useState(false)
  const [result, setResult] = useState<{ created: number; duplicates: number; scheduled: number } | null>(null)
  const [loaded, setLoaded] = useState(false), [saved, setSaved] = useState('')
  const input = useRef<HTMLInputElement>(null), inFlight = useRef(false)
  const saveChain = useRef<Promise<unknown>>(Promise.resolve())
  const latest = useRef({ rows, batchId }); latest.current = { rows, batchId }
  useEffect(() => {
    let live = true
    setBatchId(crypto.randomUUID())
    fetch('/api/imports/draft').then(async res => {
      if (!res.ok) throw new Error('Sauvegarde des brouillons indisponible. Gardez cette page ouverte.')
      return res.json()
    }).then(data => { if (live && data?.rows?.length) { setRows(data.rows.map((r: Draft) => ({ ...r, confirmed: false }))); setBatchId(data.batch_id); setSaved('Brouillon retrouvé : vérifiez-le avant de continuer.') } })
      .catch(e => { if (live) setSaved(e.message) }).finally(() => { if (live) setLoaded(true) })
    return () => { live = false }
  }, [])
  useEffect(() => { if (tables[0]) setMapping(suggestMapping(tables[0].headers)) }, [tables])
  function saveDraft() {
    const snapshot = latest.current
    if (!snapshot.rows.length) return Promise.resolve()
    const job = async () => {
      const res = await fetch('/api/imports/draft', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(snapshot) })
      setSaved(res.ok ? 'Brouillon enregistré dans votre espace privé.' : 'Brouillon non sauvegardé : gardez cette page ouverte.')
    }
    saveChain.current = saveChain.current.catch(() => {}).then(job).catch(() => { setSaved('Brouillon non sauvegardé : gardez cette page ouverte.') })
    return saveChain.current
  }
  useEffect(() => {
    if (!loaded || busy || saving || result || !rows.length) return
    const timer = setTimeout(() => { void saveDraft() }, 700)
    return () => clearTimeout(timer)
  }, [rows, loaded, busy, saving, result]) // Draft writes are serialized to prevent older responses overwriting edits.
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => { if (rows.length && !result) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', guard); return () => window.removeEventListener('beforeunload', guard)
  }, [rows.length, result])

  function update(id: string, field: Field, value: string) {
    setRows(old => old.map(r => r.id === id ? { ...r, [field]: value, confirmed: false } : r)); setReviewed(false)
  }
  async function filesSelected(files: File[]) {
    if (inFlight.current || !loaded) return
    if (files.length > MAX_FILES || files.reduce((n,f) => n+f.size,0) > 25*1024*1024) { setError('10 fichiers et 25 Mo au total maximum.'); return }
    inFlight.current = true; setBusy(true); setError(''); setReviewed(false); track('import_started', files.length)
    const found: Draft[] = [], sheets: Table[] = [], failures: string[] = []
    try {
      const engine = await import('@/lib/imports/browser')
      for (const file of files) {
        try {
          engine.checkFile(file); track('document_uploaded'); setProgress(`Analyse locale : ${file.name}`)
          if (/\.(xlsx|csv)$/i.test(file.name)) sheets.push(...await engine.parseTable(file))
          else found.push(await engine.parseDocument(file, setProgress))
          track('document_parsed')
        } catch (e) { failures.push(`${file.name} : ${e instanceof Error ? e.message : 'Lecture impossible.'}`) }
      }
      if (rows.length + found.length > MAX_ROWS) failures.push('Limite de 200 créances : les nouveaux documents n’ont pas été ajoutés.')
      else setRows(old => [...old, ...found])
      setTables(old => [...old, ...sheets]); setError(failures.join('\n'))
    } catch { setError('Le moteur d’import est indisponible. Réessayez ou utilisez la saisie manuelle.') }
    finally { setBusy(false); setProgress(''); inFlight.current = false; if (input.current) input.current.value = '' }
  }
  function useMapping() {
    const assigned = Object.values(mapping).filter(Boolean)
    if (new Set(assigned).size !== assigned.length) { setError('Associez chaque champ à une seule colonne.'); return }
    if (!assigned.includes('client') && !assigned.includes('lastName')) { setError('Associez une colonne au client ou au nom.'); return }
    const added = mappedRows(tables[0], mapping)
    if (rows.length + added.length > MAX_ROWS) { setError('200 créances maximum.'); return }
    setRows(old => [...old, ...added]); setTables(old => old.slice(1)); setError(''); setReviewed(false)
  }
  async function submit() {
    if (inFlight.current) return
    if (!reviewed || rows.some(r => !r.confirmed || draftErrors(r, schedule).length) || tables.length) { setError('Vérifiez chaque créance et confirmez le scénario.'); return }
    inFlight.current = true; setSaving(true); setError('')
    try {
      await saveChain.current
      const res = await fetch('/api/imports', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ batchId, rows, schedule, scenario, reviewed }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Import non enregistré.')
      setResult(data)
    } catch (e) { setError(e instanceof Error ? e.message : 'Connexion interrompue. Réessayez : le même lot ne sera pas créé deux fois.') }
    finally { inFlight.current = false; setSaving(false) }
  }
  async function discard() {
    if (!window.confirm('Supprimer ce brouillon ? Les factures déjà enregistrées ne sont pas concernées.')) return
    setSaving(true); await saveChain.current
    const res = await fetch('/api/imports/draft', { method: 'DELETE' }).catch(() => null)
    setSaving(false)
    if (!res?.ok) { setError('Suppression impossible. Réessayez.'); return }
    setRows([]); setTables([]); setBatchId(crypto.randomUUID()); setSaved('Brouillon supprimé.'); setReviewed(false)
  }
  async function remove(id: string) {
    if (rows.length === 1) { await discard(); return }
    setRows(old => old.filter(r => r.id !== id)); setReviewed(false)
  }
  if (result) return <section className="card"><span className="badge">Import validé</span>
    <h1>{result.scheduled > 0 ? 'Votre première relance est programmée ✓' : 'Vos créances sont enregistrées'}</h1>
    <p>{result.created} créance(s) créée(s) · {result.duplicates} doublon(s) ignoré(s) · {result.scheduled} relance(s) programmée(s).</p>
    <p>{result.scheduled ? 'Aucun email n’a été envoyé à la validation. Le premier envoi est prévu au plus tôt demain.' : 'Aucun email ne sera envoyé. Vous pourrez compléter les emails et activer les relances depuis le tableau de bord.'}</p>
    <div className="actions"><Link href="/dashboard" className="btn">Voir mon tableau de bord</Link><Link href="/pricing" className="btn alt">Choisir mon abonnement</Link></div></section>
  const invalid = rows.filter(r => draftErrors(r, schedule).length).length
  return <>
    <h1>Importer vos créances</h1><p className="lead">Importer → analyser → vérifier → relancer.</p>
    <p className="muted">Vos documents sont lus sur votre appareil. Seules les informations extraites sont sauvegardées dans votre espace privé. Aucun email sans votre validation.</p>
    <div className="grid3 import-options"><div className="card"><h2>Factures</h2><p>PDF, JPG, PNG · une ou plusieurs factures.</p></div><div className="card"><h2>Excel / CSV</h2><p>Une liste de créances, avec association des colonnes.</p></div><div className="card"><h2>Export comptable</h2><p>Excel ou CSV. Les grands livres PDF complexes ne sont pas pris en charge.</p></div></div>
    <fieldset disabled={busy || saving || !loaded} className="plain-fieldset">
      <div className="drop-zone" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (!busy && !saving) void filesSelected(Array.from(e.dataTransfer.files)) }}>
        <label htmlFor="documents"><strong>Déposez vos fichiers ici ou sélectionnez-les</strong></label>
        <input ref={input} id="documents" type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.xlsx,.csv" onChange={e => void filesSelected(Array.from(e.target.files || []))} />
        <p>10 fichiers · 10 Mo par fichier · 200 créances par lot.</p>
        <label className="btn alt">Prendre une photo<input className="camera-input" type="file" accept="image/jpeg,image/png" capture="environment" onChange={e => void filesSelected(Array.from(e.target.files || []))} /></label>
      </div>
      <button className="btn alt" onClick={() => { setRows(old => [...old, emptyDraft('Saisie manuelle')]); setReviewed(false) }} disabled={rows.length >= MAX_ROWS}>Compléter une facture manuellement</button>
    </fieldset>
    {busy && <p role="status">{progress} — restez sur cette page.</p>}
    {error && <p className="notice error" role="alert" style={{whiteSpace:'pre-line'}}>{error}</p>}
    {tables[0] && <section className="card"><h2>Associez les colonnes de votre fichier</h2><p>{tables[0].name} · {tables[0].rows.length} lignes · {tables.length} feuille(s) à traiter.</p>
      <div className="formGrid">{tables[0].headers.map((h,i) => <label key={i}>{h || `Colonne ${i+1}`}<small className="muted"> · {tables[0].rows[0]?.[i]?.slice(0,60)}</small>
        <select className="field" value={mapping[String(i)] || ''} onChange={e => setMapping(old => ({...old,[i]:e.target.value as Field|''}))}><option value="">Ignorer</option>{Object.entries(fields).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select></label>)}</div>
      <div className="actions"><button className="btn" onClick={useMapping}>Vérifier ces créances</button><button className="btn alt" onClick={() => setTables(old => old.slice(1))}>Ignorer cette feuille</button></div></section>}
    {rows.length > 0 && <section><h2>Nous avons trouvé ces informations</h2><p>{rows.length} créance(s) détectée(s) · {invalid} à compléter. Toutes doivent être vérifiées.</p>
      <p className="muted" role="status">{saved}</p>
      <fieldset className="plain-fieldset" disabled={saving || busy}>
      {rows.map((row,index) => <article className="card review-card" key={row.id}>
        <div className="toolbar"><div><small>{row.source}</small><h3>{index+1}. Client à relancer identifié : {row.client || 'Information manquante'}</h3><p>{row.invoiceNumber || 'N° manquant'} · {row.amount || 'Montant manquant'} {row.currency} · {row.due || 'Échéance manquante'} · {row.email ? 'Email détecté, à vérifier' : 'Email manquant'}</p></div>
          <button className="btn alt" onClick={() => void remove(row.id)}>Retirer</button></div>
        <p className="notice">Émetteur / fournisseur : {row.issuer || 'Non identifié'}. Vérifiez que le client ci-dessous est bien celui qui doit payer.</p>
        <div className="formGrid">{(['client','email','invoiceNumber','amount','due','currency'] as Field[]).map(key => <label key={key}>{fields[key]} <small>{row[key] ? row.confirmed ? '✓ confirmé' : 'à vérifier' : '⚠ information manquante'}</small><input className="field" value={row[key]} type={key==='email'?'email':'text'} inputMode={key==='amount'?'decimal':undefined} placeholder={key==='due'?'AAAA-MM-JJ':'Information manquante'} onChange={e => update(row.id,key,e.target.value)} /></label>)}</div>
        <details><summary>Modifier les informations complémentaires</summary><div className="formGrid">{(Object.keys(fields) as Field[]).filter(k => !['client','email','invoiceNumber','amount','due','currency'].includes(k)).map(key => <label key={key}>{fields[key]}<input className="field" value={row[key]} placeholder="Information manquante (facultatif)" onChange={e => update(row.id,key,e.target.value)} /></label>)}</div></details>
        {draftErrors(row,schedule).length>0 && <p className="notice">{draftErrors(row,schedule).join(' · ')}</p>}
        <label className="check"><input type="checkbox" checked={row.confirmed} onChange={e => { setRows(old => old.map(r=>r.id===row.id?{...r,confirmed:e.target.checked}:r)); setReviewed(false) }} />J’ai vérifié le débiteur, l’email, le numéro, les montants, la devise et l’échéance de cette facture.</label>
      </article>)}
      <section className="card"><h2>Choisissez vos relances</h2>
        <label className="check"><input type="checkbox" checked={schedule} onChange={e => { setSchedule(e.target.checked); setReviewed(false) }} />Programmer les relances après validation</label>
        <p className="muted">Sans email client, décochez cette option : les créances seront conservées sans aucun envoi.</p>
        <label>Scénario<select className="field" value={scenario} onChange={e => { setScenario(e.target.value as Scenario); setReviewed(false) }}>{Object.entries(scenarios).map(([k,s])=><option key={k} value={k}>{s.label}</option>)}</select></label>
        {schedule && rows.some(r=>dateISO(r.due)) && <details><summary>Voir les dates prévues pour chaque facture</summary>{rows.filter(r=>dateISO(r.due)).map(r=><div key={r.id}><h3>{r.invoiceNumber || r.client}</h3><ul>{previewSchedule(dateISO(r.due),scenario).map(p=><li key={p.stage}>{p.stage} · {new Date(p.at).toLocaleString('fr-FR')}</li>)}</ul></div>)}</details>}
        <p>Une relance au plus tôt demain ; les relances déjà dépassées sont espacées d’au moins 24 h. Les horaires définitifs sont calculés à la validation. L’envoi nécessite un essai ou abonnement actif.</p>
        <label className="check"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)} />Je confirme les informations vérifiées et {schedule ? 'autorise la programmation de ce scénario pour ces créances.' : 'souhaite enregistrer sans programmer de relance.'}</label>
        <div className="actions"><button className="btn" disabled={!reviewed || invalid>0 || rows.some(r=>!r.confirmed) || tables.length>0} onClick={()=>void submit()}>Valider les {rows.length} créance(s)</button><button className="btn alt" onClick={()=>void discard()}>Supprimer le brouillon</button></div>
      </section></fieldset>{saving && <p role="status">Enregistrement sécurisé du lot…</p>}
    </section>}
  </>
}
