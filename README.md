# NF Named Download v2.7

Tampermonkey helper with a selection-aware downloader. The interface uses the name NF; website hostnames and runtime API keys are preserved so the script remains functional.

## Changes

- Panel title shows "NF · Media downloader v2.7" so the installed version is visible.
- Dropdown defaults to the smallest measured file; Copy Link and Download use the selected file.
- Filename follows the current title, episode, and selected audio track language. When the actual playing codec is identified as EC-3/DD+, uses .eac3; for HE-AAC/AAC and unknown codec, uses .aac.
- Example: Show Title - S01E02 - zh-cn - eac3 - track-01.eac3 (only when EC-3 identified), or Show Title - S01E02 - zh-cn - aac - track-01.aac (AAC/HE-AAC or unverified).
- Selected audio is read from the player and, when available, playback stats or the currently open read-only diagnostic textarea. Real playback codec takes precedence over audio selection labels. A 5.1 label DOES NOT prove EC-3.
- The panel shows whether audio codec data is confirmed. Old .mp4/.m4a extensions are normalized. Filename editing retains the basename.
- Download now reports progress and more useful errors. If nothing starts after 10 seconds, it tells you to check the browser's download/Save As dialog.
- Captured CDN responses are copied unchanged. Renaming cannot transcode, demux or decrypt a file; a large measured file is not necessarily a valid audio-only file.

## Suppress the Save As location picker

The code uses GM_download with saveAs:false, but browser settings and Tampermonkey extension permission may still require a dialog; a userscript cannot reliably override that.

1. Open thorium://settings/downloads and turn OFF "Ask where to save each file before downloading".
2. In Tampermonkey Settings > Download Mode, choose Browser API and give Downloads permission.
3. Allow .aac and .eac3 in Tampermonkey's file extension whitelist, if one is enforced. Failure reason not_whitelisted means the extension must be allowed.
4. Relative destination gm/nfaudio resolves under the browser's download directory. The inspected Thorium profile currently lists /home/deraz/Downloads and Downloads/gm/nfaudio is a symlink. The script's text showing a destination cannot override browser settings.
5. Disable any older duplicate NF userscript and reload the watch page. Confirm title says v2.7.

## Install

https://raw.githubusercontent.com/dtnpz/nf-named-download/main/nf-named-download.user.js

## Validation

JavaScript syntax and regression tests passed for title/episode, selected audio language, codec EC-3 vs HE-AAC 5.1, unknown-codec fallback, selected-link download, forced audio extension and download callback flow. No real browser/CDN transfer or Save As prompt was exercised by the test harness.
