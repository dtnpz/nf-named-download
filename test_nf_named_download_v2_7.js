'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const src = fs.readFileSync('nf-named-download.user.js','utf8');
new vm.Script(src, {filename:'nf-named-download-v2.6.user.js'});
assert.match(src, /@version\s+2\.7/);
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
        getAudioTrack:()=>opts.track || {language:{bcp47:'ja'},contentProfile:'ddplus-5.1-dash'},
        getPlaybackStats:()=>opts.stats ?? null,
        getMovieId:()=> 99
    };
    const api={videoPlayer:{
        getAllPlayerSessionIds:()=>['watch:1'],
        getVideoPlayerBySessionId:()=>player
    },
    getVideoMetadataByVideoId:()=>({getCurrentVideo:()=>({getTitle:()=>opts.title||'Aurora Days'})})};
    const page={netflix:{appContext:{state:{playerApp:{getAPI:()=>api}}}}};
    const ctx={
        unsafeWindow:opts.noPlayer?{}:page,
        window:page,
        document:{querySelector:(sel)=> {
            if(sel.includes('video-title'))return opts.noDom?null:titleRoot;
            return null;
        }},
        navigator:{mediaSession:{metadata:null}},
        location:{pathname:'/watch/123456'},
        selectedLink:()=>['https://nflxvideo.net/link',{number:3}],
        filename:{value:'',type:'text'},
        edited:false,
        audioSummary:null,
        console
    };
    vm.createContext(ctx);
    vm.runInContext(names,ctx);
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
   'Aurora Days - S01E02 - th - aac - track-03.aac','HE-AAC 5.1 must not be misclassified DD+');
}
{
 const ctx=mock({track:{language:'ko',codec:'aac',channels:6}});
 assert.equal(vm.runInContext('selectedAudioInfo().codec',ctx),'aac',
    '5.1/6 channels must not imply DD+');
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
 assert.equal(vm.runInContext('selectedAudioInfo().codec',ctx),'aac',
   'Real HE-AAC must override a stale DD+ profile label');
}
{
 const ctx=mock({
   track:{languageCode:'zh-CN',channels:'5.1',displayName:'Mandarin 5.1'}
 });
 assert.equal(vm.runInContext('selectedAudioInfo().codec',ctx),'aac',
   '5.1 with no codec data is not evidence of E-AC-3');
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

console.log('PASS: v2.7 metadata, title/episode, current audio language, explicit DD+, HE-AAC 5.1, unknown-language fallback, editable filename, forced audio extensions, selected download.');
