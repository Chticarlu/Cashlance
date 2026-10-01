'use client'
import ReminderPlanner from '@/components/reminder-planner'

// Dashboard and invoice detail deliberately share the same planner,
// preventing the scenario list and backend payload from diverging.
export default function ActivateInvoice({ id, email, due }: { id: string; email: string; due: string }) {
  return <details className="dashboard-reminder-planner">
    <summary>Programmer les relances</summary>
    <ReminderPlanner invoiceId={id} due={due} initialEmail={email} />
  </details>
}
