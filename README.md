# NF Named Download

Tampermonkey userscript for selecting one captured NF CDN media request, saving its original response bytes and giving the download a title/episode + selected audio-language filename.

## Current version: 2.6

- Select the desired captured file from the list, sorted by size; **smallest is the default**.
- **Download selected** and **Copy Link** both use the selected entry.
- A verified selection can be downloaded while other file-size checks are still running.
- The filename uses the title and episode currently shown in the NF player and, where exposed, the player's **currently selected audio track** language:
  - e.g. \`Aurora Days - S01E02 - ja - eac3 - track-03.eac3\`
  - e.g. \`Aurora Days - S01E02 - th - aac - track-03.aac\`
- DD+/EC-3 audio that is explicitly identified in the selected-audio metadata is labeled **\`.eac3\`**; HE-AAC/AAC and tracks with no reliable codec information use **\`.aac\`**. A 5.1 channel count alone is **not** proof of DD+ (HE-AAC 5.1 exists).
- If the chosen track language is not available from the active player, the name uses \`und\` (undetermined), **not** the website/OS language.
- User-edited filename text is preserved; the extension is normalized to \`.eac3\` or \`.aac\` at download time.
- Saves relative to the browser's configured download folder: \`gm/nfaudio/\`. The local user's browser folder is configured to map to \`/datadisk/daily/gm/nfaudio\`.
- It leaves the separate NF Plus script untouched.

## Install

Open [nf-named-download.user.js](./nf-named-download.user.js) in Tampermonkey. Automatic update links point to this GitHub repo's main branch. Set Tampermonkey's **Download Mode** to **Browser API** to preserve the relative folder.

## Important limitation

The filename/extension logic **does not transcode, remux, decrypt or extract an audio track**. It downloads the selected *original CDN response*, byte-for-byte, and labels it using metadata from the *currently selected audio track*. A captured URL can be for video, a fragmented container or DRM-encrypted content. Simply giving it an \`.aac\` or \`.eac3\` extension **does not make it a valid, playable AAC or E-AC-3 elementary stream**.

This script does not attempt DRM circumvention or license interception. For correctly formed elementary audio output, a legal clear/unprotected source and a real demux/extraction stage would be required. Signed CDN links may expire.

## Verification

\`node --check nf-named-download.user.js\` and \`node test_nf_named_download_v2_6.js\` passed offline. Tests cover filename generation, season/episode metadata, language and codec checks, HE-AAC 5.1 differentiation, unknown-language fallback, manual filenames, selected-link download and extension normalization.

Live streaming/CDN transfer was not exercised by the test harness.
