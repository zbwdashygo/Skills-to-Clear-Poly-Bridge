const fs=require('fs'),pb=require('./polybridge.cjs');
const [baselinePath,outputPath]=process.argv.slice(2);
if(!baselinePath||!outputPath){console.error('Usage: node scripts/build-3-13.cjs BASELINE OUTPUT');process.exit(1);}
const base=pb.decode(baselinePath);
if(JSON.stringify(pb.anchors(base))!==JSON.stringify([[1,0,1],[2,6,-1.5],[3,14,-1.5],[4,20,1]]))throw Error('Baseline is not the verified 3-13 anchor layout');
const objects=base.Objects.filter(o=>o.type===0&&o.isKinematic),nodes=new Map(objects.map(o=>[[o.x,o.y].join(','),o.id]));let id=5;
function node(p){p=p.map(x=>Math.round(x*1e6)/1e6);const key=p.join(',');if(!nodes.has(key)){nodes.set(key,id);objects.push({type:0,x:p[0],y:p[1],id:id++,anchorAID:0,anchorBID:0,splitForDrawBridge:0,rate:0});}return nodes.get(key);}
function beam(type,a,b,rate=0){const aid=node(a),bid=node(b);objects.push({type,x:(a[0]+b[0])/2,y:(a[1]+b[1])/2,id:id++,anchorAID:aid,anchorBID:bid,splitForDrawBridge:0,rate});}
function truss(a,b,n,height){const top=[];for(let i=0;i<n;i++){const p=[a[0]+(b[0]-a[0])*i/n,a[1]+(b[1]-a[1])*i/n],q=[a[0]+(b[0]-a[0])*(i+1)/n,a[1]+(b[1]-a[1])*(i+1)/n],t=[(p[0]+q[0])/2,(p[1]+q[1])/2+height];beam(1,p,q);beam(2,p,t);beam(2,t,q);top.push(t);}for(let i=1;i<top.length;i++)beam(2,top[i-1],top[i]);}
function tower(x,side,outer){const secondary=[];for(let i=0;i<4;i++){const y=-1.5+i*1.5,p=[x,y],q=[x,y+1.5],t=[x+side,y+.75];beam(2,p,q);beam(2,p,t);beam(2,t,q);secondary.push(t);}for(let i=1;i<secondary.length;i++)beam(2,secondary[i-1],secondary[i]);}
tower(6,-1,[0,1]);tower(14,1,[20,1]);
for(const x of [6.1,13.9]){const tx=x<10?6:14;beam(2,[tx,4.5],[x,4.5]);beam(2,[tx,3],[x,4.5]);beam(4,[x,4.5],[x,1.5],.5);beam(4,[x,1.5],[x,-1.5],.5);}
truss([6.1,-1.5],[13.9,-1.5],4,1);
truss([0,1],[5.9,1.5],3,1);beam(2,[5.9,1.5],[6,1.5]);beam(2,[5.9,1.5],[6,0]);
truss([14.1,1.5],[20,1],3,1);beam(2,[14.1,1.5],[14,1.5]);beam(2,[14.1,1.5],[14,0]);
for(let x=6.1;x<13.8;x+=1.95)beam(2,[x,-1.5],[x+1.95,-1.5]);
const design={DisplayName:'3-13 lift v2',Objects:objects};
const summary=pb.validate(design,{baseline:base,budget:32000,allowed:'road,wood,hydraulic,rope'});
if(summary.counts.road>10||summary.counts.rope>4)throw Error('Material count exceeded');
pb.encode(outputPath,design);console.log(JSON.stringify(summary,null,2));
