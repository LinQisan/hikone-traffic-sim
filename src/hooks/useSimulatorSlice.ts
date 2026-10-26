import {useSyncExternalStore} from 'react';
import type {SimulatorSnapshot, SimulatorStore} from '../state/SimulatorStore.ts';
export function useSimulatorSlice<K extends keyof SimulatorSnapshot>(store: SimulatorStore, key: K): SimulatorSnapshot[K] {
  return useSyncExternalStore(store.subscribe, () => store.getSnapshot()[key]);
}

/** Primitive selectors keep diagnostics from rerendering hidden menus or result panels. */
export function useSimulatorValue<T>(store: SimulatorStore, select: (snapshot: ReturnType<SimulatorStore['getSnapshot']>) => T) {
  return useSyncExternalStore(store.subscribe, () => select(store.getSnapshot()), () => select(store.getSnapshot()));
}
