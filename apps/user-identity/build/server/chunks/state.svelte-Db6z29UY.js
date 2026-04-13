import { n as noop } from './renderer-ChLcKSye.js';
import './root-DMJibEMq.js';

const is_legacy = noop.toString().includes("$$") || /function \w+\(\) \{\}/.test(noop.toString());
const placeholder_url = "a:";
if (is_legacy) {
  ({
    url: new URL(placeholder_url)
  });
}
//# sourceMappingURL=state.svelte-Db6z29UY.js.map
