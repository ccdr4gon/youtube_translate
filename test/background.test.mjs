import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';

test('扩展收到部分讲解即推送页面，完成后才缓存，取消后不再转发', async () => {
  globalThis.crypto ??= webcrypto;
  let receiveNative, receiveContent;
  const sent = [], pageMessages = [], storage = {};
  const port = {
    onMessage: {addListener: fn => receiveNative = fn}, onDisconnect: {addListener() {}},
    postMessage: message => sent.push(message)
  };
  globalThis.chrome = {
    runtime: {id:'test-extension',connectNative:()=>port,onMessage:{addListener:fn=>receiveContent=fn}},
    storage: {local: {
      get: async key => typeof key === 'string' ? {[key]:storage[key]} : storage,
      set: async value => Object.assign(storage,value), remove: async keys => {for(const key of keys) delete storage[key]}
    }},
    tabs: {sendMessage:async (tabId,message)=>pageMessages.push({tabId,message}),onRemoved:{addListener(){}}}
  };
  await import('../extension/background.js');
  const sender={id:'test-extension',tab:{id:7}};
  const payload={videoId:'test-video',cues:[{id:'a',text:'The view is sick.',start:0,end:5}],context:[]};
  let complete=false;
  const result=new Promise(resolve=>receiveContent({type:'ytl:analyze',session:'s1',analysisId:'batch1',payload},sender,r=>{complete=true;resolve(r)}));
  await new Promise(resolve=>setTimeout(resolve,20));
  const job=sent.find(m=>m.type==='analyze');assert.ok(job);
  receiveNative({id:job.id,type:'progress',result:{terms:[{term:'sick'}],firstTermMs:3000}});
  assert.equal(pageMessages[0].message.analysisId,'batch1');assert.equal(complete,false);assert.equal(storage.cacheIndex,undefined);
  receiveNative({id:job.id,ok:true,result:{terms:[{term:'sick'}],firstTermMs:3000}});
  assert.equal((await result).ok,true);assert.equal(storage.cacheIndex.length,1);
  const paused=new Promise(resolve=>receiveContent({type:'ytl:analyze',session:'paused',analysisId:'pause-batch',payload:{...payload,mode:'pause'}},sender,resolve));
  await new Promise(resolve=>setTimeout(resolve,20));
  const pauseJob=sent.filter(m=>m.type==='analyze').at(-1);
  assert.equal(pauseJob.payload.mode,'pause','同一字幕的暂停请求不能复用仅选 5 词的播放缓存');
  receiveNative({id:pauseJob.id,ok:true,result:{terms:[{term:'view',level:'A1'}]}});
  assert.equal((await paused).result.terms[0].term,'view');
  assert.equal(storage.cacheIndex.length,2);
  const second=new Promise(resolve=>receiveContent({type:'ytl:analyze',session:'s2',analysisId:'batch2',payload:{...payload,videoId:'other-video'}},sender,resolve));
  await new Promise(resolve=>setTimeout(resolve,20));
  const lastJob=sent.filter(m=>m.type==='analyze').at(-1);
  receiveContent({type:'ytl:cancel',session:'s2'},sender,()=>{});
  receiveNative({id:lastJob.id,type:'progress',result:{terms:[{term:'late'}]}});
  assert.equal((await second).ok,false);assert.equal(pageMessages.length,1);
  delete globalThis.chrome;
});
