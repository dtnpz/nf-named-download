'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const src = fs.readFileSync('nf-named-download.user.js','utf8');
new vm.Script(src, {filename:'nf-named-download-v3.1.user.js'});
assert.match(src, /@version\s+3\.1/);
assert.match(src, /@grant\s+unsafeWindow/);
assert.ok(src.includes("downloadButton.disabled = downloading || !selected"));
assert.ok(src.includes("choices.value = chosen ? chosen[0] : ''"));
assert.ok(!src.includes("name += '.mp4'"));
const between = (from,to) => {
    const a=src.indexOf(from);assert.ok(a>=0,from);
    const b=src.indexOf(to,a);assert.ok(b>a,to);
    return src.slice(a,b);
};
const names=between('    function text(selector) {','    function resetOnNavigation() {');
function mock(opts={}) {
    const spans=(opts.spans || ['S1E2']).map(textContent=>({textContent}));
    const titleRoot={
        querySelector:()=>({textContent:opts.title || 'Aurora Days'}),
        querySelectorAll:()=>spans
    };
    const player=opts.noPlayer?null:{
        getAudioTrackList:()=>opts.trackList || [],
        getAudioTrack:()=>opts.track ?? {language:{bcp47:'ja'},contentProfile:'ddplus-5.1-dash'},
        getPlaybackStats:()=>opts.stats ?? null,
        getMovieId:()=> 99
    };
    const api={videoPlayer:{
        getAllPlayerSessionIds:()=>['watch:1'],
        getVideoPlayerBySessionId:()=>player
    },
    getVideoMetadataByVideoId:()=>({getCurrentVideo:()=>({getTitle:()=>opts.title||'Aurora Days'})})};
    const page={netflix:{appContext:{state:{playerApp:{getAPI:()=>api}}}}};
    const menuItems = opts.menuItems ?? null;
    const rowNodes = (menuItems || []).map((item,index)=>({
        textContent:item,
        className:index===(opts.selectedAudioIndex??0)?'selected':'',
        getAttribute:()=>null,
        querySelector:()=>null
    }));
    const subtitleRow = {textContent:'คำบรรยาย (5.1)',className:'selected',getAttribute:()=>null,querySelector:()=>null};
    const audioCol = {querySelectorAll:()=>rowNodes};
    const subtitleCol = {querySelectorAll:()=>[subtitleRow]};
    const audioHeading = {textContent:'เสียง', parentElement:audioCol};
    const subtitleHeading = {textContent:'คำบรรยาย', parentElement:subtitleCol};
    const selectors = sel => {
        if(sel.includes('.audio-tracks')) return menuItems ? [audioCol] : [];
        if(sel.startsWith('h2,h3,h4,h5,h6'))return [audioHeading,subtitleHeading];
        return [];
    };
    const ctx={
        unsafeWindow:opts.noPlayer?{}:page,
        window:page,
        document:{querySelector:(sel)=> {
            if(sel.includes('video-title'))return opts.noDom?null:titleRoot;
            return null;
        },querySelectorAll:selectors},
        navigator:{mediaSession:{metadata:null}},
        location:{pathname:'/watch/123456'},
        selectedLink:()=>['https://nflxvideo.net/link',{number:3}],
        filename:{value:'',type:'text'},
        edited:false,
        audioSummary:null,
        lastCheckedAudioChoice:null,
        lastAudioTrackKey:null,
        console
    };
    vm.createContext(ctx);
    vm.runInContext(names,ctx);
    ctx.changeAudioChoice = index => rowNodes.forEach((row,i)=>{row.className=i===index?'selected':'';});
    ctx.hideMenu = () => {ctx.document.querySelectorAll=()=>[];};
    return ctx;
}
{
 const ctx=mock();
 const v=vm.runInContext('suggestedAudioFilename()',ctx);
 assert.equal(v,'Aurora Days - S01E02 - ja - eac3 - track-03.eac3');
 vm.runInContext('suggestFilename()',ctx);
 assert.equal(ctx.filename.value,v);
}
{
 const ctx=mock({track:{languageCode:'th',codec:'mp4a.40.5',channels:'5.1'}});
 assert.equal(vm.runInContext('suggestedAudioFilename()',ctx),
   'Aurora Days - S01E02 - th - eac3 - track-03.eac3','Confirmed selected 5.1 determines the requested filename');
}
{
 const ctx=mock({track:{language:'ko',codec:'aac',channels:6}});
 assert.equal(vm.runInContext('selectedAudioInfo().codec',ctx),'eac3');
 assert.equal(vm.runInContext('selectedAudioInfo().measuredCodec',ctx),'aac');
 assert.equal(vm.runInContext('selectedAudioInfo().codecVerified',ctx),false);
}
{
 const ctx=mock({track:{languageCode:'en-GB',codec:'ec-3'}});
 assert.equal(vm.runInContext('selectedAudioInfo().codec',ctx),'eac3');
 assert.equal(vm.runInContext('selectedAudioInfo().lang',ctx),'en-gb');
}
{
 const ctx=mock({track:{languageCode:'es',codec:'aac'},title:'Sample Drama',spans:['Season 3 Episode 11']});
 assert.equal(vm.runInContext('suggestedAudioFilename()',ctx),
    'Sample Drama - S03E11 - es - aac - track-03.aac');
}
{
 const ctx=mock({noPlayer:true,noDom:true,title:'Unseen'});
 assert.equal(vm.runInContext('selectedAudioInfo().lang',ctx),'und',
    'If selected audio is unavailable, do not guess from UI locale/subtitles');
 assert.equal(vm.runInContext('selectedAudioInfo().codec',ctx),'aac');
}
{
 const ctx=mock();
 ctx.edited=true;
 ctx.filename.value='custom.aac';
 vm.runInContext('suggestFilename()',ctx);
 assert.equal(ctx.filename.value,'custom.eac3','Preserve manually edited basename, normalize codec suffix');
}
const handler=between('        download.onclick = () => {','        content.appendChild(download);');
function simulateDownload(codec,name='custom-video.mp4') {
 const links=new Map([['https://cdn.nflxvideo.net/test',{number:1,bytes:1234}]]);
 let captured=null;
 const ctx={
  links,manualChoiceUrl:null,downloading:false,
  activeProbes:5,probeQueue:[{url:'other'}],
  status:{textContent:''},filename:{value:name},download:{},
  downloadButton:{disabled:false},
  DOWNLOAD_FOLDER:'gm/nfaudio',
  GM_info:{downloadMode:'browser'},
  GM_download:args=>{captured=args;},
  selectedLink:()=>[...links.entries()][0],
  selectedAudioInfo:()=>({codec}),
  suggestFilename:()=>{},
  formatSize:x=> (x/1000000).toFixed(2)+' MB',
  safeName:x=>x.replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g,'-').trim(),
  updateSummary:()=>{},
  setInterval:()=>1,
  clearInterval:()=>{},
  console
 };
 vm.createContext(ctx);vm.runInContext(handler,ctx);
 ctx.download.onclick();
 assert.ok(captured,'Expected GM_download call even while other size probes run');
 return captured;
}
{
 const r=simulateDownload('eac3','Japanese Audio.mp4');
 assert.equal(r.name,'gm/nfaudio/Japanese Audio.eac3');
}
{
 const r=simulateDownload('aac','Thai Audio.eac3');
 assert.equal(r.name,'gm/nfaudio/Thai Audio.aac');
}

