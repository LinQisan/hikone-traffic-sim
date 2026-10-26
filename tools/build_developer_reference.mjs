// Refresh source-derived tables in the static Chinese developer reference.
import fs from 'node:fs/promises';
import { newScenario, newVehicle, HIKONE_BOUNDS, PLAYER_MODES, SETTINGS, BODIES, ID_PATTERN } from '../src/simulation/core/scenario.ts';
import { SIGNAL_STAGES, SIGNAL_PERIOD } from '../src/simulation/traffic/SignalCycle.ts';
import { signalRigs } from '../src/three/scene/signal-layout.js';
import { SAMPLE_INTERVAL, BUFFER_SECONDS, SECONDS_BEFORE_IMPACT, SECONDS_AFTER_IMPACT, GAZE_HALF_ANGLE, GAZE_MAX_DISTANCE, SIDE_CHECK_MIN, SIDE_CHECK_MAX } from '../src/simulation/metrics/analysis.ts';

const file = new URL('../docs/reference.html', import.meta.url);
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const code = value => `<code>${escape(typeof value === 'string' ? value : JSON.stringify(value))}</code>`;
const table = (label, headers, rows) => `<div class="table-wrap" role="region" aria-label="${label}，可横向滚动" tabindex="0"><table><thead><tr>${headers.map(h => `<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>\n${rows.map(row => `<tr>${row.map(c => `<td>${c}</td>`).join('')}</tr>`).join('\n')}\n</tbody></table></div>`;
const fields = {
	format: '文件格式', version: '格式版本', id: '场景标识', name: '日文界面中的名称', nameEn: '英文名称',
	setting: '场景分类', learningGoal: '练习目标', situation: '场景说明', point: '反馈要点', map: '地图标识',
	playerMode: '参与方式', spawn: '起点，单位为米', goal: '终点矩形，yaw 单位为度',
	trigger: '触发矩形，yaw 单位为度', vehicles: '车辆定义数组',
	model: '车辆模型名', body: '车身类型', route: '路径点数组，单位为米', speedKmh: '目标速度，单位为 km/h',
	start: '启动条件', delaySeconds: '启动延迟，单位为秒', repeatMinSeconds: '最短重复间隔，单位为秒',
	repeatMaxSeconds: '最长重复间隔，单位为秒', stopOnTrigger: '触发后停止后续重复生成', accident: '教学事故车辆标记',
	overrideYaw: '启用固定朝向', yaw: '固定朝向，单位为度'
};
function defaults(value, label) {
	return table(label, ['字段', '默认值', '含义'], Object.entries(value).map(([key, value]) => [code(key), code(JSON.stringify(value)), key === 'name' && label === '车辆字段' ? '车辆名称' : fields[key]]));
}
const rigs = signalRigs();
const colour = { red: '红', yellow: '黄', green: '绿', flash: '绿灯闪烁' };
let start = 0;
const phases = SIGNAL_STAGES.map(stage => {
	const row = [code(stage.id), `${start} ≤ t &lt; ${start + stage.seconds}`, stage.seconds, colour[stage.eastWest], colour[stage.northSouth], colour[stage.walk]];
	start += stage.seconds;
	return row;
});
const blocks = {
	'scenario-defaults': defaults(newScenario(), '场景字段'),
	'vehicle-defaults': defaults(newVehicle(), '车辆字段'),
	'scenario-constants': table('场景常量', ['符号', '值'], Object.entries({ HIKONE_BOUNDS, PLAYER_MODES, SETTINGS, BODIES, ID_PATTERN: String(ID_PATTERN) }).map(([key, value]) => [code(key), code(value)])),
	'signal-phases': `<p><code>SIGNAL_PERIOD</code> 为 ${SIGNAL_PERIOD} 秒。区间中的 <code>t</code> 为场景时间对周期取余的结果。</p>\n${table('信号相位', ['id', '区间，秒', '持续，秒', 'eastWest', 'northSouth', 'walk'], phases)}\n<p><code>signalRigs()</code> 返回 ${rigs.length} 组装置，共 ${rigs.reduce((n, r) => n + (r.head ? 1 : 0) + r.extraHeads.length, 0)} 个车行灯头和 ${rigs.reduce((n, r) => n + r.pedestrians.length, 0)} 个行人灯头。</p>`,
	'recording-constants': table('录制与分析常量', ['符号', '值', '单位'], Object.entries({ SAMPLE_INTERVAL, BUFFER_SECONDS, SECONDS_BEFORE_IMPACT, SECONDS_AFTER_IMPACT, GAZE_HALF_ANGLE, GAZE_MAX_DISTANCE, SIDE_CHECK_MIN, SIDE_CHECK_MAX }).map(([key, value]) => [code(key), value, key === 'GAZE_MAX_DISTANCE' ? '米' : key.includes('ANGLE') || key.startsWith('SIDE_CHECK') ? '度' : '秒']))
};

const before = await fs.readFile(file, 'utf8');
let after = before;
for (const [name, content] of Object.entries(blocks)) {
	const begin = `<!-- generated:${name}:start -->`;
	const end = `<!-- generated:${name}:end -->`;
	const start = after.indexOf(begin), stop = after.indexOf(end);
	if (start < 0 || stop < start) throw new Error(`Missing reference markers: ${name}`);
	after = after.slice(0, start) + `${begin}\n${content}\n` + after.slice(stop);
}
if (process.argv.includes('--check')) {
	if (after !== before) {
		console.error('Developer reference is stale. Run node tools/build_developer_reference.mjs');
		process.exitCode = 1;
	} else console.log('Developer reference matches source.');
} else {
	await fs.writeFile(file, after);
	console.log('Updated docs/reference.html');
}
