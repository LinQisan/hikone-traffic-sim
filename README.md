# Hikone Traffic Simulator（彦根交通安全シミュレーター）

[VRLearn](https://github.com/LinQisan/VRLearn)（Meta Quest 2 向けの歩行者向け交通安全 VR 体験）のブラウザ版です。three.js（r186）を使い、ビルド手順も外部パッケージも不要です。彦根・京橋の街、10 の組み込み場面と JSON のカスタム場面を、パソコンのブラウザ（マウス＋キーボード）または Quest のブラウザ（WebXR）で体験できます。

## 動かし方

```bash
node serve.mjs            # http://127.0.0.1:8770/
```

- **パソコン**：場面と身長を選んで「開始」。画面をクリックするとマウスで視点が動きます（Esc で解除）。WASD・矢印キーで移動、R でやり直し。
- **Quest（VR）**：USB でつないで `adb reverse tcp:8770 tcp:8770` を実行し、Quest のブラウザで `http://localhost:8770` を開いて「ENTER VR」。左スティックで移動します。リプレイと結果は目の前のパネルに表示され、トリガー／A・X で次へ（結果ではタイトルへ）、B・Y でもう一度。WebXR は安全なページ（localhost か https）でしか動きません。
- 流れは Unity 版と同じです：場面を歩く（自転車の場面も同じ速さ）→ 車と接触すると赤い光と停止 → 三人称のリプレイ（接触の前 8 秒〜後 1.6 秒、接触前後はスロー、最後で止まって「結果へ進む」を待つ）→ 結果（Unity と同じ評価と文章）。ゴールに着くと成功の結果（左右の確認）。

## データの更新

`data/` は Unity プロジェクトから作ります（このリポジトリは VRLearn の隣（`../VRLearn`）に置く前提。別の場所なら `VRLEARN_ROOT` / `VRLEARN_WEB` を指定）。

1. Unity：`Tools/VRLearn/Web/Export Scene For Web` → `data/scene.json`（Unity のマテリアル、光と霧、信号、黒い壁、場面ごとの駐車車両とトラック）。
2. Blender：`Blender -b --factory-startup --python tools/export_models.py` → `data/models/*.glb`（VRLearn の生成スクリプトそのもので全モデルを作り、glb で書き出し。ブラウザ用のセダンと信号機を追加）。
3. `node tools/sync.mjs` → 配置（`layout.json`）、道路の当たり判定メッシュ（`road_tiles.json`）、地図、場面ファイル、テクスチャ、共通の場面モデル（`src/shared/scenario.js` ＝ Web エディタと同じもの）。

環境・場面・地図を変えたら 1〜3 をやり直します。`npm test` でロジックとデータを確認できます。

## 作り

| ファイル | 内容 |
| --- | --- |
| `src/app.js` | 画面の流れ（タイトル → 体験 → 接触 → リプレイ → 結果）、キー・VR ボタン |
| `src/world.js` | 街：`layout.json` の配置を InstancedMesh で描く（約 160 描画呼び出し）、Unity のマテリアル、空・光・影・霧 |
| `src/traffic.js` | 車の出現と動き（Unity 座標）：8 m/s² で巡航速度まで加速、トリガー、繰り返し、停止、接触判定 |
| `src/player.js` | 体験者：マウス＋キー／WebXR、透明な壁、地面の高さ。速さは Quest 版と同じ約 2.4 m/s |
| `src/ground.js` | 地面の高さ：Unity の道路の当たり判定（車道 0.01・歩道 0.41・坂）から |
| `src/analysis.js` | 記録（20 Hz・12 秒）と評価：車の方を見ていた時間、左右の確認（Unity と同じ角度と文章） |
| `src/replay.js`, `src/panel.js` | リプレイ（描画専用のコピー）と VR 用パネル |

座標：Unity（左手系）を three.js（右手系）に移すとき x を反転し、向き（yaw）の符号を反転します。モデルも同じ反転で書き出されるので一致します（`src/coords.js`）。シミュレーションはすべて Unity 座標で行い、描画のときだけ変換します。

## Unity 版との違い

- 組み込み 06〜08 のコードだけにある動き（速度超過で止まらない、側面衝突）、信号の切り替わり、前の車への追従はありません（場面ファイルにない動きは再現しません）。信号は表示だけです。
- 車は Unity のセダン（他社のモデルで再配布できない）の代わりに、同じ大きさの日本のセダンを使います。軽自動車とトラックは Unity と同じモデルです。
- CSV は書き出しません。音、自転車の見た目、雨・夜の設定はまだありません。
- 画面で見るのと VR で体験するのは別の刺激です。実験のデータとまぜないでください。

## ライセンス

three.js は MIT（`vendor/three/LICENSE`）。モデルは VRLearn の生成スクリプトで作ったもので、外部のモデルは含みません。