{
 const ctx=mock({
   track:{languageCode:'zh-CN',channels:'5.1',displayName:'Mandarin 5.1'},
   stats:'Audio Track: zh-cn, Id: a1, Channels: 5.1, Codec: audio/mp4;codecs=ec-3 (ddplus)'
 });
 assert.equal(vm.runInContext('selectedAudioInfo().lang',ctx),'zh-cn');
 assert.equal(vm.runInContext('selectedAudioInfo().codec',ctx),'eac3');
 assert.equal(vm.runInContext('selectedAudioInfo().codecVerified',ctx),true);
}
{
 const ctx=mock({
   track:{languageCode:'zh-CN',channels:'5.1',contentProfile:'ddplus-5.1-dash'},
   stats:'Audio Track: zh-cn, Id: a1, Channels: 5.1, Codec: audio/mp4;codecs=mp4a.40.5 (he-aac)'
 });
 assert.equal(vm.runInContext('selectedAudioInfo().codec',ctx),'eac3');
 assert.equal(vm.runInContext('selectedAudioInfo().measuredCodec',ctx),'aac');
}
{
 const ctx=mock({
   track:{languageCode:'zh-CN',channels:'5.1',displayName:'Mandarin 5.1'}
 });
 assert.equal(vm.runInContext('selectedAudioInfo().codec',ctx),'eac3');
 assert.equal(vm.runInContext('selectedAudioInfo().selectionConfirmed',ctx),true);
 assert.equal(vm.runInContext('selectedAudioInfo().codecVerified',ctx),false);
}
{
 const ctx=mock();
 ctx.edited=true;
 ctx.filename.value='Manual Title - ja - track-01.mp4';
 vm.runInContext('suggestFilename()',ctx);
 assert.equal(ctx.filename.value,'Manual Title - ja - track-01.eac3',
  'Display must not retain obsolete MP4 suffix even if manually edited');
}
{
 const req=simulateDownload('eac3','Audio.mp4');
 req.onprogress({loaded:1000,total:2000});
 req.onload();
}


