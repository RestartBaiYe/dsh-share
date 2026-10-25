import { cp, mkdir, readFile, lstat, symlink, writeFile, realpath, rename } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const profileName = args.includes('--profile') ? args[args.indexOf('--profile') + 1] : 'desktop';
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
const releaseFiles = ['lib', 'package.json', 'cordis.patch.yml', 'README.md', 'README.en.md', 'LICENSE'];
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
if (await realpath(source) !== await realpath(target)) for (const entry of releaseFiles) await cp(join(source, entry), join(target, entry), { recursive: true });
const link = join(profile, 'node_modules', 'dsh-share');
await mkdir(join(profile, 'node_modules'), { recursive: true });
try {
  await lstat(link);
  // Preserve a separately managed installation before writing through its link.
  if (await realpath(link) !== await realpath(target)) {
    await cp(link, join(backup, 'profile-plugin'), { recursive: true, dereference: true });
    if (await realpath(link) !== await realpath(source)) for (const entry of releaseFiles) await cp(join(source, entry), join(link, entry), { recursive: true });
  }
} catch (e) { if (e.code !== 'ENOENT') throw e; await symlink(target, link, process.platform === 'win32' ? 'junction' : 'dir'); }
manifest.dependencies ||= {};
manifest.dependencies['dsh-share'] = 'file:' + target.replaceAll('\\', '/');
manifest.dsh ||= {}; manifest.dsh.profile ||= {};
const bundles = manifest.dsh.profile.bundles ||= [];
if (!bundles.includes('dsh-share')) bundles.push('dsh-share');
const nextManifest = manifestPath + '.dsh-share-' + stamp + '.tmp';
await writeFile(nextManifest, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
await rename(nextManifest, manifestPath);
console.log(`Installed dsh-share ${version} into ` + profile);
console.log('Backup: ' + backup);
console.log('Reload the DSH page, or restart DSH if it has not refreshed automatically.');
