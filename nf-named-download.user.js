// ==UserScript==
// @name         NF Named Download
// @namespace    http://tampermonkey.net/
// @version      2.5
// @description  Select captured media files and download the chosen file, smallest by default.
// @match        *://*/*
// @grant        GM_setClipboard
// @grant        GM_download
// @grant        GM_xmlhttpRequest
// @grant        GM_info
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @connect      nflxvideo.net
// @run-at       document-start
// @noframes
// ==/UserScript==

(function () {
    'use strict';

    // Relative to the browser's download folder. Locally, gm/nfaudio points to
    // /datadisk/daily/gm/nfaudio so other browser downloads are unaffected.
    const DOWNLOAD_FOLDER = 'gm/nfaudio';
    // NF media requests made in a worker may not appear in page timing.
    const isNFPage = /(^|\.)netflix\.com$/i.test(location.hostname);
    const links = new Map();
    const seen = new Set();
    const probeQueue = [];
    let activeProbes = 0;
    let failedProbes = 0;
    let generation = 0;
    let resourceStartTime = 0;
    let downloading = false;
    // Null means automatic smallest; a manual selection stays pinned while new links arrive.
    let manualChoiceUrl = null;
    let pageKey = location.origin + location.pathname;
    let panel, choices, filename, status, summary, downloadButton;
    let panelBody, panelHeading, minimizeButton;
    let closed = false;
    let edited = false;
    let savedUI = {};
    try { savedUI = GM_getValue('nflx-panel-ui', {}) || {}; } catch (_) {}
    let minimized = savedUI.minimized === true;
    let panelPosition = Number.isFinite(savedUI.x) && Number.isFinite(savedUI.y)
        ? { x: savedUI.x, y: savedUI.y } : null;

    function savePanelState() {
        try {
            GM_setValue('nflx-panel-ui', { ...panelPosition, minimized });
        } catch (_) {}
    }

    function fitPanel() {
        if (!panel || panel.style.display === 'none') return;
        const rect = panel.getBoundingClientRect();
        const x = Math.max(8, Math.min(panelPosition?.x ?? rect.left, window.innerWidth - rect.width - 8));
        const y = Math.max(8, Math.min(panelPosition?.y ?? rect.top, window.innerHeight - rect.height - 8));
        panelPosition = { x, y };
        Object.assign(panel.style, { left: `${x}px`, top: `${y}px`, right: 'auto', bottom: 'auto' });
    }

    function applyPanelState() {
        if (!panel) return;
        panelBody.hidden = minimized;
        panel.style.width = minimized ? '240px' : '430px';
        panelHeading.textContent = minimized ? 'NFLX' : 'NFLX · Smallest file';
        minimizeButton.textContent = minimized ? '+' : '−';
        minimizeButton.title = minimized ? 'Restore downloader' : 'Minimize downloader';
        minimizeButton.setAttribute('aria-label', minimizeButton.title);
        minimizeButton.setAttribute('aria-expanded', String(!minimized));
        fitPanel();
    }

    function enableDragging(header) {
        let drag = null;
        header.addEventListener('pointerdown', event => {
            if (event.button !== 0 || !event.isPrimary || event.target.closest('button')) return;
            event.preventDefault();
            event.stopPropagation();
            const rect = panel.getBoundingClientRect();
            drag = { id: event.pointerId, x: event.clientX - rect.left, y: event.clientY - rect.top };
            header.setPointerCapture(event.pointerId);
            header.classList.add('dragging');
        });
        header.addEventListener('pointermove', event => {
            if (!drag || event.pointerId !== drag.id) return;
            event.stopPropagation();
            panelPosition = { x: event.clientX - drag.x, y: event.clientY - drag.y };
            fitPanel();
        });
        const finish = event => {
            if (!drag || event.pointerId !== drag.id) return;
            drag = null;
            header.classList.remove('dragging');
            if (header.hasPointerCapture(event.pointerId)) header.releasePointerCapture(event.pointerId);
            savePanelState();
        };
        header.addEventListener('pointerup', finish);
        header.addEventListener('pointercancel', finish);
        header.addEventListener('lostpointercapture', finish);
        header.addEventListener('click', event => event.stopPropagation());
    }

    function formatSize(bytes) {
        return `${(bytes / 1000000).toFixed(2)} MB`;
    }

    function sortedLinks() {
        return [...links.entries()].sort((a, b) =>
            a[1].bytes - b[1].bytes || a[1].number - b[1].number);
    }

    function smallestLink() {
        return sortedLinks()[0];
    }

    function selectedLink() {
        // Use the explicit dropdown selection if it still exists; otherwise
        // return to the smallest verified file automatically.
        if (manualChoiceUrl && links.has(manualChoiceUrl)) {
            return [manualChoiceUrl, links.get(manualChoiceUrl)];
        }
        manualChoiceUrl = null;
        return smallestLink();
    }

    function checkSize(url) {
        // HEAD reads response headers, without downloading the media body.
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'HEAD', url, timeout: 15000,
                onload: response => {
                    if (response.status < 200 || response.status >= 300) {
                        reject(new Error(`HTTP ${response.status}`));
                        return;
                    }
                    const headers = response.responseHeaders || '';
                    const total = headers.match(/^content-range:\s*bytes\s+\d+-\d+\/(\d+)\s*$/im)?.[1]
                        || (response.status === 200 ? headers.match(/^content-length:\s*(\d+)\s*$/im)?.[1] : null);
                    const bytes = total ? Number(total) : NaN;
                    if (Number.isSafeInteger(bytes) && bytes > 0) resolve(bytes);
                    else reject(new Error('File size unavailable'));
                },
                onerror: () => reject(new Error('Size request failed')),
                ontimeout: () => reject(new Error('Size request timed out'))
            });
        });
    }

    function pumpProbes() {
        while (activeProbes < 3 && probeQueue.length) {
            const item = probeQueue.shift();
            activeProbes++;
            checkSize(item.url).then(bytes => {
                if (item.generation !== generation) return;
                links.set(item.url, { bytes, number: item.number });
            }).catch(() => {
                if (item.generation === generation) failedProbes++;
            }).finally(() => {
                activeProbes--;
                resetOnNavigation();
                showPanel();
                refreshChoices();
                pumpProbes();
            });
        }
        updateSummary();
    }

    function updateSummary() {
        if (!summary) return;
        const pending = probeQueue.length + activeProbes;
        const smallest = smallestLink();
        const selected = selectedLink();
        summary.textContent = pending
            ? `Checking ${pending} link(s)…${smallest ? ` Smallest so far: ${formatSize(smallest[1].bytes)}.` : ''}`
            : smallest ? `Smallest file: ${formatSize(smallest[1].bytes)} · ${links.size} measured.`
                : seen.size
                    ? `Captured ${seen.size} link(s), but no verified file size yet.`
                    : 'Waiting for NFLX media requests. Start or resume playback; this panel stays visible.';
        if (selected && manualChoiceUrl && selected[0] !== smallest?.[0]) {
            summary.textContent += ` Selected: file ${selected[1].number} (${formatSize(selected[1].bytes)}).`;
        }
        if (failedProbes) summary.textContent += ` ${failedProbes} size check(s) failed; those links are excluded.`;
        // Background size probes can run continuously during NF playback.
        // A verified selection can be downloaded while other probes are pending.
        if (downloadButton) downloadButton.disabled = downloading || !selected;
    }

    function cleanLink(raw) {
        try {
            const url = new URL(raw, location.href);
            if (url.protocol !== 'https:' || !url.hostname.endsWith('.nflxvideo.net')) return null;
            const path = url.pathname.replace(/(?:\/|%2f)range(?:\/|%2f)0-\d+(?=\/|%2f|$)/i, '');
            if (path === url.pathname) return null;
            // Keep signed query parameters untouched. Only remove the range path.
            url.pathname = path || '/';
            return url.href;
        } catch (_) {
            return null;
        }
    }

    function text(selector) {
        return document.querySelector(selector)?.textContent?.trim() || '';
    }

    function safeName(value) {
        return value.replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '-')
            .replace(/\s+/g, ' ').replace(/[. ]+$/g, '').trim().slice(0, 180);
    }

    function titleAndEpisode() {
        const root = document.querySelector('[data-uia="video-title"], .video-title');
        const labels = root ? [...new Set(Array.from(root.querySelectorAll('span'))
            .map(el => el.textContent.trim()).filter(Boolean))] : [];
        const playerText = labels.join(' ');
        const media = navigator.mediaSession?.metadata;
        let title = root?.querySelector('h4, h3, h2')?.textContent?.trim()
            || text('.watch-video--title') || media?.album || media?.title
            || document.title.replace(/\s*[-|–]\s*Netflix\s*$/i, '').trim();
        if (!title || /^netflix$/i.test(title)) {
            title = 'NF - ' + (location.pathname.match(/\/watch\/(\d+)/)?.[1] || 'media');
        }
        // h4 is the show title; spans supply episode labels and episode titles.
        // "ตอน 1" means episode 1, not season 1. Never invent a missing season.
        const match = playerText.match(/S\s*(\d+)\s*[: .-]*E\s*(\d+)/i)
            || playerText.match(/Season\s*(\d+)\s*[:,.-]?\s*Episode\s*(\d+)/i)
            || playerText.match(/(?:ซีซั่น|ฤดูกาล)\s*(\d+)\s*[:,.-]?\s*ตอน(?:ที่)?\s*(\d+)/);
        const season = match?.[1]
            || playerText.match(/(?:Season|ซีซั่น|ฤดูกาล)\s*(\d+)/i)?.[1];
        const episode = match?.[2]
            || playerText.match(/(?:Episode|ตอน(?:ที่)?|\bE)\s*(\d+)/i)?.[1];
        const code = (season ? `S${season.padStart(2, '0')}` : '')
            + (episode ? `E${episode.padStart(2, '0')}` : '');
        const episodeTitles = labels.filter(label => !title.includes(label)
            && !/^(?:S\s*\d+\s*[: .-]*E\s*\d+|(?:Season|ซีซั่น|ฤดูกาล)\s*\d+|(?:Episode|ตอน(?:ที่)?|E)\s*\d+)$/i.test(label)
            && label !== match?.[0]);
        return safeName([title, code, ...episodeTitles].filter(Boolean).join(' - '));
    }

    function suggestFilename() {
        if (!filename || edited) return;
        const number = selectedLink()?.[1].number || 1;
        filename.value = `${titleAndEpisode()} - track-${String(number).padStart(2, '0')}.mp4`;
    }

    function resetOnNavigation() {
        const next = location.origin + location.pathname;
        if (next === pageKey) return;
        pageKey = next;
        generation++;
        resourceStartTime = performance.now();
        links.clear();
        seen.clear();
        probeQueue.length = 0;
        failedProbes = 0;
        manualChoiceUrl = null;
        if (panel) panel.remove();
        panel = choices = filename = status = summary = downloadButton = undefined;
        panelBody = panelHeading = minimizeButton = undefined;
        edited = false;
        closed = false;
    }

    function panelParent() {
        // The fullscreen root sits above the document's regular stacking layer.
        const fullscreen = document.fullscreenElement;
        if (fullscreen instanceof HTMLElement && !/^(VIDEO|IFRAME)$/.test(fullscreen.tagName)) {
            return fullscreen;
        }
        return document.body;
    }

    function showPanel() {
        // NF may detach overlays when replacing the video player.
        if (panel && !panel.isConnected) {
            panel = choices = filename = status = summary = downloadButton = undefined;
            panelBody = panelHeading = minimizeButton = undefined;
        }
        const parent = panelParent();
        if (panel && parent && panel.parentNode !== parent) parent.appendChild(panel);
        if (panel || closed || (!seen.size && !isNFPage) || !parent) return;
        panel = document.createElement('div');
        panel.id = 'nfLinkBox';
        Object.assign(panel.style, {
            all: 'initial', position: 'fixed', bottom: '24px', right: '24px', width: '430px',
            maxWidth: 'calc(100vw - 16px)', maxHeight: 'calc(100vh - 16px)',
            padding: '14px', overflow: 'hidden', background: '#111827',
            color: '#fff', border: '2px solid #94a3b8', borderRadius: '12px',
            boxShadow: '0 8px 32px #0009',
            zIndex: '2147483647', font: '16px/1.5 sans-serif', boxSizing: 'border-box'
        });
        // Isolate controls from NF's button/text styles.
        const shadow = panel.attachShadow({ mode: 'open' });
        const style = document.createElement('style');
        style.textContent = `
            :host { color-scheme: dark; }
            * { box-sizing: border-box; font-family: sans-serif; }
            strong { font-size: 19px; color: #fff; }
            [hidden] { display: none !important; }
            .header { display: flex; align-items: center; justify-content: space-between;
                gap: 10px; cursor: grab; user-select: none; touch-action: none; }
            .header.dragging { cursor: grabbing; }
            .header strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .header-actions { display: flex; gap: 6px; flex-shrink: 0; }
            .header-actions button { width: 36px; min-height: 36px; padding: 4px; font-size: 20px; }
            .body { max-height: calc(100vh - 100px); overflow-y: auto; }
            button { background: #334155; color: #fff; border: 2px solid #94a3b8;
                border-radius: 7px; padding: 10px 14px; min-height: 44px;
                font-size: 15px; font-weight: 700; cursor: pointer; }
            button:hover { background: #475569; }
            button:focus-visible, input:focus-visible, select:focus-visible {
                outline: 3px solid #38bdf8; outline-offset: 3px; }
            button.primary { background: #facc15; color: #111827; border-color: #facc15; }
            button.primary:hover { background: #fde047; }
            button:disabled { opacity: .55; cursor: wait; }
            input, select { display: block; width: 100%; margin: 12px 0;
                padding: 10px; background: #fff; color: #111827; border: 2px solid #94a3b8;
                border-radius: 6px; font-size: 15px; }
            .summary { color: #7dd3fc; margin: 12px 0; font-weight: 700; }
            .destination { color: #cbd5e1; font-size: 13px; overflow-wrap: anywhere; margin: 10px 0; }
        `;
        shadow.appendChild(style);

        const header = document.createElement('div');
        header.className = 'header';
        header.title = 'Drag this header to move the downloader';
        const heading = document.createElement('strong');
        panelHeading = heading;
        heading.textContent = 'NF · Media downloader';
        header.appendChild(heading);
        const headerActions = document.createElement('div');
        headerActions.className = 'header-actions';
        minimizeButton = document.createElement('button');
        minimizeButton.type = 'button';
        minimizeButton.onclick = () => {
            minimized = !minimized;
            applyPanelState();
            savePanelState();
        };
        headerActions.appendChild(minimizeButton);
        const close = document.createElement('button');
        close.type = 'button';
        close.textContent = '×';
        close.title = 'Close (reopen from the Tampermonkey menu)';
        close.setAttribute('aria-label', 'Close downloader');
        close.onclick = () => { closed = true; panel.style.display = 'none'; };
        headerActions.appendChild(close);
        header.appendChild(headerActions);
        shadow.appendChild(header);
        enableDragging(header);

        const content = document.createElement('div');
        content.className = 'body';
        panelBody = content;
        shadow.appendChild(content);

        summary = document.createElement('div');
        summary.className = 'summary';
        summary.setAttribute('aria-live', 'polite');
        content.appendChild(summary);

        choices = document.createElement('select');
        choices.setAttribute('aria-label', 'Captured media file');
        choices.title = 'Choose the file to download (smallest by default).';
        choices.onchange = () => {
            // A user-chosen file is used by both Copy Link and Download.
            manualChoiceUrl = choices.value || null;
            suggestFilename();
            updateSummary();
        };
        content.appendChild(choices);

        filename = document.createElement('input');
        filename.type = 'text';
        filename.setAttribute('aria-label', 'Download filename');
        filename.oninput = () => { edited = true; };
        content.appendChild(filename);

        const destination = document.createElement('div');
        destination.className = 'destination';
        destination.textContent = 'Save to: /datadisk/daily/gm/nfaudio';
        content.appendChild(destination);

        const copy = document.createElement('button');
        copy.type = 'button';
        copy.textContent = 'Copy Link';
        copy.onclick = () => {
            try {
                const selected = selectedLink();
                if (!selected) { status.textContent = 'Wait for a verified file size.'; return; }
                GM_setClipboard(selected[0], 'text');
                status.textContent = 'Link copied.';
            } catch (_) { status.textContent = 'Clipboard failed. Check Tampermonkey permissions.'; }
        };
        content.appendChild(copy);

        const download = document.createElement('button');
        downloadButton = download;
        download.type = 'button';
        download.className = 'primary';
        download.textContent = 'Download selected';
        download.style.marginLeft = '10px';
        download.onclick = () => {
            const selected = selectedLink();
            if (!selected || downloading) {
                if (!selected) status.textContent = "No measured file is ready yet.";
                return;
            }
            // Let GM_download report permission/mode errors instead of silently
            // rejecting clicks when Tampermonkey does not expose downloadMode.
            // Browser API is still recommended for the relative nfaudio folder.
            const mode = typeof GM_info === 'object' ? GM_info?.downloadMode : undefined;
            if (mode && mode !== 'browser') {
                status.textContent = 'Tampermonkey Download Mode is not Browser API. Attempting download; folder may differ.';
            }
            const url = selected[0];
            let name = safeName(filename.value);
            if (!name) { status.textContent = 'Enter a filename first.'; return; }
            if (!/\.[a-z0-9]{1,8}$/i.test(name)) name += '.mp4';
            status.textContent = 'Starting download…';
            downloading = true;
            updateSummary();
            const downloadStatus = status;
            const finish = message => { downloadStatus.textContent = message; downloading = false; updateSummary(); };
            try {
                GM_download({
                    url, name: `${DOWNLOAD_FOLDER}/${name}`, saveAs: false, conflictAction: 'uniquify',
                    onload: () => finish('Download complete → nfaudio.'),
                    onerror: error => finish(`Download failed: ${error?.error || 'unknown error'}. Check Tampermonkey download settings; replay to refresh expired links.`),
                    ontimeout: () => finish('Download timed out. Try again.')
                });
            } catch (error) { finish(`Download failed: ${error.message}`); }
        };
        content.appendChild(download);

        status = document.createElement('div');
        status.style.marginTop = '10px';
        status.textContent = 'Select a file to download (smallest by default). Filename is editable.';
        content.appendChild(status);
        parent.appendChild(panel);
        refreshChoices();
        applyPanelState();
    }

    function refreshChoices() {
        if (!choices) return;
        choices.replaceChildren();
        const sorted = sortedLinks();
        for (const [index, [link, info]] of sorted.entries()) {
            const option = document.createElement('option');
            option.value = link;
            option.textContent = `${index === 0 ? 'Smallest · ' : ''}${formatSize(info.bytes)} · file ${info.number}`;
            choices.appendChild(option);
        }
        // Rebuilding options must not overwrite a user's choice. If nothing
        // was selected manually, continually default to the current smallest.
        const chosen = selectedLink();
        choices.value = chosen ? chosen[0] : '';
        suggestFilename();
        updateSummary();
    }

    function capture(raw) {
        resetOnNavigation();
        const link = cleanLink(raw);
        if (!link || seen.has(link)) return;
        seen.add(link);
        probeQueue.push({ url: link, number: seen.size, generation });
        showPanel();
        pumpProbes();
    }

    // Poll as well as observe: some browsers miss buffered resource entries.
    function captureResource(entry) {
        if (entry.startTime >= resourceStartTime) capture(entry.name);
    }
    function scanResources() {
        try {
            for (const entry of performance.getEntriesByType('resource')) captureResource(entry);
        } catch (error) {
            console.warn('[NF downloader] Resource scan unavailable:', error);
        }
    }
    try {
        const observer = new PerformanceObserver(list => {
            for (const entry of list.getEntries()) captureResource(entry);
        });
        observer.observe({ type: 'resource', buffered: true });
    } catch (error) {
        console.warn('[NF downloader] Resource observer unavailable:', error);
    }
    scanResources();
    setInterval(scanResources, 2000);
    capture(location.href);
    document.addEventListener('DOMContentLoaded', showPanel, { once: true });
    setInterval(() => { resetOnNavigation(); showPanel(); suggestFilename(); }, 1000);
    document.addEventListener('fullscreenchange', () => { showPanel(); fitPanel(); });
    window.addEventListener('resize', () => { fitPanel(); savePanelState(); });
    GM_registerMenuCommand('Show NF downloader', () => {
        closed = false;
        if (panel) { panel.style.display = 'block'; fitPanel(); }
        else showPanel();
    });
})();
