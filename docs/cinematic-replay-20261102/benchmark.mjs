// Frozen production builds, same-origin reloads, actual rendered work; no FPS claim.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {createReadStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
if(!process.env.BEFORE_DIST||!process.env.AFTER_DIST)throw Error('Set BEFORE_DIST and AFTER_DIST to frozen production builds');
const out=new URL('.',import.meta.url).pathname,roots={before:process.env.BEFORE_DIST,after:process.env.AFTER_DIST};
let stage='before';
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.gz':'application/gzip','.png':'image/png'};
const server=http.createServer(async(req,res)=>{try{
  const file=path.join(roots[stage],new URL(req.url,'http://localhost').pathname.replace(/^\//,'')||'index.html');
  await fs.access(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]??'application/octet-stream','Cache-Control':'no-store'});
  await pipeline(createReadStream(file),res);
}catch{if(!res.headersSent)res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:960},reducedMotion:'no-preference',deviceScaleFactor:1});
await page.route('**/*',route=>route.continue());
const errors=[],failures=[],results=[];
page.on('pageerror',e=>errors.push({stage,error:String(e)}));
page.on('console',m=>{if(m.type()==='error')errors.push({stage,error:m.text()});});
page.on('response',r=>{if(!r.ok())failures.push({stage,status:r.status(),url:r.url()});});
const url=`http://127.0.0.1:${server.address().port}/?view=replay&benchmark=1&quality=high`;
try {
  for(let run=0;run<5;run++)for(stage of ['before','after']){
    await page.goto(url,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.vrlearn?.state==='replay',null,{timeout:180000});
    const motion=await page.evaluate(()=>{
      const r=window.vrlearn.replay;r.playing=false;
      const intervals=[];
      for(const [from,until] of [[0,2.5],[2.5,5.6]]){
        const booms=[],positions=[];
        for(let t=from;t<until-1e-5;t+=1/60){r.frame(t);booms.push(r.camera.position.distanceTo(r.focus));positions.push(r.camera.position.toArray());}
        intervals.push({from,until,boom:[Math.min(...booms),Math.max(...booms)],firstPosition:positions[0],lastPosition:positions.at(-1)});
      }
      return {intervals,fov:r.camera.fov,shots:r.overview.shots?.map(s=>({from:s.from,until:s.until,purpose:s.purpose,visibility:s.visibility}))};
    });
    const views=[];
    for(const [view,t] of [['establish',1],['interaction',3.8],['landing',4.5]]){
      await page.evaluate(t=>{const r=window.vrlearn.replay;r.time=t;r.frame(t);},t);
      await page.waitForTimeout(500);
      const frames=await page.evaluate(()=>new Promise(resolve=>{
        const frames=[];let previous=window.vrlearn.renderer.info.render.frame;
        const next=()=>requestAnimationFrame(()=>{
          const info=window.vrlearn.renderer.info.render;
          if(info.frame!==previous){previous=info.frame;frames.push({frame:info.frame,calls:info.calls,triangles:info.triangles});}
          if(frames.length===30)resolve(frames);else next();
        });next();
      }));
      if(frames.some(f=>f.calls<=0||f.triangles<=0))throw Error('No rendered work');
      views.push({view,t,frames});
      if(run===0)await page.screenshot({path:`${out}/ab-${view}-${stage}.jpg`,type:'jpeg',quality:90});
    }
    results.push({run,stage,motion,views});console.log(run,stage,'rendered');
  }
  const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
  const summary=Object.fromEntries(['establish','interaction','landing'].map(view=>[view,Object.fromEntries(['before','after'].map(stage=>[
    stage,Object.fromEntries(['calls','triangles'].map(metric=>{
      const runs=results.filter(r=>r.stage===stage).map(r=>median(r.views.find(v=>v.view===view).frames.map(f=>f[metric])));
      return [metric,{median:median(runs),range:[Math.min(...runs),Math.max(...runs)],runs}];
    }))
  ]))]));
  await fs.writeFile(out+'/benchmark.json',JSON.stringify({claim:'Camera movement and rendered workload; no frame-time or speedup conclusion.',
    method:'Five alternating before/after production reload pairs on the same page, origin and URL. 1440x960, DPR 1, quality=high, benchmark=1, normal motion. Fixed review recording. Each view warms for 500 ms and samples 30 distinct rendered frames. Within-run medians are observations; five reloads are the trials. Camera movement is sampled directly at 60 Hz. Different compositions intentionally render different geometry.',
    browser:browser.version(),summary,results,errors,failures},null,2)+'\n');
  if(errors.length||failures.length)throw Error(JSON.stringify({errors,failures}));
} finally {await browser.close();await new Promise(r=>server.close(r));}
