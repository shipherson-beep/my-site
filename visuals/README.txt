SHIP HER SON — VISUAL SYNTHESIZER
=================================

DEPLOY
------
index.html is fully self-contained: runtime, styles and fonts are inlined.
Upload it anywhere that serves static files (any web host, S3, Netlify,
Vercel, GitHub Pages, a subfolder of your site). No build step, no server
code, no dependencies to install.

  yoursite.com/synth/index.html

Open it over http(s) rather than file:// — some browsers block audio
decoding and canvas capture on file:// URLs.

WHAT SHIPS WITH IT
------------------
- All 6 built-in scenes: Minimal Pulse, Symmetry, Red Strobe,
  Industrial Lines, No Signal, Night Drive.
- GENERATE (procedural scene builder), macros, post FX bus, palette.
- Layer types: solid, line, rect, circle, dots, text, image, video.
- Media processing per layer: monochrome, contrast, tint, threshold,
  dither, pixel size, posterize, negative.
- Audio loading, BPM detection, beat grid alignment, tap tempo.
- Undo (60 steps), fullscreen output, offline 1080p60 MP4 render.

USER PRESETS
------------
Scenes you SAVE in the app are stored in the visitor's own browser under
localStorage key "signal.presets.v1" — they are per-browser, not baked
into the file. To ship your own scenes as built-ins, save them in the app,
then in the browser console run:

  localStorage.getItem('signal.presets.v1')

and send me that JSON — I'll bake it into the build as factory presets.

TWO THINGS THAT NEED THE NETWORK
--------------------------------
1. MP4 export loads its H.264 muxer from a CDN on first use
   (cdn.jsdelivr.net / unpkg.com). If your deployment must work fully
   offline, tell me and I'll inline the muxer into the build.
2. Everything else — playback, visuals, presets — runs offline.

BROWSER SUPPORT
---------------
Chrome / Edge (desktop) is the reference target: offline frame-accurate
MP4 render with AAC audio. Safari renders video but may produce a silent
MP4 (no AAC encoder); the app says so in the export status. Browsers
without WebCodecs fall back to real-time screen capture.
