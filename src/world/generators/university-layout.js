// Google satellite outlines reviewed 2026-10-19, registered to the existing Kyobashi plan.
// The university's campus map supplies building identities; dimensions/heights are approximate.
// Map images are references only and are not included in the shipped scene.
import { geographicPoint, westernOutline, CASTLE_WEST_BANK } from './castle-layout.js';
import { INNER_MOAT_OUTER, INNER_MOAT_INNER, INNER_MOAT_ROAD } from './castle-approach.js';
import { inEastExtension } from './east-layout.ts';
import FIELD_PHOTOS from '../../../world/field-observations.json' with {type:'json'};

export const UNIVERSITY_REFERENCES = [
  'https://www.google.com/maps/@?api=1&map_action=map&center=35.27765,136.24650&zoom=18&basemap=satellite',
  'https://www.google.com/maps/@?api=1&map_action=map&center=35.2782,136.2465&zoom=19&basemap=satellite',
  'https://www.google.com/maps/@?api=1&map_action=map&center=35.2769,136.2465&zoom=19&basemap=satellite',
  'https://www.google.com/maps/@?api=1&map_action=map&center=35.27725,136.2449&zoom=19&basemap=satellite',
  'https://www.shiga-u.ac.jp/information/campus-access/campusmap/',
  'https://www.google.com/maps/@?api=1&map_action=pano&pano=oSBsIlmcNwwIajIeCcCoSA&heading=300',
  'https://www.shiga-u.ac.jp/wp/wp-content/uploads/CMP2022.pdf',
  'https://www.google.com/maps/@?api=1&map_action=map&center=35.27725,136.24565&zoom=20&basemap=satellite',
  'https://www.google.com/maps/@?api=1&map_action=pano&pano=woO9EKoy96wN4PjoMCIBSg&heading=82',
  'https://www.google.com/maps/@?api=1&map_action=pano&pano=WZ1jdlBeFlTpImMIWKD36g&heading=40',
  'https://www.google.com/maps/@?api=1&map_action=pano&pano=jfK2aVA5I6pPr6QmspUkIA&heading=59',
  'https://www.google.com/maps/@?api=1&map_action=map&center=35.2772,136.2487&zoom=18&basemap=satellite',
  'https://www.city.hikone.lg.jp/kakuka/toshi_seisaku/15/4/3/4217.html',
];
function trace(points, lat = 35.27765, lon = 136.24650, zoom = 18) {
  const m = 156543.03392 * Math.cos(lat * Math.PI / 180) / 2 ** zoom;
  return points.map(([x, y]) => geographicPoint(lat + (341 - y) * m / 111320,
    lon + (x - 244) * m / (111320 * Math.cos(lat * Math.PI / 180))))
    .map(p => p.map(v => +v.toFixed(5)));
}
const wide = p => trace(p, 35.2785, 136.2484, 17);
const north = p => trace(p, 35.27955, 136.24805);
const sports = p => trace(p, 35.2811, 136.2490);
const street = p => trace(p, 35.2747, 136.2496, 17);
// North-up Maps viewport: 1536 × 848, with the actual map centre at (768,424).
// Keep each roof trace tied to its own geographic view. The earlier small-view
// outlines did not follow the long-wing axes visible in the reviewed aerial.
function aerial(points, lat=35.2782, lon=136.2465, zoom=19) {
  const m=156543.03392*Math.cos(lat*Math.PI/180)/2**zoom;
  return points.map(([x,y])=>geographicPoint(lat+(424-y)*m/111320,
    lon+(x-768)*m/(111320*Math.cos(lat*Math.PI/180))));
}
const south = p => aerial(p,35.2769);
const westStreetView = p => aerial(p,35.27725,136.2449);
const westGateView = p => aerial(p,35.27725,136.24565,20);
// The school-side lot and November 2022 panorama share this wider aerial registration.
const schoolView = p => aerial(p,35.2772,136.2487,18);
function building(id, name, footprint, height, roof = 'flat', rise = 0) {
  return { id, name, footprint, height, roof, rise };
}
const b = (id, name, points, height, roof = 'flat', rise = 0) =>
  building(id, name, trace(points), height, roof, rise);

