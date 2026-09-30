'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
export default function EmailPreferences({ initial }: { initial: boolean }) {
  const [enabled,setEnabled] = useState(initial); const [busy,setBusy] = useState(false); const [message,setMessage] = useState('')
  async function change(value: boolean) {
    setBusy(true)
    try { const db=createClient(); const { data: { user } }=await db.auth.getUser(); if (!user) throw new Error()
      const { error }=await db.from('onboarding_state').upsert({ user_id:user.id,opted_in:value }); if(error) throw error
      setEnabled(value);setMessage('Préférence enregistrée.')
    } catch { setMessage('Impossible d’enregistrer la préférence.') } finally { setBusy(false) }
  }
  return <div><label className="check"><input type="checkbox" checked={enabled} disabled={busy} onChange={e=>change(e.target.checked)} />Recevoir les rappels de démarrage et de fin d’essai.</label><small role="status">{message}</small></div>
}
