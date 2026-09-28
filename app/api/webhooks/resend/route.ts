import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase/admin'
import { classifyReply } from '@/lib/reminders'

export async function POST(req: Request) {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Webhook non configuré' }, { status: 503 })
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY)
    const payload = await req.text()
    const event: any = resend.webhooks.verify({
      payload,
      headers: {
        id: req.headers.get('svix-id') || '',
        timestamp: req.headers.get('svix-timestamp') || '',
        signature: req.headers.get('svix-signature') || '',
      },
      webhookSecret: process.env.RESEND_WEBHOOK_SECRET,
    })

    if (event.type !== 'email.received') return new NextResponse('OK')
    const { data: email }: any = await resend.emails.receiving.get(event.data.email_id)
    const recipients = [...(event.data.to || []), ...(email?.to || [])].join(' ')
    const match = recipients.match(/invoice\+([0-9a-f-]{36})@/i)
    if (!match) return new NextResponse('OK')

    const invoiceId = match[1]
    const db = createAdminClient()
    const { data: invoice } = await db.from('invoices').select('id,organization_id,status').eq('id', invoiceId).maybeSingle()
    if (!invoice) return new NextResponse('OK')

    // Email content is untrusted input. It is only classified; it never executes tools or arbitrary instructions.
    const body = String(email?.text || '').slice(0, 12000)
    const result = classifyReply(body)
    const sender = String(event.data.from || email?.from || '').slice(0, 320)

    await db.from('inbound_messages').insert({
      organization_id: invoice.organization_id,
      invoice_id: invoice.id,
      provider_message_id: event.data.email_id,
      sender_email: sender,
      subject: String(event.data.subject || email?.subject || '').slice(0, 500),
      body_text: body,
      classification: result.classification,
      extracted_date: result.extractedDate || null,
      needs_review: !['paid','promise','duplicate'].includes(result.classification),
    })

    if (result.classification === 'paid') {
      // A customer's statement is not treated as proof of payment: flag for review instead of marking paid automatically.
      await db.from('reminders').update({ state: 'needs_review' }).eq('invoice_id', invoice.id).eq('state', 'pending')
    } else if (result.classification === 'promise') {
      await db.from('invoices').update({ status: 'promised' }).eq('id', invoice.id)
      await db.from('reminders').update({ state: 'cancelled' }).eq('invoice_id', invoice.id).eq('state', 'pending')
    } else if (result.classification === 'dispute') {
      await db.from('invoices').update({ status: 'disputed', dispute_reason: body.slice(0, 1000) }).eq('id', invoice.id)
      await db.from('reminders').update({ state: 'cancelled' }).eq('invoice_id', invoice.id).eq('state', 'pending')
    } else if (result.classification === 'duplicate') {
      await db.from('reminders').update({ state: 'needs_review' }).eq('invoice_id', invoice.id).eq('state', 'pending')
    }

    return new NextResponse('OK')
  } catch (e) {
    console.error('Resend webhook rejected', e)
    return new NextResponse('Bad request', { status: 400 })
  }
}
