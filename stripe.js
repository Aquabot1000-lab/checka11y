// Only ADDS a separate product (metadata project=a11yscan). Never lists/modifies other products.
const crypto=require('crypto');const {PLANS}=require('./lib');
const K=()=>process.env.STRIPE_SECRET_KEY;
async function api(path,params,method='POST'){const body=params?new URLSearchParams(params).toString():undefined;
  const r=await fetch('https://api.stripe.com/v1/'+path,{method,headers:{Authorization:'Bearer '+K(),'content-type':'application/x-www-form-urlencoded'},body});
  const j=await r.json();if(!r.ok)throw new Error('stripe '+path+': '+(j.error&&j.error.message));return j}
let LINKS={};
async function ensure(base){ if(!K()) return LINKS;
  for(const [id,p] of Object.entries(PLANS)){ if(process.env['LINK_'+id.toUpperCase()]){LINKS[id]=process.env['LINK_'+id.toUpperCase()];continue}
    const lk='a11yscan_'+id+'_monthly';
    let price=(await api('prices?lookup_keys[]='+lk+'&limit=1',null,'GET')).data[0];
    if(!price){const prod=await api('products',{name:'Welcome Check Web – accessibility monitoring ('+p.name+')','metadata[project]':'a11yscan','metadata[plan]':id});
      price=await api('prices',{product:prod.id,currency:'usd',unit_amount:p.cents,'recurring[interval]':'month',lookup_key:lk,'metadata[project]':'a11yscan'});}
    const pl=await api('payment_links',{'line_items[0][price]':price.id,'line_items[0][quantity]':1,'metadata[project]':'a11yscan','metadata[plan]':id,'subscription_data[metadata][project]':'a11yscan','subscription_data[metadata][plan]':id,'after_completion[type]':'redirect','after_completion[redirect][url]':base+'/thanks'});
    LINKS[id]=pl.url;}
  return LINKS}
function verify(raw,sig,secret){const parts=Object.fromEntries(String(sig).split(',').map(x=>x.split('=')));
  const exp=crypto.createHmac('sha256',secret).update(parts.t+'.'+raw).digest('hex');
  if(!parts.v1||!crypto.timingSafeEqual(Buffer.from(exp),Buffer.from(parts.v1)))throw new Error('bad signature');
  if(Math.abs(Date.now()/1000-parts.t)>300)throw new Error('stale');return JSON.parse(raw)}
const cancelSub=id=>api('subscriptions/'+id,null,'DELETE');
module.exports={ensure,verify,cancelSub,links:()=>LINKS,api};
