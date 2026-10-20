// Editor coordinates are the scenario's X/Z metres; Z increases toward the top of the plan.
export function toMapPixel(map, x, z) {
  return [(x - map.world.xMin) * map.pixelsPerMeter, (map.world.zMax - z) * map.pixelsPerMeter];
}

export function fromMapPixel(map, x, y) {
  return { x: map.world.xMin + x / map.pixelsPerMeter, z: map.world.zMax - y / map.pixelsPerMeter };
}

/** Register a sharper regional image in the overview's pixel coordinates. */
export function imagePlacement(map, region) {
  const [x, y] = toMapPixel(map, region.world.xMin, region.world.zMax);
  return { x, y, width: (region.world.xMax - region.world.xMin) * map.pixelsPerMeter,
    height: (region.world.zMax - region.world.zMin) * map.pixelsPerMeter };
}

export function containsPoint(map, point) {
  const { xMin, xMax, zMin, zMax } = map.world;
  return Number.isFinite(point.x) && Number.isFinite(point.z)
    && point.x >= xMin && point.x <= xMax && point.z >= zMin && point.z <= zMax;
}

export function coordinateText(point) {
  const value = v => (Math.abs(v) < 0.005 ? 0 : v).toFixed(2);
  return `x=${value(point.x)}, z=${value(point.z)} (m)`;
}

/** Only visible ticks are generated. Nice metre steps keep labels legible at every zoom. */
export function coordinateGrid(map, view, width, height) {
  const pixels = map.pixelsPerMeter * view.scale;
  const ideal = 80 / pixels, power = 10 ** Math.floor(Math.log10(ideal));
  const step = [1, 2, 5, 10].find(n => n * power >= ideal) * power;
  const a = fromMapPixel(map, -view.tx / view.scale, -view.ty / view.scale);
  const b = fromMapPixel(map, (width - view.tx) / view.scale, (height - view.ty) / view.scale);
  const ticks = (low, high, pixel) => {
    const result = [];
    for (let i = Math.ceil(low / step); i <= Math.floor(high / step); i++) {
      const value = Number((i * step).toPrecision(12));
      result.push({ value, pixel: pixel(value) });
    }
    return result;
  };
  return { step,
    x: ticks(Math.max(map.world.xMin, a.x), Math.min(map.world.xMax, b.x),
      x => toMapPixel(map, x, 0)[0] * view.scale + view.tx),
    z: ticks(Math.max(map.world.zMin, b.z), Math.min(map.world.zMax, a.z),
      z => toMapPixel(map, 0, z)[1] * view.scale + view.ty) };
}
