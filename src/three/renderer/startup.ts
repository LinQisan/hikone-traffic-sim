import type {StartupDiagnostics, ModelTiming} from '../../types/assets.ts';
// Opt-in startup diagnostics. Worker timings are included because window resource entries do not
// cover worker fetches or construction. All timestamps are relative to the page time origin.
export const startup: StartupDiagnostics = {
  enabled: typeof location !== 'undefined' && new URLSearchParams(location.search).has('benchmark'),
  stages: {}, models: [],
};
export function startupMark(name: string) {
  if (startup.enabled && startup.stages[name] == null) startup.stages[name] = performance.now();
}
export function startupModel(record: ModelTiming) { if (startup.enabled) startup.models.push(record); }

export function resetStartup() {startup.stages = {}; startup.models = []; delete startup.workerCount;}
