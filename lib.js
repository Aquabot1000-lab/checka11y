const SB=process.env.SUPABASE_URL, KEY=process.env.SUPABASE_ANON_KEY, TOK=process.env.WORKER_TOKEN;
async function rpc(op,args={},fn='rpc'){ if(!SB) return null;
  const r=await fetch(`${SB}/rest/v1/rpc/${fn}`,{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+KEY,'content-type':'application/json'},body:JSON.stringify({tok:TOK,op,args})});
  if(!r.ok) throw new Error('db '+op+' '+r.status+' '+(await r.text()).slice(0,200)); return r.json(); }
const rpc2=(op,a)=>rpc(op,a,'rpc2');
async function logErr(where,e,meta){console.error(where,e);try{await rpc('error',{where,message:String(e&&e.message||e),meta})}catch{}}
const DISCLAIMER='Automated accessibility scan. Results are informational and may not identify every accessibility issue. This service is not legal advice, a compliance certification, or a substitute for comprehensive manual accessibility testing.';
const PLANS={solo:{name:'Solo',sites:1,pages:25,cents:2900},studio:{name:'Studio',sites:5,pages:25,cents:7900},agency:{name:'Agency',sites:25,pages:50,cents:24900,whitelabel:true},agencyplus:{name:'Agency 100',sites:100,pages:50,cents:69900,whitelabel:true}};
// Email: provider-agnostic. Set RESEND_API_KEY + MAIL_FROM to enable; otherwise logged as pending (owner gate).
async function sendMail(to,subject,html){
  if(!process.env.RESEND_API_KEY){await rpc('event',{kind:'email_pending',meta:{to,subject}}).catch(()=>{});return false}
  const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'content-type':'application/json'},body:JSON.stringify({from:process.env.MAIL_FROM,to,subject,html})});
  if(!r.ok) await logErr('sendMail',await r.text()); return r.ok }
module.exports={rpc,rpc2,logErr,DISCLAIMER,PLANS,sendMail};
