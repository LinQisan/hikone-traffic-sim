import {useEffect, useRef, useState} from 'react';
import type {SimulatorStore} from '../../state/SimulatorStore.ts';
import {useSimulatorSlice} from '../../hooks/useSimulatorSlice.ts';
import {LoadingScene} from './LoadingScene.tsx';
const tips = ['渡る前に 右・左・右 / Look right, left, right', '止まっている車の陰に注意 / Mind the blind spot behind parked cars', '曲がる車は うしろからも来る / Turning cars can come from behind', '自転車は 左側を走る / Bicycles keep to the left', '出入口の前では スピードを落とす / Slow down at driveways', '速い車は すぐに来る / Fast cars arrive sooner than they seem'];
export function LoadingScreen({store}: {store: SimulatorStore}) {
  const loading = useSimulatorSlice(store, 'loading'), [tip, setTip] = useState(0), [hidden, setHidden] = useState(false), reload = useRef<HTMLButtonElement>(null);
  useEffect(() => {if (loading.done || loading.error) return; const timer = setInterval(() => setTip(value => (value + 1) % tips.length), 3200); return () => clearInterval(timer);}, [loading.done, loading.error]);
  useEffect(() => {if (!loading.done) {setHidden(false); return;} const timer = setTimeout(() => setHidden(true), matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 450); return () => clearTimeout(timer);}, [loading.done]);
  useEffect(() => {if (loading.error) reload.current?.focus();}, [loading.error]);
  return <section id="loading" className={'overlay loading' + (loading.done ? ' leaving' : '') + (loading.error ? ' failed' : '')} aria-labelledby="loadtitle" hidden={hidden}><div className="loader">
    <LoadingScene/><h1 id="loadtitle">彦根交通安全シミュレーター</h1>
    <div className="bar-track" role="progressbar" aria-labelledby="loadstep" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(loading.progress * 100)} id="progress"><div className="bar-fill" id="progressfill" style={{transform: `scaleX(${loading.progress})`}}/></div>
    <p id="loadstep" className="step" role="status">{loading.text}</p><p className="tip" aria-live="off"><span className="tip-label">ひとこと</span> <span id="tip">{tips[tip]}</span></p>
    <div id="loaderror" className="loaderror" role="alert" hidden={!loading.error}><p id="loaderrortext">{loading.error}</p><button ref={reload} id="reload" className="primary" type="button" onClick={() => location.reload()}>もう一度読み込む / Reload</button></div>
  </div></section>;
}
