#!/usr/bin/env python3
"""Compare model timings with core.js from a delivered ZIP (Node and Python only).

The fictional desks and operation definitions are in tests/fixtures and
measure-desk.mjs. This benchmark never opens, writes, or sends user mail.
"""
from pathlib import Path
import argparse
import subprocess
import sys
import tempfile
from zipfile import ZipFile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('previous_zip', type=Path, help='Delivered prior-release ZIP with a supported desk model')
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    with ZipFile(args.previous_zip) as archive:
        candidates = [name for name in archive.namelist() if name.endswith('/src/core.js')]
        if len(candidates) != 1:
            parser.error('The ZIP must contain exactly one application src/core.js.')
        source = archive.read(candidates[0])
    with tempfile.TemporaryDirectory(prefix='sneakernet-perf-') as directory:
        old_module = Path(directory) / 'previous-core.mjs'
        old_module.write_bytes(source)
        result = subprocess.run(['node', str(root / 'scripts/measure-desk.mjs'), str(old_module)],
                                capture_output=True, text=True)
    if result.stdout:
        print(result.stdout, end='')
    if result.stderr:
        print(result.stderr, end='', file=sys.stderr)
    raise SystemExit(result.returncode)


if __name__ == '__main__':
    main()
