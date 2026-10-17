# NF Named Download — v2.9

The requested audio filename now follows the confirmed selected 5.1 track even when the audio menu is closed or the player exposes channels without a codec field.

## Changes

- Read the current player's `channels`, `channelCount`, `numChannels`, `audioChannels`, channel layout, and selected track label.
- Resolve selected audio IDs, including numeric IDs, against the player's audio-track list.
- A selected 5.1 track produces the requested `eac3` token and `.eac3` extension. A checked stereo menu selection produces `aac` / `.aac`.
- Audio-menu detection stays scoped to the audio column and supports additional audio-row markup. A checked subtitle cannot determine audio naming.
- Clear cached menu information when the active audio ID, language, or channel count changes. Ignore playback stats from a different audio language.
- Show `5.1 selected` instead of the previous `assumed` / `codec unverified` wording. Independently reported playback codec remains available as a separate diagnostic when it differs from the requested output label.
- Preserve manual filenames, selected CDN links, size comparisons, download feedback, minimize/drag, and the `gm/nfaudio` destination.

Example:

```text
Title - S01E01 - zh-cn - eac3 - track-02.eac3
```

## Install

Update the existing Tampermonkey script using:

https://raw.githubusercontent.com/dtnpz/nf-named-download/main/nf-named-download.user.js

Reload the watch page and check that the panel displays **NF · Media downloader v2.9**.

## Verification and scope

Run `node --check nf-named-download.user.js` and `node test_nf_named_download_v2_9.js`.

Focused regression coverage includes selected 5.1 with no codec/menu, alternate channel fields, numeric selected-track IDs, audio changes with a closed menu, subtitle isolation, editable filenames, selected downloads while other probes run, and separate playback-codec diagnostics.

This change corrects selection detection and the requested filename convention. Downloaded CDN bytes are unchanged. It does not establish that every selected response is elementary E-AC-3, nor does it add demuxing, decryption, or transcoding.
