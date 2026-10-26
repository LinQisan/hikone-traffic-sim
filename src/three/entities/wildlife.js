// Small painted silhouettes, instanced in four draws. Moving wildlife never enters sun shadows.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { painted } from '../materials/style.js';
import { toThree } from '../scene/coords.ts';
import { ambientMotion } from '../materials/ambient-motion.js';
import { packPigments } from '../scene/geometry-budget.js';
import { CROWS, WATER_BIRDS, WATER_LEVEL, birdPose } from '../../world/generators/wildlife-layout.js';

const pigment = {
  crow: '#222736', feather: '#364352', black: '#151c25', duck: '#84705a',
  wing: '#827e70', green: '#244d40', blue: '#435e91', cream: '#e4dfcd',
  bill: '#b9aa4c', swan: '#e3e1d7', light: '#f5f0e4', orange: '#d68a4e',
  grey: '#b2b1a4', chestnut: '#77513d', covert: '#c9c8ba', shaft: '#aaa99b',
  wingLight: '#999789',
};
function tint(geometry, colour, side = 0) {
  geometry.deleteAttribute('uv');
  const rgb = new THREE.Color(colour), p = geometry.getAttribute('position');
  const colors = new Float32Array(p.count * 3), wings = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    const light = .94 + .06 * Math.sin(p.getX(i) * 23 + p.getY(i) * 17 + p.getZ(i) * 13);
    colors[i * 3] = rgb.r * light; colors[i * 3 + 1] = rgb.g * light; colors[i * 3 + 2] = rgb.b * light;
    wings[i] = side;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('wingSide', new THREE.BufferAttribute(wings, 1));
  return geometry;
}
function birdGeometry(species) {
  const parts = [];
  const waterfowl = species !== 'crow';
  const add = (g, c, p = [0,0,0], rotation = [0,0,0]) => {
    g.rotateX(rotation[0]); g.rotateY(rotation[1]); g.rotateZ(rotation[2]);
    g.translate(...p); parts.push(tint(g, pigment[c])); return g;
  };
  const oval = (p, s, c, rotation = [0,0,0]) => {
    const small = Math.max(...s) < .03;
    const g = new THREE.SphereGeometry(1, waterfowl ? (small ? 8 : 16) : 10, waterfowl ? (small ? 6 : 10) : 6);
    g.scale(...s); return add(g, c, p, rotation);
  };
  const beak = (p, s, c) => oval(p, s, c);
  const eyes = (y, z, spread, radius) => {
    for (const side of [-1, 1]) {
      oval([side * spread, y, z], [radius * .55, radius, radius], 'black');
      if (waterfowl) oval([side * (spread + radius * .45), y + radius * .25, z + radius * .25],
        [radius * .16, radius * .22, radius * .22], 'light');
    }
  };
  // A longitudinal hull with smooth section changes replaces the detached spherical torso.
  const hull = (profile, colour, rings = 20, sides = 14) => {
    const p = [], indices = [], last = profile.length - 1;
    const sample = (t, column) => {
      const k = Math.min(last - 1, Math.floor(t)), u = t - k;
      const a = profile[Math.max(0,k-1)][column], b = profile[k][column];
      const c = profile[k+1][column], d = profile[Math.min(last,k+2)][column];
      return .5 * ((2*b) + (-a+c)*u + (2*a-5*b+4*c-d)*u*u + (-a+3*b-3*c+d)*u*u*u);
    };
    for (let i = 0; i <= rings; i++) for (let j = 0; j < sides; j++) {
      const t = i / rings * last, a = j / sides * Math.PI * 2;
      p.push(Math.cos(a) * Math.max(.001, sample(t,1)),
        sample(t,3) + Math.sin(a) * Math.max(.001, sample(t,2)), sample(t,0));
    }
    for (let i = 0; i < rings; i++) for (let j = 0; j < sides; j++) {
      const a = i * sides + j, b = i * sides + (j+1)%sides, c = a+sides, d = b+sides;
      indices.push(a,b,c,b,d,c);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
    g.setIndex(indices); g.computeVertexNormals(); add(g, colour); return g;
  };
  // Radius tapers along a curved centreline, broad where neck feathers meet the breast.
  const neck = (points, radii, colour, segments = 28) => {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
    const g = new THREE.TubeGeometry(curve, segments, 1, 10, false), p = g.attributes.position;
    const centre = new THREE.Vector3();
    for (let i = 0; i <= segments; i++) {
      curve.getPointAt(i/segments,centre);
      const t = i / segments * (radii.length-1), k = Math.min(radii.length-2,Math.floor(t));
      const r = radii[k] + (radii[k+1]-radii[k])*(t-k);
      for (let j = 0; j <= 10; j++) {
        const at = i * 11 + j;
        p.setXYZ(at, centre.x+(p.getX(at)-centre.x)*r, centre.y+(p.getY(at)-centre.y)*r,
          centre.z+(p.getZ(at)-centre.z)*r);
      }
    }
    g.computeVertexNormals(); add(g,colour); return g;
  };
  const feather = (position, length, width, colour, rotation = [0,0,0]) => {
    const g = hull([[-length/2,.001,.001,0],[-length*.30,width*.60,.008,0],
      [0,width,.014,0],[length*.31,width*.70,.012,0],[length/2,.002,.002,0]],colour,8,8);
    // hull() already adds its paint. Transform positions and normals together afterwards.
    g.rotateX(rotation[0]); g.rotateY(rotation[1]); g.rotateZ(rotation[2]); g.translate(...position);
  };
  if (species === 'crow') {
    oval([0, .06, -.03], [.105, .105, .25], 'crow');
    oval([0, .13, .22], [.085, .085, .105], 'crow');
    beak([0, .12, .34], [.04, .035, .105], 'black');
    oval([0, .045, -.29], [.11, .025, .19], 'feather');
    eyes(.16, .265, .072, .012);
    for (const side of [-1, 1]) {
      const shape = new THREE.Shape();
      shape.moveTo(.055, -.14); shape.lineTo(.23, -.21); shape.lineTo(.5, -.2);
      // Separated primary tips keep the silhouette recognisably corvid rather than a gull V.
      for (let i = 0; i < 5; i++) {
        shape.lineTo(.59 - i * .025, -.14 + i * .066);
        shape.lineTo(.46 - i * .018, -.11 + i * .066);
      }
      shape.lineTo(.17, .15); shape.lineTo(.055, .12); shape.closePath();
      const g = new THREE.ExtrudeGeometry(shape, { depth: .022, bevelEnabled: false, curveSegments: 1 });
      g.rotateX(Math.PI / 2); g.translate(0, .075, 0);
      if (side < 0) g.rotateZ(Math.PI); // Mirror the span without a negative instance determinant.
      if (side < 0) g.translate(0, .15, 0);
      parts.push(tint(g, pigment.feather, side));
    }
  } else {
    const swan = species === 'swan';
    const body = hull(swan ? [[-.85,.005,.014,.21],[-.66,.14,.13,.17],[-.40,.28,.24,.18],
      [-.04,.33,.28,.19],[.25,.27,.25,.20],[.43,.17,.19,.25],[.50,.001,.001,.31]]
      : [[-.38,.003,.014,.15],[-.29,.085,.07,.14],[-.16,.144,.12,.13],
        [.02,.158,.14,.14],[.16,.13,.13,.16],[.24,.07,.09,.20],[.26,.006,.025,.23]],
      swan ? 'swan' : 'grey');
    if (!swan) {
      const p = body.attributes.position, colours = body.attributes.color;
      const chest = new THREE.Color(pigment.chestnut);
      for (let i = 0; i < p.count; i++) {
        const amount = THREE.MathUtils.smoothstep(p.getZ(i), .04, .18);
        colours.setXYZ(i, colours.getX(i)*(1-amount)+chest.r*amount,
          colours.getY(i)*(1-amount)+chest.g*amount, colours.getZ(i)*(1-amount)+chest.b*amount);
      }
    }
    for (const side of [-1, 1]) {
      const wing = hull(swan ? [[-.68,.003,.004,.26],[-.46,.067,.10,.33],[-.16,.105,.16,.36],
        [.12,.078,.105,.32],[.24,.008,.01,.28]]
        : [[-.34,.002,.003,.15],[-.22,.031,.045,.20],[-.06,.044,.075,.205],
          [.08,.028,.048,.20],[.14,.003,.004,.18]], swan ? 'light' : 'wing',16,12);
      wing.translate(side*(swan ? .23 : .121),0,0);
      const count = swan ? 9 : 7;
      for (let j = 0; j < count; j++) {
        const t = j/(count-1), curve = Math.sin(t*Math.PI);
        feather([side*(swan ? .29+curve*.05 : .144+curve*.02), swan ? .30+curve*.13 : .19+curve*.05,
          swan ? -.50+t*.62 : -.28+t*.36], swan ? .34-t*.14 : .17-t*.06,
        swan ? .038 : .016, swan ? (j%3 ? 'light' : 'covert') : (j%2 ? 'wing' : 'wingLight'),
        [swan ? -.08 : -.03,side*(.15+t*.13),-side*(swan ? 1.1 : .8)]);
      }
      if (!swan) {
        // White borders enclose the small blue speculum on the folded outer wing.
        feather([side*.170,.206,-.16],.14,.027,'cream',[0,side*.1,-side*1.0]);
        feather([side*.176,.208,-.16],.115,.018,'blue',[0,side*.1,-side*1.0]);
      }
    }
    if (swan) {
      neck([[0,.27,.37],[0,.50,.29],[0,.84,.19],[0,1.12,.29],[0,1.30,.49],[0,1.28,.64],[0,1.20,.71]],
        [.115,.095,.066,.052,.053,.065], 'light');
      oval([0,1.225,.725],[.073,.084,.135],'light',[-.13,0,0]);
      for (const side of [-1,1]) oval([side*.050,1.214,.801],[.016,.038,.065],'black',[-.18,0,0]);
      hull([[.80,.042,.029,1.196],[.85,.047,.030,1.182],[.94,.032,.020,1.146],
        [.98,.011,.011,1.139]],'orange',10,10);
      oval([0,1.145,.975],[.022,.014,.020],'black');
      oval([0,1.238,.824],[.038,.034,.035],'black');
      eyes(1.252,.777,.062,.010);
      for (const side of [-1,1]) oval([side*.024,1.193,.894],[.004,.003,.009],'black');
    } else {
      const lowerNeck = neck([[0,.19,.17],[0,.265,.20],[0,.335,.23],[0,.385,.265]], [.079,.065,.057,.062], 'green',16);
      const p = lowerNeck.attributes.position, colours = lowerNeck.attributes.color;
      const breast = new THREE.Color(pigment.chestnut);
      for (let i=0;i<p.count;i++) {
        const amount = 1-THREE.MathUtils.smoothstep(p.getY(i),.25,.27);
        colours.setXYZ(i,colours.getX(i)*(1-amount)+breast.r*amount,
          colours.getY(i)*(1-amount)+breast.g*amount,colours.getZ(i)*(1-amount)+breast.b*amount);
      }
      oval([0,.388,.283],[.077,.082,.102],'green',[-.16,0,0]);
      // A thin collar follows the neck instead of a large white ball under the head.
      add(new THREE.TorusGeometry(.073,.004,6,20),'cream',[0,.265,.203],[Math.PI/2+.25,0,0]);
      hull([[.35,.043,.021,.367],[.40,.062,.016,.356],[.47,.053,.012,.348],
        [.50,.014,.007,.350]],'bill',10,12);
      oval([0,.349,.495],[.019,.007,.010],'black');
      eyes(.413,.325,.067,.009);
      for (const side of [-1,1]) oval([side*.022,.371,.414],[.004,.0025,.008],'black');
      const curl = new THREE.CatmullRomCurve3([[0,.205,-.28],[0,.217,-.325],[0,.236,-.35],
        [0,.227,-.37],[0,.218,-.35]].map(p=>new THREE.Vector3(...p)));
      add(new THREE.TubeGeometry(curl,12,.004,6,false),'black');
    }
  }
  // Preserve shared waterfowl vertices: feather detail must not triple attribute storage.
  const inputs = waterfowl ? parts : parts.map(g => g.index ? g.toNonIndexed() : g);
  const geometry = mergeGeometries(inputs);
  for (const g of new Set([...parts, ...inputs])) g.dispose();
  geometry.computeBoundingSphere();
  if (waterfowl) geometry.deleteAttribute('wingSide');
  return packPigments(geometry);
}

function rippleGeometry() {
  const positions = [], alpha = [], indices = [], segments = 40;
  for (let j = 0; j < 3; j++) for (let i = 0; i <= segments; i++) {
    const a = i / segments * Math.PI * 2, r = .97 + j * .03;
    positions.push(Math.cos(a) * r, 0, Math.sin(a) * r);
    alpha.push(j === 1 ? 1 : 0);
  }
  for (let j = 0; j < 2; j++) for (let i = 0; i < segments; i++) {
    const a = j * (segments + 1) + i, b = a + segments + 1;
    indices.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('edgeAlpha', new THREE.Float32BufferAttribute(alpha, 1));
  g.setIndex(indices); g.computeVertexNormals();
  return g;
}

function routeBounds(mesh, routes, padding) {
  const box = new THREE.Box3(), point = new THREE.Vector3(), pose = {};
  for (const r of routes) {
    if (r.from) { box.expandByPoint(toThree(...r.from,point)); box.expandByPoint(toThree(...r.to,point)); continue; }
    for (let i = 0; i < 64; i++) {
      birdPose(r, i / 64 * Math.PI * 2 / r.speed, pose);
      box.expandByPoint(toThree(pose.x, pose.y, pose.z, point));
    }
  }
  box.expandByScalar(padding);
  mesh.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
}

export function buildWildlife(scene) {
  const root = new THREE.Group(); root.name = 'Painted wildlife';
  const material = painted(new THREE.MeshLambertMaterial({ name: 'ART_Wildlife', color: 0xffffff,
    vertexColors: true, side: THREE.DoubleSide }));
  const crowMaterial = material.clone(), compile = material.onBeforeCompile;
  crowMaterial.onBeforeCompile = shader => {
    compile(shader);
    shader.uniforms.birdTime = ambientMotion.time;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
      uniform float birdTime;
      attribute float wingSide;
      attribute float instancePhase;
      mat2 wingRotation(float side) {
        float flap = sin(birdTime * 8.2 + instancePhase) * .58
          * smoothstep(-.3, .4, sin(birdTime * .55 + instancePhase)) + .12;
        float a = side * flap;
        return mat2(cos(a), sin(a), -sin(a), cos(a));
      }`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        if (abs(wingSide) > .5) objectNormal.xy = wingRotation(wingSide) * objectNormal.xy;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        if (abs(wingSide) > .5) {
          vec2 hinge = vec2(wingSide * .055, .075);
          transformed.xy = wingRotation(wingSide) * (transformed.xy - hinge) + hinge;
        }`);
  };
  crowMaterial.customProgramCacheKey = () => 'hk-crow-flap-v1';
  const routes = { crow: CROWS, duck: WATER_BIRDS.filter(r => r.species === 'duck'),
    swan: WATER_BIRDS.filter(r => r.species === 'swan') };
  const birds = Object.entries(routes).map(([species, paths]) => {
    const g = birdGeometry(species);
    if (species === 'crow') g.setAttribute('instancePhase', new THREE.InstancedBufferAttribute(
      new Float32Array(paths.map(r => r.wingPhase)), 1));
    const mesh = new THREE.InstancedMesh(g, species === 'crow' ? crowMaterial : material, paths.length);
    mesh.name = species; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    routeBounds(mesh, paths, 2); root.add(mesh);
    return { mesh, paths, species };
  });
  const rings = rippleGeometry(), fade = new THREE.InstancedBufferAttribute(new Float32Array(WATER_BIRDS.length * 3), 1);
  fade.setUsage(THREE.DynamicDrawUsage); rings.setAttribute('instanceOpacity', fade);
  const rippleMaterial = new THREE.MeshBasicMaterial({ color: '#d4dfcc', transparent: true,
    opacity: .42, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true });
  rippleMaterial.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
      attribute float edgeAlpha;
      attribute float instanceOpacity;
      varying float rippleAlpha;`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n rippleAlpha = edgeAlpha * instanceOpacity;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\n varying float rippleAlpha;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.a *= rippleAlpha;');
  };
  rippleMaterial.customProgramCacheKey = () => 'hk-bird-ripple-v1';
  const ripples = new THREE.InstancedMesh(rings, rippleMaterial, fade.count);
  ripples.name = 'Swimming wakes'; ripples.renderOrder = 1;
  ripples.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  routeBounds(ripples, WATER_BIRDS, 3); root.add(ripples); scene.add(root);
  const dummy = new THREE.Object3D(), pose = {};
  let previousTime = -Infinity;
  const wildlife = { root, birds, ripples,
    update(time) {
      if (!root.visible || time === previousTime) return;
      previousTime = time;
      for (const { mesh, paths, species } of birds) {
        for (let i = 0; i < paths.length; i++) {
          const r = paths[i]; birdPose(r, time, pose);
          toThree(pose.x, pose.y, pose.z, dummy.position);
          dummy.position.y += species === 'crow' ? 0 : Math.sin(time * 1.8 + r.phase) * .012;
          dummy.rotation.set(0, -pose.yaw, 0);
          dummy.scale.setScalar(r.size * pose.visibility); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
      }
      for (let i = 0; i < WATER_BIRDS.length; i++) for (let j = 0; j < 3; j++) {
        const r = WATER_BIRDS[i], age = ((time + r.phase + j * 1.5) % 4.5 + 4.5) % 4.5;
        // Emit at the bird's historical position, so the trail stays behind as it swims away.
        birdPose(r, time - age, pose);
        toThree(pose.x, WATER_LEVEL + .012, pose.z, dummy.position);
        dummy.rotation.set(0, -pose.yaw, 0);
        const radius = (r.species === 'swan' ? .38 : .2) + age * .24;
        dummy.scale.set(radius, 1, radius * .76); dummy.updateMatrix();
        const k = i * 3 + j; ripples.setMatrixAt(k, dummy.matrix);
        fade.setX(k, Math.sin(Math.PI * age / 4.5) * .85);
      }
      ripples.instanceMatrix.needsUpdate = true; fade.needsUpdate = true;
    },
  };
  wildlife.update(ambientMotion.time.value);
  return wildlife;
}
