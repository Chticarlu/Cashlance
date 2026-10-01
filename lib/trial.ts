import { hasSubscription } from '@/lib/subscription'
export function canSendImportedReminder(org:{subscription_status:string;stripe_subscription_id:string|null;created_at:string}|null,_now=Date.now()) {
  return hasSubscription(org)
}
