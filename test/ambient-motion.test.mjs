import test from 'node:test';
import assert from 'node:assert/strict';
import { AmbientMotion } from '../src/ambient-motion.js';

test('ambient motion freezes in place for reduced motion and resumes without a jump', () => {
  const motion = new AmbientMotion(), uniform = motion.time;
  motion.advance(0.05);
  const phase = motion.time.value, angle = motion.skyAngle;
  assert.ok(phase > 0 && angle > 0);
  motion.setReducedMotion(true);
  for (let i = 0; i < 60; i++) motion.advance(1 / 60);
  assert.equal(motion.time.value, phase);
  assert.equal(motion.skyAngle, angle);
  motion.setReducedMotion(false);
  motion.advance(0.02);
  assert.equal(motion.time.value, phase + 0.02, 'continue from the same water/cloud phase');
  const resumed = motion.time.value;
  for (const elapsed of [0, -1, NaN, Infinity]) motion.advance(elapsed);
  assert.equal(motion.time.value, resumed, 'a hidden/invalid frame does not change the scene');
  motion.advance(60);
  assert.ok(motion.time.value - resumed <= 0.101, 'returning to a tab does not jump a minute ahead');
  assert.equal(motion.time, uniform, 'compiled shaders keep the same shared uniform');
});
