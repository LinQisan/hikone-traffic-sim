import {Fragment, useEffect, useRef, useState, useSyncExternalStore} from 'react';
import {createEditorController} from '../../editor/controller.ts';
import type {EditorController} from '../../editor/controller.ts';
import type {QuestReport} from '../../types/editor.ts';
import {hasTrigger, MODE_LABELS} from '../../simulation/core/scenario.ts';
import {coordinateText} from '../../editor/map-coordinates.ts';
import {Inspector} from './Inspector.tsx';
export function EditorApp() {
  const [controller] = useState(createEditorController);
  useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const {state, ui, actions: a} = controller;
  const mapRef = useRef<SVGSVGElement>(null), questDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    let cancelled = false, mounted = false;
    queueMicrotask(() => {if (!cancelled) {mounted = true; void controller.mount();}});
    return () => {cancelled = true; if (mounted) controller.dispose();};
  }, [controller]);
  useEffect(() => {document.body.classList.toggle('server', state.server); return () => document.body.classList.remove('server');}, [state.server]);
  useEffect(() => {const dialog = questDialog.current; if (ui.questOpen && !dialog?.open) dialog?.showModal(); else if (!ui.questOpen && dialog?.open) dialog.close();}, [ui.questOpen]);
  const errors = state.problems.filter(problem => problem.level === 'error').length, warnings = state.problems.length - errors;
  return <>
  <header className="bar">
    <a className="brand" href="../" title="シミュレーターへ戻る / Back to the simulator">
      
      <svg className="logo" viewBox="-22 -26 44 40" aria-hidden="true">
        <circle cx="-11" cy="-17" r="6" fill="#e0b47c"/><circle cx="11" cy="-17" r="6" fill="#e0b47c"/>
        <circle cx="-11" cy="-17" r="3" fill="#eba091"/><circle cx="11" cy="-17" r="3" fill="#eba091"/>
        <circle cx="0" cy="-6" r="15" fill="#e0b47c"/>
        <ellipse cx="0" cy="-1" rx="7" ry="5" fill="#ffe7c4"/><ellipse cx="0" cy="-3" rx="2.6" ry="1.9" fill="#2a3441"/>
        <circle cx="-5.5" cy="-8" r="1.8" fill="#2a3441"/><circle cx="5.5" cy="-8" r="1.8" fill="#2a3441"/>
        <circle cx="-9" cy="-3" r="2.2" fill="#eba091" opacity=".7"/><circle cx="9" cy="-3" r="2.2" fill="#eba091" opacity=".7"/>
      </svg>
      <span>シナリオエディタ</span>
    </a>

    <div className="file" aria-live="polite">
      <span className="file-line"><span id="fileName" title={state.file?.template ? `${state.file.path} — 保存すると複製になります。` : state.file?.path ?? ''}>{state.file?.path.split('/').at(-1) ?? `${state.scenario.id}.json`}</span><span id="dirty" className="dirty" hidden={!controller.isDirty()} title="未保存の変更があります">● 未保存</span></span>
      <span id="status" className="status" title="チェックの結果（右下の一覧）"><span className={'pill ' + (errors ? 'error' : warnings ? 'warn' : 'ok')}>{errors ? `エラー ${errors}` : warnings ? `注意 ${warnings}` : 'OK'}</span></span>
    </div>

    <nav className="actions" aria-label="ファイル">
      <div className="group" role="group" aria-label="ファイル">
        <button id="btnNew" onClick={() => void a.newScenario()} type="button" title="新しい場面"><span className="i">＋</span><span className="t">新規</span></button>
        <button id="btnDuplicate" onClick={() => void a.duplicate()} type="button" title="この場面を複製"><span className="i">⧉</span><span className="t">複製</span></button>
        <label className="button" title="JSON ファイルを読み込む"><span className="i">↑</span><span className="t">開く</span><input id="importFile" onChange={event => {const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; void a.importJson(file);}} type="file" accept=".json,application/json"/></label>
        <button id="btnSave" onClick={() => void a.save()} type="button" className="primary" title="保存 (Ctrl+S)"><span className="i">✓</span><span className="t">保存</span></button>
      </div>
      <div className="group history" role="group" aria-label="編集の履歴">
        <button id="btnUndo" disabled={!state.undo.length} onClick={() => void a.undo()} type="button" title="元に戻す (Ctrl+Z)" aria-label="元に戻す"><span className="i">↶</span><span className="t">戻す</span></button>
        <button id="btnRedo" disabled={!state.redo.length} onClick={() => void a.redo()} type="button" title="やり直す (Ctrl+Shift+Z)" aria-label="やり直す"><span className="i">↷</span><span className="t">やり直す</span></button>
      </div>
      <div className="group try" role="group" aria-label="試す">
        <button id="btnTry" onClick={() => void a.playInBrowser()} type="button" className="accent" title="このままの内容をシミュレーターで体験（新しいタブ）"><span className="i">▶</span><span className="t">ブラウザで試す</span></button>
        <button id="btnPlay" onClick={() => void a.playInUnity()} type="button" className="server-only" title="保存して Unity エディタで再生"><span className="i">▶</span><span className="t">Unityで試す</span></button>
      </div>
      <div className="group" role="group" aria-label="書き出し">
        <button id="btnQuest" onClick={() => void a.openQuestDialog()} type="button" className="server-only" title="保存済みの場面を USB / ワイヤレス adb でつないだ Quest にコピー"><span className="i">⇪</span><span className="t">Quest</span></button>
        <button id="btnDownload" onClick={() => void a.downloadJson()} type="button" title="この場面を JSON ファイルとして書き出す"><span className="i">⇩</span><span className="t">JSON</span></button>
      </div>
    </nav>
  </header>

  <main className="layout">
    <aside className="panel left" aria-label="場面の一覧">
      <section className="scenes">
        <h2>場面 <span id="mode" className="mode" title={state.server ? 'VRLearn/Scenarios に保存します。Unity での再生と Quest への送信が使えます。' : 'マイ場面はこのブラウザだけに残ります。「⇩ JSON」で書き出せます。Unity と Quest には、ローカルで npm run dev を動かして送ります。'}>{state.server ? 'Unity に保存' : 'ブラウザに保存'}</span></h2>
        <div id="scenarioList" className="list">{([['マイ場面', state.list.filter(e => !e.template)], ['ひな形', state.list.filter(e => e.template)]] as const).map(([title, entries]) => <Fragment key={title}><div className="group">{title}</div>{!entries.length && <div className="note">保存した場面がここに表示されます。</div>}{entries.map(entry => <div key={entry.path} role="button" tabIndex={0} className={'item' + (state.file?.path === entry.path ? ' active' : '')} title={entry.unreadable ?? `${entry.id} — ${entry.errors} エラー / ${entry.warnings} 注意`} onClick={() => void a.openFile(entry.path, entry.template)} onKeyDown={event => {if (event.key === 'Enter' || event.key === ' ') {event.preventDefault(); void a.openFile(entry.path, entry.template);}}}><span className={'dot' + (entry.errors ? ' error' : entry.warnings ? ' warn' : '')}/><span className="name">{entry.name}</span><span className="chip">{entry.playerMode ? MODE_LABELS[entry.playerMode] : ''}</span></div>)}</Fragment>)}</div>
        <button id="btnDelete" disabled={!state.file || state.file.template} onClick={() => void a.removeFile()} type="button" className="danger wide" title="この場面を削除（ひな形は削除できません）">この場面を削除</button>
      </section>
      <section className="steps">
        <details className="guide">
          <summary>操作ガイド</summary>
          <ol>
            <li><b>場面を選ぶ</b>：一覧から開く、または「＋ 新規」。ひな形は別の id で保存されます。</li>
            <li><b>出発・ゴール・トリガー</b>を地図上でドラッグ（□ 大きさ ・ ○ 向き）。</li>
            <li><b>✎ 車を描く</b>：クリックで点、Enter で完了。右の「車」で速さと<b>事故車</b>を指定。</li>
            <li>下の <b>▶</b> で動きを確かめ、<b>チェック</b>が OK なら <b>▶ ブラウザで試す</b> → <b>保存</b>。</li>
          </ol>
          <details className="keys">
            <summary>マウスとキーの操作</summary>
            <ul>
              <li>ドラッグ：移動 ・ 空白をドラッグ：地図を動かす ・ ホイール：拡大縮小</li>
              <li>ルート上をダブルクリック：点を追加 ・ 点を右クリック：削除</li>
              <li><kbd>V</kbd> 選択 ・ <kbd>C</kbd> 車を描く ・ <kbd>F</kbd> 全体表示</li>
              <li><kbd>P</kbd> 座標を指定 ・ 地図の中央を <kbd>Enter</kbd> で指定</li>
              <li><kbd>G</kbd> 地図全体（彦根城・大学を含む）</li>
              <li><kbd>Space</kbd> 再生 ・ <kbd>Delete</kbd> 削除 ・ <kbd>Esc</kbd> 選択解除</li>
              <li><kbd>Ctrl</kbd>+<kbd>S</kbd> 保存 ・ <kbd>Ctrl</kbd>+<kbd>Z</kbd> 元に戻す</li>
            </ul>
          </details>
        </details>
      </section>
    </aside>

    <section className="stage" aria-label="地図">
      <svg ref={mapRef} id="map" tabIndex={0} aria-label="彦根・京橋の地図" aria-describedby="coordinateHelp"></svg>
      <div className="tools" role="toolbar" aria-label="地図の道具">
        <div className="segmented">
          <button id="toolSelect" onClick={() => a.tool('select')} aria-pressed={state.tool === 'select'} type="button" className={'tool' + (state.tool === 'select' ? ' active' : '')} title="選択・移動 (V)"><span className="i">↖</span> 選択 <kbd>V</kbd></button>
          <button id="toolDraw" onClick={() => a.tool('draw')} aria-pressed={state.tool === 'draw'} type="button" className={'tool' + (state.tool === 'draw' ? ' active' : '')} title="車のルートを描く (C)"><span className="i">✎</span> 車を描く <kbd>C</kbd></button>
          <button id="toolCoordinates" onClick={() => a.tool('coordinates')} aria-pressed={state.tool === 'coordinates'} type="button" className={'tool' + (state.tool === 'coordinates' ? ' active' : '')} aria-keyshortcuts="P" title="地図上の地点の座標を指定 (P)"><span className="i">⌖</span> 座標 <kbd>P</kbd></button>
        </div>
      </div>
      <div className="view-tools" role="toolbar" aria-label="表示">
        <button id="btnZoomOut" onClick={() => a.zoom(1 / 1.4)} type="button" className="tool icon" title="縮小" aria-label="縮小">−</button>
        <button id="btnZoomIn" onClick={() => a.zoom(1.4)} type="button" className="tool icon" title="拡大" aria-label="拡大">＋</button>
        <button id="btnFit" onClick={() => void a.fitScenario()} type="button" className="tool icon" title="場面全体を表示 (F)" aria-label="場面全体を表示">⤢</button>
        <button id="btnMapFit" onClick={() => void a.fitMap()} type="button" className="tool icon" title="地図全体を表示 (G)" aria-label="地図全体を表示" aria-keyshortcuts="G">▦</button>
        <details className="layers">
          <summary className="tool" title="地図に重ねるもの">表示 ▾</summary>
          <div className="layers-menu">
            <label className="check"><input type="checkbox" id="layerGrid" checked={ui.layers.layerGrid} onChange={event => a.layer('layerGrid', event.currentTarget.checked)}/> 座標グリッド・目盛り</label>
            <label className="check"><input type="checkbox" id="layerSurfaces" checked={ui.layers.layerSurfaces} onChange={event => a.layer('layerSurfaces', event.currentTarget.checked)}/> 路面（車道・歩道）</label>
            <label className="check"><input type="checkbox" id="layerLanes" checked={ui.layers.layerLanes} onChange={event => a.layer('layerLanes', event.currentTarget.checked)}/> 組み込みの車線</label>
            <label className="check"><input type="checkbox" id="layerWalls" checked={ui.layers.layerWalls} onChange={event => a.layer('layerWalls', event.currentTarget.checked)}/> 通行不可（堀など）</label>
            <label className="check"><input type="checkbox" id="layerSignals" checked={ui.layers.layerSignals} onChange={event => a.layer('layerSignals', event.currentTarget.checked)}/> 信号</label>
            <hr/>
            <label className="check"><input type="checkbox" id="snapLanes" checked={ui.layers.snapLanes} onChange={event => a.layer('snapLanes', event.currentTarget.checked)}/> 車線に吸着（3 m 以内）</label>
          </div>
        </details>
      </div>
      <div id="drawHint" className="hint" hidden={state.drawing == null}>クリックで点を追加 ・ <kbd>Enter</kbd> / ダブルクリックで完了 ・ <kbd>Esc</kbd> で中止</div>
      <ul className="legend" aria-label="凡例">
        <li><i className="sw spawn"></i>出発</li>
        <li><i className="sw goal"></i>ゴール</li>
        <li><i className="sw trigger"></i>トリガー</li>
        <li><i className="sw car"></i>車</li>
        <li><i className="sw accident"></i>事故車</li>
        <li><i className="sw lane"></i>車線</li>
        <li><i className="sw wall"></i>見えない壁</li>
      </ul>
      <div id="coords" className="coords">{ui.coords}</div>
      <div id="loading" className="loading" hidden={ui.loaded}>{ui.loading}</div>
    </section>

    <aside className="panel right" aria-label="編集">
      <details id="coordinatePanel" className="coordinate-panel" open={ui.coordinateOpen} onToggle={event => a.coordinateOpen(event.currentTarget.open)}>
        <summary id="coordinateTitle">座標</summary>
        <p id="coordinateHelp" className="visually-hidden">座標ツールで地図をクリックして地点を選び、コピーできます。X は右、Z は上、単位は m です。</p>
        <form id="coordinateForm" className="coordinate-form" onSubmit={event => {event.preventDefault(); a.locate();}}>
          <label>X (m) <input id="coordinateX" value={ui.coordinateX} min={state.map?.world.xMin} max={state.map?.world.xMax} onChange={event => a.coordinate('coordinateX', event.currentTarget.value)} type="number" step="0.01" required aria-label="地点の X 座標（m）" placeholder="0.00"/></label>
          <label>Z (m) <input id="coordinateZ" value={ui.coordinateZ} min={state.map?.world.zMin} max={state.map?.world.zMax} onChange={event => a.coordinate('coordinateZ', event.currentTarget.value)} type="number" step="0.01" required aria-label="地点の Z 座標（m）" placeholder="0.00"/></label>
          <button type="submit" className="small">表示</button>
        </form>
        <div className="coordinate-copy">
          <input id="coordinateValue" value={state.reference ? coordinateText(state.reference) : ''} type="text" readOnly aria-label="共有する座標" placeholder="地点を指定してください"/>
          <button id="btnCopyCoordinates" onClick={() => void a.copyCoordinates()} type="button" className="small" disabled={!state.reference}>コピー</button>
        </div>
      </details>
      <div id="inspector" className="inspector">{ui.loaded && <Inspector controller={controller} revision={controller.inspectorRevision}/>}</div>
      <section className="checks">
        <h2>チェック <span id="problemCount" className="count">{[errors ? `エラー ${errors}` : '', warnings ? `注意 ${warnings}` : ''].filter(Boolean).join(' ・ ')}</span></h2>
        <div id="problems" className="problems">{!state.problems.length && <div className="all-good">✓ 問題なし</div>}{state.problems.map((problem, index) => <div key={index} role="button" tabIndex={0} className={'problem ' + problem.level} onClick={() => a.focusTarget(problem.target)} onKeyDown={event => {if (event.key === 'Enter' || event.key === ' ') {event.preventDefault(); a.focusTarget(problem.target);}}}><span className="icon">{problem.level === 'error' ? '✕' : '!'}</span>{problem.message}</div>)}</div>
      </section>
    </aside>
  </main>

  <footer className="timeline" aria-label="タイムライン">
    <div className="playback">
      <button id="btnTimePlay" onClick={() => a.togglePlay()} type="button" className="play" title="再生 / 一時停止 (Space)" aria-label="再生 / 一時停止">{state.playing ? '⏸' : '▶'}</button>
      <input type="range" id="timeSlider" min="0" max={ui.horizon} step="0.05" value={state.time} onChange={event => a.time(Number(event.currentTarget.value))} aria-label="時刻"/>
      <span id="timeLabel" className="time">{state.time.toFixed(1)} 秒</span>
    </div>
    <fieldset className="trigger-box">
      <legend>トリガー</legend>
      <label className="check"><input type="checkbox" id="triggerOn" checked={ui.triggerOn} disabled={!hasTrigger(state.scenario)} onChange={event => a.trigger('triggerOn', event.currentTarget.checked)}/> 体験者が入る</label>
      <label className="num">時刻 <input type="number" id="triggerTime" value={ui.triggerTime} disabled={!hasTrigger(state.scenario) || ui.triggerAuto} onChange={event => a.trigger('triggerTime', event.currentTarget.value)} step="0.5" min="0"/> 秒</label>
      <label className="check"><input type="checkbox" id="triggerAuto" checked={ui.triggerAuto} disabled={!hasTrigger(state.scenario)} onChange={event => a.trigger('triggerAuto', event.currentTarget.checked)}/> 歩く速さから推定</label>
    </fieldset>
    <span id="timelineInfo" className="info">{ui.timelineInfo}</span>
  </footer>

  <dialog ref={questDialog} onCancel={() => a.closeQuest()} id="questDialog" className="dialog">
    <h2>Quest に送る</h2>
    <p className="note">「マイ場面」のうちエラーのない場面を、つないだ Quest のアプリにコピーします。PC で消した場面は Quest からも消えます（組み込みの 10 場面はアプリに入っているので送りません）。</p>
    <div id="questStatus" className="quest-status">{ui.questError || (ui.questBusy && !ui.questStatus ? '確認中…' : '')}{ui.questStatus && <QuestStatusView controller={controller}/>}</div>
    <div id="questResult" className="quest-result">{ui.questMessage}{ui.questResult && <QuestResultView report={ui.questResult}/>}</div>
    <div className="dialog-buttons">
      <button id="questRefresh" onClick={() => void a.questCheck()} type="button">再確認</button>
      <button id="questSend" onClick={() => void a.questSend()} disabled={ui.questBusy || !ui.questStatus?.devices.some(device => device.state === 'device')} type="button" className="primary">送る</button>
      <button id="questClose" onClick={() => void a.closeQuest()} type="button">閉じる</button>
    </div>
  </dialog>

  <div id="toast" className={'toast' + (ui.toast.error ? ' error' : '')} role="status" hidden={!ui.toast.visible}>{ui.toast.text}</div>
