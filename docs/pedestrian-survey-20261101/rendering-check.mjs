import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {createReadStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
// Set BEFORE_DIST and, if needed, AFTER_DIST and PLAYWRIGHT_MODULE.
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const out=new URL('.',import.meta.url).pathname;
if(!process.env.BEFORE_DIST)throw Error('BEFORE_DIST must name the frozen baseline production build');
let stage='before';
const roots={before:process.env.BEFORE_DIST,after:process.env.AFTER_DIST ?? new URL('../../dist',import.meta.url).pathname};
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.gz':'application/gzip','.png':'image/png','.hkb':'application/octet-stream'};
const server=http.createServer(async(req,res)=>{try{
 const file=path.join(roots[stage],new URL(req.url,'http://localhost').pathname.replace(/^\//,'')||'index.html');
 await fs.access(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]??'application/octet-stream','Cache-Control':'no-store'});
 await pipeline(createReadStream(file),res);
}catch{if(!res.headersSent)res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1280,height:800},reducedMotion:'reduce'});
const errors=[],failures=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});page.on('response',r=>{if(!r.ok())failures.push([r.status(),r.url()])});
const url=`http://127.0.0.1:${server.address().port}/index.html?street=-503.15,203.18,18,-42,41.6&benchmark=1&quality=high`;
const results=[];
const views={"moatStreet":[-232,1.7,199.375,-262,1.7,204.1,68],"fork":[-544,1.7,251,-520,1.7,256,70],"bridgeApproach":[23,1.7,367,-8,1.7,372,72]};

for(let run=0;run<5;run++)for(stage of ['before','after']){
 await page.goto(url,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>!!window.vrlearn?.env,null,{timeout:180000});
 for(const [view,camera] of Object.entries(views)){
  await page.evaluate(c=>window.vrlearn.debugView(...c),camera);
  await page.evaluate(()=>window.vrlearn.benchmark.reset());
  await page.waitForFunction(()=>!!window.vrlearn.benchmark.report,null,{timeout:60000});
  const probe=await page.evaluate(()=>window.vrlearn.benchmark.report);
  if(run===0)await page.screenshot({path:`${out}/ab-${view}-${stage}.jpg`,type:'jpeg',quality:90});
  results.push({stage,run,view,probe});console.log(JSON.stringify({stage,run,view,calls:probe.calls,triangles:probe.triangles,p95Ms:probe.p95Ms}));
 }
}
await fs.writeFile(out+'/rendering.json',JSON.stringify({claim:'Check rendering work at the photographed street, fork and bridge. No speedup claim; this is a visual reconstruction.',method:'Five alternating A/B samples. Frozen starting production build and final production build on the same page and URL, with identical fixed cameras, 1280x800, quality=high, reduced motion. PerformanceProbe uses 2 seconds warmup and 8 seconds sampling.',results,errors,failures},null,2));
await browser.close();server.close();
if(errors.length||failures.length)throw Error(JSON.stringify({errors,failures}));
