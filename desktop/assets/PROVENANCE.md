# Original MPS mark

`mps-mark.svg` is a new, manually specified geometric design created for this
cleanup: a dark rounded square, a folded sheet, a check mark and two lines.
It uses no font, stock artwork, personal image, historical logo or image-model
output. It does not derive from the previously inherited prism illustration.

`../scripts/generate-owned-icons.py` reproducibly generates the PNG, ICO and ICNS
variants using only the Python standard library. Raster coordinates mirror the
SVG primitives. The generator writes image data and required container headers
only: no C2PA, EXIF, author email, instance ID, source timestamps or machine path.

The application retains its existing asset filenames to avoid unrelated runtime
changes. The old artwork is absent from this candidate's active files, but it
remains in the private historical commit until the separately approved history
cleanup. Retain all unrelated upstream software copyright notices.

Proposed license for this new artwork and generator: MIT, see `LICENSE` here.
