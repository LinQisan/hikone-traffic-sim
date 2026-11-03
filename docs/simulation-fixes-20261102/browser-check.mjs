const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
import fs from'node:fs/promises';
const out=new URL('.',import.meta.url).pathname,browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1280,height:900},reducedMotion:'reduce'}),errors=[];
page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
try{
 await page.goto('http://127.0.0.1:8770/?benchmark=1');await page.waitForFunction(()=>!!window.vrlearn?.env,null,{timeout:180000});
 const cases=[];
 for(let i=1;i<=10;i++){
  const id=`builtin-${String(i).padStart(2,'0')}`;
  await page.evaluate(async id=>{window.vrlearn.select(id);await window.vrlearn.start()},id);
  const result=await page.evaluate(async()=>{
   const v=window.vrlearn,{Traffic}=await import('/src/simulation/traffic/Traffic.ts'),run=v.run;
   run.traffic=new Traffic(run.scenario,{seed:3,builtInMix:true,canSee:(a,b)=>v.obstacles.clearSight(a,b)});v.obstacles.setTraffic(run.traffic.cars);
   v.player.place(-200,-100,0,170,run.scenario.playerMode);v.player.enabled=false;
   let deepest=0,frames=0,cars=0;
   const overlap=(a,b)=>{let depth=Infinity;const dx=b.x-a.x,dz=b.z-a.z;for(const c of[a,b])for(const angle of[c.yaw,c.yaw+90]){const x=Math.sin(angle*Math.PI/180),z=Math.cos(angle*Math.PI/180),radius=c=>{const r=c.yaw*Math.PI/180;return Math.abs(x*Math.sin(r)+z*Math.cos(r))*c.size[2]/2+Math.abs(x*Math.cos(r)-z*Math.sin(r))*c.size[0]/2};const d=radius(a)+radius(b)-Math.abs(dx*x+dz*z);if(d<=0)return 0;depth=Math.min(depth,d)}return depth};
   for(let i=0;i<120*30;i++){
    v.simulate(1/30,1/30);frames++;cars=Math.max(cars,run.traffic.cars.length);
    for(let a=0;a<run.traffic.cars.length;a++)for(let b=a+1;b<run.traffic.cars.length;b++)deepest=Math.max(deepest,overlap(run.traffic.cars[a],run.traffic.cars[b]));
    if(v.state!=='playing')throw Error(`Idle participant unexpectedly left practice: ${v.state}`);
   }
   if(deepest>.001)throw Error(`Interpenetration ${deepest}`);
   v.toTitle();await v.start();v.simulate(3);const crashRun=v.run;v.knock();if(v.state!=='impact')throw Error('No contact car');
   v.simulate(.5);if(v.state!=='impact')throw Error('Initial fall not shown');
   v.simulate(.17);if(v.state!=='replay')throw Error('Contact replay was delayed');
   const tail=crashRun.frames.at(-1).t-crashRun.impact.time;
   if(Math.abs(tail-1.6)>.025)throw Error(`Missing post-contact recording: ${tail}`);
   const collision={liveDelay:.65,recordedTail:tail,frames:crashRun.frames.length};
   v.simulate(40);if(!v.replay.atEnd)throw Error('Replay cannot finish');
   return {frames,cars,maxBodyOverlap:deepest,collision};
  });
  await page.locator('#next').click();await page.locator('#results').waitFor({state:'visible'});await page.locator('#totitle').click();
  const success=await page.evaluate(async id=>{const v=window.vrlearn;v.select(id);await v.start();v.simulate(2);const {x,z}=v.run.scenario.goal;v.player.place(x,z,0,170,v.run.scenario.playerMode);v.player.enabled=true;v.simulate(1/60);const r=v.run,t=r.time;if(!r.successReview||v.state!=='playing'||v.player.enabled)throw Error('Arrival not held');v.simulate(.2);if(v.state!=='playing')throw Error('Goal confirmation skipped');v.simulate(.06);if(v.state!=='replay')throw Error('Success replay delayed');if(r.frames.at(-1).t!==t)throw Error('Goal wait changed the recording');return {liveDelay:.25,terminalRecordedAt:t,frames:r.frames.length};},id);
  await page.locator('#viewparticipant').click();await page.locator('#viewover').click();await page.evaluate(()=>window.vrlearn.simulate(40));await page.locator('#next').click();await page.locator('#totitle').click();
  cases.push({id,...result,success});console.log(id,'passed');
 }
 // Menu during the goal confirmation must cancel its pending replay.
 await page.evaluate(async()=>{const v=window.vrlearn;v.select('builtin-01');await v.start();const g=v.run.scenario.goal;v.player.place(g.x,g.z,0,170,'walking');v.player.enabled=true;v.simulate(1/60);v.toTitle();v.simulate(1);if(v.state!=='title'||v.run)throw Error('Cancelled arrival started a replay');});
 await fs.writeFile(out+'/browser.json',JSON.stringify({cases,menuCancelsPendingReplay:true,errors},null,2)+'\n');if(errors.length)throw Error(JSON.stringify(errors));
}finally{await browser.close()}