export const UNIVERSITY_BUILDINGS = [
  // Roof envelopes include eaves; the heritage register's 679 m² is building area.
  // OSM way 380034661; its east gable faces the main gate in the owner's photos (2026-10-29).
  building('auditorium', 'Shiga University auditorium', [[-670.9,216.8],[-623.2,212.2],[-624.6,196.8],[-672.5,201.3]],8.4,'copper',5.8),
  building('auditorium-annex', 'Auditorium single-storey classroom', [[-675.9,217.3],[-670.9,216.8],[-672.5,201.3],[-677.5,201.8]],4,'metal',2.2),
  building('administration','University administration',south([[741,195],[650,322],[721,373],[812,246]]),9.6),
  building('archives','Faculty of Economics archives',westGateView([[1140,235],[1012,399],[1102,464],[1230,300]]),6.6,'tile',2.5),
  building('shikon','Shikon Shosai Kan',westGateView([[1320,-70],[1126,212],[1212,275],[1406,-7]]),10,'tile',2),
  building('health','Health administration wing',south([[800,85],[752,151],[823,201],[871,135]]),6.5),
  building('lecture-west','Main classroom west connector',aerial([[789,503],[748,559],[776,579],[817,523]]),18.5),
  building('lecture-north','Existing north lecture wing',aerial([[964,365],[1110,470],[1085,505],[939,400]]),9.5,'metal',2.4),
  building('lecture-east','Main classroom east wing',aerial([[1027,448],[870,623],[904,647],[1061,472]]),18.5),
  building('lecture-south','Main classroom south wing',aerial([[774,523],[947,648],[921,684],[748,559]]),18.5),
  building('research','Research and admissions building',aerial([[814,302],[641,536],[671,557],[844,323]]),21),
  building('library-north','University library north wing',aerial([[541,510],[657,593],[625,638],[509,555]]),10.2),
  building('library-west','University library west wing',aerial([[509,555],[625,638],[534,765],[418,682]]),10.2),
  building('ryosui','Ryosui Kaikan alumni hall',westGateView([[852,187],[693,405],[778,465],[937,247]]),6.1,'red',1.8),
  building('ds','Data Science building',aerial([[879,115],[978,185],[926,255],[827,185]]),14),
  building('initiative','Initiative building',aerial([[863,252],[915,291],[861,365],[809,326]]),10.2),
  b('second-classroom','Second classroom building',[[219,104],[251,127],[235,150],[203,127]],10.2),
  building('gym', 'FAS Arena gymnasium', north([[75,417],[174,488],[123,556],[24,485]]), 9.5, 'metal', 2.4),
  building('coop', 'University co-op and cafeteria', north([[171,493],[211,522],[174,572],[134,543]]), 6.8),
  building('clubs', 'Student activity facilities', north([[148,411],[246,482],[230,505],[132,434]]), 5.0, 'metal', 1.0),
  // Two-storey prefabricated site office behind the north gate wall, photographed 2026-10-29.
  // Photo-relative envelope: north of the hall's front sight line (0852/0853),
  // inside the OSM campus corner. No surveyed dimensions for this temporary structure.
  building('site-office', 'Temporary two-storey site office', [[-601,214.5],[-601,208.5],[-617,208.5],[-617,214.5]], 6.0),
];