{
 const ctx=mock({
    track:{languageCode:'zh-CN',codec:'mp4a.40.5',channels:6},
    stats:'Audio Track: zh-cn, Id: a, Channels: 5.1, Codec: audio/mp4;codecs=mp4a.40.5 (he-aac)',
    menuItems:['จีนกลาง (ผู้ตงฮั่ว) [ต้นฉบับ] (5.1)','จีนกลาง (ผู้ตงฮั่ว) [ต้นฉบับ]','ไทย'],
    selectedAudioIndex:0
 });
 const a=vm.runInContext('selectedAudioInfo()',ctx);
 assert.equal(a.codec,'eac3','Explicit checked 5.1 option must label eac3 by user assumption');
 assert.equal(a.selectionConfirmed,true);
 assert.equal(a.codecVerified,false,'AAC playback is not proof of EAC3 despite the requested output label');
 assert.equal(a.measuredCodec,'aac');
 assert.equal(a.source,'checked-audio-menu');
 assert.equal(a.lang,'zh-cn');
 assert.match(vm.runInContext('suggestedAudioFilename()',ctx),/zh-cn - eac3 - track-03\.eac3$/);
 ctx.changeAudioChoice(1);
 const b=vm.runInContext('selectedAudioInfo()',ctx);
 assert.equal(b.codec,'aac','Checked stereo menu option must label AAC');
 assert.equal(b.channelLabel,'stereo');
 ctx.changeAudioChoice(0);
 vm.runInContext('selectedAudioInfo()',ctx);
 ctx.hideMenu();
 assert.equal(vm.runInContext('selectedAudioInfo().codec',ctx),'eac3',
    'Last known selected audio choice should survive temporary menu closure');
}
{
 const ctx=mock({
    track:{languageCode:'zh-CN',codec:'ec-3'},
    menuItems:['จีนกลาง (ผู้ตงฮั่ว) [ต้นฉบับ]','ไทย'],
    selectedAudioIndex:0
 });
 assert.equal(vm.runInContext('selectedAudioInfo().codec',ctx),'aac',
    'Checked non-5.1 audio policy overrides a codec field for naming');
}
{
 const ctx=mock({
    track:{languageCode:'zh-CN',codec:'aac'},
    menuItems:['จีนกลาง (ผู้ตงฮั่ว) [ต้นฉบับ]','ไทย'],
    selectedAudioIndex:0
 });
 assert.equal(vm.runInContext('selectedAudioInfo().codec',ctx),'aac',
    'Checked Subtitle (5.1) must NOT determine audio codec');
}
{
 const ctx=mock({
    track:{languageCode:'zh-CN',displayName:'Mandarin 5.1'},
    menuItems:['จีนกลาง (ผู้ตงฮั่ว) [ต้นฉบับ] (5.1)','ไทย'],
    selectedAudioIndex:0
 });
 assert.equal(vm.runInContext('selectedAudioInfo().codec',ctx),'eac3');
 assert.equal(vm.runInContext('selectedAudioInfo().codecVerified',ctx),false);
 ctx.edited=true;
 ctx.filename.value='Custom Title - zh-cn - aac - track-02.mp4';
 vm.runInContext('suggestFilename()',ctx);
 assert.equal(ctx.filename.value,'Custom Title - zh-cn - eac3 - track-02.eac3');
 ctx.audioSummary={textContent:''};
 vm.runInContext('suggestFilename()',ctx);
 assert.match(ctx.audioSummary.textContent,/5\.1 selected/i);
 assert.doesNotMatch(ctx.audioSummary.textContent,/assumed|unverified/i);
}
assert.match(src, /NF · Media downloader v3/);
assert.ok(src.includes('lastCheckedAudioChoice = null;'),'Reset cached menu on navigation');

