# Vendored third-party files

Local copies of the libraries Puddleton loads, so the game does not depend on outside CDNs.
Downloaded on 2026-11-22. The files are byte for byte what the CDN served (nothing edited, licence headers kept).
Fonts live next door in `../fonts/` (see the end of this file).

| File | Package and version | Downloaded from | Licence |
| --- | --- | --- | --- |
| `three.module.js` | three 0.170.0 (r170) | https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js | MIT |
| `gsap.min.js` | gsap 3.12.5 | https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js | GSAP Standard "No Charge" License |
| `ScrollTrigger.min.js` | gsap 3.12.5 (ScrollTrigger plugin) | https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/ScrollTrigger.min.js | GSAP Standard "No Charge" License |
| `lenis.min.js` | lenis 1.1.13 | https://cdn.jsdelivr.net/npm/lenis@1.1.13/dist/lenis.min.js | MIT |

These were the CDN URLs the pages loaded before they switched to the local copies.

## Notes per library

**three.js 0.170.0.** `three.module.js` in r170 is a single self-contained ES module: it has no `import` statements, so no other build file is needed (the `three.core.js` split only arrived in later releases). Our code imports only the bare `"three"` specifier (world.mjs, stage.mjs, cosmetics.mjs), no addons. The file keeps its `@license ... SPDX-License-Identifier: MIT` header. Full text: `licenses/three.LICENSE.txt` ("Copyright 2010-2024 three.js authors").

**GSAP 3.12.5 and ScrollTrigger.** Both files keep their header ("Copyright 2024, GreenSock. All rights reserved. Subject to the terms at https://gsap.com/standard-license"). GSAP is not open source: it is free to use, including commercially, on websites and web apps under the Standard "No Charge" GSAP License (effective 2025-04-30, owned by Webflow since 2024). The only prohibited use is building a no-code visual animation tool that competes with Webflow, which Puddleton is not. The licence forbids removing or altering GSAP's proprietary notices, so do not strip the header when minifying or bundling. GSAP ships no LICENSE file in the npm package; the licence lives at the URL above.

**Lenis 1.1.13.** The minified file has no header comment (that is how the package ships it). Full MIT text: `licenses/lenis.LICENSE.txt` ("Copyright (c) 2024 darkroom.engineering"). Keep that file alongside the script.

## SHA-256

```
ce1fa418de16a19495a9f72495580e3015d7745c296d3ce0485897f902ddedfb  three.module.js
28033e449a31ebcc396e5be8b13b63152bf03094288fb5867034321927bce087  gsap.min.js
ad33c2df9ada8a663c2147357828f980d0b7ca731ef33eb3c6e4f327c3b2cda5  ScrollTrigger.min.js
b2958f142f832f0d5e547cdef77e6fadfce16bea60982fc8bbf50395a2439df8  lenis.min.js
```

## Fonts (`../fonts/`)

| File | Font | Source | Licence |
| --- | --- | --- | --- |
| `jersey-20-latin.woff2`, `jersey-20-latin-ext.woff2` | Jersey 20, weight 400 (v4) | fonts.gstatic.com via the Google Fonts CSS the pages link today | SIL Open Font License 1.1, "Copyright 2023 The Soft Type Project Authors" |
| `dm-sans-latin.woff2`, `dm-sans-latin-ext.woff2` | DM Sans variable, covers 400, 500 and 700 (v17) | same | SIL Open Font License 1.1, "Copyright 2014 The DM Sans Project Authors" |

`fonts.css` holds the `@font-face` rules (font-display: swap, same unicode ranges Google uses). Jersey 20 only exists in weight 400; headings set to 700 get synthetic bold, the same as with the Google link today. The OFL lets you bundle and redistribute the fonts with the game as long as the licence text travels with them (`OFL-Jersey20.txt`, `OFL-DMSans.txt`) and the fonts are not sold on their own.

## How to switch the pages over (for the integration step)

- Import map: `"three": "./vendor/three.module.js"` instead of the jsDelivr URL.
- Scripts: `vendor/gsap.min.js`, `vendor/ScrollTrigger.min.js`, `vendor/lenis.min.js`.
- Fonts: replace the two `fonts.googleapis.com` lines with `<link rel="stylesheet" href="fonts/fonts.css">`.
- Then drop `https://cdn.jsdelivr.net`, `https://unpkg.com`, `https://fonts.googleapis.com` and `https://fonts.gstatic.com` from any Content-Security-Policy and preconnect tags, and add the new files to the service worker cache list if it precaches.

## Sources for the licence facts

- three.js: package.json `"license": "MIT"` and LICENSE at https://cdn.jsdelivr.net/npm/three@0.170.0/package.json and https://cdn.jsdelivr.net/npm/three@0.170.0/LICENSE
- GSAP: package.json licence field at https://cdn.jsdelivr.net/npm/gsap@3.12.5/package.json ("Standard 'no charge' license: https://gsap.com/standard-license") and the licence itself at https://gsap.com/standard-license (read 2026-11-22, effective 2025-04-30, last modified 2025-05-30)
- Lenis: https://cdn.jsdelivr.net/npm/lenis@1.1.13/package.json and https://cdn.jsdelivr.net/npm/lenis@1.1.13/LICENSE
- Jersey 20: https://github.com/google/fonts/blob/main/ofl/jersey20/OFL.txt
- DM Sans: https://github.com/google/fonts/blob/main/ofl/dmsans/OFL.txt
- OFL 1.1 text and FAQ: https://openfontlicense.org
