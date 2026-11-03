// Run against npm run dev, after model and collision generation completes.
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
import fs from 'node:fs/promises';
const out=new URL('.',import.meta.url).pathname;
const poses={bridge:[-127.6,187.91,294,-24,17.8],streetJoin:[-384.92,217.32,311,-38,17.8],fork:[-520.99,270.92,155,-48,17.8],tennis:[-457.75,222.78,34,-31,8.3],university:[-593.19,180.06,320,-22,2.5]};
const feet={campusInside:[-610,1.71,188,-596,1.71,178,70],campusApproach:[-591,1.71,184,-611,1.71,190,70],forkEast:[-514,1.71,245,-538,2.5,258,70],forkNorth:[-524.9,1.71,272,-535,1.71,250,70],tennisWest:[-460,1.71,235.9,-500,1.71,242.4,70],laneNorth:[-398.5,1.71,253,-401,1.71,230,70],bridgeEntry:[-175,1.8,199,-154,1.86,236,70],bridgeReturn:[-154,1.86,237,-177,1.71,195,70]};
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
const errors=[],failures=[];
page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});page.on('response',r=>{if(!r.ok())failures.push([r.status(),r.url()])});
try{
 for(const [view,pose] of Object.entries(poses)){
  await page.goto(`${process.env.SIMULATOR_URL??'http://127.0.0.1:8770/'}?benchmark=1&quality=high&street=${pose.join(',')}`);
  await page.waitForFunction(()=>!!window.vrlearn?.env,null,{timeout:180000});
  await page.waitForTimeout(1200);await page.screenshot({path:`${out}/view-${view}-high.jpg`,type:'jpeg',quality:94});
  await page.evaluate(()=>window.vrlearn.env.setDetail(.05));await page.waitForTimeout(500);await page.screenshot({path:`${out}/view-${view}-low.jpg`,type:'jpeg',quality:94});
 }
 await page.evaluate(()=>window.vrlearn.env.setDetail(1));
 for(const [view,camera] of Object.entries(feet)){
  await page.evaluate(c=>window.vrlearn.debugView(...c),camera);await page.waitForTimeout(500);await page.screenshot({path:`${out}/foot-${view}.jpg`,type:'jpeg',quality:94});
 }
 await fs.writeFile(out+'/views.json',JSON.stringify({poses,feet,viewport:[1440,1000],errors,failures},null,2)+'\n');
 console.log(JSON.stringify({poseCount:Object.keys(poses).length,footCount:Object.keys(feet).length,errors,failures}));
}finally{await browser.close()}
if(errors.length||failures.length)throw Error(JSON.stringify({errors,failures}));
