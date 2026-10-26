import type {SessionHeader, SessionSample, SessionIncident, IncidentRecord} from '../../types/session.ts';
import type {ReplayFrame} from '../../types/simulation.ts';
// Behaviour record of one exploration session, kept in this browser tab only. Nothing is sent
// anywhere; the participant may save it as a JSON file (export) from the session summary.
// Bounded: periodic samples and incident clips have fixed caps. Pure logic (node:test).
export const SESSION_FORMAT = 'hikone-session';
export const SAMPLE_SECONDS = 0.5;
export const MAX_SAMPLES = 14400;           // two hours at 2 Hz
export const MAX_EVENTS = 5000;
export const MAX_INCIDENTS = 5;              // replayable clips kept in memory

const round = (v: number) => Number.isFinite(v) ? Math.round(v * 100) / 100 : v;

export class SessionLog {
  declare header: SessionHeader & {format: string; version: number; startedAt: string};
  declare next: number; declare time: number; declare dropped: {samples: number; events: number};
  declare samples: (Record<string, number | boolean | string> & {t: number})[];
  declare events: ({t: number; type: string} & object)[];
  declare incidents: SessionIncident[];
  endedAt?: string;
  constructor(header: SessionHeader) {
    this.header = { format: SESSION_FORMAT, version: 1, startedAt: new Date().toISOString(), ...header };
    this.samples = []; this.events = []; this.incidents = [];
    this.next = 0; this.dropped = { samples: 0, events: 0 };
    this.time = 0;
  }

  add(type: string, data: object = {}) {
    if (this.events.length >= MAX_EVENTS) { this.dropped.events++; return; }
    this.events.push({ t: round(this.time), type, ...data });
  }

  /** s: { x, z, yaw, rideYaw?, speed, onRoad, wrongWay, walk, risk, probability } */
  sample(time: number, s: SessionSample) {
    this.time = time;
    if (time < this.next) return;
    this.next = time + SAMPLE_SECONDS;
    if (this.samples.length >= MAX_SAMPLES) { this.dropped.samples++; return; }
    this.samples.push({ t: round(time), x: round(s.x), z: round(s.z), yaw: round(s.yaw),
      ...(s.rideYaw != null ? { rideYaw: round(s.rideYaw) } : {}), speed: round(s.speed),
      onRoad: s.onRoad, wrongWay: s.wrongWay, walk: s.walk, risk: round(s.risk), p: round(s.probability) });
  }

  /** A contact and its replay frames (kept for re-watching; the oldest clip is released first). */
  incident(record: IncidentRecord, frames: ReplayFrame[]) {
    const incident: SessionIncident = { ...record, frames };
    this.incidents.push(incident);
    if (this.incidents.length > MAX_INCIDENTS) this.incidents[this.incidents.length - MAX_INCIDENTS - 1].frames = null;
    this.add('contact', record);
    return incident;
  }

  /** JSON for the file the participant chooses to save (replay frames of the kept clips included). */
  toJSON() {
    return { ...this.header, endedAt: this.endedAt ?? null, duration: round(this.time), dropped: this.dropped,
      events: this.events, samples: this.samples,
      incidents: this.incidents.map(i => ({ ...i, frames: i.frames ?? undefined })) };
  }
}
