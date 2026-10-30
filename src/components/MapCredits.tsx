import './map-credits.css';
/** Shared attribution for the scene and its editor; references do not load remote maps. */
export function MapCredits() {
  return <p className="help map-credits"><span>地図参照：</span><a href="https://maps.gsi.go.jp/development/ichiran.html">国土地理院</a><a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors（ODbL）</a><span>周辺の街の建物は実際の輪郭に、種類と面積から推定した高さを付けています。</span></p>;
}
