#!/usr/bin/env node
// Review the independent source outlines against current layout, without map imagery.
// node tools/check_geographic_registration.mjs [output.svg] [baseline-placements.json]
import fs from 'node:fs';
import {geographicPoint,geographicLocation} from '../src/world/geography/coordinates.ts';
import {GEOGRAPHIC_REGISTRATION as registration} from '../src/world/generators/geographic-registration.js';
import {WEST_BUILDINGS,SCHOOL_VILLA,SCHOOL_TENNIS_COURTS,SCHOOL_LANES} from '../src/world/generators/university-layout.js';
import {CASTLE_SITE,CASTLE_BUILDINGS} from '../src/world/generators/castle-layout.js';

const models = [...WEST_BUILDINGS,{id:'school-villa',...SCHOOL_VILLA},
  ...SCHOOL_TENNIS_COURTS.map((footprint,i)=>({id:'tennis-'+(i+1),footprint}))];
const centre = ring => {
  let area=0,x=0,z=0;
  for(let i=0;i<ring.length;i++){
    const a=ring[i],b=ring[(i+1)%ring.length],v=a[0]*b[1]-b[0]*a[1];
    area+=v;x+=(a[0]+b[0])*v;z+=(a[1]+b[1])*v;
  }
  return [x/(3*area),z/(3*area)];
};
let failed=false;
for(const model of models){
  const feature=registration.features[model.id];
  const source=feature.geometryWgs84.coordinates[0].slice(0,-1).map(([lon,lat])=>geographicPoint(lat,lon));
  const a=centre(source),b=centre(model.footprint),distance=Math.hypot(a[0]-b[0],a[1]-b[1]);
  console.log(`${model.id}: source/model centroid ${distance.toFixed(2)} m; ${feature.source}`);
  if(distance>feature.placement.uncertaintyMetres){failed=true;console.error(`${model.id}: check the source registration`);}
}
if(process.argv[2]){
  const baseline=process.argv[3]?JSON.parse(fs.readFileSync(process.argv[3],'utf8')):null;
  const all=Object.values(registration.features).flatMap(f=>f.geometryWgs84.type==='Polygon'?f.geometryWgs84.coordinates[0]:f.geometryWgs84.coordinates);
  const lons=all.map(p=>p[0]),lats=all.map(p=>p[1]),lon0=Math.min(...lons),lat0=Math.max(...lats);
  const scale=111320*Math.cos(lat0*Math.PI/180),k=2;
  const width=(Math.max(...lons)-lon0)*scale*k+100,height=(lat0-Math.min(...lats))*111320*k+100;
  const pixel=([x,z])=>{const{lat,lon}=geographicLocation(x,z);return [50+(lon-lon0)*scale*k,50+(lat0-lat)*111320*k];};
  const points=ring=>ring.map(p=>pixel(p).map(v=>v.toFixed(2)).join(',')).join(' ');
  const svg=[`<svg xmlns="http://www.w3.org/2000/svg" width="${width.toFixed(0)}" height="${height.toFixed(0)}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#f7f8f9"/>`,
    '<style>text{font:11px sans-serif;fill:#27323d}polygon,polyline{stroke-linejoin:round}</style>',
    '<text x="20" y="18">North up. Source gray; current blue; previous red. Castle marks are model origins, not building footprints.</text>'];
  for(const f of Object.values(registration.features))if(f.geometryWgs84.type==='Polygon'){
    const p=f.geometryWgs84.coordinates[0].map(([lon,lat])=>geographicPoint(lat,lon));
    svg.push(`<polygon points="${points(p)}" fill="#d5d9dc" stroke="#88949e" stroke-width="1"/>`);
  }
  if(baseline)for(const model of baseline.university.schoolBuildings){
    if(registration.features[model.id])svg.push(`<polygon points="${points(model.footprint)}" fill="none" stroke="#ce5c5c" stroke-width="1.5"/>`);
  }
  for(const model of models){
    svg.push(`<polygon points="${points(model.footprint)}" fill="none" stroke="#265fac" stroke-width="1.5"/>`);
    const[x,y]=pixel(centre(model.footprint));svg.push(`<text x="${x}" y="${y}">${model.id}</text>`);
  }
  for(const line of SCHOOL_LANES)svg.push(`<polyline points="${points(line)}" fill="none" stroke="#27896b" stroke-width="4"/>`);
  for(const model of [{id:'keep',...CASTLE_SITE},...CASTLE_BUILDINGS])if(registration.features[model.id]){
    const[x,y]=pixel([model.x,model.z]);svg.push(`<circle cx="${x}" cy="${y}" r="4" fill="#265fac"/><text x="${x+7}" y="${y}">${model.id}</text>`);
  }
  svg.push(`<text x="20" y="${height-16}">Modified GSI optimal vector tiles / PDL 1.0; © OpenStreetMap contributors / ODbL 1.0. No WAGmap imagery.</text></svg>`);
  fs.writeFileSync(process.argv[2],svg.join('\n')+'\n');
}
if(failed)process.exitCode=1;
