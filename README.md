# MathPaperStudio

MPS is a desktop LaTeX writing workspace with an author-controlled manual mode.
It supports PDF report import, mainline selection, hierarchical English outlines,
reviewed macro definitions, outline PDF export, and light/dark/system appearance.
Language, proof/citation, and calculation reviews return findings and suggestions;
they do not automatically rewrite a manual manuscript. Calculation review does
not independently execute calculations.

## Repository layout

- `desktop/`: customized codex-prism desktop source and upstream notices.
- `skills/`, `standards/`, `templates/`, `tools/`: optional local writing workflow.
- `demo/`: a fictional, elementary mathematical paper; no research report required.

Build instructions are in [DESKTOP.md](DESKTOP.md). Install and authenticate your
own Codex CLI, and install a TeX distribution separately. No model request is
needed to edit or compile the demo; the current onboarding flow may still ask
for a working Codex connection before entering the workspace.

This repository must not contain manuscripts, private research reports, project
`.mps` records, account settings, credentials, runtime history or machine paths.
Skills are optional: `python3 tools/studio.py deploy-skills` creates managed
copies under `.agents/skills/`; source masters remain in `skills/`.

## Licensing and source scope

The combined desktop application and new MPS application contributions use the
AGPL-3.0-or-later publication policy in [LICENSING.md](LICENSING.md). Original
upstream MIT code and vendor MIT/Apache-2.0 notices remain in force and are
retained. The new demo and geometric artwork have separate MIT notices.

This source tree does not include a prebuilt application, dependency binaries,
credentials or research data. Existing template narratives are illustrative
examples, not research claims or endorsements; contact details are placeholders.
