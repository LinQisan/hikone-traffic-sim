import test from 'node:test';
import assert from 'node:assert/strict';
import { StreetViewer, describeStreetPose, parseStreetPose } from '../src/three/camera/StreetViewer.ts';

const bounds = { xMin: -1060, zMin: -155, xMax: 420, zMax: 870 };

test('street view poses parse map metres and reject malformed or off-map input', () => {
  assert.deepEqual(parseStreetPose('-596.6,178,270', bounds), { x: -596.6, z: 178, heading: 270, pitch: 0, eye: 1.6 });
  assert.equal(parseStreetPose('-596.6,178,-90', bounds).heading, 270, 'heading wraps into 0–360');
  assert.equal(parseStreetPose('0,0,0,95,500', bounds).pitch, 80, 'pitch is clamped');
  assert.equal(parseStreetPose('0,0,0,0,500', bounds).eye, 120, 'eye height is clamped');
  for (const text of [null, '', 'x,1', '0', '500,0', '0,900', '1,2,north'])
    assert.equal(parseStreetPose(text, bounds), null, `rejects ${text}`);
});

test('held keys walk along the heading over the ground and stop at the map edge', () => {
  const window = new EventTarget(), element = new EventTarget();
  const original = globalThis.addEventListener;
  globalThis.addEventListener = window.addEventListener.bind(window);
  try {
    const viewer = new StreetViewer(Object.assign(element, { clientHeight: 600, setPointerCapture() {} }),
      { heightAt: (x) => x > 10 ? 4 : 0.15 }, bounds, new AbortController().signal);
    viewer.place({ x: 0, z: 0, heading: 90, pitch: 0, eye: 1.6 });
    const key = (type, code) => window.dispatchEvent(Object.assign(new Event(type), { code }));
    key('keydown', 'KeyW');
    assert.equal(viewer.update(1), true);
    assert.ok(Math.abs(viewer.pose.x - 4.5) < 1e-9 && Math.abs(viewer.pose.z) < 1e-9, 'heading 90 walks toward +X');
    viewer.update(2);
    assert.ok(Math.abs(viewer.camera.position.y - 5.6) < 1e-9, 'the eye follows the ground height');
    assert.ok(viewer.camera.position.x < 0, 'map +X is three.js -X');
    key('keyup', 'KeyW');
    assert.equal(viewer.update(1), false, 'no held key, no change');
    viewer.place({ x: 418, z: 0, heading: 90, pitch: 0, eye: 1.6 });
    key('keydown', 'ShiftLeft'); key('keydown', 'KeyW');
    viewer.update(1);
    assert.equal(viewer.pose.x, bounds.xMax, 'the view stays on the map');
    viewer.stop();
    assert.equal(viewer.update(1), false, 'a stopped viewer ignores held keys');
  } finally { globalThis.addEventListener = original; }
});

test('the copied view text reopens the same pose and names the real place', () => {
  const text = describeStreetPose({ x: 264, z: 237.256, heading: 38.4, pitch: -12.2, eye: 1.6 }, 'https://example.test/index.html');
  assert.match(text, /x=264, z=237\.26, 向き=38°/);
  assert.match(text, /緯度経度: 35\.272\d+, 136\.255\d+（真北からの方位 70°）/);
  const pose = parseStreetPose(text.split('?street=')[1], bounds);
  assert.deepEqual(pose, { x: 264, z: 237.26, heading: 38, pitch: -12, eye: 1.6 });
});
