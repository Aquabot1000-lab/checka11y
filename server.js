const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const {scan,report}=require('./scan');const L=require('./lib');const S=require('./stripe');
const BASE=process.env.BASE_URL||'http://localhost:8080';const ADMIN=process.env.ADMIN_TOKEN||'';
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const page=(title,body,desc='')=>`<!doctype html><html lang=en><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>${esc(title)}</title><meta name=description content="${esc(desc)}"><link rel=stylesheet href=/static/style.css></head><body><header><a href=/ class=logo>Welcome Check Web</a> <nav><a href=/pricing>Pricing</a> <a href=/agencies>Agencies</a> <a href=/guides>Guides</a></nav></header><main>${body}</main><footer><p class=disc>${L.DISCLAIMER}</p><p><a href=/terms>Terms</a> · <a href=/privacy>Privacy</a> · <a href=/support>Support</a></p></footer></body></html>`;
let busy=0;const MAXC=+process.env.MAX_CONCURRENT||1;const queue=[];
function slot(){return new Promise(r=>{if(busy<MAXC){busy++;r()}else queue.push(r)})}
function free(){const n=queue.shift();if(n)n();else busy--}
const hits=new Map();function limited(ip){const now=Date.now(),a=(hits.get(ip)||[]).filter(t=>now-t<3600e3);a.push(now);hits.set(ip,a);return a.length>10}
const ORDER={critical:0,serious:1,moderate:2,minor:3};
function issuesOf(r){const out=[];for(const p of r.pages)for(const v of p.violations||[])out.push({page:p.url,rule:v.id,impact:v.impact,count:v.count,fp:crypto.createHash('sha1').update(new URL(p.url).pathname+'|'+v.id).digest('hex').slice(0,16)});return out}
async function runScan(url,kind,maxPages,site_id){
  let id=null;try{id=(await L.rpc('scan_start',{url,kind,site_id}))?.id}catch(e){L.logErr('scan_start',e)}
  const t=Date.now();await slot();
  try{const r=await scan(url,maxPages);for(const p of r.pages)(p.violations||[]).sort((a,b)=>ORDER[a.impact]-ORDER[b.impact]);
    const iss=issuesOf(r);if(id)await L.rpc('scan_finish',{id,status:'done',pages:r.pagesScanned,total:r.totalIssues,critical:r.criticalOrSerious,ms:Date.now()-t,report:r,issues:iss}).catch(e=>L.logErr('scan_finish',e));
    return {id,r,iss}}
  catch(e){if(id)await L.rpc('scan_finish',{id,status:'failed',ms:Date.now()-t,error:String(e.message)}).catch(()=>{});throw e}
  finally{free()}}