// The main gate stands at the roadside where OSM driveway 380034677 crosses the campus
// boundary (way 180830880). The owner's photos of 2026-10-29 (IMG_0852–0854) show no
// forecourt between the moat-side street and the gate; the earlier Maps label pin lay 15 m inside.
export const UNIVERSITY_GATE = [-596.6,178.0];
const w = westernOutline;
// The southeast turn previously cut through the photographed office plot. Keep the
// southern bank corner on OSM campus way 180830880 (reviewed 2026-10-29), then join
// the existing aerial trace north of the local photo area.
export const CAMPUS_BANK = [
  ...[[35.2766649,136.2477023],[35.2771547,136.2469277],[35.2772126,136.2469392]]
    .map(([lat,lon])=>geographicPoint(lat,lon)),
  ...w([[616,422],[660,351],[698,288],[721,254],[733,233],[716,209],[690,190]]),
];
// One continuous school-side middle-moat bank, including the tennis peninsula.
// The former polygon ended at the bridge and cut diagonally across the southern lots.
export const SCHOOL_BANK = [[-220,84],...schoolView([[969,1065],[890,1005],[829,940],
  [784,875],[771,827],[736,800],[683,780],[645,751],[621,722],[620,688],
  [642,649],[667,616],[682,580],[666,560],[638,546],[619,541],
  [612,510],[597,496],[585,485],[566,472],[549,452],[537,429],[535,408],
  [550,382],[569,347],[589,316],[620,270],[650,222],[686,162],[721,103],
  [749,51],[777,2],[810,-47],[842,-89],[863,-121],[842,-149],[826,-164]])];
export const UNIVERSITY_LAND = [...w([[409,457],[650,174],[690,190]]),
  ...[...CAMPUS_BANK].reverse().slice(1),UNIVERSITY_GATE,...w([[566,542],[480,511]])];
// The built-up street block southwest of the gate is dry land, not a continuation
// of the moat ribbon around Route 25's bend. Its north edge meets the campus frontage.
export const UNIVERSITY_TOWN_BLOCK = w([[409,457],[480,511],[566,542],[612,570],
  [633,575],[608,620],[592,644],[470,550]]);
export const UNIVERSITY_GATE_LANDING = w([[612,570],[633,575],[650,534],[633,545]]);
export const UNIVERSITY_FORECOURT = w([[545,504]])[0];
export const UNIVERSITY_AXIS = [UNIVERSITY_GATE,[-606.1,178.8],...w([[599,560],[562,540],[544,530],
  [534,521],[529,512],[529,503],[534,492],[546,488],[558,493]])];
export const UNIVERSITY_PATHS = [
  UNIVERSITY_AXIS,
  w([[558,493],[565,480],[567,462],[552,443],[530,428],[514,414]]),
  w([[514,414],[505,409],[526,380],[555,341],[592,288]]),
  w([[434,446],[454,420],[490,368],[535,306],[588,232]]),
  [...north([[164,234],[211,312],[247,362]]),...sports([[122,402],[146,359]])],
];
export const WEST_ROUTE = [[-220,26],[-244,26],...street([[244,429],[151,357],[126,317],[73,269],[12,219]]),
  ...westStreetView([[1213,850],[997,691],[785,538],[590,400]])];
// The western public street meets Route 25 at its own junction, northwest of the gate.
export const UNIVERSITY_WEST_LANE = [WEST_ROUTE.at(-1),...westStreetView([[665,333],[749,269],[844,143],[942,9]]),
  ...aerial([[515,214],[675,0],[950,-350],[1170,-640]]),...sports([[122,402],[293,210],[378,111]])];
export const UNIVERSITY_WEST_GATE = geographicPoint(35.277126,136.245686);
export const UNIVERSITY_WEST_ENTRY = [...south([[450,351]]),UNIVERSITY_WEST_GATE,
  ...south([[488,292],[607,379],[742,424]]),UNIVERSITY_AXIS[3]];
UNIVERSITY_PATHS.push(UNIVERSITY_WEST_ENTRY);
// Ship a continuous street from Route 25 through the Funamachiguchi neck to the
// existing inner-moat road. Its centreline is also the bridge deck's authoritative cut.
export const CASTLE_CAMPUS_LINK = [WEST_ROUTE[6],...w([[608,610],[633,575]]),
  ...schoolView([[583,571],[610,532],[640,505],[682,532],[736,565],[821,638],[908,712]]),INNER_MOAT_ROAD[0]];
