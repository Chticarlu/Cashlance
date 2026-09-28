import Stripe from 'stripe'

export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY manquante')
  return new Stripe(key)
}

export const PLAN_CONFIG = {
  solo: {
    label: 'Solo',
    amountCents: 1900,
    priceEnv: 'STRIPE_PRICE_SOLO',
    description: '20 factures actives, relances automatiques et tableau de bord.',
  },
  pro: {
    label: 'Pro',
    amountCents: 3900,
    priceEnv: 'STRIPE_PRICE_PRO',
    description: '100 factures actives, analyse des réponses, promesses et litiges.',
  },
  team: {
    label: 'Équipe',
    amountCents: 7900,
    priceEnv: 'STRIPE_PRICE_TEAM',
    description: 'Factures illimitées, jusqu’à 5 utilisateurs et règles personnalisées.',
  },
} as const

export type PlanKey = keyof typeof PLAN_CONFIG

export function getStripePriceId(plan: PlanKey) {
  const envName = PLAN_CONFIG[plan].priceEnv
  const value = process.env[envName]
  if (!value) throw new Error(`${envName} manquante`)
  return value
}

export function planFromPriceId(priceId?: string | null): PlanKey | null {
  if (!priceId) return null
  const entries = Object.entries(PLAN_CONFIG) as Array<[PlanKey, (typeof PLAN_CONFIG)[PlanKey]]>
  for (const [plan, config] of entries) {
    if (process.env[config.priceEnv] === priceId) return plan
  }
  return null
}
