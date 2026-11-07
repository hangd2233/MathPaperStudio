# iPad 0.2.3 and scoped Mac-host source

This is a source-only checkpoint of existing functionality, not a signed public
installer or an automatic migration of anyone's working papers. The iPad target
uses the same Prism workbench and backend facade as the desktop application.
The Mac host is an opt-in, separately configured local service.

## Included behavior

- Registered project copies, native iPad HTTP transport and Keychain token storage.
- Recoverable local drafts and save acknowledgements that do not clear newer edits.
- Durable admission and receipt lookup, so reconnecting does not replay a model task.
- Explicit source comparison, single-writer confirmation, revision checks and
  backups before applying selected changes to an original manuscript.
- Keyboard/viewport recovery and separate transport-interruption messages.
  A successful complete poll clears the transient message even with no new text.
  Requests from an old connection or suspended page cannot restore stale errors.
  Genuine Codex and task errors are not cleared merely because HTTP polling works.

The transport does not discover proxy ports, renew third-party links, provide a
VPN, change routing or establish automatic service startup. A working local
listener is not proof that an iPad's complete network path works. Keep device
credentials, signing material, real project paths and runtime logs private.

## Local source checks

From `desktop/`, with Node.js 22+, pnpm 10.28.2 and the dependencies installed:

```sh
corepack pnpm install --frozen-lockfile --ignore-scripts
corepack pnpm --filter @codex-prism/desktop test
corepack pnpm --filter @codex-prism/desktop exec tsc --noEmit
corepack pnpm --filter @codex-prism/desktop build
MPS_PRISM_IPAD=1 corepack pnpm --filter @codex-prism/desktop build
node --test apps/remote/*.test.mjs
cargo test --locked --manifest-path crates/prism-core/Cargo.toml --lib -- --test-threads=1
cargo build --locked --manifest-path crates/prism-core/Cargo.toml --example prism-ipad-host
```

Tests use synthetic inputs and mocked model calls. They neither need nor authorize
live model requests, paper writes or access to a user's deployment.

## iPad device build

A Mac with Xcode and its iOS SDK is required. The existing iPad target was built
with Rust 1.90 and Tauri 2.12; use an installed toolchain with the
`aarch64-apple-ios` target. XcodeGen and CocoaPods are required by the generated
iOS project. Device signing and provisioning belong to the developer.

From `desktop/`, generate icons from the public repository's owned artwork:

```sh
python3 scripts/generate-ipad-icons.py
MPS_PRISM_IPAD=1 corepack pnpm --filter @codex-prism/desktop build
cd apps/ipad
RUSTUP_TOOLCHAIN=1.90.0 corepack pnpm exec tauri ios init
RUSTUP_TOOLCHAIN=1.90.0 corepack pnpm exec tauri ios build
```

For the optional existing-library unsigned assembly path, first generate the iOS
project, then from `desktop/` build a fresh library after the frontend:

```sh
CARGO_TARGET_DIR=.build/ios-target cargo +1.90.0 build \
  --locked --manifest-path apps/ipad/src-tauri/Cargo.toml \
  --target aarch64-apple-ios --features custom-protocol
node scripts/assemble-unsigned.mjs
```

An unsigned bundle cannot be installed on a physical iPad. Review the bundle
identifier and your own signing profile before any installation. Do not uninstall
an existing app or clear its container merely to upgrade. Generated icons, Xcode
projects, build output and provisioning files are intentionally untracked.

## Mac-host configuration boundary

Build `prism-ipad-host`, then review `apps/remote/config.mjs` and
`apps/remote/network-binding.mjs` before preparing an owner-private configuration
outside the repository. Configuration requires a reviewed binary and its SHA-256,
private runtime and project-copy roots, an explicit project registry, native-app
origins and a separately authorized device-hash store. Any account access, model
execution and original-manuscript writeback grants must be explicit and separate.
Model settings must agree between the client and the host policy.

Start only the reviewed configuration with:

```sh
node apps/remote/start-prism.mjs /path/to/private/config.json
```

Loopback is the default permitted listener mode; the service is not a public,
multi-user endpoint or a sandbox for arbitrary untrusted projects. No real
configuration, token, pairing record, paper or model transcript is distributed.
Do not copy another user's runtime or reuse its grants. Do not remove a live owner
lock or restart an active writing session without checking current work.

## Validation status

The integrated public source was checked on macOS Apple Silicon:

- 309 frontend tests in 50 files passed, including both desktop and iPad CSP coverage.
- 143 Rust library tests passed; 8 environment-specific or manual acceptance tests
  remained explicitly ignored. No live model task was submitted.
- All 20 remote-host contract tests passed with synthetic inputs.
- TypeScript, desktop and iPad frontend production builds passed.
- The Mac-host example and the iPad native library compiled successfully.
- The lockfile was verified with a fresh frozen install with lifecycle scripts disabled.
- The generated iPad icons passed size and metadata checks and reuse the existing
  owned geometric artwork. No generated icon or binary is included in this update.

The repository-wide Biome check is not clean: style, formatting and import
findings remain. This publication does not include a broad formatting rewrite or
claim a clean lint run. Production builds also retain existing chunk-size warnings.

No public-tree device signing, installation, full desktop-native bundle, or iPad
end-to-end run was performed. These local checks are not a GitHub CI badge.
Nested workflows under `desktop/.github/` do not automatically run at repository
root. Confirm the installed version and relevant real-device behavior separately;
a source commit or successful build does not prove deployment.