console.log('PASS: v3.1 metadata, title/episode, current audio language, explicit DD+, HE-AAC 5.1, unknown-language fallback, editable filename, forced audio extensions, selected download.');

// Missing menu/codec data: use selected channel metadata directly.
for (const field of ['channels','channelCount','numChannels','audioChannels','channelLayout']) {
 const ctx=mock({track:{languageCode:'zh-CN',[field]:field==='channelLayout'?'5.1':6}});
 assert.equal(vm.runInContext('selectedAudioInfo().codec',ctx),'eac3',field);
 assert.equal(vm.runInContext('selectedAudioInfo().channels',ctx),6,field);
}
{
 const ctx=mock({track:7,trackList:[{id:7,languageCode:'fr',channels:6}]});
 assert.equal(vm.runInContext('selectedAudioInfo().codec',ctx),'eac3');
 assert.equal(vm.runInContext('selectedAudioInfo().lang',ctx),'fr');
}
{
 const track={id:'mandarin-surround',languageCode:'zh-CN',channels:6};
 const ctx=mock({track,menuItems:['จีนกลาง (ผู้ตงฮั่ว) [ต้นฉบับ] (5.1)']});
 assert.equal(vm.runInContext('selectedAudioInfo().codec',ctx),'eac3');
 ctx.hideMenu();
 Object.assign(track,{id:'thai-stereo',languageCode:'th',channels:2});
 assert.equal(vm.runInContext('selectedAudioInfo().codec',ctx),'aac');
 assert.equal(vm.runInContext('selectedAudioInfo().lang',ctx),'th');
 assert.equal(ctx.lastCheckedAudioChoice,null);
}
{
 const ctx=mock({track:{languageCode:'th',channels:2,codec:'aac'},
 stats:'Audio Track: en, Id: old, Channels: 5.1, Codec: ec-3'});
 assert.equal(vm.runInContext('selectedAudioInfo().lang',ctx),'th');
 assert.equal(vm.runInContext('selectedAudioInfo().codec',ctx),'aac');
}
console.log('PASS: v3 player channel fields, selected track IDs, missing codec/menu, and stale selection invalidation.');
{
 const ctx=mock({track:{id:'old-thai',languageCode:'th',channels:2},
  menuItems:['จีนกลาง (ผู้ตงฮั่ว) [ต้นฉบับ] (5.1)']});
 assert.equal(vm.runInContext('selectedAudioInfo().lang',ctx),'zh-cn');
 assert.equal(vm.runInContext('selectedAudioInfo().codec',ctx),'eac3');
}

