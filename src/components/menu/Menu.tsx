import type {SimulatorCommands, SimulatorStore} from '../../state/SimulatorStore.ts';
import {useSimulatorSlice, useSimulatorValue} from '../../hooks/useSimulatorSlice.ts';
import {SETTINGS, SETTING_LABELS, MODE_LABELS} from '../../simulation/core/scenario.ts';
import type {ScenarioEntry} from '../../types/scenario.ts';
type BodyField = 'height' | 'weight';
// Same limits and defaults as profile() in TrafficEngine, which clamps the values when a run starts.
const BODY: Record<BodyField, {label: string; unit: string; min: number; max: number; fallback: number}> = {
  height: {label: '身長', unit: 'cm', min: 90, max: 210, fallback: 170},
  weight: {label: '体重', unit: 'kg', min: 15, max: 150, fallback: 60},
};
function BodyStepper({field, value, onChange}: {field: BodyField; value: string; onChange: (value: string) => void}) {
  const {label, unit, min, max, fallback} = BODY[field];
  const number = Number(value), valid = value.trim() !== '' && Number.isFinite(number) && number >= min && number <= max;
  const step = (delta: number) => onChange(String(Math.max(min, Math.min(max, Math.round(Number.isFinite(number) && value.trim() !== '' ? number : fallback) + delta))));
  return <div className={'body-field' + (valid ? '' : ' invalid')}>
    <label htmlFor={field}>{label}</label>
    <div className="stepper">
      <button type="button" className="step" aria-label={`${label}を 1 ${unit} 減らす`} disabled={valid && number <= min} onClick={() => step(-1)}>−</button>
      <span className="stepper-value"><input id={field} type="number" min={min} max={max} step="1" value={value} inputMode="numeric" aria-invalid={!valid} aria-describedby={field + '-range'} onChange={e => onChange(e.currentTarget.value)}/><span className="unit" aria-hidden="true">{unit}</span></span>
      <button type="button" className="step" aria-label={`${label}を 1 ${unit} 増やす`} disabled={valid && number >= max} onClick={() => step(1)}>＋</button>
    </div>
    <p id={field + '-range'} className="range">{valid ? `${min}〜${max} ${unit}` : `${min}〜${max} ${unit} で入力してください。開始時に範囲内へ調整します。`}</p>
  </div>;
}
export function Menu({store, commands}: {store: SimulatorStore; commands: SimulatorCommands | null}) {
  const menu = useSimulatorSlice(store, 'menu'), profile = useSimulatorSlice(store, 'profile');
  const screen = useSimulatorSlice(store, 'screen'), inspection = useSimulatorValue(store, snapshot => snapshot.presentation.inspection);
  const groups: [string, string, ScenarioEntry[]][] = SETTINGS.map(setting => [setting, SETTING_LABELS[setting], menu.entries.filter(e => e.template && e.setting === setting)]);
  groups.push(['other', 'その他', menu.entries.filter(e => e.template && !SETTINGS.includes(e.setting))], ['custom', 'カスタム', menu.entries.filter(e => !e.template)]);
  return <section id="title" className="overlay card" aria-labelledby="titleheading" hidden={screen !== 'title' || inspection}>
    <header className="title-header">
      <div><p className="kicker">彦根・京橋</p><h1 id="titleheading">彦根交通安全シミュレーター</h1></div>
      <nav className="title-links" aria-label="関連ページ"><a className="editor-link" href="editor/">シナリオエディタ <span aria-hidden="true">↗</span></a><a className="editor-link" href="docs/">開発ドキュメント <span aria-hidden="true">↗</span></a></nav>
    </header>
    <div className="columns">
      <div className="side">
        <section className="panel-card profile" aria-labelledby="profileheading">
          <h2 id="profileheading">あなたの体格</h2>
          <p className="help">視点の高さとリプレイの小熊の体格に反映されます。</p>
          <div className="body-inputs">
            <BodyStepper field="height" value={profile.height} onChange={height => store.patch('profile', {height})}/>
            <BodyStepper field="weight" value={profile.weight} onChange={weight => store.patch('profile', {weight})}/>
          </div>
        </section>
        <section className="panel-card explore" aria-labelledby="exploreheading"><h2 id="exploreheading">自由探索</h2>
          <p className="help">京橋の街を自由に歩き、途中で起きる出来事に対応します。</p>
          <div className="modes" role="radiogroup" aria-label="移動のしかた">{(['walking', 'bicycle'] as const).map(mode => <label key={mode}><input type="radio" name="mode" value={mode} checked={profile.mode === mode} onChange={() => store.patch('profile', {mode})}/>{MODE_LABELS[mode]}</label>)}</div>
          <button id="explore" type="button" className="primary" disabled={menu.busy || !commands} onClick={() => commands?.explore()}>探索を始める</button>
        </section>
      </div>
      <section className="panel-card practice" aria-labelledby="practiceheading"><h2 id="practiceheading">場面の練習</h2>
        <div id="scenarios" className="scenarios" role="group" aria-label="場面を選ぶ">{groups.filter(([, , entries]) => entries.length).map(([key, label, entries]) => <section key={key} className="scenario-group" aria-labelledby={'scenario-group-' + key}>
          <h3 id={'scenario-group-' + key}>{label}</h3>{entries.map(entry => {
            const number = entry.template ? entry.id.replace('builtin-', '') : '';
            const displayName = entry.template ? entry.name.replace(/^[^：]+：/, '') : entry.name;
            const category = displayName === entry.name ? '' : entry.name.split('：')[0];
            const context = [...new Set([category, MODE_LABELS[entry.playerMode]].filter(Boolean))].join('・');
            const selected = menu.selectedId === entry.id;
            return <button key={entry.id} type="button" className={'tile' + (selected ? ' on' : '')} data-scenario={entry.id} aria-pressed={selected} aria-label={`${number} ${displayName}（${context}）`.trim()} title={entry.nameEn ?? undefined} onClick={() => commands?.select(entry.id)}>
              {number && <span className="scenario-number" aria-hidden="true">{number}</span>}<span className="tile-name">{displayName}</span>
            </button>;
          })}</section>)}</div>
        <p id="selected" className="custom-selection" aria-live="polite" hidden={!menu.customName}>{menu.selectedName}</p>
        <div className="practice-actions"><label className="file">JSON を開く<input id="file" type="file" accept=".json,application/json" aria-label="場面の JSON を開く" aria-describedby="scenario-status" aria-busy={menu.busy} onChange={event => {const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) void commands?.importFile(file);}}/></label><button id="start" type="button" aria-describedby="selected" disabled={menu.busy || !commands} onClick={() => void commands?.start()}>練習を始める</button></div>
        <p id="scenario-status" className={'scenario-status' + (menu.error ? ' error' : '')} role={menu.error ? 'alert' : 'status'} aria-atomic="true" hidden={!menu.status}>{menu.status}</p>
      </section>
    </div>
    <footer className="title-controls" aria-label="操作">
      <p className="keys desktop-only"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 移動</span><span><kbd>Q</kbd><kbd>E</kbd> 見回す</span><span>クリックでマウス操作・<kbd>Esc</kbd> 解除</span><span><kbd>R</kbd> やり直す</span><span><kbd>M</kbd> メニュー</span></p>
      <p className="keys touch-only"><span>左下のスティックで移動</span><span>画面をドラッグして見回す</span></p>
      <p className="tip">交通ルールを守っていても危険な車は現れます。青信号でも左右と車の停止を確かめましょう。</p>
    </footer>
  </section>;
}
