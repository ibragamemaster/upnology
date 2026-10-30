import { test, mock } from 'node:test'
import assert from 'node:assert/strict'
import { handleRequest } from '../server/handler.ts'

test('workspace activation distinguishes disabled runtime, v2 schema, and permissions without bypassing gates', async () => {
 const previous = { ...process.env }
 Object.assign(process.env, { COMMERCIAL_ENABLED: 'false', SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'fixture', STRIPE_ENABLED: 'false', RESEND_ENABLED: 'false' })
 let failure: string | null = null
 const called: string[] = []
 const fetch = mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
  const url = String(input); called.push(url)
  if (url.includes('/auth/v1/user')) return Response.json({ id: '11111111-1111-4111-8111-111111111111', email: 'admin@example.com', email_confirmed_at: '2026-01-01' })
  assert.ok(url.endsWith('/rpc/commercial_workspace_v2'))
  if (failure) return Response.json({ code: failure, message: 'Internal details must not leak', details: null, hint: null }, { status: failure === '42501' ? 403 : 404 })
  return Response.json({ workspace: { quotes: [] }, commercial: { offers: [], templates: [] }, generated_at: '2026-10-30T00:00:00Z' })
 })
 const request = () => new Request('https://example.com/api/commercial/workspace', { headers: { Authorization: 'Bearer fixture' } })
 try {
  assert.equal((await handleRequest(request())).status, 503)
  assert.equal(called.length, 0)
  const status = await (await handleRequest(new Request('https://example.com/api/commercial/status'))).json()
  assert.equal(status.workspaceVersion, 2); assert.equal(status.backend, false)
  process.env.COMMERCIAL_ENABLED = 'true'
  assert.equal((await handleRequest(new Request('https://example.com/api/commercial/workspace'))).status, 401)
  const success = await handleRequest(request())
  assert.equal(success.status, 200)
  assert.equal((await success.json()).version, 2)
  for (const code of ['PGRST202', '42P01', '42883', '42703']) {
   failure = code
   const response = await handleRequest(request()); const body = await response.json()
   assert.equal(response.status, 503)
   assert.match(body.error, /20261030000000_commercial_workspace_v2/)
   assert.doesNotMatch(body.error, /Internal details/)
  }
  failure = '42501'
  assert.equal((await handleRequest(request())).status, 403)
 } finally {
  fetch.mock.restore()
  for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key]
  Object.assign(process.env, previous)
 }
})