const captureCode=between('    function cleanLink(raw)', '    function text(selector)');
{
 const context={URL,location:{href:'https://www.netflix.com/watch/1'}};
 vm.createContext(context);vm.runInContext(captureCode,context);
 const clean='https://audio.nflxvideo.net/?o=a%2Fb+z&x=1&x=2';
 for (const range of ['range/0-4095','range/0-65535','range%2F0-4095']) {
  assert.equal(context.cleanLink('https://audio.nflxvideo.net/'+range+'?o=a%2Fb+z&x=1&x=2'),clean);
 }
 for (const url of [
  'https://audio.nflxvideo.net/range/4096-8191?token=test',
  'https://audio.nflxvideo.net/file?token=test',
  'https://audio.nflxvideo.net/file?range=0-4095',
  'https://audio.nflxvideo.net/not-range/0-4095?token=test',
  'https://example.org/range/0-4095',
  'https://audio.nflxvideo.net.evil.test/range/0-4095',
  'http://audio.nflxvideo.net/range/0-4095',
 ]) {
  assert.equal(context.cleanLink(url),null,url);
  assert.equal(context.cleanLink(url,true),null,'No direct-URL bypass: '+url);
 }
}
assert.ok(!src.includes('allowDirect'));
assert.ok(!src.includes('inspectMessage'));
assert.ok(!src.includes('new Proxy(page[name]'));
console.log('PASS: v3 initial-range-only targeting, signed-query preservation, rejected direct/nonzero URLs and removal of arbitrary message capture.');

assert.ok(src.includes("data-nf-named-download-active"),"missing guard");
assert.ok(src.includes("duplicatePanelCount()"),"missing duplicate detection");
assert.ok(src.includes("Diagnose NF downloader duplicates / download mode"),"missing diagnostic menu");
function firstExecution(duplicate){
 const root={
  attributes:new Map(duplicate?[['data-nf-named-download-active','3.1']]:[]),
  hasAttribute(k){return this.attributes.has(k)},
  setAttribute(k,v){this.attributes.set(k,v)},
  appendChild(node){this.lastAppended=node}
 };
 const from=src.indexOf("    const singletonRoot = document.documentElement;");
 const to=src.indexOf("\n    // Relative to the browser's download folder.",from);
 assert.ok(from>0 && to>from);
 const preamble=src.slice(from,to);
 const code="(function(){const document={documentElement:root,createElement:()=>({textContent:''})};\n"+preamble+"\nreturn true;})()";
 return {executed:vm.runInNewContext(code,{root,location:{hostname:'www.netflix.com'}}),root};
}
{
 const a=firstExecution(false);
 assert.equal(a.executed,true,'first script instance starts');
 assert.equal(a.root.attributes.get('data-nf-named-download-active'),'3.1');
 const b=firstExecution(true);
 assert.equal(b.executed,undefined,'second instance exits early');
}

{
 let attempts=0;
 const ctx={
   selectedLink:()=>['https://cdn.nflxvideo.net/test',{bytes:1234,number:1}],
   downloading:false,download:{},
   GM_info:{downloadMode:'native'},
   GM_download:()=>{attempts++;},
   status:{textContent:''}
 };
 vm.createContext(ctx);
 vm.runInContext(handler,ctx);
 ctx.download.onclick();
 assert.equal(attempts,0,'Native mode should not start a download that prompts Save As');
 assert.match(ctx.status.textContent,/Browser API/);
}
assert.ok(src.includes('data-nf-downloader-owner="3.1"'),
 'Legacy overlay CSS selector missing');
assert.ok(src.includes("panel.dataset.nfDownloaderOwner = '3.1'"),
 'Current overlay must be excluded from legacy CSS');

console.log("PASS: 3.1 duplicate-init guard.");