// 0855–0861 locate the actual stone-lined turn; OSM 121393441 supplies its vertices.
// Retain the public road endpoints and shared school branch vertex ownership.
const schoolRoad = FIELD_PHOTOS.schoolRoad.points;
CASTLE_CAMPUS_LINK.splice(4,4,schoolRoad.at(-1),schoolRoad.at(-2),schoolRoad.at(-3),schoolRoad.at(-4));
for (const i of [8,9]) {
  const x=CASTLE_CAMPUS_LINK[i][0],a=schoolRoad.at(-4),b=schoolRoad.at(-5);
  CASTLE_CAMPUS_LINK[i]=[x,a[1]+(b[1]-a[1])*(x-a[0])/(b[0]-a[0])];
}
export const SCHOOL_GATE_ENTRY = [schoolRoad.at(-2),[-587.0,263.2]];
// The narrow frontage lane is separate from Route 25 and joins the moat-side street.
// Share the exact junction vertex: independent viewport traces differed by 9 cm,
// leaving a tiny unmatched cap in the exported walking-surface partition.
// It meets the moat-side street at the real lane mouth (OSM way 122757607), south of the campus corner.
export const UNIVERSITY_FRONT_LANE = [...westStreetView([[749,269],[901,374],[1047,510]]),...south([[473,386],[650,512],[836,643]]),[-616.8,141.2],CASTLE_CAMPUS_LINK[1]];
export const UNIVERSITY_ENTRANCE = [CASTLE_CAMPUS_LINK[2],UNIVERSITY_GATE,UNIVERSITY_AXIS[1]];
// A low pierced concrete wall encloses the street frontage. The gate opening splits
// it into two runs; the eastern edge changes to a slim timber/metal palisade by the moat.
const gateLength = Math.hypot(UNIVERSITY_AXIS[1][0]-UNIVERSITY_GATE[0],UNIVERSITY_AXIS[1][1]-UNIVERSITY_GATE[1]);
const gateTangent = [-(UNIVERSITY_AXIS[1][1]-UNIVERSITY_GATE[1])/gateLength,
  (UNIVERSITY_AXIS[1][0]-UNIVERSITY_GATE[0])/gateLength];
const gateEdge = side => UNIVERSITY_GATE.map((v,i)=>v+gateTangent[i]*side*4.3);
const westTangent = (() => {
  const [a,b]=south([[450,319],[550,390]]),length=Math.hypot(b[0]-a[0],b[1]-a[1]);
  return [(b[0]-a[0])/length,(b[1]-a[1])/length];
})();
const westEdge = side => UNIVERSITY_WEST_GATE.map((v,i)=>v+westTangent[i]*side*2.1);
// The gatekeeper room (OSM way 1409173495) stands just inside, south of the gate opening.
// The same footprint is used for baking and camera collision.
export const UNIVERSITY_GATEHOUSE = {id:'gatehouse',name:'Main gatekeeper room',height:4,
  footprint:[[-601.6,173.4],[-602.4,164.6],[-609.6,164.4],[-608.9,173.6]]};
