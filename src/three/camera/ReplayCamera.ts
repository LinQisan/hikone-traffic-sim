import * as THREE from 'three';

export interface ReplaySubject {
  role: 'participant' | 'vehicle';
  bounds: THREE.Box3;
  targets: readonly THREE.Vector3[];
}
export interface ReplayBlocker {id: number; bounds: THREE.Box3; reference: boolean}
export interface ReplayCameraSample {
  t: number;
  subjects: readonly ReplaySubject[];
  blockers?: readonly ReplayBlocker[];
}
interface Ground {heightAt(x: number, z: number): number}
interface Obstacles {
  cameraClear(position: THREE.Vector3): boolean;
  clear(from: THREE.Vector3, to: THREE.Vector3): boolean;
  liftOut?(position: THREE.Vector3): void;
}
interface Presentation {aspect: number; bottomInset: number; reducedMotion: boolean}
type Purpose = 'establish' | 'approach' | 'interaction' | 'outcome' | 'visibility';
export interface ReplayShot {
  from: number;
  until: number;
  purpose: Purpose;
  position: THREE.Vector3;
  focus: THREE.Vector3;
  angle: number;
  pitch: number;
  visibility: 'clear' | 'obstructed';
}
interface Recording {
  samples: readonly ReplayCameraSample[];
  referenceTime: number;
  preferredAngle: number;
  obstacles: Obstacles | null;
}
const STEP = 1/30, CHECK_STEP = .05, MARGIN = .76, MIN_HOLD = 1.5;
const UP = new THREE.Vector3(0, 1, 0);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const angleDelta = (a: number, b: number) => Math.atan2(Math.sin(a-b), Math.cos(a-b));

/** Fixed analytical compositions, edited on the recording timeline instead of refitted each frame. */
export class ReplayCamera {
  readonly focus = new THREE.Vector3();
  readonly camera: THREE.PerspectiveCamera;
  private readonly ground: Ground;
  private recording: Recording | null = null;
  private presentation: Presentation;
  private planned: ReplayShot[] = [];
  private readonly ray = new THREE.Ray();
  private readonly offset = new THREE.Vector3();
  private readonly hit = new THREE.Vector3();
  private readonly blockerSweeps = new WeakMap<ReplayBlocker, THREE.Box3>();

  constructor(camera: THREE.PerspectiveCamera, ground: Ground) {
    this.camera = camera;
    this.ground = ground;
    this.presentation = {aspect: camera.aspect, bottomInset: 0, reducedMotion: false};
  }
  get shots(): readonly ReplayShot[] {return this.planned;}
  get samples(): readonly ReplayCameraSample[] {return this.recording?.samples ?? [];}

  configure(update: Partial<Presentation>) {
    const p = {...this.presentation, ...update};
    p.aspect = Number.isFinite(p.aspect) && p.aspect > 0 ? p.aspect : this.presentation.aspect;
    p.bottomInset = clamp(Math.ceil(p.bottomInset * 50) / 50, 0, .65);
    if (p.aspect === this.presentation.aspect && p.bottomInset === this.presentation.bottomInset
      && p.reducedMotion === this.presentation.reducedMotion) return;
    this.presentation = p;
    this.camera.aspect = p.aspect;
    this.camera.setViewOffset(p.aspect, 1, 0, p.bottomInset / 2, p.aspect, 1);
    this.plan();
  }

  start(recording: Recording) {
    this.recording = {...recording, samples: [...recording.samples]};
    for (let i=0;i<recording.samples.length;i++) for (const blocker of recording.samples[i].blockers ?? []) {
      const swept=blocker.bounds.clone();
      for (const neighbor of [recording.samples[i-1],recording.samples[i+1]]) {
        const adjacent=neighbor?.blockers?.find(b=>b.id===blocker.id);
        if (adjacent) swept.union(adjacent.bounds);
      }
      this.blockerSweeps.set(blocker,swept.expandByScalar(.1));
    }
    this.plan();
    const first = this.recording.samples[0];
    if (first) this.frame(first.t);
  }

  stop() {this.recording = null; this.planned = [];}

