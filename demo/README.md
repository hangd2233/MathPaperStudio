# Synthetic MPS demo

This fictional paper demonstrates sections, a custom macro, theorem/proof
environments, cross references and a simple calculation. The author name is a
placeholder. The elementary identity is standard mathematics, not new research.
No user manuscript, report, personal affiliation or model output is embedded.

Open this directory in MPS and select `main.tex` as the main document. Compile
using your own LaTeX installation. For a command-line check, write generated
files outside the source tree:

```sh
latexmk -pdf -no-shell-escape -interaction=nonstopmode -halt-on-error -outdir=/tmp/mps-demo-build main.tex
```

No `.mps` review state is shipped; reviewers must not interpret this demo as a
record of an actual proof audit. License selection is pending in LICENSE-PLAN.md.
