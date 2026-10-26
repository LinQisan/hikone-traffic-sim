import {memo, Children, createElement, useLayoutEffect, useRef, useState} from 'react';
import type {ReactNode, CSSProperties, ChangeEvent} from 'react';
import * as S from '../../simulation/core/scenario.ts';
import type {EditorController} from '../../editor/controller.ts';
import type {VehicleSpec} from '../../types/scenario.ts';
type FieldKind = 'text' | 'number' | 'select' | 'textarea' | 'checkbox';
interface FieldOptions {choices?: string[][]; rows?: number; step?: number; min?: number; max?: number; unit?: string; after?: (value: string | number | boolean) => void}
interface Attributes {class?: string; style?: string | CSSProperties; onchange?: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void; onclick?: () => void; [key: string]: unknown}
function FieldControl({controller, path, type, options}: {controller: EditorController; path: string; type: FieldKind; options: FieldOptions}) {
  const value = controller.getPath(path), id = 'field-' + path.replaceAll('.', '-');
  const [draft, setDraft] = useState(String(value ?? ''));
  const editing = useRef(false);
  useLayoutEffect(() => {if (!editing.current) setDraft(type === 'number' ? String(value == null ? '' : Math.round(Number(value) * 100) / 100) : String(value ?? ''));}, [value, type]);
  const onChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const text = event.currentTarget.value; setDraft(text);
    let next: string | number | boolean = type === 'checkbox' ? ('checked' in event.currentTarget && event.currentTarget.checked) : text;
    if (type === 'number') {next = parseFloat(text); if (!Number.isFinite(next)) return;}
    controller.setField(path, next, options.after);
  };
  const common = {id, onFocus: () => {editing.current = true;}, onBlur: () => {editing.current = false;}, 'data-path': path, 'data-type': type, onChange};
  if (type === 'select') return <select {...common} value={String(value ?? '')}>{options.choices?.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select>;
  if (type === 'textarea') return <textarea {...common} rows={options.rows ?? 2} value={draft}/>;
  return <input {...common} type={type} value={type === 'checkbox' ? undefined : draft} checked={type === 'checkbox' ? !!value : undefined} step={options.step ?? 'any'} min={options.min} max={options.max}/>;
}
export const Inspector = memo(function Inspector({controller}: {controller: EditorController; revision: number}) {
/** Compatibility for the existing form vocabulary; every element is owned and reconciled by React. */
let elementSequence = 0;
function html(tag: string, attrs: Attributes = {}, ...children: ReactNode[]) {
  const {class: className, style, onclick: onClick, onchange: onChange, ...rest} = attrs;
  const css: CSSProperties | undefined = typeof style === 'string' ? Object.fromEntries(style.split(';').filter(Boolean).map(pair => {const [key, ...value] = pair.split(':'); return [key.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()), value.join(':')];})) : style;
  return createElement(tag, {key: String(rest.key ?? rest.id ?? 'field-part-' + elementSequence++), ...rest, className, style: css, onClick, onChange}, ...Children.toArray(children));
}
  const {state, actions} = controller;
  const {pushUndo, onScenarioChanged, renderInspector, select, addVehicle, deleteVehicle, startDrawing, toggleTrigger} = actions;
  const vehicleColor = (v: VehicleSpec, i: number) => v.accident ? '#ff6b5e' : ['#ff9f1c', '#2ec4b6', '#9b5de5', '#00bbf9', '#f15bb5', '#8ac926', '#fee440', '#4d7cfe'][i % 8];
  const fmt = (value: number, digits = 1) => Number(value).toFixed(digits);
  function field(label: string, path: string, type: FieldKind = 'text', options: FieldOptions = {}) {
    const control = <FieldControl key={path} controller={controller} path={path} type={type} options={options}/>;
    return [<label key={path + '-label'} htmlFor={'field-' + path.replaceAll('.', '-')}>{label}</label>, options.unit ? <div key={path} className="unit">{control}<span>{options.unit}</span></div> : control];
  }
function inspectorView() {
  const root: ReactNode[] = [];
  const s = state.scenario;
  if (!s) return;
  const tabs = [['meta', '場面'], ['layout', '出発・ゴール'], ['vehicles', `車 (${s.vehicles.length})`]];
  const section: ReactNode[] = [html('div', { class: 'tabs' }, tabs.map(([id, text]) =>
      html('button', { class: state.tab === id ? 'active' : '', onclick: () => { state.tab = id; renderInspector(); } }, text)))];

  if (state.tab === 'meta') {
    section.push(html('div', { class: 'form' },
      field('ファイル ID', 'id', 'text'),
      field('名前', 'name', 'text'),
      field('英語名', 'nameEn', 'text'),
      field('分類', 'setting', 'select', { choices: Object.entries(S.SETTING_LABELS) }),
      field('移動', 'playerMode', 'select', { choices: Object.entries(S.MODE_LABELS) }),
      field('学ぶこと', 'learningGoal', 'textarea', { rows: 2 }),
      field('事故の状況', 'situation', 'textarea', { rows: 3 }),
      field('確認ポイント', 'point', 'textarea', { rows: 3 })
    ));
    section.push(html('div', { class: 'form', style: 'margin-top:14px' },
      html('label', {}, '危険な運転者'), html('label', { class: 'check' }, html('input', { type: 'checkbox', checked: !!s.hazardPolicy, onchange: e => {
        pushUndo();
        if (('checked' in e.currentTarget && e.currentTarget.checked)) s.hazardPolicy = { safeProbability: 0.03, unsafeProbability: 0.6 };
        else delete s.hazardPolicy;
        onScenarioChanged({ inspector: 'full' });
      } }), '抽選率を指定'),
      ...(s.hazardPolicy ? [
        html('div', { class: 'full note' }, '標準は通常時 3%、危険行動時は最大 60%。0.03 = 3%。体験用の設定で、現実の事故率ではありません。'),
        ...field('通常時の抽選率', 'hazardPolicy.safeProbability', 'number', { min: 0, max: 1, step: 0.01 }),
        ...field('危険行動時の抽選率', 'hazardPolicy.unsafeProbability', 'number', { min: 0, max: 1, step: 0.01 }),
      ] : []),
      html('label', {}, '道路環境'), html('label', { class: 'check' }, html('input', { type: 'checkbox', checked: !!s.environment, onchange: e => {
        pushUndo();
        if (('checked' in e.currentTarget && e.currentTarget.checked)) s.environment = { visibilityMeters: 80, roadGrip: 1 };
        else delete s.environment;
        onScenarioChanged({ inspector: 'full' });
      } }), '見通し・路面を指定'),
      ...(s.environment ? [
        ...field('可視距離', 'environment.visibilityMeters', 'number', { unit: 'm', min: 5, max: 150, step: 1 }),
        ...field('路面のグリップ', 'environment.roadGrip', 'number', { min: 0.2, max: 1, step: 0.1 }),
      ] : [])
    ));
  } else if (state.tab === 'layout') {
    const trigger = S.hasTrigger(s);
    section.push(
      html('h3', {}, html('span', { style: 'color:var(--spawn)' }, '●'), '出発点'),
      html('div', { class: 'form' }, ...field('x', 'spawn.x', 'number', { unit: 'm' }), ...field('z', 'spawn.z', 'number', { unit: 'm' }),
        html('div', { class: 'full note' }, '体験者は出発点からゴールの方を向いて始まります。')),
      html('h3', { style: 'margin-top:14px' }, html('span', { style: 'color:var(--goal)' }, '■'), 'ゴール'),
      areaForm('goal'),
      html('h3', { style: 'margin-top:14px' }, html('span', { style: 'color:var(--trigger)' }, '■'), 'トリガー'),
      html('div', { class: 'form' },
        html('label', {}, '使う'),
        html('label', { class: 'check' }, html('input', { type: 'checkbox', checked: trigger, onchange: e => toggleTrigger(('checked' in e.currentTarget && e.currentTarget.checked)) }),
          '入ったときに「トリガー」の車が出発')),
      trigger ? areaForm('trigger') : html('div', { class: 'note' }, 'トリガーなし：全部の車が場面の開始から数えて出発します。'));
  } else {
    section.push(vehicleList());
    const sel = state.selection;
    if (sel?.kind === 'vehicle' && s.vehicles[sel.index]) root.push(vehicleForm(sel.index));
  }
  return <><section>{Children.toArray(section)}</section>{Children.toArray(root)}</>;
}

function areaForm(kind: 'goal' | 'trigger') {
  return html('div', { class: 'form' },
    ...field('x', `${kind}.x`, 'number', { unit: 'm' }), ...field('z', `${kind}.z`, 'number', { unit: 'm' }),
    ...field('幅', `${kind}.width`, 'number', { unit: 'm', min: 0.5 }), ...field('奥行き', `${kind}.depth`, 'number', { unit: 'm', min: 0.5 }),
    ...field('向き', `${kind}.yaw`, 'number', { unit: '°' }));
}

function vehicleList() {
  const s = state.scenario;
  return html('div', {},
    html('div', { class: 'vehicles' }, s.vehicles.map((v, i) =>
      html('div', { class: 'vehicle-row' + (state.selection?.kind === 'vehicle' && state.selection.index === i ? ' active' : '') },
        html('button', { class: 'vehicle-select', type: 'button',
          'aria-pressed': state.selection?.kind === 'vehicle' && state.selection.index === i ? 'true' : 'false',
          onclick: () => select({ kind: 'vehicle', index: i }) },
          html('span', { class: 'swatch', style: `background:${vehicleColor(v, i)}` }),
          html('span', { class: 'name' }, v.name || `車 ${i + 1}`),
          v.accident ? html('span', { class: 'tag accident' }, '事故車') : null,
          html('span', { class: 'tag' }, v.start === S.START_TRIGGER ? 'トリガー' : '開始'),
          S.isRepeating(v) ? html('span', { class: 'tag' }, '繰り返し') : null),
        html('button', { class: 'vehicle-delete', type: 'button',
          title: `${v.name || `車 ${i + 1}`} の車とルートを削除`,
          'aria-label': `${v.name || `車 ${i + 1}`} の車とルートを削除`,
          onclick: () => deleteVehicle(i) }, '削除')))),
    html('div', { class: 'row-buttons' },
      html('button', { id: 'btnAddVehicle', onclick: addVehicle }, '＋ 車を追加して描く'),
      laneMenu()));
}

function laneMenu() {
  const laneSelect = html('select', { class: 'small', onchange: e => {
    const lane = state.map!.lanes.find(l => l.id === e.currentTarget.value);
    if (!lane) return;
    const s = state.scenario;
    pushUndo();
    const first = !s.vehicles.some(v => v.accident);
    s.vehicles.push(S.newVehicle({
      name: first ? '事故車' : `車の流れ ${lane.id}`, accident: first,
      start: first && S.hasTrigger(s) ? S.START_TRIGGER : S.START_BEGIN, delaySeconds: first ? 2 : 3,
      repeatMinSeconds: first ? 0 : 4, repeatMaxSeconds: first ? 0 : 6, stopOnTrigger: !first && S.hasTrigger(s),
      route: lane.points.map(p => ({ x: p.x, z: p.z }))
    }));
    e.currentTarget.value = '';
    state.selection = { kind: 'vehicle', index: s.vehicles.length - 1 };
    onScenarioChanged({ inspector: 'full' });
  } }, html('option', { value: '' }, '組み込みの車線から追加…'),
    ...state.map!.lanes.map(l => html('option', { value: l.id }, `${l.name}（${l.points.length} 点）`)));
  return laneSelect;
}

function vehicleForm(i: number) {
  const v = state.scenario.vehicles[i];
  const p = `vehicles.${i}`;
  const models = (state.map!.vehicleModels ?? ['Car_Left']).map(m => [m, m]);
  const trigger = S.hasTrigger(state.scenario);
  const form = html('div', { class: 'form' },
    ...field('名前', `${p}.name`, 'text'),
    ...field('車種', `${p}.model`, 'select', { choices: models }),
    ...field('車体', `${p}.body`, 'select', { choices: (state.map!.vehicleBodies ?? S.BODIES.map(id => ({ id, label: S.BODY_LABELS[id as keyof typeof S.BODY_LABELS] })))
      .map(b => [b.id, b.label]) }),
    html('label', {}, '注目する車'), html('label', { class: 'check' }, fieldInput(`${p}.accident`, 'checkbox'), '場面の注目車（運転行動は下で設定）'),
    ...field('経路の上限速度', `${p}.speedKmh`, 'number', { unit: 'km/h', min: 5, max: 80, step: 1 }),
    html('label', {}, '運転者'), html('label', { class: 'check' }, html('input', { type: 'checkbox', checked: !!v.driver, onchange: e => {
      pushUndo();
      if (('checked' in e.currentTarget && e.currentTarget.checked)) v.driver = { reactionTimeSeconds: 1, desiredSpeedKmh: v.speedKmh, maxBrakingMps2: 6, accelerationMps2: 2.4, timeHeadwaySeconds: 1.5 };
      else delete v.driver;
      onScenarioChanged({ inspector: 'full' });
    } }), '個別に指定（未指定なら車ごとに変化）'),
    ...(v.driver ? [
      ...field('運転行動', `${p}.driver.behavior`, 'select', { choices: S.DRIVER_BEHAVIORS.map(key => [key, S.DRIVER_BEHAVIOR_LABELS[key as keyof typeof S.DRIVER_BEHAVIOR_LABELS]]) }),
      ...field('反応時間', `${p}.driver.reactionTimeSeconds`, 'number', { unit: '秒', min: 0.2, max: 2.5, step: 0.1 }),
      ...field('希望速度', `${p}.driver.desiredSpeedKmh`, 'number', { unit: 'km/h', min: 5, max: 80, step: 1 }),
      ...field('最大減速度', `${p}.driver.maxBrakingMps2`, 'number', { unit: 'm/s²', min: 2, max: 9, step: 0.1 }),
      ...field('加速度', `${p}.driver.accelerationMps2`, 'number', { unit: 'm/s²', min: 0.5, max: 4, step: 0.1 }),
      ...field('車間時間', `${p}.driver.timeHeadwaySeconds`, 'number', { unit: '秒', min: 0.8, max: 3, step: 0.1 }),
    ] : []),
    ...field('出発の基準', `${p}.start`, 'select', { choices: trigger
      ? [[S.START_BEGIN, '場面の開始から'], [S.START_TRIGGER, 'トリガーに入ってから']]
      : [[S.START_BEGIN, '場面の開始から']] }),
    ...field('待ち時間', `${p}.delaySeconds`, 'number', { unit: '秒', min: 0, step: 0.5 }),
    html('label', {}, '繰り返す'),
    html('label', { class: 'check' }, html('input', { type: 'checkbox', checked: S.isRepeating(v), onchange: e => {
      pushUndo();
      v.repeatMinSeconds = ('checked' in e.currentTarget && e.currentTarget.checked) ? 4 : 0;
      v.repeatMaxSeconds = ('checked' in e.currentTarget && e.currentTarget.checked) ? 6 : 0;
      onScenarioChanged({ inspector: 'full' });
    } }), '車の流れ（一定の間隔で次々に出る）'),
    ...(S.isRepeating(v) ? [
      html('label', {}, '間隔'),
      html('div', { class: 'pair' }, fieldInput(`${p}.repeatMinSeconds`, 'number'), fieldInput(`${p}.repeatMaxSeconds`, 'number')),
      ...(trigger ? [html('label', {}, 'トリガーで'), html('label', { class: 'check' }, fieldInput(`${p}.stopOnTrigger`, 'checkbox'), '次の車の出発を止める（旧形式）')] : [])
    ] : []),
    html('label', {}, '最初の向き'),
    html('label', { class: 'check' }, fieldInput(`${p}.overrideYaw`, 'checkbox', { rebuild: true }), '指定する（しないとルートの方を向く）'),
    ...(v.overrideYaw ? field('向き', `${p}.yaw`, 'number', { unit: '°' }) : [])
  );
  return html('section', {},
    html('h3', {}, html('span', { class: 'swatch', style: `display:inline-block;width:12px;height:12px;border-radius:3px;background:${vehicleColor(v, i)}` }), v.name || `車 ${i + 1}`),
    form,
    html('div', { style: 'margin-top:10px' }, vehicleTiming(i)),
    html('div', { class: 'row-buttons' },
      html('button', { onclick: () => startDrawing(i) }, '✎ 点を描き足す'),
      html('button', { onclick: () => { pushUndo(); v.route.reverse(); onScenarioChanged({ inspector: 'full' }); } }, '⇄ 逆向き'),
      html('button', { class: 'danger', onclick: () => deleteVehicle(i) }, 'この車を削除')));
}

/** A bare input bound to a path (for compact layouts). */
function fieldInput(path: string, type: FieldKind, _options = {}) {return field('', path, type)[1];}

function vehicleTiming(i: number) {
  const s = state.scenario;
  const v = s.vehicles[i];
  const box: ReactNode[] = [];
  if (!v || v.route.length < 2) { box.push('ルートを 2 点以上描いてください。'); return html('div', {class: 'timing', 'data-timing': i}, box); }
  const speed = v.speedKmh / 3.6;
  const length = S.routeLength(v.route);
  const drive = S.timeToDistance(length, speed);
  const base = v.start === S.START_TRIGGER ? 'トリガーに入ってから' : '場面の開始から';
  box.push(
    html('div', {}, `ルート ${fmt(length)} m ・ 自由走行の参考値 ${fmt(drive)} 秒（信号・車間・反応で変化）`),
    html('div', {}, `${base} `, html('b', {}, `${fmt(v.delaySeconds)} 秒`), ' 後に出現' +
      (S.isRepeating(v) ? `、その後 ${fmt(v.repeatMinSeconds)}〜${fmt(v.repeatMaxSeconds)} 秒ごと` : '')));
  const c = S.conflictPoint(s, v);
  if (c) {
    const carAt = v.delaySeconds + c.carSeconds;
    box.push(html('div', {}, '体験者の線と交わる: 出現から ', html('b', {}, `${fmt(c.carSeconds)} 秒`),
      `（${base.replace('から', '')} ${fmt(carAt)} 秒）`));
    if (v.start === S.START_TRIGGER) {
      const diff = carAt - c.personSeconds;
      box.push(html('div', {}, `体験者（${s.playerMode === 'bicycle' ? '自転車 4 m/s' : '歩行 1.2 m/s'}）はトリガーから約 `, html('b', {}, `${fmt(c.personSeconds)} 秒`),
        ` で到達 → 車は ${Math.abs(diff) < 0.5 ? 'ほぼ同時' : diff > 0 ? `${fmt(diff)} 秒 遅い` : `${fmt(-diff)} 秒 早い`}`));
    }
  } else {
    box.push(html('div', { class: 'note' }, '体験者の出発点→ゴールの直線とは交わりません。'));
  }
  return html('div', {class: 'timing', 'data-timing': i}, box);
}


return inspectorView();
});
