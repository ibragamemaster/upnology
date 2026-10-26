import { test, mock } from 'node:test'
import assert from 'node:assert/strict'
import { features, supabaseSecretKey } from '../server/config.ts'
import { service, serviceClient, userClient } from '../server/database.ts'

test('Supabase secret key precedence, legacy fallback, feature gates and isolated user authorization', async () => {
 const previous={...process.env}
 const calls:Headers[]=[]
 const intercepted=mock.method(globalThis,'fetch',async (input:string|URL|Request, init?:RequestInit)=>{
  calls.push(new Headers(init?.headers))
  if(String(input).includes('/auth/v1/user')) return Response.json({id:'test-user',email_confirmed_at:'2026-10-16T00:00:00Z'})
  return Response.json({ok:true})
 })
 try {
  Object.assign(process.env,{SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'sb_publishable_fixture',SUPABASE_SECRET_KEY:'sb_secret_fixture',SUPABASE_SERVICE_ROLE_KEY:'legacy-fixture',COMMERCIAL_ENABLED:'true',STRIPE_ENABLED:'true',STRIPE_MODE:'test',STRIPE_SECRET_KEY:'rk_test_fixture',STRIPE_WEBHOOK_SECRET:'whsec_fixture',APP_URL:'https://example.com',RESEND_ENABLED:'true',RESEND_API_KEY:'fixture',RESEND_FROM:'test@example.com'})
  assert.equal(supabaseSecretKey(),'sb_secret_fixture')
  assert.equal(features().payments,true);assert.equal(features().email,true)
  assert.deepEqual(await service('stripe_event',{attempt_id:'fixture'}),{ok:true})
  assert.equal(calls.at(-1)!.get('apikey'),'sb_secret_fixture')
  await userClient(new Request('https://example.com/api/commercial/overview',{headers:{Authorization:'Bearer user-token'}}))
  assert.equal(calls.at(-1)!.get('apikey'),'sb_publishable_fixture')
  assert.equal(calls.at(-1)!.get('authorization'),'Bearer user-token')
  await service('claim_emails')
  assert.equal(calls.at(-1)!.get('apikey'),'sb_secret_fixture')
  assert.notEqual(calls.at(-1)!.get('authorization'),'Bearer user-token')
  process.env.SUPABASE_SECRET_KEY='  '
  await service('claim_emails')
  assert.equal(calls.at(-1)!.get('apikey'),'legacy-fixture')
  assert.equal(calls.at(-1)!.get('authorization'),'Bearer legacy-fixture')
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
  assert.equal(features().payments,false);assert.equal(features().email,false)
  assert.throws(serviceClient,/Servizio non configurato/)
  process.env.SUPABASE_SECRET_KEY='sb_secret_fixture';process.env.STRIPE_ENABLED='false'
  assert.equal(features().payments,false)
 } finally {
  intercepted.mock.restore()
  for(const key of Object.keys(process.env)) if(!(key in previous)) delete process.env[key]
  Object.assign(process.env,previous)
 }
})
