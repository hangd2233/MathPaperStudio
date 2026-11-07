# Desktop source and development

The application source is under `desktop/`; writing skills and templates remain
at the repository root. Upstream codex-prism code retains its MIT copyright
notices in `desktop/LICENSE`. Renderer and dependency licenses also apply.

Use Node.js 22+, pnpm 10.28.2 and Rust 1.88.0. Runtime PDF compilation needs a
separate TeX distribution. Codex authentication belongs to each developer.

```sh
git clone https://github.com/hangd2233/MathPaperStudio.git
cd MathPaperStudio/desktop
corepack pnpm install --frozen-lockfile
corepack pnpm --filter @codex-prism/desktop test
corepack pnpm --filter @codex-prism/desktop build
cargo test --locked --manifest-path crates/prism-core/Cargo.toml --lib -- --test-threads=1
corepack pnpm build:desktop
```

For a development session, run `corepack pnpm dev:desktop` from `desktop/`.
The build script produces a local development artifact; it does not install or
replace an existing app. The application still uses the upstream bundle identity,
so avoid replacing another installed codex-prism build accidentally.

macOS development also requires Apple's Xcode command-line tools. Linux needs
the platform Tauri/WebKit development libraries described in `desktop/README.md`;
Windows needs the corresponding Rust/MSVC/WebView2 toolchain. Only the macOS
source checks described in the root README were revalidated for this release.

Generated template PDFs, bundles, caches and credentials are excluded. Recreate
template previews with the existing `generate-previews` script if needed.
Nested workflow files under `desktop/.github/` are reference configuration;
they do not automatically run at this combined repository root.

Source origin: https://git.jolibrain.com/beniz/codex-prism . The imported source
snapshot had no Git history of its own. Root skill notices record their separate
upstream origins. The historical prism artwork has been replaced with the original geometric SVG
and reproducible icons documented in desktop/assets/PROVENANCE.md. Complete
binary notices still need separate review before shipping application bundles.

The shared frontend also contains the iPad entry point. Normal desktop builds
continue to use `src/main.tsx`; only `MPS_PRISM_IPAD=1` selects the iPad entry and
transport adapters. See [IPAD.md](IPAD.md) for the separate source target.
