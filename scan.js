const puppeteer=require('puppeteer-core');const fs=require('fs');
const {safeUrl}=require('./netguard');const {AxePuppeteer}=require('@axe-core/puppeteer');
async function scan(url,maxPages=5){
  const b=await puppeteer.launch({executablePath:process.env.CHROME||'/usr/bin/google-chrome',args:['--no-sandbox','--headless=new','--disable-dev-shm-usage','--disable-gpu','--no-zygote']});
  const seen=new Set(),queue=[url],pages=[];const host=new URL(url).host;
  try{while(queue.length&&pages.length<maxPages){const u=queue.shift();if(seen.has(u))continue;seen.add(u);
    const p=await b.newPage();await p.setBypassCSP(true);await p.setViewport({width:1280,height:1024});await p.setRequestInterception(true);p.on('request',async rq=>{try{(await safeUrl(rq.url()))?rq.continue():rq.abort('blockedbyclient')}catch{}});try{if(!(await safeUrl(u)))throw new Error('Blocked: address is not a public website');await p.goto(u,{waitUntil:'networkidle2',timeout:30000});
      const TAGS=['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa'];let r;try{r=await new AxePuppeteer(p).withTags(TAGS).analyze()}catch(e){await p.addScriptTag({path:require.resolve('axe-core/axe.min.js')});r=await p.evaluate(t=>axe.run(document,{runOnly:t}),TAGS);r.framesSkipped=true}
      const nEl=await p.evaluate(()=>document.getElementsByTagName('*').length);const title=await p.title();const warn=(nEl<15||(await p.$('meta[http-equiv=refresh i]')&&nEl<80)||/just a moment|attention required|access denied|captcha/i.test(title))?'This page looked nearly empty or like a bot check, so the site may have blocked automated browsers. Results may not reflect what visitors see.':null;const links=await p.$$eval('a[href]',a=>a.map(x=>x.href));
      links.forEach(l=>{try{const x=new URL(l);x.hash='';if(x.host===host&&!seen.has(x.href)&&!/\.(pdf|jpg|png|zip)$/i.test(x.pathname))queue.push(x.href)}catch{}});
      pages.push({url:u,warning:warn,elements:nEl,violations:r.violations.map(v=>({id:v.id,impact:v.impact,help:v.help,helpUrl:v.helpUrl,count:v.nodes.length,examples:v.nodes.slice(0,3).map(n=>n.target.join(' '))}))});
    }catch(e){pages.push({url:u,error:String(e.message)})}finally{await p.close()}}}finally{await b.close()}
  const tot=pages.reduce((s,p)=>s+(p.violations||[]).reduce((a,v)=>a+v.count,0),0);
  const crit=pages.reduce((s,p)=>s+(p.violations||[]).filter(v=>['critical','serious'].includes(v.impact)).reduce((a,v)=>a+v.count,0),0);
  const failed=pages.filter(p=>p.error).length;if(pages.length&&failed===pages.length)throw new Error('Could not load the site: '+pages[0].error);
  return {url,failedPages:failed,scannedAt:new Date().toISOString(),pagesScanned:pages.length,totalIssues:tot,criticalOrSerious:crit,pages};
}
const {DISCLAIMER}=require('./lib');
function report(r,o={}){const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&','<':'<','>':'>','"':'"'}[c]));
 const body=`<h1>Automated accessibility scan</h1><p><b>${esc(r.url)}</b><br>Scanned ${esc(r.scannedAt)} · ${r.pagesScanned} page(s)${r.failedPages?` · ${r.failedPages} failed to load`:''}<br>Issues found: <b>${r.totalIssues}</b> (critical or serious: <b>${r.criticalOrSerious}</b>)</p>
<p class=disc>${DISCLAIMER}</p><p>Issues are sorted by impact. Fix critical and serious items first.</p>
${r.pages.map(p=>`<h2>${esc(p.url)}</h2>`+(p.warning?`<p class=serious>⚠ ${esc(p.warning)}</p>`:'')+(p.error?`<p>Could not scan this page: ${esc(p.error)}</p>`:(p.violations.length?'<ul>'+p.violations.map(v=>`<li class=${v.impact}><b>${esc(v.help)}</b> <span class=tag>${v.impact}</span> ×${v.count}<br><small>e.g. <code>${esc(v.examples.join(' | '))}</code></small> <a href="${esc(v.helpUrl)}" rel=nofollow>How to fix</a></li>`).join('')+'</ul>':'<p>No automatically detectable issues on this page.</p>'))).join('')}`;
 return o.inner?body:`<!doctype html><meta charset=utf-8><title>Accessibility scan: ${esc(r.url)}</title><style>body{font-family:system-ui;max-width:900px;margin:auto;padding:16px}.critical,.serious{color:#b00020}</style>${body}`}
module.exports={scan,report};
if(require.main===module){(async()=>{const r=await scan(process.argv[2],+process.argv[3]||5);fs.writeFileSync('out.json',JSON.stringify(r,null,1));fs.writeFileSync('out.html',report(r));console.log(r.totalIssues,r.criticalOrSerious,r.pagesScanned)})()}
