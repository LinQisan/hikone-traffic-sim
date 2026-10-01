// Deterministic inspection recording; not participant data.
export function replayReviewFrames(bicycle = false) {
  const impact = 4, carId = 5;
  const frames = Array.from({ length: 113 }, (_, i) => {
    const t = i / 20;
    return { t, head: bicycle ? { x: 32, z: 17.4 + Math.min(t, impact) * 2.4,
      yaw: Math.sin(Math.min(t, impact) * 1.8) * 48, rideYaw: 0 }
      : { x: 32, z: 23.8 + Math.min(t, impact) * 0.8,
        yaw: 180 + Math.sin(Math.min(t, impact) * 1.8) * 28 },
    cars: [{ id: carId, x: 11.55 + Math.min(t, impact) * 4.5, z: 27, yaw: 90, body: 'sedan', accident: true }] };
  });
  return { frames, impact, car: frames.find(frame => frame.t === impact).cars[0] };
}
