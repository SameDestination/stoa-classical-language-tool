# Third-party notices

STOA is licensed under the [GNU General Public License v3.0 or later](LICENSE)
(`GPL-3.0-or-later`). It
bundles and depends on third-party work that keeps its own license. This file
lists what the repository and the STOA builds (Web, Portable and Desktop)
include.

## Bundled fonts

Font files are separate works distributed alongside STOA. Each license text is
stored next to the fonts.

| Font | Files | Copyright | License | License file |
| --- | --- | --- | --- | --- |
| Liberation Sans 2.1.5 | `public/fonts/LiberationSans-*.ttf` | © 2010 Google Corporation; © 2012 Red Hat, Inc. | SIL OFL 1.1 | [`OFL-LiberationSans.txt`](public/fonts/OFL-LiberationSans.txt), [source note](public/fonts/LiberationSans-source.txt) |
| Liberation Serif 2.1.5 | `public/fonts/LiberationSerif-*.ttf` | © 2010 Google Corporation; © 2012 Red Hat, Inc. | SIL OFL 1.1 | [`OFL-LiberationSerif.txt`](public/fonts/OFL-LiberationSerif.txt) |
| Noto Serif 2.015 | `public/fonts/NotoSerif-*.ttf` | © 2022 The Noto Project Authors | SIL OFL 1.1 | [`OFL-NotoSerif.txt`](public/fonts/OFL-NotoSerif.txt) |
| Noto Sans SC / Noto Sans JP 2.004 (variable) | `public/fonts/NotoSans{SC,JP}-Variable.ttf` | © 2014–2021 Adobe, Reserved Font Name "Source" | SIL OFL 1.1 | [`OFL-NotoSans-CJK.txt`](public/fonts/OFL-NotoSans-CJK.txt) |
| Source Han Serif SC / TC 1.001 | `public/fonts/classical-chinese/SourceHanSerif{SC,TC}-Regular.otf` | © 2014–2021 Adobe, Reserved Font Name "Source" | SIL OFL 1.1 | [`OFL-SourceHanSerif.txt`](public/fonts/classical-chinese/OFL-SourceHanSerif.txt) |
| Fandol Song, Hei, Kai, Fang | `public/fonts/classical-chinese/Fandol*.otf` | © 2012–2013 the Fandol team (Clerk Ma, Jie Su) | GPL-3.0 with font exception | [`GPL-Fandol-with-font-exception.txt`](public/fonts/classical-chinese/GPL-Fandol-with-font-exception.txt), [README](public/fonts/classical-chinese/README-Fandol.txt) |

Fonts that are not listed here are not bundled. STOA loads **Times New Roman**
from the user's own device when requested, and no Microsoft font files are
included. Earlier STOA versions bundled the Vusillus font; it was removed
because its redistribution terms are not documented. Users who have their own
licensed copy of any font can import it. Imported fonts stay on the user's
device and are not stored in project files; vector PDF exports embed the
glyphs they use, as PDF exports normally do.

## Vendored code

| Component | Location | License | License file |
| --- | --- | --- | --- |
| PDF.js worker (Mozilla Foundation, from `pdfjs-dist`) | `public/vendor/pdf.worker.min.mjs` | Apache-2.0 | [`LICENSE-pdfjs.txt`](public/vendor/LICENSE-pdfjs.txt) |
| Browser adaptation of `mdict-js` (© 2018 terasum) | `app/lib/vendor/mdict-base-browser.cjs` | MIT | [`MDICT-JS-LICENSE.txt`](app/lib/vendor/MDICT-JS-LICENSE.txt) |

`public/trial-app/STOA-Interlinear-Studio-3.5.html` is a prebuilt STOA 3.5
bundle, served by the marketing website's `/trial` page. It contains STOA's
own code and the libraries it was built with at the time.

## Main npm dependencies included in builds

These packages are bundled into the Web, Portable or Desktop builds. All
licenses are GPL-3.0-compatible. For the complete dependency tree, see
`package-lock.json` or run `npx license-checker --summary`.

| Package | License |
| --- | --- |
| React, React DOM | MIT |
| PDFKit | MIT |
| PDF.js (`pdfjs-dist`) | Apache-2.0 |
| JSZip | MIT or GPL-3.0-or-later |
| fflate | MIT |
| html2canvas | MIT |
| mdict-js, bl | MIT |
| pako | MIT and Zlib |
| Electron (Desktop only) | MIT |
| vinext (website only) | MIT |
