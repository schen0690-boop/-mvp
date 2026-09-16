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
prompts = []
with Path(source['source']).open(encoding='utf-8') as stream:
    for line in stream:
        event = json.loads(line)
        item = event.get('payload', {})
        if event.get('type') == 'response_item' and item.get('role') == 'user':
            for part in item.get('content', []):
                value = part.get('text', '')
                if value.startswith('我确认阶段 4A 的设计，进入：'):
                    prompts.append(value)
assert len(prompts) == 1
prompt_bytes = prompts[0].encode('utf-8')
assert hashlib.sha256(prompt_bytes).hexdigest() == source['promptSha256']
assert prompt_bytes in archive[source['prefixBytes']:]
historical = subprocess.check_output(['git', 'diff', '--name-only', source['baseline'], '--',
    'evidence/stage-2', 'evidence/stage-3', 'tools/env-probe', 'package.json', 'package-lock.json',
    'docs/stage-2-validation.md', 'docs/stage-3-validation.md', 'docs/sources/stage-0-audit.md'], cwd=root)
assert not historical.strip(), 'Historical evidence or dependency baseline changed'
names = subprocess.check_output(['git', 'diff', '--cached', '--name-only', '-z'], cwd=root).decode('utf-8').split('\0')
files = [name for name in names if name]
changed = subprocess.check_output(['git','diff',source['baseline'],'--name-only','-z'],cwd=root).decode('utf-8').split('\0')
for name in (name for name in changed if name):
    assert not (set(Path(name).parts) & {'node_modules', '.cache', '.tmp', 'dist', 'raw'}), name
    assert not re.search(r'\.(sqlite3?|db)(-|$)', name), name
    if Path(name).suffix in {'.ts', '.tsx', '.md', '.json', '.py', '.mjs', '.ps1', '.sql'}:
        content = (root / name).read_text(encoding='utf-8-sig')
        for pattern in [r'sk-[A-Za-z0-9_-]{24,}', r'gh[pousr]_[A-Za-z0-9]{30,}', r'-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----']:
            assert not re.search(pattern, content), name + ': secret-like content (value omitted)'

checks = [('35-final-build-backend', 'src', '**/*.ts'), ('36-final-build-web', 'web/src', '**/*'),
          ('41-final-isolation-regression', 'tests', '**/*.ts'), ('34-final-web-tests', 'web/tests', '**/*.ts'),
          ('40-e2e-evidence-paths', 'e2e', '**/*.ts')]
for record, directory, pattern in checks:
    evidence = json.loads((root / f'evidence/stage-4b/{record}.json').read_text(encoding='utf-8-sig'))
    assert evidence['exitCode'] == 0, record
    for path in (root / directory).glob(pattern):
        if not path.is_file():
            continue
        hashes = evidence['sourceHashes']
        if path == root / 'tests/integration/migrations.test.ts':
            hashes = json.loads((root / 'evidence/stage-4b/44-final-migration-history.json').read_text(encoding='utf-8-sig'))['sourceHashes']
        name = str(path.relative_to(root))
        assert hashlib.sha256(path.read_bytes()).hexdigest().upper() == hashes[name], 'Unverified source change: ' + name

for filename in ['requirements.md','architecture.md','contracts.md','lineup-design.md','test-plan.md','ui-spec.md','stage-4b-validation.md']:
    path = root / 'docs' / filename
    content = path.read_text(encoding='utf-8')
    assert content.count('```') % 2 == 0, filename + ': fence'
    for target in re.findall(r'\]\(([^)]+)\)', content):
        if '://' not in target and not target.startswith('#'):
            assert (path.parent / target.split('#')[0]).exists(), filename + ': missing link ' + target
matrix = (root / 'docs/test-plan.md').read_text(encoding='utf-8')
assert re.findall(r'^\| (S4-\d+) \|', matrix, re.M) == [f'S4-{n:02}' for n in range(1, 33)]
print(json.dumps({'historicalPromptPrefixPreserved': True, 'currentPromptMatchesSource': True,
                  'historicalEvidenceAndDependenciesPreserved': True, 'stagedFiles': files,
                  'verifiedSourceHashesMatch': True, 's4CasesMapped': 32, 'secretPatternHits': 0,
                  'scope': 'limited source-pattern and document check, not a security audit'}, ensure_ascii=False))
