# NF Named Download — v3.1

## Problems observed

1. Two floating downloader windows can appear simultaneously when Tampermonkey runs two copies of the script or an older NF / NFLX downloader is still enabled.
2. Clicking Download opens a Save As location picker even after "Ask where to save each file" was disabled in Thorium. The v3 code already used GM_download with saveAs:false, so an alternative download mode or browser extension permissions can still be involved.

## Changes in v3.1

- Claim one DOM singleton marker (data-nf-named-download-active); duplicate executions of v3.1 in the same document exit early.
- Keep a CSS rule scoped to the NF page that hides prior legacy downloader panels with IDs nflxLinkBox or nfLinkBox without this build's ownership attribute. The new UI has owner="3.1" and stays visible.
- If a legacy overlay is detected, print a console warning and show an in-panel notice. This only hides the outdated panel: **disable the old scripts in Tampermonkey** to actually stop their network activity.
- New menu: "Diagnose NF downloader duplicates / download mode", showing the number of other downloader panels and GM_info.downloadMode when exposed by Tampermonkey.
- When GM_info.downloadMode is explicitly set to "native" or "disabled", **do not begin a GM_download** that would ignore saveAs:false. Instead show instructions to select Tampermonkey Browser API. If the mode cannot be detected, the original behavior is maintained.
- Preserve v3's initial-range-only URL targeting, chosen smallest/default dropdown, title/episode/audio language/5.1 naming convention, and no DRM or audio conversion.

## How to remove Save As dialogs

1. Open Tampermonkey Dashboard → Settings; change Configuration mode to Advanced if needed, and go to Downloads.
2. Choose **Download Mode: Browser API** and approve its optional Downloads permission request.
3. Allow .aac and .eac3 file extensions in Tampermonkey's file extension whitelist.
4. In Thorium open **thorium://settings/downloads** and keep "Ask where to save each file before downloading" OFF.
5. Disable any older "NF Named Download" or "NFLX Link Extractor" scripts; use only this v3.1 build and reload the watch page. The title must say NF · Media downloader v3.1.
6. The script requests a relative filename gm/nfaudio/<selected name>. Browser's downloads API cannot request absolute paths. The default directory currently belongs to the browser profile and was previously inspected as /home/deraz/Downloads; there is a symlink at /home/deraz/Downloads/gm/nfaudio to the desired location. Confirm the actual resulting file/path from the browser's Downloads list. If Browser API is confirmed and a dialog still appears, diagnose extensions competing to determine filenames and whether a symlinked destination is accepted, rather than claiming saveAs:false must work universally.

**Important:** The script cannot force writing into /datadisk/daily/gm/nfaudio by specifying that absolute path through Tampermonkey's Browser API. Chrome downloads API paths are relative to the browser's downloads directory. An independent local helper with explicit filesystem access would be a separate solution if strict arbitrary-path silent saving is required.

## Verification

- Node syntax check and v3.1 regression suite passed, including duplicate-instance guard and the Native download-mode preflight.
- Live browser automation was attempted but was blocked by missing Python Playwright in the local test environment. No live CDN download / Save As claim is made.
