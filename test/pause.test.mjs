import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import * as core from '../extension/core.js';
import { batchPrompt } from '../native/codex.mjs';

const cues = core.normalizeCues([
  {id:'a',start:0,end:4,text:'The first remark is ambiguous.'},
  {id:'b',start:10,end:14,text:'We take it for granted.'},
  {id:'c',start:20,end:24,text:'This simple view is sick.'},
  {id:'d',start:30,end:34,text:'The next stop is home.'},
  {id:'e',start:40,end:44,text:'Our final stop is remote.'}
]);
const tick = () => new Promise(resolve => setImmediate(resolve));

test('暂停选当前句及前后句；边缘凑三句，跨字幕片段合句，无标点也有上限', () => {
  assert.deepEqual(core.nearbySentences(cues,21).map(c=>c.start),[10,20,30]);
  assert.deepEqual(core.nearbySentences(cues,1).map(c=>c.start),[0,10,20]);
  assert.deepEqual(core.nearbySentences(cues,99).map(c=>c.start),[20,30,40]);
  const fragments = core.normalizeCues([
    {start:0,end:2,text:'We take it'}, {start:2,end:4,text:'for granted.'},
    {start:4,end:6,text:'It is easy. We agree!'}, {start:6,end:8,text:'Go home.'}
  ]);
  assert.deepEqual(core.nearbySentences(fragments,1).map(c=>c.text),['We take it for granted.','It is easy.','We agree!']);
  const asr = Array.from({length:20},(_,i)=>({id:String(i),start:i*3,end:i*3+3,text:'unpunctuated captions'}));
  assert.equal(core.nearbySentences(asr,30).length,3);
  assert.ok(core.nearbySentences(asr,30).every(c=>c.end-c.start<=12));
});

test('暂停接受 A1，显示附近未来一句；词内本义保留并拒绝不属于词组的词', () => {
  const window = core.nearbySentences(cues,21);
  assert.deepEqual(core.pauseTerms([
    {term:'simple',level:'A1',start:20,end:24},
    {term:'home',level:'A1',start:30,end:34},
    {term:'ambiguous',level:'C1',start:0,end:4}
  ],window).map(t=>t.term),['simple','home']);
  const result=core.validateResult({terms:[{cue_id:'b',term:'take it for granted',level:'B2',kind:'phrase',meaning:'认为理所当然',
    words:[{word:'granted',meaning:'被给予的；被承认的'},{word:'grant',meaning:'not the exact form'},{word:'invented',meaning:'不存在'}]}]},cues);
  assert.deepEqual(result.terms[0].words,[{word:'granted',meaning:'被给予的；被承认的'}]);
  const request=core.validateRequest({videoId:'test',cues:window,mode:'pause'});
  assert.equal(request.mode,'pause'); assert.match(batchPrompt(request),/MODE=PAUSE/);
  assert.match(batchPrompt({...request,mode:'play'}),/MODE=PLAY/);
});

