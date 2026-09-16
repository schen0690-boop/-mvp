"""Stage 4B commit scope/source guard. Does not read secret configuration."""
from pathlib import Path
import json
import hashlib
import re
import subprocess

root = Path(__file__).resolve().parent.parent
source = json.loads((root / 'evidence/stage-4b/source.json').read_text(encoding='utf-8'))
archive = (root / 'docs/sources/development-prompts.md').read_bytes()
assert hashlib.sha256(archive[:source['prefixBytes']]).hexdigest() == source['prefixSha256']
names = subprocess.check_output(['git', 'diff', '--cached', '--name-only', '-z'], cwd=root).decode('utf-8').split('\0')
files = [name for name in names if name]
for name in files:
    assert not (set(Path(name).parts) & {'node_modules', '.cache', '.tmp', 'dist', 'raw'}), name
    assert not re.search(r'\.(sqlite3?|db)(-|$)', name), name
    if Path(name).suffix in {'.ts', '.tsx', '.md', '.json', '.py', '.mjs', '.ps1', '.sql'}:
        content = (root / name).read_text(encoding='utf-8-sig')
        for pattern in [r'sk-[A-Za-z0-9_-]{24,}', r'gh[pousr]_[A-Za-z0-9]{30,}', r'-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----']:
            assert not re.search(pattern, content), name + ': secret-like content (value omitted)'
print(json.dumps({'historicalPromptPrefixPreserved': True, 'stagedFiles': files,
                  'secretPatternHits': 0, 'scope': 'limited source-pattern check, not a security audit'}, ensure_ascii=False))
