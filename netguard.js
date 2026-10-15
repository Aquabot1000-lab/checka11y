const dns=require('dns').promises,net=require('net');
function priv(ip){if(net.isIPv6(ip)){const l=ip.toLowerCase();if(l.startsWith('::ffff:'))return priv(l.slice(7));return l==='::1'||l==='::'||/^f[cd]/.test(l)||/^fe[89ab]/.test(l)}
 const [a,b]=ip.split('.').map(Number);return a===10||a===127||a===0||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&b===168)||(a===100&&b>=64&&b<=127)||a>=224||(a===192&&b===0)||(!process.env.ALLOW_FAKEIP_DNS&&a===198&&(b===18||b===19))}
const cache=new Map();
async function safeHost(h){h=h.replace(/^\[|\]$/g,'');if(cache.has(h))return cache.get(h);let ok;
 try{const ips=net.isIP(h)?[h]:(await dns.lookup(h,{all:true})).map(x=>x.address);ok=ips.length>0&&!ips.some(priv)}catch{ok=false}
 cache.set(h,ok);setTimeout(()=>cache.delete(h),60000);return ok}
async function safeUrl(u){try{const x=new URL(u);if(!/^https?:$/.test(x.protocol))return /^(data|blob|about):$/.test(x.protocol);return await safeHost(x.hostname)}catch{return false}}
module.exports={safeUrl,safeHost,priv};
