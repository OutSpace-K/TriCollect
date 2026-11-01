"""Build a source ZIP, excluding local configuration, dependencies and internal screenshots."""
from pathlib import Path
import hashlib
import json
import zipfile
root = Path(__file__).resolve().parents[1]
allowed = ['src', 'scripts', 'tests', 'config', 'docs', 'assets', 'dist', 'evidence', 'package.json', 'package-lock.json', 'tsconfig.json', 'README.md', 'LICENSE', '.gitignore']
files = []
for name in allowed:
    item = root / name
    for f in sorted(item.rglob('*')) if item.is_dir() else [item]:
        if not f.is_file() or f.is_symlink():
            continue
        rel = f.relative_to(root)
        if f.name == 'platform.local.json' or f.suffix in ['.png', '.log'] or 'node_modules' in rel.parts or '__pycache__' in rel.parts:
            continue
        files.append(f)
manifest = {str(f.relative_to(root)): hashlib.sha256(f.read_bytes()).hexdigest() for f in files}
version = json.loads((root / 'package.json').read_text())['version']
output = root.parent / f'TriCollect-v{version}-source.zip'
with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
    for f in files:
        archive.write(f, 'TriCollect/' + str(f.relative_to(root)))
    archive.writestr('TriCollect/SHA256SUMS.json', json.dumps(manifest, indent=2) + "\n")
with zipfile.ZipFile(output) as archive:
    assert archive.testzip() is None
    for name, digest in manifest.items():
        assert hashlib.sha256(archive.read('TriCollect/' + name)).hexdigest() == digest
print(json.dumps({'file': str(output), 'files': len(files)+1, 'bytes': output.stat().st_size, 'sha256': hashlib.sha256(output.read_bytes()).hexdigest(), 'verified': True}, indent=2))
