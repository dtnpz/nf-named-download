from pathlib import Path
from playwright.sync_api import sync_playwright
import tempfile

source = Path(__file__).with_name('nf-named-download.user.js').read_text()
html = '<meta charset="utf-8"><body style="background:#15212a;color:white"><div data-uia="video-title"><h4>สายยา</h4><span>ตอน 1</span></div></body>'
mocks = r'''window.unsafeWindow=window;window.audio={id:'selected51',languageCode:'zh-CN',channels:6};
window.fixturePlayer={getAudioTrack:()=>audio};window.fixtureAPI={videoPlayer:{getAllPlayerSessionIds:()=>['watch:1'],getVideoPlayerBySessionId:()=>fixturePlayer}};
window.netflix={appContext:{state:{playerApp:{getAPI:()=>fixtureAPI}}}};
window.headRequests=[];window.GM_getValue=(k,v)=>v;window.GM_setValue=()=>{};window.GM_registerMenuCommand=()=>{};window.GM_info={downloadMode:'browser'};window.GM_setClipboard=v=>window.copied=v;
window.GM_xmlhttpRequest=r=>{headRequests.push(r.url);queueMicrotask(()=>r.onload({status:200,responseHeaders:'Content-Length: '+(r.url.includes('/audio')?226960000:800000000)+'\r\n'}));return{abort(){}}};
window.GM_download=r=>{window.downloaded={url:r.url,name:r.name};r.onload();return{abort(){}}};
performance.getEntriesByType=()=>[];window.PerformanceObserver=class{constructor(cb){window.emitResources=entries=>cb({getEntries:()=>entries})}observe(){}};
window.originalWorker=Worker;window.originalPortPost=MessagePort.prototype.postMessage;
window.originalChannel=MessageChannel;window.originalFetch=fetch;
window.fetch=function(...args){window.nativePromise=originalFetch.apply(this,args);return nativePromise};'''
artifacts = Path(tempfile.mkdtemp(prefix='nf-v211-targeting-'))
errors = []
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width':1000,'height':760})
    page.on('pageerror', lambda e: errors.append(str(e)))
    def route(request):
        is_page = 'www.netflix.com' in request.request.url
        request.fulfill(status=200, content_type='text/html' if is_page else 'application/octet-stream',
                        headers={'Access-Control-Allow-Origin':'*'}, body=html if is_page else 'original bytes')
    page.route('**/*', route)
    page.goto('https://www.netflix.com/watch/1')
    page.evaluate('(()=>{'+mocks+'})();')
    page.add_script_tag(content=source)
    # Direct URLs and later ranges are actual requests, but must not be candidates.
    page.evaluate("Promise.all([fetch('https://test.nflxvideo.net/wrong-small?token=test'),fetch('https://test.nflxvideo.net/wrong-range/range/4096-8191?token=test')])")
    page.evaluate("emitResources([{startTime:1,name:'https://test.nflxvideo.net/wrong-resource?token=test'},{startTime:2,name:'https://test.nflxvideo.net/wrong-range/range/50000-60000?token=test'}])")
    # A URL merely carried in a worker message must never be probed.
    assert page.evaluate('Worker===originalWorker && MessagePort.prototype.postMessage===originalPortPost && MessageChannel===originalChannel')
    reply = page.evaluate('''()=>new Promise(resolve=>{window.w=new Worker(URL.createObjectURL(new Blob(['onmessage=e=>postMessage(e.data)'],{type:'application/javascript'})));w.onmessage=e=>resolve(e.data.url);w.postMessage({url:'https://test.nflxvideo.net/catalog-only/range/0-4095?token=test'})})''')
    assert '/catalog-only/' in reply
    page.evaluate('w.terminate()')
    assert page.evaluate('headRequests.length') == 0
    # Match the attachment's initial-range request, retaining exact query bytes.
    result = page.evaluate('''async()=>{const promise=fetch(new URL('https://test.nflxvideo.net/audio/range/0-4095?o=a%2Fb+z&x=1&x=2'));const same=promise===nativePromise;return{same,body:await(await promise).text()}}''')
    assert result == {'same':True,'body':'original bytes'}
    page.wait_for_function("document.querySelector('#nfLinkBox')?.shadowRoot.querySelectorAll('select option').length===1")
    audio = 'https://test.nflxvideo.net/audio?o=a%2Fb+z&x=1&x=2'
    assert page.locator('#nfLinkBox select').input_value() == audio
    value = page.evaluate("new Promise(resolve=>{const x=new XMLHttpRequest();x.open('GET','https://test.nflxvideo.net/video/range/0-65535?token=test');x.onload=()=>resolve(x.responseText);x.send()})")
    assert value == 'original bytes'
    page.wait_for_function("document.querySelector('#nfLinkBox').shadowRoot.querySelectorAll('select option').length===2")
    page.evaluate("emitResources([{startTime:3,name:'https://test.nflxvideo.net/third/range%2F0-4095?token=test'}])")
    page.wait_for_function("document.querySelector('#nfLinkBox').shadowRoot.querySelectorAll('select option').length===3")
    assert page.evaluate('headRequests.length') == 3
    assert all('/wrong' not in x and '/catalog-only' not in x for x in page.evaluate('headRequests'))
    page.get_by_role('button', name='Download selected', exact=True).click()
    assert page.evaluate('downloaded.url') == audio
    assert page.evaluate('downloaded.name').endswith('.eac3')
    page.screenshot(path=str(artifacts/'strict-initial-ranges.png'))
    # SPA deduplication keeps old buffered URLs from replacing the new selection.
    page.evaluate("history.pushState({},'', '/watch/2');emitResources([{startTime:3,name:'https://test.nflxvideo.net/third/range%2F0-4095?token=test'},{startTime:4,name:'https://test.nflxvideo.net/new/range/0-4095?token=test'}])")
    page.wait_for_function("document.querySelector('#nfLinkBox')?.shadowRoot.querySelector('select')?.value.includes('/new?')")
    assert page.locator('#nfLinkBox select option').count() == 1
    assert not errors, errors
    browser.close()
print('PASS: genuine initial-range fetch/XHR/resource requests accepted; direct, nonzero-range and worker-catalog URLs rejected before probing.')
print('PASS: signed queries and response bytes preserved; selectable files, EAC3 naming and SPA deduplication retained.')
print('Preview:', artifacts/'strict-initial-ranges.png')
