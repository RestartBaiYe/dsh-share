import { readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = new URL('./', import.meta.url);
const strip = source => source.replace(/^import .*?;\r?\n/gm, '').replace(/^export (?=(?:function|const|class|async function)\b)/gm, '');
// Keep the actual plugin renderer in the Site repository, so a clean checkout
// builds independently of the parent plugin directory.
for (const name of ['markdown.js', 'render.js']) {
  const parent = new URL('../lib/' + name, root);
  const dest = new URL('renderer/' + name, root);
  await mkdir(new URL('renderer/', root), { recursive: true });
  try { await cp(parent, dest); } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
await mkdir(new URL('dist/server/', root), { recursive: true });
const sources = await Promise.all(['renderer/markdown.js', 'renderer/render.js', 'worker/index.js'].map(p => readFile(new URL(p, root), 'utf8')));
await writeFile(new URL('dist/server/index.js', root), sources.map(strip).join('\n'));
await cp(new URL('.openai/', root), new URL('dist/.openai/', root), { recursive: true });
await cp(new URL('drizzle/', root), new URL('dist/drizzle/', root), { recursive: true });
const worker = await import(new URL('dist/server/index.js', root));
if (typeof worker.default?.fetch !== 'function') throw new Error('Missing Worker entry');
console.log('Built ' + fileURLToPath(new URL('dist/', root)));
