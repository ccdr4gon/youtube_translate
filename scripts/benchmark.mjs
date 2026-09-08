import { createAppServerRunner } from '../native/app-server.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
const cases = [
  {text:'We paid a fortune for this tiny room, but the view was sick.', term:'sick', meaning:/棒|赞|惊艳|漂亮|震撼|美|出色/},
  {text:"I ate some bad seafood and now I feel sick, so I'm staying at the hotel.", term:'sick', meaning:/不舒服|恶心|生病|身体不适/},
  {text:"I'm down for grabbing dinner, but let's play it by ear because our train might be late.", term:'play it by ear', meaning:/情况|临时|应变|决定|安排/},
  {text:'Spill the tea! What happened between you and the tour guide?', term:'Spill the tea', meaning:/八卦|内情|说说|内幕/}
];
const runner = createAppServerRunner();const rows=[];
try {
  for (let i=0;i<cases.length;i++) {
    const item=cases[i];let first;
    const start=Date.now();
    const result=await runner.analyze({videoId:'context-benchmark',cues:[{id:`case-${i}`,start:i*10,end:i*10+8,text:item.text}],context:[]},undefined,()=>{first ??= Date.now()-start});
    const selected=result.terms.find(t=>t.term.toLowerCase().includes(item.term.toLowerCase()));
    const pass=Boolean(selected && item.meaning.test(selected.meaning));
    const row={sentence:item.text,firstMs:first ?? result.firstTermMs,totalMs:result.elapsedMs,pass,terms:result.terms};rows.push(row);
    console.log(JSON.stringify(row));
  }
  mkdirSync('.local',{recursive:true});writeFileSync('.local/context-benchmark.json',JSON.stringify({at:new Date().toISOString(),model:'gpt-5.6-luna',rows},null,2));
  assert.ok(rows.every(r=>r.pass),'Inspect contextual meanings in .local/context-benchmark.json');
} finally { runner.close(); }
