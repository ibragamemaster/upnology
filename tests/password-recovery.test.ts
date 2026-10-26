import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { SupabaseClient } from '@supabase/supabase-js'
import { passwordResetRedirect, recoveryCallback, rememberRecovery, hasRecovery, resolveRecovery, completePasswordRecovery } from '../src/lib/passwordRecovery.ts'
function storage() {
 const entries=new Map<string,string>()
 return {getItem:(k:string)=>entries.get(k)??null,setItem:(k:string,v:string)=>{entries.set(k,v)},removeItem:(k:string)=>{entries.delete(k)}} as Storage
}
function client(options:{initializeError?:boolean;userError?:boolean;otpError?:boolean;updateError?:string;signoutError?:boolean}={}) {
 const calls:string[]=[]
 return {calls,api:{auth:{
  initialize:async()=>{calls.push('initialize');return {error:options.initializeError?{}:null}},
  getUser:async()=>({data:{user:options.userError?null:{id:'alice'}},error:options.userError?{}:null}),
  verifyOtp:async(args:unknown)=>{assert.deepEqual(args,{token_hash:'fixture',type:'recovery'});calls.push('verify');return {error:options.otpError?{}:null,data:{session:options.otpError?null:{user:{id:'alice'}}}}},
  updateUser:async(args:unknown)=>{assert.deepEqual(args,{password:'new-password-fixture'});calls.push('update');return {error:options.updateError?{code:options.updateError}:null}},
  signOut:async(args:unknown)=>{assert.deepEqual(args,{scope:'local'});calls.push('signout');if(options.signoutError)throw new Error('offline');return {error:null}},
 }} as unknown as SupabaseClient}
}
test('recovery redirect is the public HTTPS reset page without a browser-origin dependency',()=>{
 assert.equal(passwordResetRedirect(),'https://upnology.agency/reset-password')
})
test('implicit recovery and expired callbacks are recognized without displaying provider tokens/errors',()=>{
 assert.equal(recoveryCallback('https://upnology.agency/#type=recovery&access_token=fixture').requested,true)
 assert.equal(recoveryCallback('https://upnology.agency/#error_code=otp_expired').requested,true)
 assert.equal(recoveryCallback('https://upnology.agency/reset-password#error_description=private').error,true)
 assert.equal(recoveryCallback('https://upnology.agency/account#type=signup').requested,false)
})
test('recovery session survives refresh, belongs to the correct user, and ordinary login cannot reset',async()=>{
 const s=storage(), c=client()
 assert.equal(await resolveRecovery(c.api,'https://upnology.agency/reset-password',s),false)
 rememberRecovery(s,'alice')
 assert.equal(hasRecovery(s,'bob'),false)
 assert.equal(await resolveRecovery(client().api,'https://upnology.agency/reset-password',s),true)
 assert.equal(await resolveRecovery(client({userError:true}).api,'https://upnology.agency/reset-password',s),false)
})
test('invalid callback wins over an existing session; PKCE/implicit initialization failure blocks reset',async()=>{
 const s=storage();rememberRecovery(s,'alice')
 assert.equal(await resolveRecovery(client().api,'https://upnology.agency/reset-password#error_code=otp_expired',s),false)
 assert.equal(hasRecovery(s,'alice'),false)
 rememberRecovery(s,'alice')
 assert.equal(await resolveRecovery(client({initializeError:true}).api,'https://upnology.agency/reset-password?code=fixture',s),false)
})
test('custom recovery token hash exchanges once, including repeated StrictMode initialization',async()=>{
 const s=storage(),c=client(),url='https://upnology.agency/reset-password?token_hash=fixture&type=recovery'
 assert.deepEqual(await Promise.all([resolveRecovery(c.api,url,s),resolveRecovery(c.api,url,s)]),[true,true])
 assert.equal(c.calls.filter(x=>x==='verify').length,1)
 assert.equal(await resolveRecovery(client({otpError:true}).api,url,storage()),false)
})
test('successful update clears recovery and signs out locally before login; failures allow retry',async()=>{
 const s=storage();rememberRecovery(s,'alice');const c=client()
 assert.deepEqual(await completePasswordRecovery(c.api,'new-password-fixture',s),{signedOut:true})
 assert.deepEqual(c.calls,['update','signout']);assert.equal(hasRecovery(s,'alice'),false)
 rememberRecovery(s,'alice');const fail=client({updateError:'same_password'})
 await assert.rejects(()=>completePasswordRecovery(fail.api,'new-password-fixture',s),/diversa/)
 assert.deepEqual(fail.calls,['update']);assert.equal(hasRecovery(s,'alice'),true)
 assert.deepEqual(await completePasswordRecovery(client({signoutError:true}).api,'new-password-fixture',s),{signedOut:false})
})

test('verified implicit callback does not depend on delayed PASSWORD_RECOVERY event delivery',async()=>{
 const s=storage(),href='https://upnology.agency/reset-password#type=recovery&access_token=fixture&refresh_token=fixture'
 assert.equal(await resolveRecovery(client().api,href,s),true)
 assert.equal(await resolveRecovery(client({initializeError:true}).api,href,storage()),false)
})
