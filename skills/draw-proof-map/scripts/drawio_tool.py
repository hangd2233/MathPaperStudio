#!/usr/bin/env python3
"""Local draw.io helpers. No content extraction, layout, downloads or cloud calls."""
import argparse
import base64
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
from urllib.parse import unquote
import xml.etree.ElementTree as ET
import zlib


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def models(path):
    root = ET.parse(path).getroot()
    if root.tag == 'mxGraphModel':
        return [root]
    if root.tag != 'mxfile':
        raise ValueError('Expected mxfile or mxGraphModel')
    result = []
    for diagram in root.findall('diagram'):
        model = diagram.find('mxGraphModel')
        if model is None:
            payload = zlib.decompress(base64.b64decode(diagram.text or ''), -15)
            model = ET.fromstring(unquote(payload.decode('utf-8')))
        result.append(model)
    if not result:
        raise ValueError('No diagram pages')
    return result


def check(path):
    counts = []
    for model in models(path):
        cells = model.findall('.//mxCell')
        parents = {child: parent for parent in model.iter() for child in parent}
        ids = [c.get('id') or parents[c].get('id') for c in cells]
        if None in ids or len(set(ids)) != len(ids) or not {'0', '1'} <= set(ids):
            raise ValueError('Missing/duplicate ids or root layers')
        vertices = [c for c in cells if c.get('vertex') == '1']
        if not vertices:
            raise ValueError('No editable vertices')
        for c in cells:
            if c.get('parent') == c.get('id'):
                raise ValueError('Self-parent cell')
            if c.get('parent') and c.get('parent') not in ids:
                raise ValueError('Missing parent')
            if c.get('vertex') == '1':
                g = c.find('mxGeometry')
                if g is None or min(float(g.get('width', 0)), float(g.get('height', 0))) <= 0:
                    raise ValueError('Vertex missing positive geometry')
            if c.get('edge') == '1':
                if c.get('source') not in ids or c.get('target') not in ids:
                    raise ValueError('Dangling edge; explicitly model unknown relations')
                if c.find('mxGeometry') is None:
                    raise ValueError('Edge geometry absent')
        counts.append({'vertices': len(vertices), 'edges': sum(c.get('edge') == '1' for c in cells)})
    print(json.dumps({'structural_check_only': counts, 'sha256': sha(path)}))


def executable(arg):
    configured = arg or os.environ.get('DRAWIO_DESKTOP')
    local = Path(os.environ.get('LOCALAPPDATA', Path.home() / '.local/share'))
    config = (Path.home() / 'Library/Application Support/MathPaperStudio/drawio.json'
              if sys.platform == 'darwin' else local / 'MathPaperStudio/drawio.json')
    if not configured and config.is_file():
        configured = json.loads(config.read_text(encoding='utf-8-sig'))['executable']
    if configured:
        p = Path(configured).expanduser()
        if not p.is_file():
            raise ValueError(f'Configured Desktop executable missing: {p}')
        return str(p)
    candidates = [shutil.which('draw.io'), shutil.which('drawio'),
                  str(local / 'Programs/draw.io/draw.io.exe'),
                  str(Path(os.environ.get('ProgramFiles', 'C:/Program Files')) / 'draw.io/draw.io.exe'),
                  '/Applications/draw.io.app/Contents/MacOS/draw.io',
                  str(Path.home() / 'Applications/draw.io.app/Contents/MacOS/draw.io')]
    for p in candidates:
        if p and Path(p).is_file():
            return p
    raise ValueError('Desktop not found; set DRAWIO_DESKTOP or --exe. Source can still be retained.')


def run(exe, args):
    env = os.environ.copy()
    env.pop('ELECTRON_RUN_AS_NODE', None)
    r = subprocess.run([exe, '--disable-gpu', '--disable-update', *args],
                       capture_output=True, text=True, encoding='utf-8', errors='replace',
                       timeout=90, env=env)
    if r.returncode:
        raise ValueError(f'Desktop failed ({r.returncode}): {r.stdout}\n{r.stderr}')
    return r.stdout


def baseline(path):
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    dest = path.parent / 'baselines' / f'{path.stem}-{stamp}-{sha(path)[:10]}'
    dest.mkdir(parents=True, exist_ok=False)
    for p in [path, path.with_suffix('.pdf'), path.with_name(path.stem + '-notes.md')]:
        if p.is_file():
            shutil.copy2(p, dest / p.name)
    print(dest)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['probe', 'check', 'baseline', 'export', 'open'])
    parser.add_argument('file', nargs='?')
    parser.add_argument('--exe')
    parser.add_argument('--format', choices=['pdf', 'svg'], default='pdf')
    a = parser.parse_args()
    if a.command == 'probe':
        print(run(executable(a.exe), ['--help']))
        return
    if not a.file:
        raise ValueError('Specify one .drawio file')
    path = Path(a.file).resolve(strict=True)
    if path.suffix.lower() != '.drawio':
        raise ValueError('Expected an independent .drawio source')
    check(path)
    if a.command == 'check':
        return
    if a.command == 'baseline':
        baseline(path)
        return
    exe = executable(a.exe)
    if a.command == 'open':
        subprocess.Popen([exe, '--disable-update', str(path)],
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        print('Desktop launch requested; visible/editable UI requires separate confirmation')
        return
    help_text = run(exe, ['--help'])
    for option in ['--export', '--format', '--output', '--border']:
        if option not in help_text:
            raise ValueError(f'Installed CLI lacks {option}')
    before = sha(path)
    with tempfile.TemporaryDirectory(prefix='proof-map-export-') as tmp:
        output = Path(tmp) / ('export.' + a.format)
        args = ['--export', '--format', a.format, '--border', '16', '--output', str(output)]
        if a.format == 'pdf' and '--crop' in help_text:
            args.append('--crop')
        if '--all-pages' in help_text and a.format == 'pdf':
            args.append('--all-pages')
        print(run(exe, args + [str(path)]))
        if sha(path) != before:
            raise ValueError('Desktop changed source during export; inspect source/baseline')
        if not output.is_file() or output.stat().st_size < 100:
            raise ValueError('Missing/empty export; no output published')
        if a.format == 'pdf' and not output.read_bytes().startswith(b'%PDF-'):
            raise ValueError('Invalid PDF header')
        if a.format == 'svg' and ET.parse(output).getroot().tag.split('}')[-1] != 'svg':
            raise ValueError('Invalid SVG')
        target = path.with_suffix('.' + a.format)
        # Stage on the target filesystem; publish only a completed export.
        with tempfile.NamedTemporaryFile(dir=path.parent, suffix='.' + a.format, delete=False) as f:
            stage = Path(f.name)
        try:
            shutil.copyfile(output, stage)
            os.replace(stage, target)
        finally:
            stage.unlink(missing_ok=True)
    print(f'Exported {target}; source unchanged {before}; visual check still required')


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, ET.ParseError, subprocess.TimeoutExpired, zlib.error) as exc:
        print(f'ERROR: {exc}', file=sys.stderr)
        sys.exit(1)
