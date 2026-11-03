// Start npm run dev. PLAYWRIGHT_MODULE may point to an installed Playwright entry.
import fs from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
const out=new URL('.',import.meta.url).pathname;
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:960},reducedMotion:'no-preference'});
const errors=[];
page.on('pageerror',e=>errors.push(String(e)));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const url=process.env.SIMULATOR_URL??'http://127.0.0.1:8770/';
try {
  await page.goto(new URL('?view=replay&quality=high',url).href);
  await page.waitForFunction(()=>window.vrlearn?.state==='replay',null,{timeout:180000});
  const fixtures=[];
  for(const mode of ['walking','bicycle','safe','no-car']) {
    await page.setViewportSize({width:1440,height:960});
    await page.emulateMedia({reducedMotion:'no-preference'});
    const setup=await page.evaluate(mode=>{
      const r=window.vrlearn.replay,success=mode==='safe'||mode==='no-car',impact=success?null:8,end=success?12:9.6;
      const frames=Array.from({length:Math.round(end*30)+1},(_,i)=>{
        const t=i/30,travel=Math.min(t,8);
        return {t,head:mode==='bicycle'?{x:32,z:7.8+travel*2.4,yaw:0,rideYaw:0}
          :{x:32,z:(success?17.4:20.6)+(success?t:travel)*.8,yaw:0},
          cars:mode==='no-car'?[]:[{id:5,x:(success?-38.45:-6.45)+(success?t:travel)*4.5,z:27,yaw:90,body:'sedan',accident:!success}]};
      });
      window.cameraReviewFixture={frames,impact,carId:mode==='no-car'?null:5,mode:mode==='bicycle'?'bicycle':'walking'};
      r.start(frames,impact,mode==='no-car'?null:5,170,mode==='bicycle'?'bicycle':'walking');
      r.setView('overview');r.playing=false;
      return {start:r.start_,end:r.end,reference:impact??end};
    },mode);
    for(const presentation of ['landscape','portrait','reduced']) {
      await page.evaluate(()=>{window.vrlearn.replay.playing=true;});
      await page.setViewportSize(presentation==='portrait'?{width:390,height:844}:{width:1440,height:960});
      await page.emulateMedia({reducedMotion:presentation==='reduced'?'reduce':'no-preference'});
      await page.waitForTimeout(120);
      const measured=await page.evaluate(()=>{
        const r=window.vrlearn.replay,f=window.cameraReviewFixture;
        r.start(f.frames,f.impact,f.carId,170,f.mode);
        const shots=r.overview.shots;
        r.playing=false;
        let cameraDrift=0,focusDrift=0;
        for(const shot of shots)for(let t=shot.from;t<shot.until-1e-6;t+=1/60){
          r.frame(t);cameraDrift=Math.max(cameraDrift,r.camera.position.distanceTo(shot.position));
          focusDrift=Math.max(focusDrift,r.focus.distanceTo(shot.focus));
        }
        return {shots:shots.map(s=>({from:s.from,until:s.until,purpose:s.purpose,pitch:s.pitch*180/Math.PI,
          boom:s.position.distanceTo(s.focus),visibility:s.visibility})),cameraDrift,focusDrift,
          width:innerWidth,scrollWidth:document.documentElement.scrollWidth,fov:r.camera.fov};
      });
      if(measured.cameraDrift>1e-10||measured.focusDrift>1e-10)throw Error(`${mode}/${presentation}: camera drifts`);
      if(measured.shots.some(s=>s.visibility!=='clear'))throw Error(`${mode}/${presentation}: occluded shot`);
      if(measured.scrollWidth>measured.width)throw Error(`${mode}/${presentation}: overflow`);
      fixtures.push({mode,presentation,...measured});
      for(const [t,name] of [[1,'establish'],[setup.reference-.5,'interaction'],[setup.end-.1,'outcome']]) {
        await page.evaluate(t=>{const r=window.vrlearn.replay;r.time=t;r.frame(t);},t);
        await page.waitForTimeout(80);
        await page.screenshot({path:`${out}/${mode}-${presentation}-${name}.jpg`,type:'jpeg',quality:85});
      }
    }
  }
  await page.setViewportSize({width:1280,height:900});
  await page.emulateMedia({reducedMotion:'no-preference'});
  const events=[];
  for(let i=1;i<=10;i++) {
    const id=`builtin-${String(i).padStart(2,'0')}`;
    await page.evaluate(async id=>{const v=window.vrlearn;v.toTitle();v.select(id);await v.start();},id);
    await page.keyboard.down('q');await page.evaluate(()=>window.vrlearn.simulate(.25));await page.keyboard.up('q');
    await page.keyboard.down('w');await page.evaluate(()=>window.vrlearn.simulate(.45));await page.keyboard.up('w');
    const contact=await page.evaluate(()=>{
      const v=window.vrlearn;v.simulate(3);v.knock();v.simulate(1);
      if(v.state!=='replay')throw Error('Contact replay not reached');
      return {mode:v.run.scenario.playerMode,shots:v.replay.overview.shots.map(s=>({from:s.from,until:s.until,visibility:s.visibility}))};
    });
    await page.keyboard.press('v');await page.keyboard.press('v');await page.locator('#viewover').click();
    await page.keyboard.press('b');
    const restarted=await page.evaluate(()=>Math.abs(window.vrlearn.replay.time-window.vrlearn.replay.start_)<.1);
    if(!restarted)throw Error('Keyboard replay restart failed');
    await page.evaluate(()=>{const r=window.vrlearn.replay;r.playing=true;window.vrlearn.simulate(50);if(!r.atEnd)throw Error('Replay cannot finish');});
    await page.locator('#next').click();await page.locator('#results').waitFor({state:'visible'});await page.locator('#totitle').click();
    const safe=await page.evaluate(async id=>{
      const v=window.vrlearn;v.select(id);await v.start();v.simulate(2);
      const g=v.run.scenario.goal;v.player.place(g.x,g.z,0,170,v.run.scenario.playerMode);v.player.enabled=true;
      v.simulate(.3);if(v.state!=='replay')throw Error('Safe replay not reached');
      v.simulate(40);if(!v.replay.atEnd)throw Error('Safe replay cannot finish');
      return {shots:v.replay.overview.shots.length};
    },id);
    await page.locator('#next').click();await page.locator('#results').waitFor({state:'visible'});await page.locator('#totitle').click();
    events.push({id,contact,safe,keyboardViewsAndRestart:true,resultsAndMenu:true});
    console.log(id,'passed');
  }
  await page.setViewportSize({width:320,height:720});
  await page.emulateMedia({reducedMotion:'reduce',forcedColors:'active'});
  await page.evaluate(async()=>{const v=window.vrlearn;v.select('builtin-01');await v.start();v.simulate(3);v.knock();v.simulate(1);});
  await page.keyboard.press('Tab');
  const accessibility=await page.evaluate(()=>{
    const buttons=[...document.querySelectorAll('#replayui button')].filter(b=>b.getClientRects().length).map(b=>{
      const box=b.getBoundingClientRect();return {id:b.id,width:box.width,height:box.height};
    });
    return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,buttons,
      forcedColors:matchMedia('(forced-colors: active)').matches,reducedMotion:window.vrlearn.replay.reducedMotion,
      focus:document.activeElement?.id};
  });
  if(accessibility.scrollWidth>accessibility.width||accessibility.buttons.some(b=>b.width<44||b.height<44))throw Error('Narrow replay controls are inaccessible');
  if(!accessibility.focus||!accessibility.forcedColors||!accessibility.reducedMotion)throw Error('Accessibility preference/focus missing');
  await page.screenshot({path:out+'/narrow-forced-colors.jpg',type:'jpeg',quality:85});
  await page.locator('#replaymenu').click();
  await fs.writeFile(out+'/browser.json',JSON.stringify({fixtures,events,accessibility,errors},null,2)+'\n');
  if(errors.length)throw Error(JSON.stringify(errors));
  console.log(JSON.stringify({fixtures:fixtures.length,events:events.length,errors}));
} finally {await browser.close();}
