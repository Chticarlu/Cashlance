import { test, expect } from '@playwright/test'
test.beforeEach(async ({ page, request }) => {
  await request.post('http://127.0.0.1:54440/reset')
  await page.route('**/*',r => ['127.0.0.1','localhost'].includes(new URL(r.request().url()).hostname) ? r.continue() : r.abort())
  await page.goto('/login?mode=signup')
  await page.getByPlaceholder('Nom de votre entreprise').fill('Test isolé')
  await page.getByPlaceholder('vous@entreprise.fr').fill('synthetic@example.invalid')
  await page.getByPlaceholder('8 caractères minimum').fill('local-test-password')
  await page.getByRole('button',{name:'Commencer mes 14 jours gratuits'}).click()
  await expect(page).toHaveURL(/\/pricing$/)
})
test('signup and direct paid routes stay gated; pricing and billing never loop',async({page}) => {
  for (const path of ['/dashboard','/import','/invoices/test','/onboarding','/auth/continue']) {
    await page.goto(path); await expect(page).toHaveURL(/\/pricing$/)
  }
  await page.goto('/account/billing'); await expect(page.getByRole('heading',{name:'Mon abonnement'})).toBeVisible()
  await page.goto('/pricing'); await expect(page.getByRole('heading',{name:/Choisissez selon/})).toBeVisible()
  const response = await page.request.post('/api/imports',{headers:{origin:'http://127.0.0.1:3027'},data:{}})
  expect(response.status()).toBe(402)
})
test('Checkout returns to dashboard only after verified Stripe synchronization',async({page,request}) => {
  await page.getByRole('button',{name:'Démarrer l’essai'}).nth(1).click()
  await expect(page).toHaveURL(/\/dashboard$/)
  const state = await (await request.get('http://127.0.0.1:54440/inspect')).json()
  expect(state.org.subscription_status).toBe('trialing'); expect(state.org.stripe_subscription_id).toBe('sub_test')
  await page.goto('/import'); await expect(page).toHaveURL(/\/import$/)
})
test('past_due can recover billing and cancelled users can choose another offer',async({page,request}) => {
  await request.post('http://127.0.0.1:54440/subscription',{data:{status:'past_due'}})
  await page.goto('/dashboard'); await expect(page).toHaveURL(/\/account\/billing$/)
  await expect(page.getByText('Paiement à régulariser')).toBeVisible()
  await request.post('http://127.0.0.1:54440/subscription',{data:{status:'cancelled'}})
  await page.goto('/auth/continue'); await expect(page).toHaveURL(/\/pricing$/)
  await page.goto('/account/billing'); await expect(page.getByText('Résilié',{exact:true})).toBeVisible()
})
