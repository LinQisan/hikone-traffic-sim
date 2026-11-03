const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
import fs from'node:fs/promises';
const stage=process.argv[2]??'after',out=new URL('.',import.meta.url).pathname,b=await chromium.launch({channel:'chrome',headless:true}),p=await b.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),errors=[],failures=[];p.on('pageerror',e=>errors.push(String(e)));p.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
p.on('response',r=>{if(!r.ok())failures.push([r.status(),r.url()])});
try{await p.goto('http://127.0.0.1:8770/?street=-588.64,175.82,295,-22,6&quality=high&benchmark=1');await p.waitForFunction(()=>!!window.vrlearn?.env,null,{timeout:180000});await p.waitForTimeout(600);await p.screenshot({path:out+'/owner-'+stage+'.jpg',type:'jpeg',quality:94});
const views={front:[-587.5,1.71,178,-600,1.71,178,65],postbox:[-594.1,1.45,170.65,-596.827,.72,171.113,42],postboxSide:[-595.7,1.4,168.5,-596.827,.95,171.113,48],postboxUnderHood:[-595.9,.9,171.2,-596.827,1.25,171.113,42],north:[-591,1.71,190,-600,1.71,181.5,68],inside:[-605,1.71,178,-590,1.71,178,70],overhead:[-585,22,168,-599,.5,178,64]};
for(const[name,camera]of Object.entries(views)){await p.evaluate(c=>window.vrlearn.debugView(...c),camera);await p.waitForTimeout(200);await p.screenshot({path:out+'/'+name+'-'+stage+'.jpg',type:'jpeg',quality:94});}
await p.evaluate(()=>window.vrlearn.env.setDetail(.05));
for(const[name,camera]of Object.entries(views)){await p.evaluate(c=>window.vrlearn.debugView(...c),camera);await p.waitForTimeout(200);await p.screenshot({path:out+'/'+name+'-'+stage+'-low.jpg',type:'jpeg',quality:94});}
await fs.writeFile(out+'/views-'+stage+'.json',JSON.stringify({views,errors,failures},null,2)+'\n');console.log({stage,errors,failures});if(errors.length||failures.length)throw Error(JSON.stringify({errors,failures}));}finally{await b.close()}
