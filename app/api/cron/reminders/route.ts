import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase/admin'
import { reminderCopy } from '@/lib/reminders'
import { sendOnboardingEmails } from '@/lib/onboarding-emails'
import { canSendImportedReminder } from '@/lib/trial'

export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!process.env.RESEND_API_KEY || !process.env.CASHLANCE_FROM_EMAIL) {
    return NextResponse.json({ error: 'Email non configuré' }, { status: 503 })
  }

  const db = createAdminClient()
  const resend = new Resend(process.env.RESEND_API_KEY)
  const { data: reminders, error } = await db.rpc('due_reminder_batch')

  if (error) return NextResponse.json({ error: 'File de relances indisponible.' }, { status: 500 })
  let sent = 0

  for (const reminder of reminders || []) {
    const inv: any = reminder.invoices
    if (!inv || inv.status !== 'open' || !inv.customers?.email) continue
    if (inv.import_key && (!inv.reviewed_at || !inv.reminder_scenario || !canSendImportedReminder(inv.organizations))) continue
    const customer = inv.customers
    const copy = reminderCopy(reminder.stage, customer.name, inv.amount_cents, inv.invoice_number)
    const replyTo = process.env.CASHLANCE_INBOUND_DOMAIN
      ? `invoice+${inv.id}@${process.env.CASHLANCE_INBOUND_DOMAIN}`
      : undefined

    const { data, error: sendError } = await resend.emails.send({
      from: process.env.CASHLANCE_FROM_EMAIL,
      to: [customer.email],
      subject: copy.subject,
      text: copy.text,
      replyTo,
    })

    await db.from('outbound_messages').insert({
      organization_id: inv.organization_id,
      invoice_id: inv.id,
      reminder_id: reminder.id,
      provider_message_id: data?.id || null,
      recipient_email: customer.email,
      subject: copy.subject,
      body_text: copy.text,
      state: sendError ? 'failed' : 'sent',
      sent_at: sendError ? null : new Date().toISOString(),
    })

    if (!sendError) {
      sent++
      await db.from('reminders').update({ state: 'sent' }).eq('id', reminder.id)
      await db.from('invoices').update({ last_contact_at: new Date().toISOString() }).eq('id', inv.id)
    }
  }

  const onboardingSent = await sendOnboardingEmails(db, resend)
  return NextResponse.json({ ok: true, processed: reminders?.length || 0, sent, onboardingSent })
}
