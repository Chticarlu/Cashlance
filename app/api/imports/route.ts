import { subscriptionApiError } from '@/lib/subscription-server'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { cleanDrafts, sameOrigin, uuid } from '@/lib/imports/server'
import { dateISO, draftErrors, moneyCents } from '@/lib/imports/model'

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Origine non autorisée.' }, { status: 403 })
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Connectez-vous pour enregistrer vos créances.' }, { status: 401 })
  const denied = await subscriptionApiError(db, user.id)
  if (denied) return denied
  try {
    const text = await req.text()
    if (text.length > 2_000_000) throw new Error('Import trop volumineux.')
    const body = JSON.parse(text)
    if (!uuid(body.batchId) || body.reviewed !== true || !(typeof body.scenario === 'string' && (['gentle','complete'].includes(body.scenario) || /^custom:(?:[1-9]|[1-5][0-9]|60)(?:,(?:[1-9]|[1-5][0-9]|60)){0,4}$/.test(body.scenario) && (() => { const a=body.scenario.slice(7).split(',').map(Number); return a.every((n:number,i:number)=>i===0||n>a[i-1]) })())) || typeof body.schedule !== 'boolean') throw new Error('Confirmez les informations et le scénario de relance.')
    const rows = cleanDrafts(body.rows)
    for (const row of rows) {
      if (!row.confirmed) throw new Error('Chaque créance doit être vérifiée.')
      const errors = draftErrors(row, body.schedule)
      if (errors.length) throw new Error(errors[0])
    }
    const admin = createAdminClient()
    const { data, error } = await admin.rpc('confirm_import_server', {
      p_owner: user.id,
      batch_id: body.batchId, schedule: body.schedule, scenario: body.scenario,
      rows: rows.map(({ id, source, issuer, confirmed, ...row }) => ({
        client: row.client, email: row.email, invoiceNumber: row.invoiceNumber, amount_cents: moneyCents(row.amount),
        due: dateISO(row.due), currency: 'EUR', confirmed,
        details: { ...row, issuer },
      })),
    })
    if (error) {
      const message = error.message?.includes('subscription_required') ? 'Votre essai est terminé. Choisissez un abonnement pour programmer les relances.'
        : error.message?.includes('customer_email_conflict') ? 'Cet email appartient déjà à un client de nom différent. Vérifiez le débiteur.'
        : 'Import non enregistré. Vérifiez la configuration et réessayez ; aucun lot partiel n’a été créé.'
      return NextResponse.json({ error: message }, { status: 409 })
    }
    return NextResponse.json({ ok: true, ...data })
  } catch (e) { return NextResponse.json({ error: e instanceof SyntaxError ? 'Format de requête invalide.' : e instanceof Error ? e.message : 'Import invalide.' }, { status: 400 }) }
}
