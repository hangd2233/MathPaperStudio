# Recommended license plan — pending owner approval

Upstream desktop code: MIT; retain all original copyright and license notices.
MuPDF.js 1.27.0: AGPL-3.0-or-later, including its wrapper and WASM implementation.
The current renderer imports MuPDF.js into the application bundle. A release
cannot be described as exclusively MIT while ignoring that dependency.

Recommended plan (no remote license change has been applied):

Release the combined application and new MPS application contributions under
AGPL-3.0-or-later. Retain the existing MIT grants and copyright notices for
upstream code, and each vendor reference's separate license. Publish source,
lockfiles, build scripts and notices, with no application binaries in this first
release. License the new synthetic demo and original geometric artwork under
their included MIT notices. See LICENSING.md for the precise scope.

Writing-skill references retain their existing MIT/Apache-2.0 notices. Their
licenses do not license private author papers; those references are removed.
The new synthetic demo contains no private report or copied paper. The owner's
chosen public license should explicitly cover it before publication.

The inherited artwork has been replaced in this candidate by a new geometric SVG
and reproducible icon variants; no C2PA or other nonessential metadata is carried.
Remaining supported platforms' dependency licenses and complete bundled font /
WASM notices must still be checked before publishing downloadable application bundles.
