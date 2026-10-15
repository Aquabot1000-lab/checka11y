// Weekly re-scan + change detection + alerts. Triggered by GitHub Actions cron -> POST /internal/weekly.
const L=require('./lib');
async function run({runScan,BASE}){const sites=await L.rpc('due_sites',{},'rpc3')||[];let ok=0,fail=0;
 for(const st of sites){try{const {iss,r}=await runScan(st.url,'monitor',st.max_pages||25,st.id);ok++;
   const prev=new Set(st.prev||[]);const now=new Set(iss.map(i=>i.fp));const added=iss.filter(i=>!prev.has(i.fp));const fixed=[...prev].filter(f=>!now.has(f)).length;
   const subj=added.length?`${added.length} new accessibility issue type(s) on ${new URL(st.url).host}`:`Weekly accessibility scan: ${r.totalIssues} issues on ${new URL(st.url).host}`;
   await L.sendMail(st.email,subj,`<p>${r.pagesScanned} pages scanned. ${r.totalIssues} issues (${r.criticalOrSerious} critical or serious). ${added.length} new, ${fixed} resolved since last week.</p>${added.slice(0,10).map(a=>`<li>${a.rule} [${a.impact}] on ${a.page}</li>`).join('')}<p>Full history: reply to this email. <a href="${BASE}/cancel?token=${st.cancel_token}">Cancel monitoring</a></p><p>${L.DISCLAIMER}</p>`);
 }catch(e){fail++;await L.logErr('weekly_site',e,{site:st.id})}}
 await L.rpc('event',{kind:'weekly_run',meta:{ok,fail,total:sites.length}});return {ok,fail}}
module.exports={run};
