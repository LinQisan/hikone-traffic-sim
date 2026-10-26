import type {ScenarioMap} from '../types/scenario.ts';
// File imports and editor handoffs share the same rules. The full map is loaded only on demand,
// independently of the small wall-only map used by the running simulation.
import { parseScenario, validate, ScenarioInputError } from '../simulation/core/scenario.ts';

export function createScenarioReader(loadMap: () => Promise<ScenarioMap> | ScenarioMap) {
  let mapPromise: Promise<ScenarioMap> | null = null;
  const map = () => mapPromise ??= Promise.resolve().then(loadMap).then(value => {
    if (!Array.isArray(value?.surfaces)) throw new Error('Expected a map with surfaces');
    return value;
  }).catch(cause => {
    mapPromise = null;
    throw Object.assign(new Error('地図を読み込めません。接続を確認して、同じファイルをもう一度選んでください。', { cause }),
      { code: 'SCENARIO_MAP_UNAVAILABLE' });
  });
  return async (text: string) => {
    const scenario = parseScenario(text);
    const errors = validate(scenario, await map()).filter(problem => problem.level === 'error');
    if (errors.length) throw new ScenarioInputError(errors);
    return scenario;
  };
}
