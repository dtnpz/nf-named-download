from pathlib import Path
from playwright.sync_api import sync_playwright
import tempfile,json
source=Path('nf-named-download.user.js').read_text()
folder=Path(tempfile.mkdtemp(prefix='nf-v210-capture-'))
html='<meta charset="utf-8"><body style="background:#14212a;color:white;font:18px sans-serif"><div data-uia="video-title"><h4>สายยา</h4><span>ตอน 1</span></div></body>'
mocks=r'''window.audio={id:'audio51',languageCode:'zh-CN',channels:6};window.unsafeWindow=window;
window.fixturePlayer={getAudioTrack:()=>audio,getPlaybackStats:()=> 'Audio Track: zh-CN, Id: A:2:1;6;zh-CN;1;0;0;, Channels: 5.1, Codec: audio/mp4;codecs=mp4a.40.5 (ddplus51hq)'};
window.fixtureAPI={videoPlayer:{getAllPlayerSessionIds:()=>['watch:1'],getVideoPlayerBySessionId:()=>fixturePlayer}};
window.netflix={appContext:{state:{playerApp:{getAPI:()=>fixtureAPI}}}};
window.GM_getValue=(k,v)=>v;window.GM_setValue=()=>{};window.GM_registerMenuCommand=()=>{};window.GM_info={downloadMode:'browser'};window.GM_setClipboard=()=>{};
window.GM_xmlhttpRequest=r=>{queueMicrotask(()=>r.onload({status:200,responseHeaders:'Content-Length: '+(r.url.includes('/small')?22000000:226960000)+'\r\n'}));return{abort(){}}};
window.GM_download=r=>{window.downloaded={url:r.url,name:r.name};r.onload();return{abort(){}}};
window.timings=[];performance.getEntriesByType=()=>timings;window.PerformanceObserver=class{observe(){}};
window.nativeFetch=window.fetch;window.fetch=function(...args){window.nativePromise=nativeFetch.apply(this,args);return nativePromise;};'''
errors=[]
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True)
 context=browser.new_context(viewport={'width':1000,'height':740})
 def setup():
  page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
  page.route('**/*',lambda route:route.fulfill(status=200,content_type='text/html' if 'www.netflix.com' in route.request.url else 'application/octet-stream',headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*'},body=html if 'www.netflix.com' in route.request.url else 'original payload'))
  page.goto('https://www.netflix.com/watch/1');page.evaluate('(()=>{'+mocks+'})();');page.add_script_tag(content=source)
  return page
 def wait_links(page,count=1):
  page.wait_for_function("n => document.querySelector('#nfLinkBox')?.shadowRoot.querySelectorAll('select option').length === n",arg=count,timeout=10000)
 def selected(page):return page.locator('#nfLinkBox select').input_value()
 page=setup()
 answer=page.evaluate('''async()=>{const promise=fetch(new URL('https://test.nflxvideo.net/range/9000-12000?token=a%2Fb+z'));const preserved=promise===nativePromise;return {preserved,body:await(await promise).text()}}''')
 assert answer=={'preserved':True,'body':'original payload'},answer
 wait_links(page);assert selected(page)=='https://test.nflxvideo.net/?token=a%2Fb+z'
 page.evaluate("fetch(new Request('https://test.nflxvideo.net/small?token=test',{headers:{Range:'bytes=0-4095'}}))")
 wait_links(page,2)
 result=page.evaluate("new Promise(resolve=>{const x=new XMLHttpRequest();x.open('GET','https://test.nflxvideo.net/xhr/range/65536-70000?token=test');x.onload=()=>resolve(x.responseText);x.send()})")
 assert result=='original payload';wait_links(page,3)
 page.locator('#nfLinkBox select').select_option(index=1)
 page.get_by_role('button',name='Download selected',exact=True).click()
 assert page.evaluate('downloaded.name').endswith('.eac3')
 assert 'EAC3' in ' '.join(page.locator('#nfLinkBox .destination').all_text_contents())
 page.screenshot(path=str(folder/'captured-files.png'))
 page.close()
 # Incoming Worker message carries the URL; page resource timing is deliberately empty.
 page=setup()
 reply=page.evaluate('''()=>new Promise((resolve,reject)=>{const code="fetch('https://test.nflxvideo.net/worker-in/range/50000-60000?token=test').then(r=>r.text()).then(body=>postMessage({body,nested:{url:'https://test.nflxvideo.net/worker-in/range/50000-60000?token=test'}}))";const url=URL.createObjectURL(new Blob([code],{type:'application/javascript'}));window.w=new Worker(url);w.onmessage=e=>resolve(e.data.body);w.onerror=e=>reject(e.message)})''')
 assert reply=='original payload';wait_links(page);assert '/worker-in?' in selected(page)
 page.evaluate('w.terminate()');page.close()
 # Outgoing Worker message carries a JSON-escaped CDN URL.
 page=setup()
 reply=page.evaluate(r'''()=>new Promise(resolve=>{window.w=new Worker(URL.createObjectURL(new Blob(['onmessage=e=>postMessage("ok")'],{type:'application/javascript'})));w.onmessage=e=>resolve(e.data);w.postMessage({manifest:JSON.stringify({url:'https://test.nflxvideo.net/worker-out/range/8000-9000?token=test'})})})''')
 assert reply=='ok';wait_links(page);assert '/worker-out?' in selected(page)
 page.evaluate('w.terminate()');page.close()
 # MessageChannel ports retain normal delivery and are observed in either direction.
 page=setup()
 value=page.evaluate('''()=>new Promise(resolve=>{window.channel=new MessageChannel();channel.port1.onmessage=e=>resolve(e.data.ok);channel.port2.postMessage({ok:true,url:'https://test.nflxvideo.net/port/range/8192-12288?token=test'})})''')
 assert value is True;wait_links(page);assert '/port?' in selected(page)
 page.evaluate('channel.port1.close();channel.port2.close()');page.close()
 # A request started before the SPA polling callback must not disappear, and old buffered entries must not return.
 page=setup()
 page.evaluate("timings=[{startTime:1,name:'https://test.nflxvideo.net/old/range/0-4095?token=test'}]")
 wait_links(page)
 page.evaluate("history.pushState({},'', '/watch/2');timings.push({startTime:2,name:'https://test.nflxvideo.net/new/range/4096-8191?token=test'})")
 page.wait_for_function("document.querySelector('#nfLinkBox')?.shadowRoot.querySelector('select')?.value.includes('/new?')",timeout=10000)
 wait_links(page);assert '/new?' in selected(page)
 page.close()
 assert not errors,errors
 browser.close()
print('PASS: real fetch(URL/Request), unchanged fetch result/body, XHR, incoming/outgoing Worker messages, MessageChannel and SPA resource deduplication with page timing disabled.')
print('PASS: captured files become selectable and the existing EAC3 download naming is preserved.')
print('Preview:',folder/'captured-files.png')
