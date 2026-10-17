# NF Named Download — v2.10

v2.10 fixes missing media-file capture while preserving the selected 5.1 / `.eac3` filename behavior from v2.9.

## Capture fixes

- Observe page `fetch` requests, including URL and Request inputs, and XHR URLs/redirects.
- Passively inspect bounded URL-bearing messages sent to/from native Workers, SharedWorkers, and MessageChannel ports. Worker code, source URLs, message contents, transfer lists, response bodies and return values remain unchanged.
- Keep resource timing as an additional capture source.
- Recognize nonzero URL ranges such as `/range/49152-65535` and full CDN URLs without a range path. Preserve signed query strings.
- Deduplicate resource entries across watch-page navigation instead of discarding new requests that started before a polling callback noticed the navigation.
- Install API/message hooks only on NF pages. Media buffers and property getters in messages are not inspected.

## Update

https://raw.githubusercontent.com/dtnpz/nf-named-download/main/nf-named-download.user.js

**Fully reload the watch page after updating.** The heading must show **NF · Media downloader v2.10**. This allows the capture hooks to attach when the player and its workers are created.

Captured files populate the dropdown after size checks. The smallest measured file remains the default; a manual dropdown selection is used by Copy Link and Download selected. Destination, download feedback, minimize/restore, dragging and remembered position are preserved.

The selected 5.1 naming rule remains unchanged. A diagnostic containing `mp4a.40.5 (ddplus51hq)` is not used to undo the requested `.eac3` filename.

## Checks

```sh
python run_nf_named_download_v2_10_tests.py
python test_nf_named_download_v2_10_browser.py
```

The browser check requires Python Playwright with Chromium installed. It uses local simulated endpoints and real browser fetch, XHR, Workers and MessageChannel APIs with page resource timing deliberately disabled. It verifies capture, native response/return-value preservation, file selection, `.eac3` naming, and SPA resource deduplication. No signed media URLs, cookies or media samples are included in these fixtures.

Real NF traffic still needs verification after installing this update. A worker request that never exposes its URL through any observed page API, timing entry or message cannot be recovered by these passive hooks. The script downloads the selected CDN response unchanged; it does not demux, decrypt or transcode it.
