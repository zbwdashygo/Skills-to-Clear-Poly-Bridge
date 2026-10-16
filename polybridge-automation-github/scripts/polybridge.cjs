#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),z=require('node:zlib'),crypto=require('node:crypto');
const SKILL=path.resolve(__dirname,'..');
function fail(message){throw Error(message);}
function hash(file){return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');}
function read(file){return JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));}
function write(file,data){fs.mkdirSync(path.dirname(path.resolve(file)),{recursive:true});fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');}
function decode(file){const raw=fs.readFileSync(file,'utf8').trim();if(!/^[A-Za-z0-9+/]+={0,2}$/.test(raw))fail('Invalid base64 save');return JSON.parse(z.inflateSync(Buffer.from(raw,'base64'),{maxOutputLength:32*1024*1024}).toString('utf8'));}
function encode(file,data){fs.mkdirSync(path.dirname(path.resolve(file)),{recursive:true});fs.writeFileSync(file,z.deflateSync(Buffer.from(JSON.stringify(data))).toString('base64'));}
function finite(v,label){if(typeof v!=='number'||!Number.isFinite(v))fail('Invalid number: '+label);return v;}
function anchors(data){return data.Objects.filter(o=>o.type===0&&o.isKinematic===true).map(o=>[o.id,o.x,o.y]).sort((a,b)=>a[0]-b[0]);}
function sameAnchors(a,b){if(JSON.stringify(anchors(a))!==JSON.stringify(anchors(b)))fail('Anchor IDs/coordinates differ from baseline');}
function validate(data,{baseline,budget,allowed='road,wood',limits={}}={}){
  if(!data||!Array.isArray(data.Objects)||!data.Objects.length)fail('Objects must be nonempty');
  const ids=new Set(),nodes=new Map(),edges=new Map(),counts={},lengths={},duplicates=new Set();let cost=0;
  const types={1:'road',2:'wood',3:'steel',4:'hydraulic',5:'rope'},permitted=new Set(allowed.split(','));
  for(const name of permitted)if(!Object.values(types).includes(name))fail('Unknown allowed material: '+name);
  for(const [name,limit] of Object.entries(limits)){if(!Object.values(types).includes(name)||!Number.isSafeInteger(limit)||limit < -1)fail('Invalid material limit: '+name);}
  for(const o of data.Objects){if(!Number.isSafeInteger(o.id)||o.id<1||ids.has(o.id))fail('Invalid/duplicate ID: '+o.id);ids.add(o.id);finite(o.x,'x');finite(o.y,'y');if(!Number.isInteger(o.type)||o.type<0)fail('Invalid object type');if(o.type===0){nodes.set(o.id,o);edges.set(o.id,[]);}if(o.isKinematic!==undefined&&typeof o.isKinematic!=='boolean')fail('isKinematic must be boolean');}
  if(!anchors(data).length)fail('No fixed anchors');
  for(const o of data.Objects.filter(o=>o.type!==0)){
    const name=types[o.type];if(!name||!permitted.has(name))fail('Unsupported/disallowed material: '+o.type);
    const a=nodes.get(o.anchorAID),b=nodes.get(o.anchorBID);if(!a||!b)fail('Unresolved member endpoint: '+o.id);
    const length=Math.hypot(a.x-b.x,a.y-b.y);if(length<1e-6||length>({1:2.001,2:2.001,3:4.001,4:4.001,5:Infinity}[o.type]))fail('Zero/overlong member: '+o.id+' length='+length);
    if(o.type===4&&(typeof o.rate!=='number'||!Number.isFinite(o.rate)||o.rate<0.5||o.rate>1.5))fail('Hydraulic rate must be a length ratio in [0.5,1.5]: '+o.id);
    if(Math.abs(o.x-(a.x+b.x)/2)>1e-5||Math.abs(o.y-(a.y+b.y)/2)>1e-5)fail('Member midpoint mismatch: '+o.id);
    const key=[o.type,...[a.id,b.id].sort((a,b)=>a-b)].join(',');if(duplicates.has(key))fail('Duplicate member: '+key);duplicates.add(key);
    edges.get(a.id).push(b.id);edges.get(b.id).push(a.id);counts[name]=(counts[name]||0)+1;lengths[name]=(lengths[name]||0)+length;cost+=length*({1:200,2:180,3:450,4:750,5:220}[o.type]);
  }
  const visited=new Set(),queue=anchors(data).map(a=>a[0]);for(let i=0;i<queue.length;i++){const id=queue[i];if(visited.has(id))continue;visited.add(id);queue.push(...edges.get(id).filter(x=>!visited.has(x)));}
  for(const o of nodes.values())if(!o.isKinematic&&!visited.has(o.id))fail('Unanchored node/component: '+o.id);
  if(!counts.road)fail('Design contains no road');
  for(const [name,limit] of Object.entries(limits))if(limit>=0&&(counts[name]||0)>limit)fail('Material count exceeds limit: '+name);
  if(baseline)sameAnchors(data,baseline);
  if(budget!==undefined){finite(budget,'budget');if(budget<=0)fail('Budget must be positive');if(cost>budget)fail('Estimated cost exceeds budget: '+Math.round(cost)+' > '+budget);}
  return {anchors:anchors(data),objects:data.Objects.length,counts,lengths,estimatedCost:Math.round(cost),physicsVerified:false};
}
function build(baseline,spec){
  const objects=baseline.Objects.filter(o=>o.type===0&&o.isKinematic===true).map(o=>({...o}));if(!objects.length)fail('Baseline needs anchors');
  const nodes=new Map(objects.map(o=>[[o.x,o.y].join(','),o.id]));let id=Math.max(...objects.map(o=>o.id))+1;const members=new Set();
  const round=n=>Math.round(n*1e6)/1e6;
  function point(p){if(!Array.isArray(p)||p.length!==2)fail('Point must be [x,y]');p.forEach(v=>finite(v,'point'));return p.map(round);}
  function node(p){const key=p.join(',');if(!nodes.has(key)){nodes.set(key,id);objects.push({type:0,x:p[0],y:p[1],id:id++,anchorAID:0,anchorBID:0,splitForDrawBridge:0,rate:0});}return nodes.get(key);}
  function beam(type,a,b){a=point(a);b=point(b);const aid=node(a),bid=node(b),key=[type,...[aid,bid].sort((a,b)=>a-b)].join(',');if(members.has(key))return;members.add(key);objects.push({type,x:round((a[0]+b[0])/2),y:round((a[1]+b[1])/2),id:id++,anchorAID:aid,anchorBID:bid,splitForDrawBridge:0,rate:0});}
  if(!Array.isArray(spec.spans)||!spec.spans.length)fail('Spec needs spans');
  for(const span of spec.spans){const a=point(span.start),b=point(span.end),n=span.segments,depth=finite(span.depth??1.5,'depth');if(!Number.isSafeInteger(n)||n<1||n>1000||depth<=0)fail('Invalid segments/depth');if(span.side!==undefined&&!['below','above'].includes(span.side))fail('side must be below or above');for(const p of [a,b])if(!objects.some(o=>o.isKinematic&&o.x===p[0]&&o.y===p[1]))fail('Span endpoint must be a fixed baseline anchor');const deck=[],chord=[];for(let i=0;i<=n;i++)deck.push([round(a[0]+(b[0]-a[0])*i/n),round(a[1]+(b[1]-a[1])*i/n)]);for(let i=1;i<deck.length;i++){const p=deck[i-1],q=deck[i],t=[round((p[0]+q[0])/2),round((p[1]+q[1])/2+(span.side==='above'?depth:-depth))];beam(1,p,q);if(span.reinforceDeck)beam(2,p,q);beam(2,p,t);beam(2,t,q);chord.push(t);}for(let i=1;i<chord.length;i++)beam(2,chord[i-1],chord[i]);}
  for(const pair of spec.supports??[]){if(!Array.isArray(pair)||pair.length!==2)fail('Support must be [start,end]');beam(2,pair[0],pair[1]);}
  const result={DisplayName:String(spec.name??'Generated truss'),Objects:objects};validate(result,{baseline});return result;
}
function target(root,level,slot){root=path.resolve(root);if(path.basename(root).toLowerCase()!=='savefiles')fail('root must be the savefiles directory');if(!/^[A-Za-z0-9_-]+$/.test(level??''))fail('Invalid internal level name');if(!/^[0-4]$/.test(String(slot)))fail('Only existing manual slots 0..4 may be replaced');const dir=path.join(root,level),file=path.join(dir,String(slot));if(!fs.existsSync(file)||!fs.statSync(file).isFile())fail('Create this manual slot in the game first');for(const p of [root,dir,file])if(fs.lstatSync(p).isSymbolicLink())fail('Symlink targets are unsupported');if(path.dirname(fs.realpathSync(dir))!==fs.realpathSync(root))fail('Level directory escapes root');return {root,dir,file};}
function atomic(file,bytes){const temp=file+'.pb-'+crypto.randomUUID()+'.tmp';try{fs.writeFileSync(temp,bytes,{flag:'wx'});fs.renameSync(temp,file);}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}}
function plan(o){const t=target(o.root,o.level,o.slot),candidate=path.resolve(o.candidate);if(candidate===t.file)fail('Candidate must be separate from target');const baseline=decode(t.file),data=decode(candidate);const constraints={allowed:o.allowed??'road,wood'};if(o.budget!==undefined)constraints.budget=Number(o.budget);if(o.limits)constraints.limits=read(o.limits);const summary=validate(data,{baseline,...constraints});return {version:1,createdAt:new Date().toISOString(),root:t.root,level:o.level,slot:String(o.slot),target:t.file,targetHash:hash(t.file),candidate,candidateHash:hash(candidate),constraints,summary};}
function apply(planFile,backupRoot){const p=read(planFile);if(p.version!==1)fail('Unknown plan version');const t=target(p.root,p.level,p.slot);if(t.file!==p.target)fail('Plan target mismatch');if(hash(t.file)!==p.targetHash||hash(p.candidate)!==p.candidateHash)fail('Stale plan: target/candidate changed; create a new plan');const summary=validate(decode(p.candidate),{baseline:decode(t.file),...p.constraints});backupRoot=path.resolve(backupRoot);const rel=path.relative(t.root,backupRoot);if(rel===''||(!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel)))fail('Backups must be outside active savefiles');const backup=path.join(backupRoot,p.level+'-'+Date.now()+'-'+crypto.randomUUID());fs.mkdirSync(backup,{recursive:true});fs.cpSync(t.dir,path.join(backup,'level'),{recursive:true});const stored=path.join(backup,'level',p.slot);if(hash(stored)!==p.targetHash)fail('Backup verification failed');const bytes=fs.readFileSync(p.candidate);if(hash(t.file)!==p.targetHash||crypto.createHash('sha256').update(bytes).digest('hex')!==p.candidateHash)fail('Files changed during backup; aborting');const manifest={version:1,root:p.root,level:p.level,slot:p.slot,target:t.file,beforeHash:p.targetHash,afterHash:p.candidateHash,backupFile:stored,createdAt:new Date().toISOString()};write(path.join(backup,'manifest.json'),manifest);atomic(t.file,bytes);if(hash(t.file)!==p.candidateHash)fail('Post-write hash mismatch; inspect backup manifest');return {applied:true,target:t.file,manifest:path.join(backup,'manifest.json'),summary};}
function restore(file){const m=read(file);if(m.version!==1)fail('Unknown manifest');const t=target(m.root,m.level,m.slot);if(t.file!==m.target)fail('Manifest target mismatch');if(hash(t.file)!==m.afterHash)fail('Slot changed since injection; refusing destructive restore');if(path.resolve(m.backupFile)!==path.join(path.dirname(path.resolve(file)),'level',m.slot))fail('Backup path outside manifest snapshot');if(hash(m.backupFile)!==m.beforeHash)fail('Backup hash mismatch');sameAnchors(decode(m.backupFile),decode(t.file));atomic(t.file,fs.readFileSync(m.backupFile));return {restored:true,target:t.file,hash:hash(t.file)};}
function discover(o){const candidates=[];const home=process.env.USERPROFILE||process.env.HOME;if(home)candidates.push(path.join(home,'AppData','LocalLow','Dry Cactus','Poly Bridge','savefiles'));if(o.steam){const users=path.join(path.resolve(o.steam),'userdata');if(fs.existsSync(users))for(const entry of fs.readdirSync(users,{withFileTypes:true}))if(entry.isDirectory()&&/^\d+$/.test(entry.name))candidates.push(path.join(users,entry.name,'367450','remote','savefiles'));}return candidates.filter(p=>fs.existsSync(p)).map(root=>({root,active:false,note:'Confirm with a game-created manual save',levels:fs.readdirSync(root,{withFileTypes:true}).filter(d=>d.isDirectory()).map(d=>d.name)}));}
function record(o){if(!['success','fail','timeout','unknown'].includes(o.verdict))fail('Invalid verdict');if(!o['visible-level']||!o['internal-level'])fail('Both visible and internal level are required');if(!fs.statSync(o.evidence).isFile())fail('Evidence must be a saved file');const data=decode(o.candidate);const entry={at:new Date().toISOString(),visibleLevel:o['visible-level'],internalLevel:o['internal-level'],verdict:o.verdict,candidate:path.resolve(o.candidate),candidateHash:hash(o.candidate),evidence:path.resolve(o.evidence),evidenceHash:hash(o.evidence),observationSource:'agent-reviewed game screenshot',anchors:anchors(data)};for(const k of ['cost','budget','stress'])if(o[k]!==undefined)entry[k]=finite(Number(o[k]),k);if(o.verdict==='success'&&(entry.cost===undefined||entry.budget===undefined))fail('Success record requires observed game cost and budget');if(entry.cost!==undefined&&entry.cost<0||entry.budget!==undefined&&entry.budget<=0||entry.stress!==undefined&&entry.stress<0)fail('Invalid observed metrics');if(entry.cost>entry.budget&&o.verdict==='success')fail('Over-budget result cannot be recorded as budget-compliant success');const ledger=fs.existsSync(o.ledger)?read(o.ledger):{version:1,runs:[]};if(ledger.version!==1||!Array.isArray(ledger.runs))fail('Invalid ledger');ledger.runs.push(entry);write(o.ledger,ledger);return entry;}
const HELP=`Poly Bridge original automation (Node.js 18+, no packages)
discover [--steam STEAM_DIRECTORY]
inspect SAVE
decode SAVE --out JSON
encode JSON --out SAVE [--allowed road,wood,hydraulic] [--limits JSON]
check SAVE [--baseline SAVE] [--budget NUMBER] [--allowed road,wood] [--limits JSON]
build --baseline SAVE --spec JSON --out SAVE
preset --level 1-1 --baseline SAVE --out SAVE
plan --root SAVEFILES --level INTERNAL --slot 0 --candidate SAVE --out JSON [--budget NUMBER] [--allowed road,wood] [--limits JSON]
apply --plan JSON --backup-root DIRECTORY --commit
restore --manifest JSON --commit
record --ledger JSON --visible-level 1-1 --internal-level Easy_001 --candidate SAVE --verdict success|fail|timeout|unknown --evidence IMAGE [--cost NUMBER --budget NUMBER --stress NUMBER]
apply/restore mutate saves only with --commit. User authorization is still required by the invoking agent. check validates topology, not physics.`;
function main(args){const cmd=args.shift()??'help',o={},pos=[];while(args.length){const a=args.shift();if(a.startsWith('--')){const k=a.slice(2);if(k==='commit')o[k]=true;else{if(!args.length||args[0].startsWith('--'))fail('Missing value for '+a);o[k]=args.shift();}}else pos.push(a);}let result;
  const options={help:[],discover:['steam'],inspect:[],decode:['out'],encode:['out','allowed','limits'],check:['baseline','budget','allowed','limits'],build:['baseline','spec','out','budget'],preset:['level','baseline','out'],plan:['root','level','slot','candidate','out','budget','allowed','limits'],apply:['plan','backup-root','commit'],restore:['manifest','commit'],record:['ledger','visible-level','internal-level','candidate','verdict','evidence','cost','budget','stress']};
  if(!options[cmd])fail('Unknown command: '+cmd);
  for(const key of Object.keys(o))if(!options[cmd].includes(key))fail('Unknown option for '+cmd+': --'+key);
  const positionalCount=['inspect','decode','encode','check'].includes(cmd)?1:0;if(pos.length!==positionalCount)fail(cmd+' expects '+positionalCount+' positional arguments');
  switch(cmd){case 'help':console.log(HELP);return;case 'discover':result=discover(o);break;
  case 'inspect':{const d=decode(pos[0]);result={file:path.resolve(pos[0]),hash:hash(pos[0]),anchors:anchors(d),objects:d.Objects.length,types:d.Objects.reduce((a,x)=>(a[x.type]=(a[x.type]||0)+1,a),{} )};break;}
  case 'decode':write(o.out,decode(pos[0]));result={output:path.resolve(o.out)};break;
  case 'encode':{const d=read(pos[0]);validate(d,{allowed:o.allowed,limits:o.limits?read(o.limits):undefined});encode(o.out,d);result={output:path.resolve(o.out)};break;}
  case 'check':result=validate(decode(pos[0]),{baseline:o.baseline?decode(o.baseline):undefined,budget:o.budget===undefined?undefined:Number(o.budget),allowed:o.allowed,limits:o.limits?read(o.limits):undefined});break;
  case 'build':{const baseline=decode(o.baseline),d=build(baseline,read(o.spec));validate(d,{baseline,budget:o.budget===undefined?undefined:Number(o.budget)});encode(o.out,d);result={output:path.resolve(o.out),...validate(d,{baseline})};break;}
  case 'preset':{const catalog=read(path.join(SKILL,'references','verified-levels.json')),entry=catalog.levels.find(e=>e.visible===o.level);if(!entry)fail('No verified preset for '+o.level);const baseline=decode(o.baseline),d=decode(path.join(SKILL,'assets','verified',entry.save));validate(d,{baseline,budget:entry.budget,allowed:entry.allowed.join(','),limits:entry.limits});encode(o.out,d);result={output:path.resolve(o.out),historicalObservation:entry,currentPhysicsVerified:false};break;}
  case 'plan':result=plan(o);write(o.out,result);break;
  case 'apply':if(!o.commit)fail('apply requires --commit after user authorization');result=apply(o.plan,o['backup-root']);break;
  case 'restore':if(!o.commit)fail('restore requires --commit');result=restore(o.manifest);break;
  case 'record':result=record(o);break;
  default:fail('Unknown command: '+cmd);}
  console.log(JSON.stringify(result,null,2));
}
if(require.main===module){try{main(process.argv.slice(2));}catch(e){console.error(JSON.stringify({error:e.message}));process.exitCode=1;}}
module.exports={decode,encode,validate,build,plan,apply,restore,anchors,hash,record};
