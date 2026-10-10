# Hikone Traffic Simulator（彦根交通安全シミュレーター）

[VRLearn](https://github.com/LinQisan/VRLearn)（歩行者向け交通安全 VR）のブラウザ版。彦根・京橋の街で、10 の事故場面とカスタム場面（JSON）をパソコンとスマートフォンで体験できます。three.js、ビルド不要。VR は Unity 版を使ってください。

## 動かす

すぐ試す: **https://linqisan.github.io/hikone-traffic-sim/**

手元で動かす:

```bash
node serve.mjs                 # http://127.0.0.1:8770/
node serve.mjs --host 0.0.0.0  # 同じ LAN のスマートフォンから http://<PC の IP>:8770/
```

| | パソコン | スマートフォン・タブレット |
| --- | --- | --- |
| 移動 | W A S D・矢印 | 左下のスティック |
| 見回す | クリックしてマウス（Esc で解除）・Q / E | 画面をドラッグ |
| 自転車 | W こぐ・S ブレーキ（止まって押すと後ろへ）・A D ハンドル | スティック上下・左右 |
| やり直し | R | 「やり直し」 |
| メニューへ（いつでも） | M・「メニュー」（マウス操作中は Esc で解除してから Esc） | 「メニュー」 |
| リプレイ | 俯瞰 / 運転者（V）・もう一度（B）・結果へ | 画面のボタン |

メニューの身長は目の高さとリプレイの小熊の背丈に、体重は小熊の体つきに反映されます。

キーボードだけでも操作できます（Tab で移動・Enter で決定・Q / E で見回す）。スクリーンリーダーには開始・接触・ゴール・リプレイ・結果を読み上げ、OS の「視差効果を減らす」設定では倒れる時の回転と赤い光を控えます。読み込み中は進み具合を表示し、失敗したときは理由と再読み込みボタンを出します。

## シナリオエディタ（`editor/`）

彦根・京橋の地図の上でカスタム場面（JSON）を作るエディタです（以前の VRLearn の `ScenarioEditor/` をここへ移しました）。タイトル画面の「✎ シナリオエディタ」か **https://linqisan.github.io/hikone-traffic-sim/editor/** から開きます。

- 地図上で **出発点・ゴール・トリガー** をドラッグで配置（□ で大きさ、○ で向き）
- **車のルートを描く**：「✎ 車を描く」→ クリックで点を追加 → Enter / ダブルクリックで完了。組み込みの車線に 3 m 以内なら吸着（Alt で解除）。「組み込みの車線から追加」も可
- 車ごとに：車種・車体（セダン / 軽）・速さ・出発の基準・待ち時間・繰り返し・事故車
- **タイムライン**：▶ で車の動きを再生。事故車と体験者の線が交わる時刻を表示
- **チェック**：Unity と同じ形式チェック＋地図チェック。クリックで該当箇所へ
- **▶ ブラウザで試す**：いまの内容をシミュレーターで体験（新しいタブ、タイトルで「開始」）
- 開く / ⇩ JSON：ファイルの読み込みと書き出し。元に戻す / やり直す（Ctrl+Z / Ctrl+Shift+Z）、Ctrl+S で保存
- URL で表示を指定：`?open=templates/builtin-01.json&select=vehicle:2&time=12&layers=surfaces`

保存先は開き方で変わります（一覧の上に表示）。

| | 保存先 | Unity で試す・Quest に送る |
| --- | --- | --- |
| GitHub Pages・LAN の別の端末 | このブラウザ（localStorage）。ほかの端末には「⇩ JSON」で | なし |
| この PC で `node serve.mjs`（隣に VRLearn があるとき） | `VRLearn/Scenarios/<id>.json`（削除は `.trash/` へ） | あり |

ひな形は Unity の組み込み 10 場面（`data/editor/templates/`、Quest で動くものと同じ）で、上書きせず別の id で保存します。上の `events/` の作り直し版ではありません。

ローカルのサーバ（`server/editor-api.mjs`）は、この PC からの要求にだけ答え、ほかのサイトからの書き込みは断ります。

- **▶ Unityで試す**：保存して、開いている Unity エディタで再生（`Scenarios/.play-request.json` 経由）
- **⇪ Questに送る**：エラーのない「マイ場面」を、USB（またはワイヤレス adb）でつないだ Quest のアプリにコピー。PC で消した場面は Quest からも消えます。Quest ではタイトル画面の「カスタム」タブ →「読み直す」。Quest を開発者モードにしてアプリを入れておき、ヘッドセットで「USB デバッグを許可」を選びます。adb は自動で探します（見つからないときは環境変数 `ADB`）

データ形式とチェックは `src/shared/scenario.js`（VRLearn の `ScenarioModel/scenario.js` の写し、Unity の `CustomScenario.cs` と同じ内容）です。

## 体験の流れ

場面を歩く・自転車で走る → 車と接触すると視点が体と一緒に倒れる → リプレイ（接触の前 8 秒〜後 1.6 秒、俯瞰または事故車の運転席から。倒れ方は当たった場所と速さで変わる） → 結果（Unity 版と同じ評価）。ゴールに着くと左右の確認の結果。

## 事故場面（`events/`）

10 の場面は Unity のテンプレートを元に、ブラウザ用に車の出る場所・道筋・タイミングを作り直しています（Unity 版の実験データは変えません）。事故車は、体験者が普通の速さで進み続けた場合に、事故の起きる場所に同時に着くように出発します（`src/traffic.js` の `launch: "meet"`）。

- 確かめずに進むと、その場面の事故車とぶつかります。止まって確かめれば、事故車が見えて、通りすぎてから安全に渡れます。
- 車は見えない場所（建物・止まったトラック・城門の黒い壁の陰）から、走りながら現れます。交差点で曲がる車や駐車場の車は、初めから止まって待っています。
- 車は前の車に追いつくと車間をとり、ほかの車と重なって現れません。

`node tools/check_events.mjs`（`npm test` にも含む）が、実際の街の建物で見通しを計算して、全場面について上の条件を確かめます。

## データの更新

`data/` は VRLearn（隣の `../VRLearn`、別の場所は `VRLEARN_ROOT` / `VRLEARN_WEB`）から作ります。

1. Unity：`Tools/VRLearn/Web/Export Scene For Web` → `data/scene.json`、`data/signals.json`
2. `blender -b --factory-startup --python tools/build_impressionist.py` → `data/models/impressionist/`（印象派の模型と遠景 LOD）
3. `node tools/sync.mjs` → 配置・道路・地図（`map.json`・`map.png`）・テクスチャ・場面（組み込みは `events/` を優先）・エディタのひな形・`src/shared/scenario.js`
4. `node tools/build_collision.mjs` → `data/collision.json`（建物・塀・木などの当たり判定。模型か配置を変えたとき）

## 作り

| ファイル | 内容 |
| --- | --- |
| `src/app.js` | 画面の流れ、入力、描画ループ |
| `src/world.js`, `src/environment-instances.js` | 街：資産ごとに 1 回の InstancedMesh 描画、視錐台・影の範囲の選別、遠景 LOD |
| `src/style.js`, `src/paint-texture.js` | 画風：共有の顔料マテリアル、筆の跡、描いた空 |
| `src/traffic.js` | 車：出現、事故車のタイミング、車間、接触判定 |
| `src/player.js`, `src/touch-controls.js` | 体験者：移動、自転車の操作、倒れる視点、タッチ操作 |
| `src/obstacles.js` | 当たり判定：建物・塀・木（体の高さ 0.3〜1.8 m で切った 0.2 m の格子）と止まっている車 |
| `src/replay.js`, `src/crash.js`, `src/cockpit.js` | リプレイ、倒れ方、運転者の視点 |
| `src/replay-animal.js`, `src/replay-cyclist.js`, `src/bicycle.js` | 小熊と自転車 |
| `src/resolution.js` | 動的解像度（GPU に合わせて画素数を調整） |
| `editor/` | シナリオエディタ：`app.js`（画面の操作）、`store.js`（ブラウザ内の保存）、`editor.css` |
| `server/editor-api.mjs` | エディタのローカルサーバ（VRLearn の `Scenarios/`、Unity 再生、Quest）。`serve.mjs` が `/api/…` を渡す |

座標は Unity と同じで計算し、描画のときだけ x を反転します（`src/coords.js`）。

## 性能

1 フレーム約 120 描画（以前の約 3,900 から）、資産ごとの InstancedMesh、影は 12 Hz・影の範囲だけ、パソコンは動的解像度（FPS 表示の %）、スマートフォンはマルチサンプリングなし。`?quality=high` で高解像度固定、`?benchmark=1` で計測。詳細は [docs/performance.md](docs/performance.md)。

## テスト

```bash
npm test
```

エディタのサーバのテスト（`test/editor-server`・`editor-quest`、`fake-adb.mjs` は Quest の代わり）は隣に VRLearn があるときだけ動き、ないときは飛ばします。

## Unity 版との違い

- 実験ではありません。CSV は書き出さず、Unity 版の VR 体験とはデータをまぜないでください。
- 信号は表示だけで切り替わりません。音、雨・夜の設定はありません。

## ライセンス

three.js は MIT（`vendor/three/LICENSE`）。模型は VRLearn とこのプロジェクトの生成スクリプトで作ったもので、外部の模型は含みません。
