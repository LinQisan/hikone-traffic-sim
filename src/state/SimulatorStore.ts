import type {PlayerMode, ScenarioEntry} from '../types/scenario.ts';
export type Screen = 'loading' | 'title' | 'playing' | 'impact' | 'replay' | 'results';
export type FocusTarget = 'start' | 'file' | 'explore' | 'next' | 'rtitle' | {scenario: string};
export interface SimulatorSnapshot {
  screen: Screen;
  loading: {text: string; progress: number; done: boolean; error: string | null};
  menu: {entries: ScenarioEntry[]; selectedId: string | null; selectedName: string; customName: string | null; status: string; error: boolean; busy: boolean};
  profile: {height: string; weight: string; mode: PlayerMode};
  hud: {name: string; help: string; signal: string; visible: boolean; retry: boolean};
  replay: {visible: boolean; title: string; time: string; next: string; hint: string; view: 'overview' | 'driver'};
  results: {visible: boolean; title: string; tone: string; lines: string[]; verdict: string; incidents: {index: number; text: string; replayable: boolean}[]; retry: string; titleAction: string; canExport: boolean};
  presentation: {touch: boolean; touchActive: boolean; flash: boolean; inspection: boolean; fps: string};
  toast: {text: string; tone: string; visible: boolean};
  focus: {sequence: number; target: FocusTarget | null; preventScroll: boolean};
  announcement: {sequence: number; text: string};
}
export interface SimulatorCommands {
  start(again?: boolean): Promise<void>; explore(): void; select(id: string): void; importFile(file: File): Promise<void>;
  next(): void; retry(): void; title(): void; menu(): void; replayAgain(): void; setReplayView(view: 'overview' | 'driver'): void;
  exportRecord(): void; replayIncident(index: number): void;
}
function initialSnapshot(): SimulatorSnapshot {return {
    screen: 'loading', loading: {text: 'ページを準備しています… / Getting ready…', progress: 0, done: false, error: null},
    menu: {entries: [], selectedId: null, selectedName: '', customName: null, status: '', error: false, busy: false},
    profile: {height: '170', weight: '60', mode: 'walking'},
    hud: {name: '', help: '', signal: '', visible: false, retry: true},
    replay: {visible: false, title: '事故のリプレイ / Accident replay', time: '', next: 'スキップ / Skip', hint: '', view: 'overview'},
    results: {visible: false, title: '', tone: '', lines: [], verdict: '', incidents: [], retry: 'もう一度体験 / Try again (R)', titleAction: 'タイトルへ / Title (Enter)', canExport: false},
    presentation: {touch: false, touchActive: false, flash: false, inspection: false, fps: ''},
    toast: {text: '', tone: '', visible: false}, focus: {sequence: 0, target: null, preventScroll: false}, announcement: {sequence: 0, text: ''},
  };}

/** UI-only snapshots. Frame-rate simulation objects never enter this store. */
export class SimulatorStore {
  private snapshot = initialSnapshot();
  private listeners = new Set<() => void>();
  private notify = () => { for (const listener of this.listeners) listener(); };
  constructor(privateCommit?: (notify: () => void) => void) { this.commit = privateCommit ?? (notify => notify()); }
  private readonly commit: (notify: () => void) => void;
  reset() {this.snapshot = {...initialSnapshot(), profile: this.snapshot.profile}; this.notify();}
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  patch<K extends Exclude<keyof SimulatorSnapshot, 'screen'>>(key: K, patch: Partial<SimulatorSnapshot[K]>) {
    const current = this.snapshot[key];
    if (Object.entries(patch).every(([field, value]) => Object.is(current[field as keyof typeof current], value))) return;
    this.snapshot = {...this.snapshot, [key]: {...current, ...patch}};
    this.notify();
  }
  screen(screen: Screen) { if (this.snapshot.screen !== screen) { this.snapshot = {...this.snapshot, screen}; this.notify(); } }
  focus(target: FocusTarget, preventScroll = false) { this.patch('focus', {target, preventScroll, sequence: this.snapshot.focus.sequence + 1}); }
  announce(text: string) { this.patch('announcement', {text, sequence: this.snapshot.announcement.sequence + 1}); }
  /** Explicit UI commit only when the native replay camera needs the updated overlay bounds. */
  flush() { this.commit(this.notify); }
}