function body(q){return new Promise((res,rej)=>{let d='';q.on('data',c=>{d+=c;if(d.length>1e6)q.destroy()});q.on('end',()=>res(d));q.on('error',rej)})}
function send(s,code,type,data,extra={}){s.writeHead(code,{'content-type':type,...extra});s.end(data)}
const json=(s,o,c=200)=>send(s,c,'application/json',JSON.stringify(o));
function validUrl(t){const v=new URL(/^https?:\/\//i.test(t)?t:'https://'+t);if(!/^https?:$/.test(v.protocol))throw 0;
  if(/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[)/.test(v.hostname)||/^172\.(1[6-9]|2\d|3[01])\./.test(v.hostname)||v.hostname.endsWith('.internal'))throw 0;return v.href}
async function links(){let l=S.links();if(Object.keys(l).length)return l;l={};for(const p of Object.keys(L.PLANS))l[p]=process.env['LINK_'+p.toUpperCase()]||'';return l}
const GUIDES=fs.existsSync(__dirname+'/guides')?fs.readdirSync(__dirname+'/guides').filter(f=>f.endsWith('.html')):[];
const srv=http.createServer(async(q,s)=>{const u=new URL(q.url,BASE);const ip=(q.headers['x-forwarded-for']||q.socket.remoteAddress||'').split(',')[0];
 try{
  if(u.pathname==='/admin/secrets'){if(!ADMIN||u.searchParams.get('t')!==ADMIN)return send(s,401,'text/plain','no');const k=process.env.STRIPE_SECRET_KEY||'',w=process.env.STRIPE_WEBHOOK_SECRET||'',g=process.env.SENDGRID_API_KEY||'';let ok=false;try{const r=await fetch('https://api.stripe.com/v1/products?limit=1',{headers:{Authorization:'Bearer '+k}});ok=r.status===200}catch(e){}return send(s,200,'application/json',JSON.stringify({stripe_key_valid:ok,stripe_key_len:k.length,webhook_secret_format_ok:/^whsec_/.test(w)&&w.length>=30,webhook_len:w.length,sendgrid_format_ok:/^SG\./.test(g)}))}
  if(u.pathname==='/healthz')return send(s,200,'text/plain','ok');
  if(u.pathname.startsWith('/static/')){const f=path.join(__dirname,'public',path.basename(u.pathname));return fs.existsSync(f)?send(s,200,f.endsWith('.css')?'text/css':'application/javascript',fs.readFileSync(f),{'cache-control':'max-age=3600'}):send(s,404,'text/plain','not found')}
  if(u.pathname==='/robots.txt')return send(s,200,'text/plain',`User-agent: *\nAllow: /\nSitemap: ${BASE}/sitemap.xml`);
  if(u.pathname==='/sitemap.xml')return send(s,200,'application/xml',`<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${['/','/pricing','/agencies','/guides',...GUIDES.map(g=>'/guides/'+g.replace('.html',''))].map(p=>`<url><loc>${BASE}${p}</loc></url>`).join('')}</urlset>`);
  if(u.pathname==='/api/event'&&q.method==='POST'){const b=JSON.parse(await body(q)||'{}');if(['visit','scan_click','checkout_click','unlock_view'].includes(b.kind))L.rpc('event',{kind:b.kind,source:String(b.source||'').slice(0,80),session:String(b.session||'').slice(0,40),url:String(b.path||'').slice(0,200)}).catch(e=>L.logErr('event',e));return json(s,{})}
  if(u.pathname==='/api/scan'&&q.method==='POST'){if(limited(ip))return json(s,{error:'Too many scans from your network. Try again in an hour.'},429);
    const b=JSON.parse(await body(q)||'{}');let url;try{url=validUrl(String(b.url||''))}catch{return json(s,{error:'Enter a valid public website address.'},400)}
    if(!(await require('./netguard').safeUrl(url)))return json(s,{error:'Enter a valid public website address.'},400);
    try{const {id,r}=await runScan(url,'free',1);const v=r.pages[0].violations||[];const tk=id?(await L.rpc2('scan_token',{id}))?.view:null;
      return json(s,{scan_id:id,view:tk,url:r.url,total:r.totalIssues,critical:r.criticalOrSerious,warning:r.pages[0].warning,top:v.slice(0,3).map(x=>({help:x.help,impact:x.impact,count:x.count})),hidden:Math.max(0,v.length-3)})}
    catch(e){return json(s,{error:'We could not load that page. Check the address and that the site is online. ('+String(e.message).slice(0,120)+')'},422)}}
  if(u.pathname==='/api/unlock'&&q.method==='POST'){const b=JSON.parse(await body(q)||'{}');const email=String(b.email||'').trim().toLowerCase();
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)||email.length>200)return json(s,{error:'Enter a valid email.'},400);
    await L.rpc('capture_email',{email,url:b.url,source:b.source||'free_scan'});
    const link=`${BASE}/r/${encodeURIComponent(b.scan_id)}?v=${encodeURIComponent(b.view)}`;
    L.sendMail(email,'Your accessibility scan report',`<p>Your report: <a href="${link}">${link}</a></p><p>${L.DISCLAIMER}</p>`).catch(()=>{});
    return json(s,{report:link})}
  let m;if((m=u.pathname.match(/^\/r\/([0-9a-f-]{36})$/))){const sc=await L.rpc2('get_scan',{id:m[1],view:u.searchParams.get('v')});if(!sc||!sc.report)return send(s,404,'text/html',page('Not found','<p>Report not found.</p>'));
    return send(s,200,'text/html',page('Accessibility report',report(sc.report,{inner:true})+`<div class=cta><p>Get this scan on up to 25 pages every week, with alerts when new issues appear.</p><a class=btn href="/pricing">See monitoring plans</a></div>`))}
  if(u.pathname==='/checkout'){const plan=u.searchParams.get('plan');const l=(await links())[plan];L.rpc('event',{kind:'checkout_click',source:plan,session:u.searchParams.get('s')}).catch(()=>{});
    if(!l)return send(s,200,'text/html',page('Coming soon',`<h1>Checkout opens soon</h1><p>Paid monitoring isn't open yet. Run a <a href=/>free scan</a> and leave your email on the results page to save your report.</p>`));
    return send(s,302,'text/plain','',{location:l})}
  if(u.pathname==='/thanks')return send(s,200,'text/html',page('Thanks',`<h1>You're subscribed</h1><p>Your first full scan runs within 24 hours. Monitoring covers the website you scanned at checkout; reply to the receipt or visit <a href=/support>support</a> to add or change sites.</p>`));
  if(u.pathname==='/stripe/webhook'&&q.method==='POST'){const raw=await body(q);let ev;try{ev=S.verify(raw,q.headers['stripe-signature'],process.env.STRIPE_WEBHOOK_SECRET||'')}catch(e){return send(s,400,'text/plain','bad sig')}
    const o=ev.data.object;
    if(ev.type==='checkout.session.completed'&&o.mode==='subscription'){const pl=(o.metadata&&o.metadata.plan)||'solo';if(o.metadata?.project==='a11yscan'){const p=L.PLANS[pl]||L.PLANS.solo;
      await L.rpc('subscribe',{email:o.customer_details?.email,stripe_customer:o.customer,stripe_subscription:o.subscription,plan:pl,site_limit:p.sites,mrr_cents:p.cents})}}
    if(ev.type==='customer.subscription.deleted'&&o.metadata?.project==='a11yscan')await L.rpc('cancel',{stripe_subscription:o.id});
    if(ev.type==='charge.refunded')await L.rpc2('refund',{stripe_customer:o.customer,cents:o.amount_refunded});
    return json(s,{received:true})}
  if(u.pathname==='/cancel'){const token=u.searchParams.get('token')||'';const sub=await L.rpc2('sub_by_token',{token});
    if(!sub)return send(s,404,'text/html',page('Cancel','<p>Link not recognized. Contact <a href=/support>support</a>.</p>'));
    if(q.method==='POST'){if(sub.stripe_subscription&&process.env.STRIPE_SECRET_KEY)await S.cancelSub(sub.stripe_subscription).catch(e=>L.logErr('cancel',e));await L.rpc('cancel',{token});
      return send(s,200,'text/html',page('Canceled','<h1>Canceled</h1><p>Your monitoring is canceled and you will not be billed again. Asking for a refund within 30 days of your first charge? Reply to your receipt and we will refund it.</p>'))}
    return send(s,200,'text/html',page('Cancel',`<h1>Cancel monitoring</h1><p>Plan: ${esc(sub.plan)} (${esc(sub.status)})</p><form method=post><button class=btn>Cancel my subscription</button></form>`))}
  if(u.pathname==='/internal/weekly'&&q.method==='POST'){if(global.weeklyRunning)return json(s,{running:true});global.weeklyRunning=true;json(s,{started:true});require('./worker').run({runScan,BASE}).catch(e=>L.logErr('weekly',e)).finally(()=>global.weeklyRunning=false);return}
  if(u.pathname==='/admin/metrics'){if(!ADMIN||u.searchParams.get('t')!==ADMIN)return send(s,401,'text/plain','no');const mt=await L.rpc('metrics');
    const conv=(a,b)=>b?(100*a/b).toFixed(1)+'%':'n/a';const cost=0;const mrr=mt.mrr_cents/100;
    return send(s,200,'text/html',page('Metrics',`<h1>Metrics</h1><table>${Object.entries({...mt,'visit→scan':conv(mt.scans_started,mt.visitors),'scan→email':conv(mt.emails,mt.scans_done),'email→paid':conv(mt.paid_active,mt.emails),'MRR $':mrr,'costs $/mo':cost,'profit $/mo':mrr-cost}).map(([k,v])=>`<tr><td>${esc(k)}</td><td>${esc(typeof v==='object'?JSON.stringify(v):v)}</td></tr>`).join('')}</table>`))}
  const statics={'/':'index','/pricing':'pricing','/agencies':'agencies','/terms':'terms','/privacy':'privacy','/support':'support','/guides':'guides_index'};
  if(statics[u.pathname]){const f=fs.readFileSync(__dirname+'/public/'+statics[u.pathname]+'.html','utf8');const [t,d,...rest]=f.split('\n');return send(s,200,'text/html',page(t,rest.join('\n'),d))}
  if((m=u.pathname.match(/^\/guides\/([a-z0-9-]+)$/))&&GUIDES.includes(m[1]+'.html')){const f=fs.readFileSync(__dirname+'/guides/'+m[1]+'.html','utf8');const [t,d,...rest]=f.split('\n');return send(s,200,'text/html',page(t,rest.join('\n'),d))}
  send(s,404,'text/html',page('Not found','<h1>Not found</h1>'))
 }catch(e){L.logErr('http '+u.pathname,e);if(!s.headersSent)send(s,500,'text/plain','Something went wrong.')}});
srv.listen(process.env.PORT||8080,()=>console.log('up'));
if(process.env.STRIPE_SECRET_KEY)S.ensure(BASE).then(l=>console.log('stripe links',l)).catch(e=>L.logErr('stripe_ensure',e));