// At the moat-side street (photos IMG_0849/0853): a granite post-and-rail balustrade with a
// clipped hedge south of the gate, and a concrete wall topped by a palisade north of it.
export const UNIVERSITY_BOUNDARY = [
  {kind:'wall',points:[...westStreetView([[784,264],[912,348]]),westEdge(-1)]},
  {kind:'wall',points:[westEdge(1),...south([[570,398],[660,463],[778,548],[889,628],[993,697]]),[-620.3,144.3],[-597.6,143.0]]},
  {kind:'balustrade',points:[[-597.6,143.0],[-596.8,145.6],gateEdge(1)]},
  {kind:'palisadeWall',points:[gateEdge(-1),CAMPUS_BANK[0]]},
  {kind:'palisade',points:CAMPUS_BANK},
  {kind:'fence',points:[...westStreetView([[784,264],[864,157],[962,23]]),...aerial([[535,229],[695,15],[970,-335]]),...w([[650,174],[690,190]])]},
];
// Visible roof envelopes in the small block between the two public streets.
// These are anonymous contextual buildings, with no inferred business interiors.
export const UNIVERSITY_NEIGHBORS = [
  [[432,374],[510,420],[467,490],[389,444]],
  [[506,465],[577,516],[529,580],[458,529]],
  [[576,512],[649,560],[602,625],[529,577]],
  [[626,583],[684,623],[638,687],[580,647]],
  [[706,611],[767,655],[709,733],[648,689]],
  [[831,546],[906,599],[860,662],[785,610]],
  [[200,210],[277,264],[229,331],[152,277]],
  [[276,282],[344,331],[292,403],[224,354]],
  [[330,356],[397,405],[353,466],[286,417]],
].map((p,i)=>building('frontage-'+i,'Campus street frontage',westGateView(p),
  i===5?5.7:5.2,'tile',1.4)).filter(item=>{
  // Mapped footprints replace these placeholders outside the retained campus (docs/geography.md).
  const [x,z]=item.footprint.reduce(([sx,sz],[px,pz])=>[sx+px/4,sz+pz/4],[0,0]);
  return !inEastExtension(x,z);
});
export const UNIVERSITY_PAVING = [
  south([[574,347],[655,404],[1029,666],[996,713],[606,433],[563,400]]),
  aerial([[510,471],[658,272],[785,211],[830,247],[775,335],[674,376],[588,500]]),
  westGateView([[369,184],[488,268],[653,391],[616,440],[327,232]]),
];
export const UNIVERSITY_PARKING = [
  south([[666,432],[985,659]]), aerial([[586,363],[741,154]]),
];
// Main-gate frontage from the owner's photos (IMG_0847–0854, 2026-10-29) and OSM nodes:
// the moat promenade's stone bollards (barrier way 1449647550), benches and map board,
// the old cylinder post box outside the south gate post and the gate's tall conifers.
export const UNIVERSITY_GATE_DETAIL = {
  postbox:[-595.0,172.4],
  hedge:[[-598.3,146.2],[-597.6,172.4]],
  sliding:[[-597.4,174.2],[-601.4,174.6]],
  // Photo-relative placement estimates: cypress by the southern wall and spreading
  // conifers behind the gatekeeper. Keep the photographed view to the hall unobstructed.
  trees:[
    {point:[-600.2,160.5],height:13,spread:1.65,form:'columnar'},
    {point:[-603.0,155.8],height:14.5,spread:1.8,form:'columnar'},
    {point:[-612.6,166.0],height:15,spread:3.5,form:'spreading'},
    {point:[-620.0,165.0],height:17,spread:4.0,form:'spreading'},
    {point:[-628.0,167.0],height:16,spread:3.8,form:'spreading'},
  ],
  lamp:[-598.5,188.8],
  bollards:[[-588.8,113.9],[-588.2,148.2],[-587.9,192.0]],
  benches:[[-587.6,145.3],[-587.6,153.3],[-585.8,125.9]],
  board:[-585.4,122.8],
  mirror:[-589.0,183.6],
};
export const UNIVERSITY_STREET_DETAIL = {
  busStop:south([[616,395]])[0],
  poles:[geographicPoint(35.27707,136.24557),...south([[730,565],[1023,714]])],
  shelters:south([[911,622],[953,652],[995,682]]),
};
export const WEST_SOLIDS = [...UNIVERSITY_NEIGHBORS];
function offsetBank(line,distance) {
  const normals=line.slice(1).map((b,i)=>{
    const a=line[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
    return [-(b[1]-a[1])/length,(b[0]-a[0])/length];
  });
  return line.map((p,i)=>{
    const a=normals[Math.max(0,i-1)],b=normals[Math.min(normals.length-1,i)];
    const nx=a[0]+b[0],nz=a[1]+b[1],scale=distance/(nx*b[0]+nz*b[1]);
    return [p[0]+nx*scale,p[1]+nz*scale];
  });
}
export const MIDDLE_MOAT_TOWN_BANK = [...offsetBank(WEST_ROUTE.slice(0,7),-8.6),
  ...schoolView([[493,720],[525,671],[556,621],[582,582],[607,545]])];
export const WEST_MOAT = [...MIDDLE_MOAT_TOWN_BANK,...CAMPUS_BANK,...[...SCHOOL_BANK].reverse()];
// The school island and both inner-moat banks use shared vertices. The former
// independent diagonals left a dry triangular strip below the castle's western slope.
export const SCHOOL_INNER_BANK = [INNER_MOAT_OUTER[0],...schoolView([[986,693],[974,673],
  [964,652],[951,626],[948,603],[923,570],[929,546],[917,516],[902,489],
  [894,462],[869,430],[859,412],[875,384],[894,354],[907,317],[919,278],
  [935,233],[947,192],[953,151],[961,107],[971,75],[980,42],[976,17],
  [961,-12],[937,-35],[916,-58],[935,-100],[952,-153],[992,-224]])];
export const WEST_INNER_WATER = [...SCHOOL_INNER_BANK,...[...CASTLE_WEST_BANK].reverse(),INNER_MOAT_INNER[0]];
const schoolEastSeam = (()=>{
  const [a,b]=INNER_MOAT_OUTER.slice(2,4),t=(-220-a[0])/(b[0]-a[0]);
  return [-220,a[1]+(b[1]-a[1])*t];
})();
export const SCHOOL_LAND = [...SCHOOL_BANK,...w([[820,136],[848,147],[852,157]]),
  ...[...SCHOOL_INNER_BANK].reverse().slice(1),...INNER_MOAT_OUTER.slice(1,3),schoolEastSeam];
export const WEST_BUILDINGS = [
  building('nishi-north', 'Hikone Nishi Junior High north classroom', schoolView([[650,278],[782,370],[764,395],[632,303]]), 9.6,'metal',1.5),
  building('nishi-stair', 'Hikone Nishi Junior High north return', schoolView([[683,234],[710,253],[679,297],[652,278]]), 9.6),
  building('nishi-main', 'Hikone Nishi Junior High main classroom', schoolView([[690,355],[767,409],[747,438],[670,384]]), 10.2,'metal',2),
  building('nishi-wing', 'Hikone Nishi Junior High south wing', schoolView([[791,374],[832,403],[818,423],[777,394]]), 6.6,'metal',1.6),
  building('nishi-gym', 'Hikone Nishi Junior High gymnasium', schoolView([[629,319],[683,357],[635,425],[581,387]]), 9.0, 'red', 3),
  building('moat-timber-house', 'Observed two-storey timber house beside the inner moat', schoolView([[841,456],[871,477],[845,514],[815,493]]), 5.4, 'tile', 2.1),
  building('moat-store', 'Observed low tiled store', schoolView([[869,472],[895,490],[872,523],[846,505]]), 3.2, 'tile', 1.5),
  building('school-lane-shed', 'Observed gabled shed by the school lane', schoolView([[794,473],[822,493],[807,514],[779,494]]), 3.4, 'metal', 1.3),
  building('lot-east-house', 'Observed low tiled frontage east of the open lot', schoolView([[899,625],[952,662],[935,687],[882,650]]), 4.4, 'tile', 1.6),
];
export const SCHOOL_LANES = [[CASTLE_CAMPUS_LINK[7],...schoolView([[750,539],[780,488],[811,443]])]];
export const SCHOOL_LOT = schoolView([[790,531],[887,600],[850,650],[751,580]]);
export const SCHOOL_LOT_ENTRY = schoolView([[790,611],[804,595],[829,580]]);
export const SCHOOL_COURT = schoolView([[770,415],[812,444],[776,495],[734,466]]);
export const SCHOOL_POOL = {
  deck:schoolView([[685,461],[739,491],[727,513],[673,483]]),
  water:schoolView([[690,467],[732,491],[723,506],[680,482]]),
};
export const SCHOOL_STREET_DETAIL = {
  // Runs stop short of the public junction and the separate open-lot entrance.
  stone: [schoolView([[738,524],[764,499],[791,459],[811,422]]),schoolView([[755,602],[776,620]]),schoolView([[808,639],[847,667]])],
  rope: [schoolView([[760,566],[785,584]]),schoolView([[816,604],[851,630],[884,599],[790,533]])],
  fence: [schoolView([[802,526],[877,579]])],
  conifers: schoolView([[742,518],[750,506],[759,494],[768,481],[778,468]]),
  broadleaf: schoolView([[735,539],[785,532],[866,573],[906,603],[864,645]]),
  poles: schoolView([[730,543],[803,512],[857,553],[913,611],[958,713]]),
  board: schoolView([[775,483]])[0],
};
export const UNIVERSITY_FIELDS = [
  { id:'small-ground', footprint:north([[211,312],[322,391],[265,485],[139,397]]), material:'ART_Sand' },
  { id:'school-ground', footprint:w([[750,306],[807,328],[751,427],[698,391]]), material:'ART_Sand' },
  { id:'tennis', footprint:schoolView([[705,598],[798,663],[737,748],[643,683]]), material:'ART_Sand' },
  { id:'athletics', footprint:sports([[76,239],[160,126],[277,48],[361,97],[328,180],[252,282],[145,359]]), material:'HK_Grass' },
  { id:'baseball', footprint:sports([[399,171],[478,126],[485,333],[412,338],[350,251]]), material:'ART_Sand' },
];
export const UNIVERSITY_NORTH_LAND = north([[33,424],[181,219],[253,267],[328,303],[385,344],[350,434],[244,541],[123,556]]);
export const UNIVERSITY_SOLIDS = [...UNIVERSITY_BUILDINGS,UNIVERSITY_GATEHOUSE,...UNIVERSITY_BOUNDARY.flatMap(run =>
  run.points.slice(1).map((b,i) => {
    const a=run.points[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
    const dx=-(b[1]-a[1])/length*.2,dz=(b[0]-a[0])/length*.2;
    return {height:1.65,footprint:[[a[0]+dx,a[1]+dz],[b[0]+dx,b[1]+dz],
      [b[0]-dx,b[1]-dz],[a[0]-dx,a[1]-dz]]};
  }))];
export const UNIVERSITY_ITEMS = ['ART_ShigaCampus','ART_WestMoat'].map(a =>
  ({ a, p:[0,0,0], r:0, s:[1,1,1], g:'WebUniversity' }));
export const UNIVERSITY_DATA = { apron:w([[618,566],[625,549],[611,541],[589,531],[576,534],[540,514],[533,521],[565,544]]), buildings:UNIVERSITY_BUILDINGS, land:UNIVERSITY_LAND,
  gatehouse:UNIVERSITY_GATEHOUSE, neighbors:UNIVERSITY_NEIGHBORS, paving:UNIVERSITY_PAVING, parking:UNIVERSITY_PARKING,
  detail:UNIVERSITY_STREET_DETAIL, frontLane:UNIVERSITY_FRONT_LANE,
  schoolLanes:SCHOOL_LANES, schoolLot:SCHOOL_LOT, schoolLotEntry:SCHOOL_LOT_ENTRY, schoolDetail:SCHOOL_STREET_DETAIL,
  outerMoatStreet:INNER_MOAT_ROAD,
  schoolCourt:SCHOOL_COURT, schoolPool:SCHOOL_POOL,
  boundary:UNIVERSITY_BOUNDARY, link:CASTLE_CAMPUS_LINK, forecourt:UNIVERSITY_FORECOURT,
  castleBank:[INNER_MOAT_INNER[0],...CASTLE_WEST_BANK], schoolInnerBank:SCHOOL_INNER_BANK,
  gate:UNIVERSITY_GATE, axis:UNIVERSITY_AXIS, paths:UNIVERSITY_PATHS, road:WEST_ROUTE,
  lane:UNIVERSITY_WEST_LANE, entrance:UNIVERSITY_ENTRANCE, campusBank:CAMPUS_BANK, schoolBank:SCHOOL_BANK,
  northLand:UNIVERSITY_NORTH_LAND, townLand:UNIVERSITY_TOWN_BLOCK, gateLanding:UNIVERSITY_GATE_LANDING,
  moat:WEST_MOAT, townBank:MIDDLE_MOAT_TOWN_BANK, schoolLand:SCHOOL_LAND, innerWater:WEST_INNER_WATER,
  schoolBuildings:WEST_BUILDINGS, fields:UNIVERSITY_FIELDS, gateDetail:UNIVERSITY_GATE_DETAIL };
UNIVERSITY_DATA.schoolGateEntry=SCHOOL_GATE_ENTRY;
