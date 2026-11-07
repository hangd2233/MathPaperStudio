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
changes. The old artwork is absent from this independently initialized source repository.
No previous repository history is imported. Retain all unrelated upstream software copyright notices.

License for this new artwork and generator: MIT, see `LICENSE` here.

The iPad source target uses `../scripts/generate-ipad-icons.py` to rasterize the
same owned geometry on an opaque background and produce the Xcode asset catalog.
It imports the existing generator, uses only the Python standard library and
adds no personal image or historical artwork. The generator is covered by the
same MIT artwork license; generated device assets remain untracked.
