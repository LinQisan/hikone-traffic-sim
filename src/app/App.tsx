import {useEffect, useRef, useState} from 'react';
import {flushSync} from 'react-dom';
import {SimulatorStore} from '../state/SimulatorStore.ts';
import type {SimulatorCommands} from '../state/SimulatorStore.ts';
import {Menu} from '../components/menu/Menu.tsx';
import {LoadingScreen} from '../components/panels/LoadingScreen.tsx';
import {Hud, Presentation, ReplayControls, Results} from '../components/hud/GameOverlays.tsx';
import {errorMessage} from '../utils/errors.ts';
/** React owns the interface; the separately loaded native engine owns exactly one canvas/loop. */
export function App() {
  const [store] = useState(() => new SimulatorStore(notify => flushSync(notify)));
  const view = useRef<HTMLDivElement>(null), touch = useRef<HTMLDivElement>(null), replay = useRef<HTMLElement>(null), fps = useRef<HTMLDivElement>(null);
  const [commands, setCommands] = useState<SimulatorCommands | null>(null);
  useEffect(() => {
    store.reset(); setCommands(null);
    let cancelled = false, engine: {dispose(): void} | undefined;
    const fail = (error: unknown) => {if (!cancelled) store.patch('loading', {done: false, error: errorMessage(error)});};
    const onError = (event: ErrorEvent) => {if (!store.getSnapshot().loading.done) fail(event.error ?? event.message);};
    const onRejection = (event: PromiseRejectionEvent) => {if (!store.getSnapshot().loading.done) fail(event.reason);};
    window.addEventListener('error', onError); window.addEventListener('unhandledrejection', onRejection);
    // Dynamic import gives the loading illustration a frame and naturally cancels StrictMode's
    // first effect before it can create a renderer. A later real unmount releases a live engine.
    void import('../three/engine/TrafficEngine.ts').then(async ({createTrafficEngine}) => {
      if (cancelled || !view.current || !touch.current || !replay.current || !fps.current) return;
      const session = createTrafficEngine({view: view.current, touchRoot: touch.current, replayRoot: replay.current, fps: fps.current, ui: store});
      engine = session;
      const api = await session.ready;
      if (!cancelled) setCommands(api.commands);
    }).catch(fail);
    return () => {cancelled = true; engine?.dispose(); window.removeEventListener('error', onError); window.removeEventListener('unhandledrejection', onRejection);};
  }, [store]);
  return <main><div id="view" ref={view} role="img" aria-label="彦根・京橋の街の 3D 表示 / 3D view of Hikone Kyobashi"/><LoadingScreen store={store}/><Menu store={store} commands={commands}/><Hud store={store} commands={commands}/><ReplayControls store={store} commands={commands} elementRef={replay}/><Results store={store} commands={commands}/><Presentation store={store} touchRef={touch} fpsRef={fps}/></main>;
}
