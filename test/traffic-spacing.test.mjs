import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Traffic} from '../src/simulation/traffic/Traffic.ts';
import {normalize} from '../src/simulation/core/scenario.ts';

// Independent rectangle projection observes the bodies users see, rather than controller targets.
function overlap(a,b){
  const dx=b.x-a.x,dz=b.z-a.z;
  for(const car of[a,b])for(const angle of[car.yaw,car.yaw+90]){
    const x=Math.sin(angle*Math.PI/180),z=Math.cos(angle*Math.PI/180);
    const radius=c=>{const r=c.yaw*Math.PI/180;return Math.abs(x*Math.sin(r)+z*Math.cos(r))*c.size[2]/2
      +Math.abs(x*Math.cos(r)-z*Math.sin(r))*c.size[0]/2;};
    if(Math.abs(dx*x+dz*z)>=radius(a)+radius(b)-.001)return false;
  }
  return true;
}
function builtin(id){return normalize(JSON.parse(fs.readFileSync(new URL(`../events/${id}.json`,import.meta.url))));}
for(const[id,seed,seconds]of[['builtin-02',1,65],['builtin-05',3,120]])test(`${id}: turning traffic and curved queues keep complete bodies apart`,()=>{
  const s=builtin(id),traffic=new Traffic(s,{seed,builtInMix:true});
  for(let i=0;i<seconds*60;i++){
    traffic.step(1/60,s.spawn);
    for(let a=0;a<traffic.cars.length;a++)for(let b=a+1;b<traffic.cars.length;b++)
      assert.ok(!overlap(traffic.cars[a],traffic.cars[b]),`bodies ${traffic.cars[a].id}/${traffic.cars[b].id} overlap at ${traffic.time}`);
  }
});
test('ordinary right-turning and oncoming drivers both clear their shared crossing',()=>{
  const s=builtin('builtin-02');s.hazardPolicy={safeProbability:0,unsafeProbability:0};
  const traffic=new Traffic(s,{seed:1,builtInMix:true});let turnX=-Infinity,oncomingZ=Infinity;
  for(let i=0;i<75*60;i++){
    traffic.step(1/60,s.spawn);
    for(const car of traffic.cars){if(car.id===1)turnX=Math.max(turnX,car.x);if(car.id===3)oncomingZ=Math.min(oncomingZ,car.z);}
  }
  assert.ok(turnX>70,'the turning car completes the turn instead of deadlocking');
  assert.ok(oncomingZ<10,'oncoming traffic passes the junction');
});
test('an unavoidable vehicle contact stops at the body, including a large caller time step',()=>{
  const s=normalize({id:'body-contact',spawn:{x:0,z:80},goal:{x:100,z:80},vehicles:[]});
  const traffic=new Traffic(s);
  const moving=traffic.admit({route:[{x:0,z:100},{x:100,z:100}],speedKmh:36,entrySpeedKmh:36,noStop:true});
  const stopped=traffic.admit({route:[{x:20,z:90},{x:20,z:110}],speedKmh:36,entrySpeedKmh:0},{distance:10});
  traffic.freeze();traffic.step(3);
  assert.ok(moving.x>16&&moving.x<17,'contact is resolved at the car outline, not by passing through');
  assert.equal(moving.currentSpeed,0);
  assert.ok(!overlap(moving,stopped));
  assert.ok(stopped.z===100&&stopped.x===20,'the parked body is not pushed or teleported');
});
