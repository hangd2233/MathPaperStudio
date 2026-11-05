# Desktop source and development

The application source is under `desktop/`; writing skills and templates remain
at the repository root. Upstream codex-prism code retains its MIT copyright
notices in `desktop/LICENSE`. Renderer and dependency licenses also apply.

Use Node.js 22+, pnpm 10.28.2 and Rust 1.88.0. Runtime PDF compilation needs a
separate TeX distribution. Codex authentication belongs to each developer.

```sh
cd desktop
corepack pnpm install --frozen-lockfile
corepack pnpm --filter @codex-prism/desktop test
corepack pnpm --filter @codex-prism/desktop build
cargo test --locked --manifest-path crates/prism-core/Cargo.toml --lib -- --test-threads=1
corepack pnpm build:desktop
```

Generated template PDFs, bundles, caches and credentials are excluded. Recreate
template previews with the existing `generate-previews` script if needed.
Nested workflow files under `desktop/.github/` are reference configuration;
they do not automatically run at this combined repository root.

Source origin: https://git.jolibrain.com/beniz/codex-prism . The imported source
snapshot had no Git history of its own. Root skill notices record their separate
upstream origins. The historical prism artwork has been replaced with the original geometric SVG
and reproducible icons documented in desktop/assets/PROVENANCE.md. Complete
binary notices still need separate review before shipping application bundles.
