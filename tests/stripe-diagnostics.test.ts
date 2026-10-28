import { test, mock } from 'node:test'
import assert from 'node:assert/strict'
import { features, stripeConfigurationChecks } from '../server/config.ts'
import { handleRequest } from '../server/handler.ts'

test('Stripe diagnostics: gates, redaction and admin-only access', async () => {
 // No realtime connection is used; support the local Node 18 test runner.
 const websocket = Object.getOwnPropertyDescriptor(globalThis, 'WebSocket')
 if (!websocket) Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: class { constructor() { throw new Error('Unexpected realtime connection') } } })
 const values = {
  COMMERCIAL_ENABLED: 'true', SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'public-test-key',
  STRIPE_ENABLED: 'true', STRIPE_MODE: 'live', STRIPE_SECRET_KEY: 'sk_live_private_sentinel',
  STRIPE_WEBHOOK_SECRET: 'whsec_private_sentinel', SUPABASE_SECRET_KEY: 'supabase_private_sentinel',
  SUPABASE_SERVICE_ROLE_KEY: '', APP_URL: 'https://private-origin.example',
 }
 const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]))
 let admin: unknown = false
 const fetchMock = mock.method(globalThis, 'fetch', async (url: string | URL | Request) => {
  if (String(url).includes('/auth/v1/user')) return Response.json({ id: '33333333-3333-4333-8333-333333333333', email_confirmed_at: '2026-01-01T00:00:00Z' })
  assert.ok(String(url).includes('/rpc/admin_access'))
  return Response.json(admin)
 })
 try {
  Object.assign(process.env, values)
  assert.ok(features().payments)
  for (const [key, bad] of Object.entries({ STRIPE_ENABLED: 'TRUE', STRIPE_MODE: 'invalid', STRIPE_SECRET_KEY: 'sk_test_wrong_mode', STRIPE_WEBHOOK_SECRET: ' ', SUPABASE_SECRET_KEY: '', APP_URL: 'http://private-origin.example/path' })) {
   process.env[key] = bad
   assert.equal(features().payments, false, key)
   assert.equal(stripeConfigurationChecks().filter(check => !check.ok).length, 1, key)
   process.env[key] = values[key as keyof typeof values]
  }
  process.env.SUPABASE_SECRET_KEY = ''
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'fallback_private_sentinel'
  assert.ok(features().payments)
  assert.match(stripeConfigurationChecks()[3].reason, /fallback/)
  Object.assign(process.env, values)
  const url = 'https://example.com/api/commercial/stripe-diagnostics'
  assert.equal((await handleRequest(new Request(url))).status, 401)
  const request = () => new Request(url, { headers: { Authorization: 'Bearer test-token' } })
  for (admin of [false, null, 'true']) assert.equal((await handleRequest(request())).status, 403)
  admin = true
  const response = await handleRequest(request())
  assert.equal(response.status, 200)
  assert.match(response.headers.get('Cache-Control')!, /no-store/)
  const body = await response.text()
  for (const sentinel of [values.STRIPE_SECRET_KEY, values.STRIPE_WEBHOOK_SECRET, values.SUPABASE_SECRET_KEY, values.APP_URL]) assert.ok(!body.includes(sentinel))
  assert.equal(JSON.parse(body).checks.length, 5)
  const publicStatus = await handleRequest(new Request('https://example.com/api/commercial/status'))
  assert.equal('checks' in await publicStatus.json(), false)
 } finally {
  fetchMock.mock.restore()
  if (!websocket) Reflect.deleteProperty(globalThis, 'WebSocket')
  for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value }
 }
})
