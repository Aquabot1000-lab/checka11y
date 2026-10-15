const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const {scan,report}=require('./scan');const L=require('./lib');const S=require('./stripe');
const BASE=process.env.BASE_URL||'http://localhost:8080';const ADMIN=process.env.ADMIN_TOKEN||'';
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const SITE=require('./site'),P=require('./pages'),zlib=require('zlib');
const page=(title,body,desc='')=>SITE.layout({title:title+' | '+SITE.BRAND,desc:desc||title,path:'/x',body:`<div class="article"><div class="wrap narrow">${body}</div></div>`,noindex:true});
const OG=fs.existsSync(__dirname+'/public/og.b64')?Buffer.from(fs.readFileSync(__dirname+'/public/og.b64','utf8'),'base64'):null;
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
function send(s,code,type,data,extra={}){const h={'content-type':type,...extra};if(/text|javascript|json|xml|svg/.test(type)&&data&&data.length>1024&&/gzip/.test(s.req?.headers['accept-encoding']||'')){data=zlib.gzipSync(data);h['content-encoding']='gzip';h.vary='Accept-Encoding'}s.writeHead(code,h);s.end(data)}
const json=(s,o,c=200)=>send(s,c,'application/json',JSON.stringify(o));
function validUrl(t){const v=new URL(/^https?:\/\//i.test(t)?t:'https://'+t);if(!/^https?:$/.test(v.protocol))throw 0;
  if(/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[)/.test(v.hostname)||/^172\.(1[6-9]|2\d|3[01])\./.test(v.hostname)||v.hostname.endsWith('.internal'))throw 0;return v.href}
async function links(){let l={...S.links()};for(const p of Object.keys(L.PLANS))l[p]=process.env['LINK_'+p.toUpperCase()]||'';for(const p of Object.keys(L.FOUNDING.plans))l['f_'+p]=process.env['LINK_F_'+p.toUpperCase()]||'';return l}
const A=require('./agency');const r4=(op,args)=>L.rpc(op,args,'rpc4');
async function foundingLeft(){try{const n=await r4('founding_count',{});return Math.max(0,L.FOUNDING.slots-(+n||0))}catch{return 0}}
async function subscribeFrom(o){const plan=String(o.metadata?.plan||'studio');const base=plan.replace(/^f_/,'');const p=L.PLANS[base]||L.PLANS.studio;const cents=plan.startsWith('f_')?(L.FOUNDING.plans[base]||p.cents):p.cents;const email=o.customer_details?.email;
  await L.rpc('subscribe',{email,stripe_customer:o.customer,stripe_subscription:o.subscription,plan,site_limit:p.sites,mrr_cents:cents});const tok=await r4('token_for_email',{email});return {tok,email}}
const cookies=q=>Object.fromEntries(String(q.headers.cookie||'').split(';').map(x=>x.trim().split('=')).filter(x=>x[0]).map(([k,...v])=>[k,decodeURIComponent(v.join('='))]));
const form=async q=>Object.fromEntries(new URLSearchParams(await body(q)));
const dpage=(title,body,ld)=>SITE.layout({title:title+' | '+SITE.BRAND,desc:title,path:'/dashboard',body,noindex:true});
const GUIDES=fs.existsSync(__dirname+'/guides')?fs.readdirSync(__dirname+'/guides').filter(f=>f.endsWith('.html')):[];
const srv=http.createServer(async(q,s)=>{s.req=q;const u=new URL(q.url,BASE);const ip=(q.headers['x-forwarded-for']||q.socket.remoteAddress||'').split(',')[0];
 try{
  if(u.pathname==='/admin/secrets'){if(!ADMIN||u.searchParams.get('t')!==ADMIN)return send(s,401,'text/plain','no');const k=process.env.STRIPE_SECRET_KEY||'',w=process.env.STRIPE_WEBHOOK_SECRET||'',g=process.env.SENDGRID_API_KEY||'';let ok=false;try{const r=await fetch('https://api.stripe.com/v1/products?limit=1',{headers:{Authorization:'Bearer '+k}});ok=r.status===200}catch(e){}return send(s,200,'application/json',JSON.stringify({stripe_key_valid:ok,stripe_key_len:k.length,webhook_secret_format_ok:/^whsec_/.test(w)&&w.length>=30,webhook_len:w.length,sendgrid_format_ok:/^SG\./.test(g)}))}
  if(u.pathname==='/healthz')return send(s,200,'text/plain','ok');
  if(u.pathname.startsWith('/static/')){const f=path.join(__dirname,'public',path.basename(u.pathname));return fs.existsSync(f)?send(s,200,f.endsWith('.css')?'text/css; charset=utf-8':'application/javascript; charset=utf-8',fs.readFileSync(f),{'cache-control':'public, max-age=86400'}):send(s,404,'text/plain','not found')}
  if(u.pathname==='/logo.svg'||u.pathname==='/favicon.svg')return send(s,200,'image/svg+xml',SITE.LOGO,{'cache-control':'public, max-age=604800'});
  if(u.pathname==='/og.jpg'&&OG)return send(s,200,'image/jpeg',OG,{'cache-control':'public, max-age=604800'});
  if(u.pathname==='/favicon.ico')return send(s,301,'text/plain','',{location:'/favicon.svg'});
  if(u.pathname==='/llms.txt')return send(s,200,'text/plain; charset=utf-8',P.llms());
  if(u.pathname==='/robots.txt')return send(s,200,'text/plain',`User-agent: *\nAllow: /\nDisallow: /r/\nDisallow: /admin/\nDisallow: /api/\nDisallow: /checkout\nDisallow: /cancel\nSitemap: ${BASE}/sitemap.xml`);
  if(u.pathname==='/sitemap.xml')return send(s,200,'application/xml',P.sitemap());
  if(u.pathname==='/api/event'&&q.method==='POST'){const b=JSON.parse(await body(q)||'{}');if(['visit','scan_click','checkout_click','unlock_view'].includes(b.kind))L.rpc('event',{kind:b.kind,source:String(b.source||'').slice(0,80),session:String(b.session||'').slice(0,40),url:String(b.path||'').slice(0,200)}).catch(e=>L.logErr('event',e));return json(s,{})}
  if(u.pathname==='/api/scan'&&q.method==='POST'){if(limited(ip))return json(s,{error:'Too many scans from your network. Try again in an hour.'},429);
    const b=JSON.parse(await body(q)||'{}');let url;try{url=validUrl(String(b.url||''))}catch{return json(s,{error:'Enter a valid public website address.'},400)}
    if(!(await require('./netguard').safeUrl(url)))return json(s,{error:'Enter a valid public website address.'},400);
    try{const {id,r}=await runScan(url,'free',1);const v=r.pages[0].violations||[];const tk=id?(await L.rpc2('scan_token',{id}))?.view:null;
      return json(s,{scan_id:id,view:tk,url:r.url,total:r.totalIssues,critical:r.criticalOrSerious,score:SITE.score(v),counts:SITE.countsBy(v),warning:r.pages[0].warning,top:v.slice(0,3).map(x=>({id:x.id,help:x.help,impact:x.impact,count:x.count})),hidden:Math.max(0,v.length-3)})}
    catch(e){return json(s,{error:'We could not load that page. Check the address and that the site is online. ('+String(e.message).slice(0,120)+')'},422)}}
  if(u.pathname==='/api/unlock'&&q.method==='POST'){const b=JSON.parse(await body(q)||'{}');const email=String(b.email||'').trim().toLowerCase();
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)||email.length>200)return json(s,{error:'Enter a valid email.'},400);
    await L.rpc('capture_email',{email,url:b.url,source:b.source||'free_scan'});
    const link=`${BASE}/r/${encodeURIComponent(b.scan_id)}?v=${encodeURIComponent(b.view)}`;
    L.sendMail(email,'Your accessibility scan report',`<p>Your report: <a href="${link}">${link}</a></p><p>${L.DISCLAIMER}</p>`).catch(()=>{});
    return json(s,{report:link})}
  let m;if((m=u.pathname.match(/^\/r\/([0-9a-f-]{36})$/))){const sc=await L.rpc2('get_scan',{id:m[1],view:u.searchParams.get('v')});if(!sc||!sc.report)return send(s,404,'text/html',page('Not found','<p>Report not found.</p>'));
    return send(s,200,'text/html; charset=utf-8',P.reportView(sc.report,u.pathname),{'x-robots-tag':'noindex'})}
  if(u.pathname==='/checkout'){let plan=u.searchParams.get('plan')||'';if(plan.startsWith('f_')&&!(await foundingLeft()))return send(s,302,'text/plain','',{location:'/pricing#founding-full'});const l=(await links())[plan];L.rpc('event',{kind:'checkout_click',source:plan,session:u.searchParams.get('s')}).catch(()=>{});
    if(!l)return send(s,200,'text/html',page('Coming soon',`<h1>Checkout opens soon</h1><p>Paid monitoring isn't open yet. Run a <a href=/>free scan</a> and leave your email on the results page to save your report.</p>`));
    return send(s,302,'text/plain','',{location:l})}
  if(u.pathname==='/thanks'){const sid=u.searchParams.get('session_id')||'';let tok=null;
    if(/^cs_[A-Za-z0-9_]+$/.test(sid)&&process.env.STRIPE_SECRET_KEY){try{const o=await S.api('checkout/sessions/'+sid,null,'GET');if(o.metadata?.project==='a11yscan'&&['paid','no_payment_required'].includes(o.payment_status)&&o.subscription)tok=(await subscribeFrom(o)).tok}catch(e){L.logErr('thanks',e)}}
    return send(s,200,'text/html; charset=utf-8',page('Thanks',tok?`<h1>You're in.</h1><p>Your agency dashboard is ready. Bookmark this link and keep it private, because it signs you in:</p><p><a class="btn" href="/d/${tok}">Open your dashboard</a></p><p class="hint">Add your client sites, then upload your logo under Branding. Each site gets its first scan shortly after you add it.</p>`:`<h1>Thanks for subscribing</h1><p>We're setting up your dashboard. If the link doesn't appear, visit <a href=/support>support</a> with the email you used at checkout.</p>`))}
  if(u.pathname==='/stripe/webhook'&&q.method==='POST'){const raw=await body(q);let ev;try{ev=S.verify(raw,q.headers['stripe-signature'],process.env.STRIPE_WEBHOOK_SECRET||'')}catch(e){return send(s,400,'text/plain','bad sig')}
    const o=ev.data.object;
    if(ev.type==='checkout.session.completed'&&o.mode==='subscription'&&o.metadata?.project==='a11yscan'){const {tok,email}=await subscribeFrom(o);if(tok&&email)L.sendMail(email,'Your Welcome Check Web dashboard',`<p>Thanks for subscribing. Open your dashboard to add client sites: <a href="${BASE}/d/${tok}">${BASE}/d/${tok}</a></p><p>Keep this link private; it signs you in.</p><p>${L.DISCLAIMER}</p>`).catch(()=>{})}
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
  if((m=u.pathname.match(/^\/d\/([0-9a-f]{20,64})$/)))return send(s,302,'text/plain','',{location:'/dashboard','set-cookie':`wcw=${m[1]}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`});
  if(u.pathname==='/demo')return send(s,200,'text/html; charset=utf-8',SITE.layout({title:'Agency dashboard demo | '+SITE.BRAND,desc:'Live demo of the agency dashboard with weekly changes, plus new, fixed and reappeared issues across client sites.',path:'/demo',body:A.dashboard(A.DEMO,{demo:true,base:'/demo'})}));
  if((m=u.pathname.match(/^\/demo\/site\/([a-z0-9-]+)$/))){const st=A.DEMO.sites.find(x=>x.id===m[1]);if(st)return send(s,200,'text/html; charset=utf-8',dpage('Demo site',A.sitePage(st,{demo:true,base:'/demo'})))}
  if(u.pathname==='/sample-report'||(m=u.pathname.match(/^\/demo\/report\/([a-z0-9-]+)$/))){const id=m?.[1]||'demo-home-4';const st=A.DEMO.sites.find(x=>x.scans.some(c=>c.id===id));if(st){const chron=[...st.scans].reverse();const i=chron.findIndex(c=>c.id===id);const html=A.report({scan:chron[i],brand:{agency_name:'Your Agency'},history:chron.slice(0,i+1),demo:true,pdf:u.searchParams.has('pdf')});
     if(u.searchParams.has('pdf')){try{await slot();const buf=await A.pdf(html);return send(s,200,'application/pdf',buf,{'content-disposition':'inline; filename="sample-report.pdf"'})}finally{free()}}return send(s,200,'text/html; charset=utf-8',html)}}
  if((m=u.pathname.match(/^\/sample\/([0-9a-f-]{36})$/))){const sc=await L.rpc2('get_scan',{id:m[1],view:u.searchParams.get('v')});if(!sc||!sc.report||sc.kind!=='sample')return send(s,404,'text/html; charset=utf-8',page('Not found','<h1>Report not found</h1>'));
    const vs=A.allViol(sc.report);const html=A.report({scan:sc,brand:{agency_name:String(sc.report.sample_for||'Your Agency').slice(0,80)},history:[{fps:vs.map(v=>v.fp),finished_at:sc.finished_at,total:sc.total}],sample:true,pdf:u.searchParams.has('pdf')});
    if(u.searchParams.has('pdf')){try{await slot();const buf=await A.pdf(html);return send(s,200,'application/pdf',buf,{'content-disposition':'inline; filename="sample-report.pdf"'})}finally{free()}}return send(s,200,'text/html; charset=utf-8',html,{'x-robots-tag':'noindex'})}
  if(u.pathname.startsWith('/dashboard')){const tok=cookies(q).wcw;const d=tok?await r4('dash',{token:tok}):null;if(!d)return send(s,401,'text/html; charset=utf-8',page('Sign in',`<h1>Agency dashboard</h1><p>Open the private dashboard link from your checkout confirmation or welcome email. Lost it? Contact <a href="/support">support</a> with your checkout email.</p><p>Want to look around first? Try the <a href="/demo">live demo</a>.</p>`));
    const back=(msg)=>send(s,303,'text/plain','',{location:'/dashboard'+(msg?'?m='+encodeURIComponent(msg):'')});
    if(u.pathname==='/dashboard'&&q.method==='GET'){const msg=u.searchParams.get('m');return send(s,200,'text/html; charset=utf-8',dpage('Client sites',(msg?`<div class="wrap" style="padding-top:24px"><p class="warn" role="status">${esc(msg)}</p></div>`:'')+A.dashboard(d)))}
    if(u.pathname==='/dashboard/site'&&q.method==='POST'){const f=await form(q);let url;try{url=validUrl(String(f.url||''))}catch{return back('Enter a valid public website address.')}if(!(await require('./netguard').safeUrl(url)))return back('Enter a valid public website address.');
      const r=await r4('add_site',{token:tok,url,max_pages:10});if(r?.error)return back(r.error);runScan(url,'monitor',10,r.id).catch(e=>L.logErr('first_scan',e));return back('Site added. Its first scan has started and usually takes a few minutes.')}
    if((m=u.pathname.match(/^\/dashboard\/site\/([0-9a-f-]{36})(\/scan|\/remove)?$/))){const st=d.sites.find(x=>x.id===m[1]);if(!st)return back('Site not found.');
      if(m[2]==='/scan'&&q.method==='POST'){const info=await r4('site',{token:tok,site_id:st.id});if(info?.recent_scan&&Date.now()-new Date(info.recent_scan)<864e5)return back('That site was scanned in the last 24 hours. Try again later.');runScan(st.url,'monitor',10,st.id).catch(e=>L.logErr('manual_scan',e));return back('Scan started for '+A.host(st.url)+'.')}
      if(m[2]==='/remove'&&q.method==='POST'){await r4('remove_site',{token:tok,site_id:st.id});return back('Site removed.')}
      return send(s,200,'text/html; charset=utf-8',dpage(A.host(st.url),A.sitePage(st)))}
    if((m=u.pathname.match(/^\/dashboard\/report\/([0-9a-f-]{36})$/))){const r=await r4('scan',{token:tok,scan_id:m[1]});if(!r||!r.scan?.report)return back('Report not available yet.');const logo=r.brand.has_logo?await r4('logo',{token:tok}):null;
      const html=A.report({scan:r.scan,brand:r.brand,history:r.history,logoData:logo,pdf:u.searchParams.has('pdf')});if(u.searchParams.has('pdf')){try{await slot();const buf=await A.pdf(html);return send(s,200,'application/pdf',buf,{'content-disposition':`attachment; filename="accessibility-report-${A.host(r.scan.url).replace(/[^a-z0-9.-]/gi,'_')}.pdf"`})}finally{free()}}return send(s,200,'text/html; charset=utf-8',html)}
    if(u.pathname==='/dashboard/settings'){if(q.method==='POST'){const raw=await body(q);let f={};try{f=JSON.parse(raw)}catch{f=Object.fromEntries(new URLSearchParams(raw))}const args={token:tok,agency_name:String(f.agency_name||'').slice(0,80)};
        if(typeof f.logo==='string'){if(f.logo===''||(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(f.logo)&&f.logo.length<220000))args.logo=f.logo;else return json(s,{error:'Logo must be a PNG or JPEG under 150 KB.'},400)}
        await r4('set_brand',args);return json(s,{ok:true})}
      return send(s,200,'text/html; charset=utf-8',dpage('Branding',`<div class="wrap narrow" style="padding:40px 24px"><nav class="crumbs" aria-label="Breadcrumb"><a href="/dashboard">Client sites</a> / <span aria-current="page">Branding</span></nav><h1 style="font-size:36px">Report branding</h1><p class="sub">Client reports show your agency name and logo, with no Welcome Check Web branding.</p>
<form id="brand" class="unlock"><label for="an"><b>Agency name</b></label><input id="an" name="agency_name" value="${esc(d.agency_name||'')}" required maxlength="80" style="width:100%;margin:6px 0 16px;font:inherit;padding:12px 16px;border-radius:12px;border:1px solid #8a8a92">
<label for="lg"><b>Logo</b> (PNG or JPEG, under 150 KB)${d.has_logo?' · a logo is uploaded':''}</label><input id="lg" type="file" accept="image/png,image/jpeg" style="display:block;margin:6px 0 16px"><button>Save branding</button><p id="bs" role="status" class="hint"></p></form></div>
<script>document.getElementById('brand').addEventListener('submit',async e=>{e.preventDefault();const st=document.getElementById('bs');const f=document.getElementById('lg').files[0];const p={agency_name:document.getElementById('an').value};if(f){if(f.size>150000){st.textContent='Logo must be under 150 KB.';return}p.logo=await new Promise(r=>{const fr=new FileReader();fr.onload=()=>r(fr.result);fr.readAsDataURL(f)})}const r=await fetch('/dashboard/settings',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(p)});const j=await r.json();st.textContent=r.ok?'Saved. New reports will use this branding.':j.error})</script>`))}
    return back()}
  const H=x=>x?send(s,200,'text/html; charset=utf-8',x):null;let pg=null;const pn=u.pathname.replace(/\/$/,'')||'/';
  if(pn==='/')pg=SITE.home(await foundingLeft());else if(pn==='/pricing')pg=SITE.pricing(await foundingLeft());else if(pn==='/agencies')pg=SITE.agencies();else if(pn==='/faq')pg=SITE.faq();
  else if(pn==='/guides')pg=P.guidesIndex();else if(pn==='/rules')pg=P.rulesIndex();else if(pn==='/compare')pg=P.compareIndex();else if(pn==='/alternatives')pg=P.alternatives();
  else if((m=pn.match(/^\/guides\/([a-z0-9-]+)$/)))pg=P.guide(m[1]);else if((m=pn.match(/^\/rules\/([a-z0-9-]+)$/)))pg=P.rule(m[1]);else if((m=pn.match(/^\/compare\/([a-z0-9-]+)$/)))pg=P.compare(m[1]);
  else if(['/terms','/privacy','/support'].includes(pn)){const f=fs.readFileSync(__dirname+'/public/'+pn.slice(1)+'.html','utf8');const [t,d,...rest]=f.split('\n');pg=SITE.simple(pn,t.split(' | ')[0],d,rest.join('\n'))}
  if(pg)return H(pg);
  send(s,404,'text/html; charset=utf-8',page('Page not found','<h1>Page not found</h1><p>Try the <a href="/">free scan</a>, the <a href="/guides">guides</a> or the <a href="/rules">rule library</a>.</p>'))
 }catch(e){L.logErr('http '+u.pathname,e);if(!s.headersSent)send(s,500,'text/plain','Something went wrong.')}});
srv.listen(process.env.PORT||8080,()=>console.log('up'));
if(process.env.STRIPE_SECRET_KEY)S.ensure(BASE).then(l=>console.log('stripe links',l)).catch(e=>L.logErr('stripe_ensure',e));
