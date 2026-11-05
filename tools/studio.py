#!/usr/bin/env python3
"""Small offline helpers; no models, accounts, or research selection."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
NAMES = ('import-research', 'distill-math-paper', 'compose-math-paper',
         'revise-math-paper', 'prepare-paper-release', 'draw-proof-map')

def fail(message):
    raise ValueError(message)

def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()

def files(base):
    result = []
    for p in sorted(base.rglob('*')):
        if p.is_symlink():
            fail(f'Symlink not allowed in portable snapshot: {p}')
        if p.is_file():
            result.append(p)
    return result

def inventory(base):
    return {p.relative_to(base).as_posix(): digest(p) for p in files(base)}

def save_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

def publish(stage, target):
    if target.exists():
        fail(f'Refusing to overwrite existing path: {target}')
    stage.rename(target)

def import_files(a):
    target = Path(a.into).resolve()
    srcs = [Path(s).resolve() for s in a.sources]
    if not srcs:
        fail('Specify individual files; directories are not scanned')
    names = set()
    rows = []
    for original, src in zip(a.sources, srcs):
        if Path(original).is_symlink() or not src.is_file():
            fail(f'Expected a regular non-symlink file: {original}')
        if src.name.casefold() in names or src.name.casefold() == 'manifest.json':
            fail(f'Duplicate/reserved filename: {src.name}; use separate batches')
        names.add(src.name.casefold())
        rows.append({'file': src.name, 'source': src.as_uri(), 'version': a.version,
                     'sha256': digest(src), 'bytes': src.stat().st_size})
    manifest = {'schema': 1, 'source_label': a.source_label, 'files': rows}
    if target.exists():
        existing = target / 'manifest.json'
        if existing.is_file() and json.loads(existing.read_text(encoding='utf-8')) == manifest:
            check_batch(target)
            print(f'UNCHANGED verified batch: {target}')
            return
        fail(f'Batch already exists with different contents/metadata: {target}; choose a new batch')
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.import-', dir=target.parent) as tmp:
        stage = Path(tmp) / 'batch'
        stage.mkdir()
        for src, row in zip(srcs, rows):
            shutil.copy2(src, stage / src.name)
            if digest(stage / src.name) != row['sha256'] or digest(src) != row['sha256']:
                fail(f'Source changed while copying: {src}')
        save_json(stage / 'manifest.json', manifest)
        publish(stage, target)
    print(f'IMPORTED {len(rows)} files: {target}')

def check_batch(base):
    manifest = json.loads((base / 'manifest.json').read_text(encoding='utf-8'))
    expected = {'manifest.json'}
    for row in manifest['files']:
        name = row['file']
        if Path(name).name != name:
            fail('Invalid manifest filename')
        expected.add(name)
        p = base / name
        if not p.is_file() or p.is_symlink() or digest(p) != row['sha256']:
            fail(f'Imported file missing or changed: {p}')
    actual = {p.name for p in base.iterdir() if p.is_file()}
    if actual != expected:
        fail(f'Unexpected files in source batch: {base}')
    # A project snapshot can retain original source hierarchy with nested batches.
    for child in base.iterdir():
        if child.is_symlink():
            fail(f'Symlink in source batch: {child}')
        if child.is_dir():
            check_import_branch(child)

def check_import_branch(base):
    if (base / 'manifest.json').is_file():
        check_batch(base)
        return
    for child in base.iterdir():
        if child.is_symlink() or child.is_file():
            fail(f'Unmanifested file in nested source directory: {child}')
        if child.is_dir():
            check_import_branch(child)

def new_paper(a):
    target = Path(a.into).resolve()
    if target.exists():
        fail(f'Paper already exists: {target}; no files overwritten')
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.paper-', dir=target.parent) as tmp:
        stage = Path(tmp) / 'paper'
        shutil.copytree(ROOT / 'templates/paper', stage)
        publish(stage, target)
    print(f'CREATED paper: {target}')

def deploy(a):
    target = ROOT / '.agents/skills'
    selected = tuple(a.only) if getattr(a, 'only', None) else NAMES
    sources = {name: ROOT / 'skills' / name for name in selected}
    desired = {name: inventory(src) for name, src in sources.items()}
    index = target / '.mathpaper-managed.json'
    prior = json.loads(index.read_text(encoding='utf-8')) if index.exists() else {}
    # Check all conflicts before writing anything. Protect hand edits.
    for name in selected:
        dst = target / name
        if dst.is_symlink():
            fail(f'Refusing symlink discovery copy: {dst}')
        if dst.exists():
            current = inventory(dst)
            if current != desired[name] and current != prior.get(name):
                fail(f'Discovery copy has untracked/manual changes: {dst}; reconcile with master first')
    # Check managed names in known ancestor/user discovery locations.
    for base in [parent / '.agents/skills' for parent in ROOT.parents] + [Path.home() / '.agents/skills', Path.home() / '.codex/skills']:
        for name in selected:
            if (base / name / 'SKILL.md').is_file():
                fail(f'Same-name skill in another discovery scope: {base / name}; do not change global config')
    # Root deployment only. Never create nested same-name copies.
    for base in [ROOT / 'papers', ROOT / 'tests']:
        for p in base.rglob('SKILL.md'):
            if '.agents' in p.parts and p.parent.name in selected:
                fail(f'Duplicate nested skill: {p}')
    target.mkdir(parents=True, exist_ok=True)
    for name, src in sources.items():
        dst = target / name
        if dst.exists() and inventory(dst) == desired[name]:
            continue
        with tempfile.TemporaryDirectory(prefix='.deploy-', dir=target) as tmp:
            stage = Path(tmp) / name
            shutil.copytree(src, stage)
            if dst.exists():
                backup = Path(tmp) / 'previous'
                dst.rename(backup)
                try:
                    stage.rename(dst)
                except Exception:
                    backup.rename(dst)
                    raise
            else:
                stage.rename(dst)
    updated = {**prior, **desired} if getattr(a, 'only', None) else desired
    if prior != updated:
        save_json(index, updated)
    print('DEPLOYED to root .agents/skills; actual discovery must be checked through Codex skills/list or selector')

def check_paper(paper):
    required = ['AGENTS.md', 'BRIEF.md', 'CONTINUE.md', 'main.tex', 'notation.tex',
                'references.bib', 'working/PROOF_MAP.md', 'working/ISSUES.md']
    for name in required:
        if not (paper / name).is_file():
            fail(f'Missing required file: {name}')
    for name in ['imports', 'sections', 'figures', 'reviews', 'releases']:
        if not (paper / name).is_dir():
            fail(f'Missing required directory: {name}')
    for m in (paper / 'imports').rglob('manifest.json'):
        check_batch(m.parent)
    # TeX is validated by compilation too. These checks catch common portability errors.
    for src in paper.rglob('*.tex'):
        if 'releases' in src.relative_to(paper).parts or 'imports' in src.relative_to(paper).parts:
            continue
        text = src.read_text(encoding='utf-8')
        text = re.sub(r'(?<!\\)%[^\n]*', '', text)
        for command, name in re.findall(r'\\(input|include|includegraphics|bibliography)(?:\[[^\]]*\])?\{([^}]+)\}', text):
            for part in name.split(','):
                q = Path(part.strip())
                if q.is_absolute() or re.match(r'^[A-Za-z]:', part):
                    fail(f'Absolute TeX dependency in {src.name}: {part}')
                candidate = (paper / q).resolve()
                if not candidate.is_relative_to(paper):
                    fail(f'TeX dependency escapes paper: {part}')
                suffixes = {'input': ['', '.tex'], 'include': ['', '.tex'],
                            'bibliography': ['', '.bib'], 'includegraphics': ['', '.pdf', '.png', '.jpg', '.jpeg', '.eps']}[command]
                if not any(Path(str(candidate) + ext).is_file() for ext in suffixes):
                    fail(f'Missing TeX dependency: {part}')

def version(value):
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]*', value):
        fail('Version must use letters/digits/dot/underscore/hyphen')
    return value

def build(paper, output):
    exe = shutil.which('latexmk')
    if not exe:
        fail('latexmk not found; add existing TeX bin directory to PATH (no automatic install)')
    # Runtime system temp is outside the synchronized tree. Fresh build prevents stale PDFs.
    with tempfile.TemporaryDirectory(prefix='mathpaper-build-') as tmp:
        local = Path(tmp) / 'source'
        shutil.copytree(paper, local, ignore=shutil.ignore_patterns('releases', '.git', '.agents', '.codexprism', '.prism', '__pycache__'))
        out = Path(tmp) / 'build'
        out.mkdir()
        command = [exe, '-pdf', '-interaction=nonstopmode', '-halt-on-error', '-file-line-error',
                   '-no-shell-escape', f'-outdir={out}', 'main.tex']
        run = subprocess.run(command, cwd=local, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                             text=True, errors='replace', timeout=180)
        log_path = out / 'main.log'
        log = log_path.read_text(errors='replace') if log_path.exists() else run.stdout
        if run.returncode or not (out / 'main.pdf').is_file():
            fail('TeX compilation failed:\n' + run.stdout[-6000:])
        if re.search(r'(undefined references|undefined citations|Citation .* undefined|Reference .* undefined|multiply defined)', log, re.I):
            fail('Unresolved/duplicate references or citations:\n' + log[-6000:])
        shutil.copy2(out / 'main.pdf', output / 'main.pdf')
        (output / 'build.log').write_text(log, encoding='utf-8')
        return {'engine': 'latexmk -pdf', 'warnings': [line for line in log.splitlines() if 'Warning' in line or 'Overfull' in line or 'Underfull' in line]}

def release(a):
    paper = Path(a.paper).resolve()
    check_paper(paper)
    dest = paper / 'releases' / version(a.version)
    if dest.exists():
        fail(f'Version already exists: {dest}; choose a new version, fixed PDFs are never overwritten')
    dest.parent.mkdir(exist_ok=True)
    before = inventory_sources(paper)
    with tempfile.TemporaryDirectory(prefix='.release-', dir=dest.parent) as tmp:
        stage = Path(tmp) / 'version'
        stage.mkdir()
        result = build(paper, stage)
        if before != inventory_sources(paper):
            fail('Paper changed during build; do not write concurrently')
        # Working draft is the default; successful build does not certify mathematics.
        meta = {'schema': 1, 'version': a.version, 'status': 'working-draft',
                'source_sha256': before, 'build': result}
        if a.command == 'release':
            with zipfile.ZipFile(stage / 'source.zip', 'w', zipfile.ZIP_DEFLATED) as z:
                for name in before:
                    z.write(paper / name, name)
                # Empty portable directories survive extraction.
                for name in ['imports', 'sections', 'figures', 'reviews', 'releases']:
                    z.writestr(name + '/', '')
            # Verify archive members byte-for-byte, not only ZIP CRC.
            with zipfile.ZipFile(stage / 'source.zip') as z:
                for name, sha in before.items():
                    if hashlib.sha256(z.read(name)).hexdigest() != sha:
                        fail(f'Archive changed while packaging: {name}')
        meta['artifacts_sha256'] = inventory(stage)
        save_json(stage / 'manifest.json', meta)
        publish(stage, dest)
    print(f'{a.command.upper()} saved fixed working-draft version: {dest}')
    for warning in result['warnings']:
        print('BUILD WARNING: ' + warning)

def inventory_sources(paper):
    return {p.relative_to(paper).as_posix(): digest(p) for p in files(paper)
            if not any(x in {'releases', '.git', '.agents', '.codexprism', '.prism', '__pycache__'} for x in p.relative_to(paper).parts)
            and (p.relative_to(paper).parts[0] == 'imports' or (p.suffix not in {'.aux', '.log', '.out', '.fls', '.fdb_latexmk', '.synctex'} and p.relative_to(paper).as_posix() != 'main.pdf')) }

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    imp = sub.add_parser('import', help='Copy explicitly specified files without changing originals')
    imp.add_argument('--into', required=True)
    imp.add_argument('--version', required=True)
    imp.add_argument('--source-label', required=True)
    imp.add_argument('sources', nargs='+')
    imp.set_defaults(func=import_files)
    new = sub.add_parser('new-paper', help='Create from template; never overwrite an existing paper')
    new.add_argument('--into', required=True)
    new.set_defaults(func=new_paper)
    dep = sub.add_parser('deploy-skills', help='Deploy managed copies only at the workspace root')
    dep.add_argument('--only', nargs='+', choices=NAMES, help='Deploy selected skills while preserving other managed entries')
    dep.set_defaults(func=deploy)
    check = sub.add_parser('check-import', help='Verify an imported batch')
    check.add_argument('batch')
    check.set_defaults(func=lambda a: (check_batch(Path(a.batch).resolve()), print('VERIFIED import')))
    check = sub.add_parser('check-paper', help='Check structure, imported hashes and static relative TeX dependencies')
    check.add_argument('paper')
    check.set_defaults(func=lambda a: (check_paper(Path(a.paper).resolve()), print('VERIFIED paper structure; compile still required')))
    for name in ['compile', 'release']:
        rel = sub.add_parser(name, help='Compile to a new fixed version' + (' and package source' if name == 'release' else ''))
        rel.add_argument('paper')
        rel.add_argument('--version', required=True)
        rel.set_defaults(func=release)
    a = parser.parse_args()
    try:
        a.func(a)
    except (ValueError, OSError, subprocess.TimeoutExpired, json.JSONDecodeError, KeyError) as exc:
        print(f'ERROR: {exc}', file=sys.stderr)
        return 1
    return 0

if __name__ == '__main__':
    sys.exit(main())
