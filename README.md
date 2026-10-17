# NF Named Download — v3

Version 3 keeps the URL targeting from the user's working v2.3 reference. The `cleanLink` function is identical to that supplied reference.

## Accepted requests

- HTTPS URLs on a subdomain of `nflxvideo.net`.
- The pathname must contain an initial range segment such as `/range/0-4095` or `/range/0-65535` (including the encoded slash form supported by the reference).
- Remove that initial-range segment to obtain the download URL. Preserve signed query parameters.

Direct CDN URLs without an initial range and ranges starting after byte zero are rejected. They are not size-probed and cannot become the smallest-file default.

Worker/SharedWorker/MessageChannel constructors, postMessage methods, and message payload scanning added in v2.10 have been removed. A URL merely mentioned in a manifest/catalog message is not an observed media request.

Resource timing and actual page fetch/XHR requests all use this same strict initial-range matcher. Existing bounded resource deduplication across SPA navigation remains.

## Preserved behavior

- Smallest measured qualifying file by default; explicit dropdown selection controls Copy Link and Download selected.
- Active title, episode, audio language, selected 5.1 `.eac3` filename convention, and editable names.
- Requested `gm/nfaudio` destination, progress/errors, minimize/restore, dragging, remembered position and fullscreen attachment.

## Install

https://raw.githubusercontent.com/dtnpz/nf-named-download/main/nf-named-download.user.js

Update the existing script, reload the watch page, and confirm **NF · Media downloader v3**. The player must make an initial-range request before a file can be listed.

## Checks

```sh
python run_nf_named_download_v2_11_tests.py
python test_nf_named_download_v2_11_browser.py
```

The optional browser check requires Python Playwright with Chromium installed. It uses local simulated endpoints and real browser fetch/XHR/Worker APIs. It verifies that qualifying requests are accepted, wrong/direct/nonzero/catalog-only URLs never reach HEAD probing, native APIs and response bytes remain unchanged, signed query strings are preserved, and file selection/naming survive navigation.

These checks do not claim a live transfer from the user's NF session. The script saves the selected response unchanged; no media conversion or decryption is performed.
