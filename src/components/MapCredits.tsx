import './map-credits.css';
/** Shared attribution for the scene and its editor; references do not load remote maps. */
export function MapCredits() {
  return <p className="help map-credits"><span>地図参照：</span><a href="https://github.com/gsi-cyberjapan/optimal_bvmap">国土地理院最適化ベクトルタイルを加工</a><a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors（ODbL）</a><span>建物の高さや屋根は推定を含みます。測量用の地図ではありません。</span></p>;
}
