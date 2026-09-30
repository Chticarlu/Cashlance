export function canSendImportedReminder(org:{subscription_status:string;stripe_subscription_id:string|null;created_at:string}|null,now=Date.now()) {
  return Boolean(org&&(org.subscription_status==='active'||(org.subscription_status==='trialing'&&(org.stripe_subscription_id||new Date(org.created_at).getTime()+14*86400000>now))))
}
