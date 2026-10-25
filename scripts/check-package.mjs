/** Audit the actual npm tarball, not merely the working tree. No secret values are logged. */
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const permitted=/^(?:lib\/[a-z-]+\.js|package\.json|cordis\.patch\.yml|README(?:\.en)?\.md|LICENSE|CHANGELOG\.md|install(?:-safe)?\.mjs|install-desktop\.cmd)$/;
const rules=[
 ['personal-host',/https?:\/\/[^\s"'<>]+\.chatgpt\.site\b|\bqq\d{6,}\b/i],
 ['deployment-id',/appgprj_[a-z0-9]{12,}/i],
 ['credential',/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|sk-(?:proj-|ant-api\d+-)?[A-Za-z0-9_-]{24,})\b/],
 ['private-key',/-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----\s+[A-Za-z0-9+/=\r\n]{32,}/],
 ['local-account-path',/(?:[A-Z]:[\\/]+Users[\\/]+[A-Za-z0-9_-]+|\/home\/[A-Za-z0-9_-]+|\/Users\/[A-Za-z0-9_-]+)/i],
];
let temporary;
try{
 let artifact=process.argv[2];
 if(!artifact){
  temporary=await mkdtemp(join(tmpdir(),'dsh-share-package-'));
  if(!process.env.npm_execpath)throw new Error('Run through npm run verify:package, or pass a .tgz path');
  const result=await promisify(execFile)(process.execPath,[process.env.npm_execpath,'pack','--ignore-scripts','--json','--pack-destination',temporary],{cwd:root,windowsHide:true,maxBuffer:1024*1024});
  const packed=JSON.parse(result.stdout);
  const info=Array.isArray(packed)?packed[0]:packed['dsh-share'];
  if(!info?.filename || !/^dsh-share-[0-9.]+\.tgz$/.test(info.filename))throw new Error('Unexpected npm pack result');
  artifact=join(temporary,info.filename);
 }
 const bytes=await readFile(resolve(artifact)),tar=gunzipSync(bytes,{maxOutputLength:20*1024*1024});
 let offset=0,count=0;const files=new Map();
 while(offset+512<=tar.length){
  const header=tar.subarray(offset,offset+512),name=header.subarray(0,100).toString().replace(/\0.*$/s,'');if(!name)break;
  const size=parseInt(header.subarray(124,136).toString().replace(/\0.*$/s,'').trim(),8);
  if(!Number.isSafeInteger(size)||size<0||offset+512+size>tar.length)throw new Error('Malformed package archive');
  const relative=name.replace(/^package\//,'');
  if(!name.startsWith('package/')||!permitted.test(relative)||![0,48].includes(header[156]))throw new Error('Unexpected package entry: '+relative);
  const text=tar.subarray(offset+512,offset+512+size).toString('utf8');
  for(const [rule,pattern]of rules)if(pattern.test(text))throw new Error(`Release audit failed: ${relative} (${rule})`);
  files.set(relative,text);count++;offset+=512+Math.ceil(size/512)*512;
 }
 const manifest=JSON.parse(files.get('package.json'));
 if(files.get('lib/hosting-http.js')?.includes(`dsh-share/${manifest.version}`)!==true)throw new Error('HTTP client version does not match package');
 for(const required of ['lib/index.js','lib/client.js','lib/store.js','LICENSE','README.md','install.mjs'])if(!files.has(required))throw new Error('Missing package file: '+required);
 console.log(JSON.stringify({version:manifest.version,files:count,privacyAudit:'passed',sha256:createHash('sha256').update(bytes).digest('hex')}));
}finally{if(temporary)await rm(temporary,{recursive:true,force:true});}
