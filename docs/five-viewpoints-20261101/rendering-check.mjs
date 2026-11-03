// Compare generated rendering work, not frame times. Start after builds and checks stop.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {createReadStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
if(!process.env.BEFORE_DIST||!process.env.AFTER_DIST)throw Error('BEFORE_DIST and AFTER_DIST must name frozen production builds');
const out=new URL('.',import.meta.url).pathname;
const roots={before:process.env.BEFORE_DIST,after:process.env.AFTER_DIST};
let stage='before';
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.gz':'application/gzip','.png':'image/png','.hkb':'application/octet-stream'};
const server=http.createServer(async(req,res)=>{try{
 const file=path.join(roots[stage],new URL(req.url,'http://localhost').pathname.replace(/^\//,'')||'index.html');
 await fs.access(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]??'application/octet-stream','Cache-Control':'no-store'});
 await pipeline(createReadStream(file),res);
}catch{if(!res.headersSent)res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
const errors=[],failures=[];
page.on('pageerror',e=>errors.push(String(e)));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
page.on('response',r=>{if(!r.ok())failures.push([r.status(),r.url()])});
const poses={bridge:[-127.6,187.91,294,-24,17.8],streetJoin:[-384.92,217.32,311,-38,17.8],fork:[-520.99,270.92,155,-48,17.8],tennis:[-457.75,222.78,34,-31,8.3],university:[-593.19,180.06,320,-22,2.5]};
const url=`http://127.0.0.1:${server.address().port}/index.html?street=${poses.bridge.join(',')}&benchmark=1&quality=high`;
const results=[];let cameras;
try{
 for(let run=0;run<5;run++)for(stage of ['before','after']){
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>!!window.vrlearn?.env,null,{timeout:180000});
  cameras??=await page.evaluate(poses=>Object.fromEntries(Object.entries(poses).map(([name,[x,z,h,p,eye]])=>{
   const y=window.vrlearn.ground.heightAt(x,z)+eye,rad=Math.PI/180;
   return [name,[x,y,z,x+30*Math.sin(h*rad)*Math.cos(p*rad),y+30*Math.sin(p*rad),z+30*Math.cos(h*rad)*Math.cos(p*rad),70]];
  })),poses);
  for(const [view,camera] of Object.entries(cameras)){
   await page.evaluate(c=>window.vrlearn.debugView(...c),camera);
   await page.waitForTimeout(2000);
   const frames=await page.evaluate(()=>new Promise(resolve=>{
    const frames=[];let previous=window.vrlearn.renderer.info.render.frame;
    const next=()=>requestAnimationFrame(()=>{
     const info=window.vrlearn.renderer.info.render;
     if(info.frame!==previous){previous=info.frame;frames.push({frame:info.frame,calls:info.calls,triangles:info.triangles});}
     if(frames.length===30)resolve(frames);else next();
    });next();
   }));
   if(frames.some(f=>f.calls<=0||f.triangles<=0))throw Error('No rendered work in sample');
   if(run===0)await page.screenshot({path:`${out}/ab-${view}-${stage}.jpg`,type:'jpeg',quality:94});
   results.push({run,stage,view,frames});
   console.log(JSON.stringify({run,stage,view,calls:frames[0].calls,triangles:frames[0].triangles}));
  }
 }
 const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
 const summary=Object.fromEntries(Object.keys(poses).map(view=>[view,Object.fromEntries(['before','after'].map(stage=>{
  const runs=results.filter(r=>r.view===view&&r.stage===stage);
  return [stage,Object.fromEntries(['calls','triangles'].map(k=>{
   const samples=runs.map(r=>median(r.frames.map(f=>f[k])));
   return [k,{median:median(samples),range:[Math.min(...samples),Math.max(...samples)],runs:samples}];
  }))];
 }))]));
 await fs.writeFile(out+'/rendering.json',JSON.stringify({claim:'Rendering workload at the five reported views; no frame-time or speedup conclusion.',method:'Five alternating before/after production reload pairs at the same origin and URL. Fixed cameras use the starting build Ground and the owner\u2019s five poses. 1440x1000, quality=high, reduced motion, benchmark=1, 2 seconds warmup then 30 distinct rendered frames per view. Frames within a run are observations, not independent trials. Summary uses the median within each of five reloads, then median and range across reloads.',poses,cameras,summary,results,errors,failures},null,2)+'\n');
}finally{await browser.close();server.close()}
if(errors.length||failures.length)throw Error(JSON.stringify({errors,failures}));
