# Proposed source-release licensing policy

This is the source-release publication policy prepared for owner approval.
Original upstream grants and notices are retained; no upstream grant is revoked.

## Combined application and new application contributions

Publish the combined MPS desktop application under **AGPL-3.0-or-later** and
provide its corresponding source, lockfiles, build scripts, and license notices.
The current renderer is MuPDF.js 1.27.0, as pinned in `desktop/pnpm-lock.yaml`.
Its JavaScript file explicitly permits AGPL version 3 or any later version;
the installed package metadata uses `AGPL-3.0-or-later`.

This does **not** replace or revoke the MIT license of the original upstream
code. `desktop/LICENSE` retains the MIT grant and original assistant-ui,
delibae and beniz copyright notices. Original MIT portions remain usable under
that grant; the combined application with its AGPL renderer must satisfy AGPL.
No commercial MuPDF license is presumed or purchased.

The full AGPL version 3 text is included in `licenses/AGPL-3.0.txt`, copied
byte-for-byte from the locked MuPDF package. The "or later" option comes from
that package's notice and the proposed MPS contribution policy.

## Independent materials

- Existing writing-skill references retain their own MIT or Apache-2.0 notices
  and attribution in `third_party/` and the corresponding reference copies.
- The newly created geometric SVG, generated icons and their generator are
  proposed under the MIT license in `desktop/assets/LICENSE`.
- The new synthetic demo is proposed under `demo/LICENSE` (MIT).
- No license grant is claimed for private user manuscripts or reports. None are
  part of this source release. A user's documents do not become program source
  merely because they are edited or compiled by MPS.

## Publication scope

The proposed initial release is **source-only**: no DMG, installed bundle,
node_modules, bundled WASM, font files or application build artifact is uploaded.
Users obtain locked dependencies from their official package sources. Runtime
dependencies remain subject to their licenses. Binary release distribution is a
separate gate requiring complete corresponding-source and dependency notice
review, including MuPDF's underlying components and supported platforms.

An AGPL notice must not be presented as proof of privacy cleanup or of a legal
review of every possible distribution. Do not mark the project MIT-only or strip
upstream attribution. No license policy becomes public until owner confirmation.

## Sources checked

- The actual inherited `desktop/LICENSE`, with its three copyright lines.
- The locked `mupdf@1.27.0` package's `package.json`, `LICENSE` and `dist/mupdf.js`.
- [Official MuPDF.js licensing guidance](https://mupdfjs.readthedocs.io/en/latest/faq/index.html#licensing).
- [GNU license compatibility guidance](https://www.gnu.org/licenses/license-compatibility.en.html).

The immediate Gitea upstream's online LICENSE endpoint could not be accessed
through the browsing tool. The inherited local notice is preserved exactly;
the public ancestor's MIT notice was independently checked. This limitation is
recorded rather than claiming a fresh upstream Gitea verification.
