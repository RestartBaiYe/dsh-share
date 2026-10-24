import { cp, mkdir, readFile, lstat, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const profileName = args[args.indexOf('--profile') + 1] || 'desktop';
if (!['desktop', 'web'].includes(profileName)) throw new Error('Use --profile desktop or --profile web');
const home = resolve(process.env.DSH_HOME || join(homedir(), '.dsh'));
const profile = resolve(process.env.DSH_PROFILE_DIR || join(home, 'profiles', profileName));
const source = fileURLToPath(new URL('./', import.meta.url));
const version = JSON.parse(await readFile(join(source, 'package.json'), 'utf8')).version;
const target = join(home, 'plugins', 'dsh-share');
const manifestPath = join(profile, 'package.json');
const raw = await readFile(manifestPath, 'utf8'); // Fail before mutation if the profile is not initialized.
const manifest = JSON.parse(raw);
const stamp = new Date().toISOString().replaceAll(/[:.]/g, '-');
const backup = join(profile, '.dsh-share-backup', stamp);
await mkdir(backup, { recursive: true });
await writeFile(join(backup, 'package.json'), raw);
const patchPath = join(profile, 'cordis.patch.yml');
let patch;
try { patch = await readFile(patchPath, 'utf8'); await writeFile(join(backup, 'cordis.patch.yml'), patch); }
catch (e) { if (e.code !== 'ENOENT') throw e; }
try { await cp(target, join(backup, 'plugin'), { recursive: true }); }
catch (e) { if (e.code !== 'ENOENT') throw e; }

await mkdir(target, { recursive: true });
// Copy only release files. Never delete the installed directory or copy cloud
// sources, Git metadata, probes, cached data, or test output into the profile.
for (const entry of ['lib', 'package.json', 'cordis.patch.yml', 'README.md']) await cp(join(source, entry), join(target, entry), { recursive: true });
const link = join(profile, 'node_modules', 'dsh-share');
await mkdir(join(profile, 'node_modules'), { recursive: true });
try {
  await lstat(link);
  // Existing installations are left in place; update their release files too.
  await cp(join(source, 'lib'), join(link, 'lib'), { recursive: true });
  await cp(join(source, 'package.json'), join(link, 'package.json'));
  await cp(join(source, 'cordis.patch.yml'), join(link, 'cordis.patch.yml'));
} catch (e) { if (e.code !== 'ENOENT') throw e; await symlink(target, link, process.platform === 'win32' ? 'junction' : 'dir'); }
manifest.dependencies ||= {};
manifest.dependencies['dsh-share'] = 'file:' + target.replaceAll('\\', '/');
manifest.dsh ||= {}; manifest.dsh.profile ||= {};
const bundles = manifest.dsh.profile.bundles ||= [];
if (!bundles.includes('dsh-share')) bundles.push('dsh-share');
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
if (patch !== undefined) await writeFile(patchPath, patch + `\n# dsh-share ${version}: independent cloud snapshot hosting\n`);
console.log(`Installed dsh-share ${version} into ` + profile);
console.log('Backup: ' + backup);
console.log('Reload the DSH page, or restart DSH if it has not refreshed automatically.');
