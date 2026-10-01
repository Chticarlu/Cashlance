import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase/admin'
import { classifyReply } from '@/lib/reminders'

async function checked<T extends { error: unknown }>(operation: PromiseLike<T>) {
  const result = await operation
  if (result.error) throw result.error
  return result
}

export async function POST(req: Request) {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Webhook non configuré' }, { status: 503 })
  }

  const resend = new Resend(process.env.RESEND_API_KEY)
  let event: any
  try {
    const payload = await req.text()
    event = resend.webhooks.verify({
      payload,
      headers: {
        id: req.headers.get('svix-id') || '',
        timestamp: req.headers.get('svix-timestamp') || '',
        signature: req.headers.get('svix-signature') || '',
      },
      webhookSecret: process.env.RESEND_WEBHOOK_SECRET,
    })
  } catch {
    return new NextResponse('Bad request', { status: 400 })
  }

  try {
    if (['email.delivered','email.bounced','email.failed','email.suppressed','email.delivery_delayed'].includes(event.type)) {
      const providerId = typeof event.data?.email_id === 'string' ? event.data.email_id : ''
      if (!providerId) return new NextResponse('Bad delivery payload', { status: 400 })
      const db = createAdminClient()
      const { data, error } = await db.rpc('record_resend_delivery', {
        p_provider_id: providerId,
        p_event: event.type,
      })
      if (error) throw error
      // Other Resend traffic (e.g. onboarding emails) does not belong to a reminder.
      return NextResponse.json({ ok: true, matched: data?.matched === true })
    }
    if (event.type !== 'email.received') return new NextResponse('OK')
    const { data: email }: any = await checked(resend.emails.receiving.get(event.data.email_id))
    const recipients = [...(event.data.to || []), ...(email?.to || [])].join(' ')
    const match = recipients.match(/invoice\+([0-9a-f-]{36})@/i)
    if (!match) return new NextResponse('OK')

    const invoiceId = match[1]
    const db = createAdminClient()
    const { data: invoice } = await checked(db.from('invoices').select('id,organization_id,status').eq('id', invoiceId).maybeSingle())
    if (!invoice) return new NextResponse('OK')

    // Email content is untrusted input. It is only classified; it never executes tools or arbitrary instructions.
    const body = String(email?.text || '').slice(0, 12000)
    const result = await classifyReply(body)
    const sender = String(event.data.from || email?.from || '').slice(0, 320)

    const stored = await db.from('inbound_messages').insert({
      organization_id: invoice.organization_id,
      invoice_id: invoice.id,
      provider_message_id: event.data.email_id,
      sender_email: sender,
      subject: String(event.data.subject || email?.subject || '').slice(0, 500),
      body_text: body,
      classification: result.classification,
      extracted_date: result.extractedDate || null,
      needs_review: result.confidence !== 'high' || result.classification !== 'promise' || !result.extractedDate,
    })
    // A retried event may already be stored after a partial failure. Reapply the
    // idempotent status updates; never acknowledge a different database error.
    if (stored.error && stored.error.code !== '23505') throw stored.error

    // Only a reply from the reminder's recorded recipient is labelled as
    // a reply to that outgoing message. Other inbound messages remain visible
    // for human review but cannot masquerade as a customer receipt.
    const senderAddress = (sender.match(/<([^<>@\\s]+@[^<>@\\s]+)>/)?.[1] || sender).trim().toLowerCase()
    const { data: previous } = await checked(db.from('outbound_messages')
      .select('id,recipient_email').eq('invoice_id', invoice.id)
      .order('created_at', { ascending: false }).limit(20))
    const repliedMessage = previous?.find(m => m.recipient_email.trim().toLowerCase() === senderAddress)
    if (repliedMessage) {
      await checked(db.from('outbound_messages').update({ replied_at: new Date().toISOString() })
        .eq('id', repliedMessage.id).is('replied_at', null))
    }

    // Do not reopen settled invoices or automate ambiguous interpretations.
    if (invoice.status === 'paid') return new NextResponse('OK')
    if (result.confidence !== 'high') {
      await checked(db.from('reminders').update({ state: 'needs_review' }).eq('invoice_id', invoice.id).eq('state', 'pending'))
      return new NextResponse('OK')
    }

    if (result.classification === 'paid') {
      // A customer's statement is not treated as proof of payment: flag for review instead of marking paid automatically.
      await checked(db.from('reminders').update({ state: 'needs_review' }).eq('invoice_id', invoice.id).eq('state', 'pending'))
    } else if (result.classification === 'promise') {
      await checked(db.from('invoices').update({ status: 'promised', promise_date: result.extractedDate || null }).eq('id', invoice.id).neq('status', 'paid'))
      await checked(db.from('reminders').update({ state: 'cancelled' }).eq('invoice_id', invoice.id).eq('state', 'pending'))
    } else if (result.classification === 'dispute') {
      await checked(db.from('invoices').update({ status: 'disputed', dispute_reason: body.slice(0, 1000) }).eq('id', invoice.id).neq('status', 'paid'))
      await checked(db.from('reminders').update({ state: 'cancelled' }).eq('invoice_id', invoice.id).eq('state', 'pending'))
    } else if (result.classification === 'duplicate') {
      await checked(db.from('reminders').update({ state: 'needs_review' }).eq('invoice_id', invoice.id).eq('state', 'pending'))
    }

    return new NextResponse('OK')
  } catch (e) {
    console.error('Resend webhook processing failed', e)
    return new NextResponse('Erreur de traitement', { status: 500 })
  }
}
