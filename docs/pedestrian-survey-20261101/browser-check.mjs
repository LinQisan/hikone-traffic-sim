// Start npm run dev; set PLAYWRIGHT_MODULE to an installed Playwright entry if needed.
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
import fs from 'node:fs/promises';
const out=new URL('.',import.meta.url).pathname;
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1280,height:900},reducedMotion:'reduce'});
const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
await page.goto(process.env.SIMULATOR_URL ?? 'http://127.0.0.1:8770/');await page.waitForFunction(()=>!!window.vrlearn?.env,null,{timeout:180000});
const traversals=await page.evaluate(async()=>{
 const v=window.vrlearn;
 const {UNIVERSITY_DATA:u}=await import('/src/world/generators/university-layout.js');
 const {INNER_MOAT_ROAD:r}=await import('/src/world/generators/castle-approach.js');
 const paths={moatStreet:r.slice(0,9),tennisLane:u.link.slice(5).toReversed(),campus:u.link.slice(2,6),forkBranch:u.schoolLanes[0].slice(0,2)};
 const result=[],delta=(a,b)=>(b-a+540)%360-180;
 for(const mode of ['walking','bicycle']){
  v.setMode(mode);await v.startExplore();
  for(const [name,points] of Object.entries(paths))for(const direction of ['forward','reverse']){
   const line=direction==='forward'?points:points.toReversed(),p=v.player;
   const heading=Math.atan2(line[1][0]-line[0][0],line[1][1]-line[0][1])*180/Math.PI;
   p.place(...line[0],heading,170,mode);p.enabled=true;p.keys.clear();p.keys.add('KeyW');let frames=0;
   for(const target of line.slice(1)){
    let count=0;
    while(Math.hypot(p.x-target[0],p.z-target[1])>.65&&count++<15000){
     const yaw=Math.atan2(target[0]-p.x,target[1]-p.z)*180/Math.PI;
     if(mode==='walking')p.yaw=yaw;
     else {p.stick[0]=Math.max(-1,Math.min(1,delta(p.rideYaw,yaw)/14));p.yaw=p.rideYaw;}
     p.update(1/60);frames++;
    }
    if(count>=15000)throw Error(`${mode} ${name} ${direction} stopped ${p.x},${p.z}, target ${target}`);
   }
   p.keys.clear();p.stick=[0,0];result.push({mode,name,direction,frames,end:[p.x,p.z],height:v.ground.heightAt(p.x,p.z)});
  }
  v.toTitle();
 }
 return result;
});
await fs.writeFile(out+'/traversals.json',JSON.stringify({traversals,errors},null,2)+'\n');
const events=[];
for(const id of ['builtin-01','builtin-07']){
 await page.evaluate(async id=>{const v=window.vrlearn;v.debugView(null);v.select(id);await v.start()},id);
 await page.waitForFunction(()=>window.vrlearn.state==='playing');
 await page.waitForTimeout(150);
 const before=await page.evaluate(()=>({yaw:window.vrlearn.player.yaw,x:window.vrlearn.player.x,z:window.vrlearn.player.z}));
 await page.keyboard.down('q');
 await page.evaluate(()=>{const v=window.vrlearn;if(!v.player.keys.has('KeyQ'))throw Error('Q not received');v.simulate(.25)});
 await page.keyboard.up('q');
 const yaw=await page.evaluate(()=>window.vrlearn.player.yaw);if(Math.abs(yaw-before.yaw)<1)throw Error('Q look failed');
 await page.keyboard.down('w');await page.evaluate(()=>window.vrlearn.simulate(.45));await page.keyboard.up('w');
 const moved=await page.evaluate(()=>({x:window.vrlearn.player.x,z:window.vrlearn.player.z}));
 if(Math.hypot(moved.x-before.x,moved.z-before.z)<.1)throw Error('movement failed');
 await page.evaluate(()=>{const v=window.vrlearn;v.simulate(2);v.knock();v.simulate(6)});
 await page.waitForFunction(()=>window.vrlearn.state==='replay',null,{timeout:10000});
 await page.locator('#viewparticipant').click();await page.locator('#viewover').click();
 await page.evaluate(()=>window.vrlearn.simulate(45));if(!await page.evaluate(()=>window.vrlearn.replay.atEnd))throw Error('replay failed to end');
 await page.locator('#next').click();await page.locator('#results').waitFor({state:'visible'});await page.locator('#totitle').click();
 events.push({id,keyboardLook:true,moved,participantReplay:true,replayEnded:true,resultsAndMenu:true});
}
await fs.writeFile(out+'/browser.json',JSON.stringify({traversals,events,errors},null,2)+'\n');
console.log(JSON.stringify({traversals,events,errors},null,2));await browser.close();if(errors.length)throw Error(JSON.stringify(errors));