</>;
}
function QuestStatusView({controller}: {controller: EditorController}) {
  const status = controller.ui.questStatus!;
  if (status.error) return <div className="bad">{status.error}</div>;
  const mine = controller.state.list.filter(entry => !entry.template);
  return <><div>アプリ: {status.package ?? '(不明)'}</div>{!status.devices.length && <div className="bad">Quest が見つかりません。USB でつなぐか、ワイヤレス adb で接続してください。</div>}{status.devices.map(device => <div key={device.serial} className="device">{device.model || 'Android'}（{device.serial}）<span className={device.state === 'device' ? 'ok' : 'bad'}>{device.state === 'device' ? '接続済み' : device.state === 'unauthorized' ? 'ヘッドセットで「USB デバッグを許可」を選んでください' : device.state}</span></div>)}<div>送る場面: {mine.filter(entry => !entry.errors).length} 件{mine.some(entry => entry.errors) ? `（エラーのある ${mine.filter(entry => entry.errors).length} 件は送りません）` : ''}</div></>;
}
function QuestResultView({report}: {report: QuestReport}) {return <>{report.results.map(row => <div key={row.serial} className={row.error ? 'error' : ''}>{row.error ? `${row.model || row.serial}: ${row.error}` : `${row.model || row.serial}: ${row.pushed.length} 件コピー` + (row.removed.length ? `、${row.removed.length} 件削除（${row.removed.join(', ')}）` : '')}</div>)}{!!report.skipped.length && <div className="error">エラーのため送らなかった場面: {report.skipped.map(row => row.id).join(', ')}</div>}{report.results.some(row => !row.error) && <div>Quest のタイトル画面で「カスタム」タブを開き、「読み直す」を押すと一覧に出ます。</div>}</>;}
