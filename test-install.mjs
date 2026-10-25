import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

test('installer preserves unrelated settings and backs up an upgrade without changing the profile patch',async()=>{
  const home=await mkdtemp(join(tmpdir(),'dsh-share-install-'));
  const profile=join(home,'profiles','desktop');await mkdir(profile,{recursive:true});
  const manifest={dependencies:{other:'file:../other'},dsh:{profile:{bundles:['other']}}};
  await writeFile(join(profile,'package.json'),JSON.stringify(manifest));await writeFile(join(profile,'cordis.patch.yml'),'# keep user settings\n');
  const install=()=>promisify(execFile)(process.execPath,[fileURLToPath(new URL('./install.mjs',import.meta.url)),'--profile','desktop'],{env:{...process.env,DSH_HOME:home,DSH_PROFILE_DIR:profile},windowsHide:true});
  try{
    await install();await install();
    const result=JSON.parse(await readFile(join(profile,'package.json'),'utf8'));
    assert.equal(result.dependencies.other,manifest.dependencies.other);assert.deepEqual(result.dsh.profile.bundles,['other','dsh-share']);
    assert.equal(await readFile(join(profile,'cordis.patch.yml'),'utf8'),'# keep user settings\n');
    assert.equal((await readdir(join(profile,'.dsh-share-backup'))).length,2);
    assert.equal(JSON.parse(await readFile(join(home,'plugins','dsh-share','package.json'),'utf8')).version,'0.5.0');
  }finally{await rm(home,{recursive:true,force:true});}
});
