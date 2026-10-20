const {test}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const jwt=require('jsonwebtoken');
const createRouter=require('../server/native-google-routes');
const secret='test-secret';
async function fixture(options,run){
 let created=0;
 const app=express();app.use(express.json());
 app.use(createRouter({clientId:()=> 'web-client',secret:()=>secret,
 verify:async()=>({sub:'id',email:'test@example.com',email_verified:true,nonce:'nonce',iat:Math.floor(Date.now()/1000)}),
 findUser:async()=>{created++;return {id:'user-id',display_name:'Test'};},
 profileComplete:()=>true,loadAdmin:async()=>null,signSession:()=> 'session',...options}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));
 const url=`http://127.0.0.1:${server.address().port}`;
 const challenge=(app='user',expiresIn=300)=>jwt.sign({app,nonce:'nonce'},secret,{expiresIn,audience:'kibbisave-native-google',issuer:'kibbisave'});
 const post=(flow=challenge())=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:'google-token',challenge:flow})});
 try{await run({url,post,challenge,created:()=>created});}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
}
test('public challenge binds nonce to app and expires after five minutes',()=>fixture({},async({url})=>{
 const r=await fetch(url+'/challenge?audience=admin');const b=await r.json();const c=jwt.verify(b.challenge,secret);
 assert.equal(r.status,200);assert.equal(c.nonce,b.nonce);assert.equal(c.app,'admin');assert.equal(c.exp-c.iat,300);
 assert.equal(r.headers.get('cache-control'),'no-store');assert.equal((await fetch(url+'/challenge?audience=unknown')).status,400);
}));
test('verified identity establishes an HttpOnly session',()=>fixture({},async({post})=>{
 const r=await post();assert.equal(r.status,200);assert.match(r.headers.get('set-cookie'),/HttpOnly/);assert.equal((await r.json()).user.id,'user-id');
}));
test('invalid Google signature cannot create a user',()=>fixture({verify:async()=>{throw new Error('bad signature');}},async({post,created})=>{
 assert.equal((await post()).status,401);assert.equal(created(),0);
}));
test('expired and forged challenges are rejected',()=>fixture({},async({post,challenge,created})=>{
 for(const c of ['forged',challenge('user',-1)])assert.equal((await post(c)).status,401);assert.equal(created(),0);
}));
test('mismatched nonce, unverified email and stale token are rejected',async()=>{
 for(const change of [{nonce:'wrong'},{email_verified:false},{iat:0}])await fixture({verify:async()=>({sub:'id',email:'test@example.com',email_verified:true,nonce:'nonce',iat:Math.floor(Date.now()/1000),...change})},async({post,created})=>{
 assert.equal((await post()).status,401);assert.equal(created(),0);
 });
});
test('ordinary users cannot obtain admin sessions',()=>fixture({},async({post,challenge})=>{
 const r=await post(challenge('admin'));assert.equal(r.status,403);assert.equal(r.headers.get('set-cookie'),null);
}));
test('admin requires both KYC and PIN',async()=>{
 for(const admin of [{kyc_complete:true},{pin_hash:'hash'},{kyc_complete:true,pin_hash:'hash'}])await fixture({loadAdmin:async()=>admin},async({post,challenge})=>{
 assert.equal((await post(challenge('admin'))).status,admin.kyc_complete&&admin.pin_hash?200:403);
 });
});
test('incomplete profile receives no session',()=>fixture({profileComplete:()=>false},async({post})=>{
 const r=await post();assert.equal(r.status,403);assert.equal(r.headers.get('set-cookie'),null);
}));