  /** The reference vehicle cannot occlude its own targets or a body physically inside it. */
  clear(position: THREE.Vector3, sample: ReplayCameraSample) {
    const obstacles = this.recording?.obstacles;
    if (position.y < this.ground.heightAt(-position.x, position.z) + 1
      || obstacles && !obstacles.cameraClear(position)) return false;
    for (const subject of sample.subjects) {
      let visible = 0;
      for (const target of subject.targets) {
        if (obstacles && !obstacles.clear(position, target)) continue;
        const distance = this.offset.subVectors(target, position).length();
        this.ray.set(position, this.offset.divideScalar(distance || 1));
        let blocked = false;
        for (const blocker of sample.blockers ?? []) {
          if (blocker.reference && (subject.role === 'vehicle' || blocker.bounds.containsPoint(target))) continue;
          const hit = this.ray.intersectBox(this.blockerSweeps.get(blocker) ?? blocker.bounds, this.hit);
          if (hit && position.distanceTo(hit) < distance - .4) {blocked = true; break;}
        }
        if (!blocked) visible++;
      }
      if (visible < Math.min(2, subject.targets.length)) return false;
    }
    return true;
  }

  private bounds(samples: readonly ReplayCameraSample[]) {
    const bounds = new THREE.Box3();
    for (const sample of samples) for (const subject of sample.subjects) bounds.union(subject.bounds);
    return bounds;
  }

  private pose(bounds: THREE.Box3, angle: number, pitch: number) {
    const focus = bounds.getCenter(new THREE.Vector3());
    const direction = new THREE.Vector3(Math.sin(angle)*Math.cos(pitch), Math.sin(pitch), Math.cos(angle)*Math.cos(pitch));
    const right = new THREE.Vector3().crossVectors(UP, direction).normalize();
    const up = new THREE.Vector3().crossVectors(direction, right);
    const tangent = Math.tan(this.camera.fov*Math.PI/360);
    const vertical = tangent*MARGIN*(1-this.presentation.bottomInset);
    const horizontal = tangent*MARGIN*this.presentation.aspect;
    let distance = 10;
    for (let i=0;i<8;i++) {
      this.offset.set(i&1?bounds.max.x:bounds.min.x, i&2?bounds.max.y:bounds.min.y,
        i&4?bounds.max.z:bounds.min.z).sub(focus);
      const depth = this.offset.dot(direction);
      distance = Math.max(distance, depth+Math.abs(this.offset.dot(right))/horizontal,
        depth+Math.abs(this.offset.dot(up))/vertical);
    }
    return {position: focus.clone().addScaledVector(direction, distance), focus};
  }

  private choose(samples: readonly ReplayCameraSample[], from: number, until: number,
    purpose: Purpose, previous: ReplayShot | undefined): ReplayShot | null {
    if (!this.recording || !samples.length) return null;
    const bounds = this.bounds(samples), candidates = [];
    if (purpose === 'establish') {
      for (const sample of this.recording.samples) for (const subject of sample.subjects)
        if (subject.role === 'participant') bounds.union(subject.bounds);
    }
    const preferred = this.recording.preferredAngle;
    const editorial = purpose === 'establish' ? 15 : purpose === 'outcome' ? -15 : 0;
    for (const degrees of [36, 44, 52, 62, 75, 84]) for (const turn of [0,30,-30,60,-60,90,-90,120,-120,150,-150,180]) {
      const angle = preferred+(turn+editorial)*Math.PI/180, pitch=degrees*Math.PI/180;
      const pose=this.pose(bounds,angle,pitch);
      const side = previous ? Math.abs(angleDelta(angle,previous.angle)) : Math.abs(turn)*Math.PI/180;
      const distance=pose.position.distanceTo(pose.focus);
      candidates.push({...pose,angle,pitch,cost:Math.abs(turn)/60+(degrees-36)/12+side*1.5+distance*.015});
    }
    candidates.sort((a,b)=>a.cost-b.cost);
    for (const candidate of candidates) {
      if (!samples.every(sample=>this.clear(candidate.position,sample))) continue;
      return {from,until,purpose,...candidate,visibility:'clear'};
    }
    return null;
  }

