import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../extension/page-bridge.js',import.meta.url),'utf8');
function fixture(fetchResult) {
  const messages=[],listeners=new Map();
  const track={languageCode:'en',vssId:'.en',baseUrl:'https://www.youtube.com/api/timedtext?v=test&lang=en'};
  const player={getPlayerResponse:()=>({videoDetails:{videoId:'test'},captions:{playerCaptionsTracklistRenderer:{captionTracks:[track]}}}),
    getOption:()=>({languageCode:'en',vss_id:'.en'}),querySelector:()=>({getAttribute:()=> 'true'}),loadModule(){}};
  class XHR {open(){} addEventListener(){}}
  const context={URL,AbortSignal,setTimeout,XMLHttpRequest:XHR,location:{href:'https://www.youtube.com/watch?v=test',origin:'https://www.youtube.com'},
    document:{getElementById:()=>player},DOMParser:class {parseFromString(){return {querySelector:()=>true}}}};
  context.window={fetch:fetchResult,addEventListener:(name,fn)=>listeners.set(name,fn),postMessage:message=>messages.push(message)};
  vm.runInNewContext(source,context);
  return {context,messages,request:()=>listeners.get('message')({source:context.window,origin:context.location.origin,data:{source:'youtube-luna-request',requestId:'request1',id:'test'}})};
}
const body=JSON.stringify({events:[{tStartMs:1000,dDurationMs:3000,segs:[{utf8:'The view was sick.'}]}]});

test('复用播放器已成功取得的英文字幕，开始学习即可提前分析',async()=>{
  const f=fixture(async()=>({clone:()=>({text:async()=>body}),ok:true,text:async()=>body}));
  await f.context.window.fetch('https://www.youtube.com/api/timedtext?v=test&lang=en');
  await new Promise(resolve=>setTimeout(resolve,0));await f.request();
  assert.equal(f.messages[0].captured,true);assert.equal(f.messages[0].cues[0].text,'The view was sick.');
});

test('完整字幕请求未返回时，英文字幕就绪通知先到达，不阻塞当前字幕分析',async()=>{
  const f=fixture(()=>new Promise(()=>{}));
  void f.request();await new Promise(resolve=>setTimeout(resolve,350));
  assert.equal(f.messages[0].captionsReady,true);assert.equal(f.messages[0].pendingTrack,true);
});