async function fixture() {
  const events={}, messages={}, jobs=[], sent=[], states=[];
  let callbacks, interval, receiveProgress;
  const player={currentTime:21,paused:false,playbackRate:1};
  const context={console,URL,Date,Map,Set,crypto:{randomUUID},__core:core,
    location:{href:'https://www.youtube.com/watch?v=test',origin:'https://www.youtube.com',pathname:'/watch'},
    setInterval:fn=>{interval=fn},
    document:{querySelector:()=>player,querySelectorAll:()=>[],getElementById:()=>({classList:{contains:()=>false}}),
      addEventListener:(name,fn)=>{events[name]=fn}},
    __createPanel:options=>{callbacks=options;return {host:{},update:state=>states.push(state)}}};
  context.window={addEventListener:(name,fn)=>{messages[name]=fn},postMessage:msg=>sent.push(msg)};
  context.chrome={storage:{local:{get:async()=>({settings:{level:'C2',known:[]}}),set:async()=>{}},onChanged:{addListener(){}}},
    runtime:{getURL:p=>p,onMessage:{addListener:fn=>receiveProgress=fn},sendMessage:async msg=>{
      if(msg.type==='ytl:status')return {ok:true,result:{loggedIn:true}};
      if(msg.type==='ytl:analyze')return new Promise(resolve=>jobs.push({msg,resolve}));
      sent.push(msg); return {ok:true,result:{}};
    }}};
  let source=readFileSync(new URL('../extension/content.js',import.meta.url),'utf8');
  source=source.replace("await import(chrome.runtime.getURL('core.js'))",'__core')
    .replace("await import(chrome.runtime.getURL('panel.js'))",'{createPanel:__createPanel}');
  vm.runInNewContext(source,context); await tick(); await callbacks.onToggle();
  const request=sent.find(m=>m.source==='youtube-luna-request');
  messages.message({source:context.window,origin:context.location.origin,data:{...request,source:'youtube-luna-response',captionsReady:true,language:'en',selectedLanguage:'en',cues}});
  return {player,jobs,sent,callbacks,state:()=>states.at(-1),tick:interval,
    event:name=>events[name]({target:player}),
    progress:(job,terms)=>receiveProgress({type:'ytl:progress',session:job.msg.session,analysisId:job.msg.analysisId,result:{terms,firstTermMs:10}})};
}

test('暂停立即解除等级筛选并抢占请求；恢复播放后迟到的暂停结果不污染原列表', async () => {
  const f=await fixture(); f.tick(); await tick();
  const regular=f.jobs[0]; assert.equal(regular.msg.payload.mode,undefined);
  const simple={term:'simple',lemma:'simple',level:'A1',kind:'word',start:20,end:24,quote:cues[2].text,meaning:'简单的'};
  f.progress(regular,[simple]); assert.equal(f.state().terms.length,0,'C2 播放时隐藏普通词');
  f.player.paused=true; f.event('pause'); await tick();
  assert.equal(f.state().paused,true); assert.equal(f.state().terms[0].term,'simple','暂停事件内立即显示缓存');
  const paused=f.jobs[1]; assert.equal(paused.msg.payload.mode,'pause');
  assert.deepEqual(Array.from(paused.msg.payload.cues,c=>c.start),[10,20,30]);
  regular.resolve({ok:true,result:{terms:[{...simple,term:'late-regular'}]}}); await tick();
  assert.equal(f.state().paused,true); assert.equal(f.state().terms.length,1);
  f.progress(paused,[{...simple,term:'home',lemma:'home',start:30,end:34,quote:cues[3].text}]);
  assert.equal(f.state().terms.length,2,'包括附近尚未播放到的句子');
  f.player.paused=false; f.event('play'); assert.equal(f.state().paused,false);
  assert.equal(f.state().terms.length,0,'恢复 C2 筛选');
  paused.resolve({ok:true,result:{terms:[simple]}}); await tick(); f.progress(paused,[simple]);
  assert.equal(f.state().terms.length,0,'迟到结果忽略');
  f.callbacks.onLevel('A1'); assert.equal(f.state().terms.length,0);
  f.callbacks.onLevel('A2'); assert.equal(f.state().terms.length,0);
  f.player.paused=true; f.event('pause'); await tick();
  assert.equal(f.state().terms[0].term,'simple','原播放结果没有被暂停清空');
  f.player.currentTime=41; f.event('seeked'); await tick();
  assert.deepEqual(Array.from(f.jobs.at(-1).msg.payload.cues,c=>c.start),[20,30,40]);
  const jobCount=f.jobs.length; f.tick(); await tick();
  assert.equal(f.jobs.length,jobCount,'暂停跳转后轮询不应重复取消并重发请求');
  f.jobs.at(-1).resolve({ok:false,error:'测试网络错误'}); await tick();
  assert.equal(f.state().paused,false); assert.equal(f.state().status,'测试网络错误');
});