  private interval(from: number, until: number, purpose: Purpose, depth=0) {
    if (!this.recording) return;
    const samples=this.intervalSamples(from,until);
    if (!samples.length) return;
    const shot=this.choose(samples,from,until,purpose,this.planned.at(-1));
    if (shot) {this.planned.push(shot); return;}
    // Only actual occlusion can split a planned story beat. No camera translation crosses a cut.
    if (until-from>=.8&&depth<6) {
      const middle=(from+until)/2;
      const hold=until-from>=MIN_HOLD*2?MIN_HOLD:.4;
      const eligible=samples.filter(s=>s.t-from>=hold&&until-s.t>=hold);
      const protectedTime=this.recording.referenceTime;
      const outside=eligible.filter(s=>s.t<protectedTime-.8||s.t>protectedTime+.8);
      const choices=outside.length?outside:eligible;
      const split=choices.reduce((best,s)=>Math.abs(s.t-middle)<Math.abs(best-middle)?s.t:best,choices[0]?.t??middle);
      this.interval(from,split,'visibility',depth+1);
      this.interval(split,until,'visibility',depth+1);
      return;
    }
    // A fully enclosed recording still needs a finite view and working replay/menu controls.
    const angle=this.planned.at(-1)?.angle??this.recording.preferredAngle,pitch=75*Math.PI/180;
    const pose=this.pose(this.bounds(samples),angle,pitch);
    this.recording.obstacles?.liftOut?.(pose.position);
    pose.position.y=Math.max(pose.position.y,this.ground.heightAt(-pose.position.x,pose.position.z)+1);
    this.planned.push({from,until,purpose,...pose,angle,pitch,visibility:'obstructed'});
  }

  private intervalSamples(from: number, until: number) {
    if (!this.recording) return [];
    const all=this.recording.samples;
    const first=Math.max(0,all.findIndex(s=>s.t>=from)-1);
    const end=all.findIndex(s=>s.t>=until);
    return all.slice(first,end<0?all.length:end+1);
  }

  private plan() {
    this.planned=[];
    const samples=this.recording?.samples,first=samples?.[0],last=samples?.at(-1);
    if (!this.recording||!first||!last) return;
    const reference=clamp(this.recording.referenceTime,first.t,last.t);
    if (this.presentation.reducedMotion||last.t-first.t<MIN_HOLD*2) {
      const whole=this.choose(samples,first.t,last.t,'interaction',undefined);
      if (whole) {this.planned=[whole];return;}
      this.interval(first.t,last.t,'visibility');return;
    }
    // The central shot includes approach, contact and landing without an edit across the action.
    const interaction=Math.max(first.t,reference-1.5);
    if (interaction-first.t>=MIN_HOLD*2+1) {
      const established=Math.min(first.t+2.5,interaction-MIN_HOLD);
      this.interval(first.t,established,'establish');
      this.interval(established,interaction,'approach');
    } else if (interaction-first.t>=MIN_HOLD) this.interval(first.t,interaction,'establish');
    const start=this.planned.length?interaction:first.t;
    const outcome=reference+1;
    if (last.t-outcome>=MIN_HOLD) {
      this.interval(start,outcome,'interaction');
      this.interval(outcome,last.t,'outcome');
    } else this.interval(start,last.t,'interaction');
    this.mergeSimilar();
  }

  private mergeSimilar() {
    if (!this.recording) return;
    for (let i=1;i<this.planned.length;) {
      const a=this.planned[i-1],b=this.planned[i];
      const first=a.position.distanceTo(a.focus),second=b.position.distanceTo(b.focus);
      if (Math.abs(angleDelta(a.angle,b.angle))<=Math.PI/6&&Math.max(first,second)<Math.min(first,second)*1.2) {
        const samples=this.intervalSamples(a.from,b.until);
        const merged=this.choose(samples,a.from,b.until,a.purpose,this.planned[i-2]);
        if (merged&&merged.position.distanceTo(merged.focus)<Math.max(first,second)*1.15) {
          this.planned.splice(i-1,2,merged);continue;
        }
      }
      i++;
    }
  }

  frame(t: number) {
    if (!this.planned.length) return;
    let shot=this.planned[0];
    for (let i=1;i<this.planned.length&&t>=this.planned[i].from;i++) shot=this.planned[i];
    this.camera.position.copy(shot.position);
    this.focus.copy(shot.focus);
    this.camera.lookAt(this.focus);
    this.camera.updateMatrixWorld();
  }
}

export function replaySampleTimes(start: number, end: number, impact: number) {
  const contact=clamp(impact,start,end),times=new Set([start,end,contact]);
  for (let t=start;t<end;t+=STEP) times.add(Math.min(end,Math.round(t*1e6)/1e6));
  for (let t=Math.max(start,impact-1);t<Math.min(end,impact+.8);t+=CHECK_STEP) times.add(Math.round(t*1e6)/1e6);
  const unique: number[]=[];
  for (const t of [...times].sort((a,b)=>a-b)) {
    if (unique.length&&t-unique[unique.length-1]<1e-4) {
      if (t===start||t===end||t===contact) unique[unique.length-1]=t;
    } else unique.push(t);
  }
  return unique;
}
