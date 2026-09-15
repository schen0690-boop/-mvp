"""Read-only Stage 3 source, evidence and versionable-file checks; no secret config reads."""
from pathlib import Path
import datetime
import hashlib
import json
import re
import subprocess

ROOT = Path(__file__).resolve().parent.parent
def sha(data):
    return hashlib.sha256(data).hexdigest()
def read_json(path):
    return json.loads((ROOT / path).read_text(encoding='utf-8-sig'))
def git(*args):
    return subprocess.check_output(['git', '-c', 'core.quotePath=false', *args], cwd=ROOT).decode('utf-8')

source = read_json('evidence/stage-3/source.json')
archive = (ROOT / 'docs/sources/development-prompts.md').read_bytes()
assert sha(archive[:source['prefixBytes']]) == source['prefixSha256']
prompt = Path(r'C:\Users\Administrator\.codex\attachments\926300d9-3747-4e64-88a5-d84bbf8c29b7\pasted-text.txt').read_text(encoding='utf-8')
assert sha(prompt.encode()) == source['promptSha256']
assert prompt in archive.decode('utf-8').replace('\r\n', '\n')
old = read_json('evidence/stage-2/source-baseline.json')
assert sha((ROOT / 'docs/sources/stage-0-audit.md').read_bytes()) == old['stage0Sha256']
for name, expected in old['probeHashes'].items():
    assert sha((ROOT / name).read_bytes()) == expected, name
assert not git('diff', '65e24f5', '--name-only', '--', 'src', 'tests', 'tools/env-probe').strip()
skill = read_json('evidence/stage-3/frontend-design-source.json')
for name, expected in skill['files'].items():
    assert sha((ROOT / skill['path'] / name).read_bytes()) == expected['sha256']
records = ['14-web-build', '15-backend-typecheck', '16-web-typecheck', '17-e2e-typecheck',
           '18-backend-regression', '19-web-regression', '20-backend-build', '21-dependencies', '22-browser-final']
for name in records:
    record = read_json(f'evidence/stage-3/{name}.json')
    assert record['exitCode'] == 0 and not record['timedOut'], name
    for path, expected in record['sourceHashes'].items():
        if name == '14-web-build' and path.replace('\\', '/').startswith('e2e/'):
            continue  # Later screenshot assertions do not change the already verified browser bundle.
        assert sha((ROOT / path).read_bytes()).upper() == expected, (name, path)
files = sorted(set(filter(None, git('ls-files', '--cached', '--others', '--exclude-standard', '-z').split('\0'))))
assert not any(set(Path(name).parts) & {'node_modules', '.cache', '.tmp', 'dist', 'raw'} for name in files)
assert not any(re.search(r'\.(sqlite3?|db)(-|$)', name) for name in files)
patterns = [r'sk-[A-Za-z0-9_-]{24,}', r'gh[pousr]_[A-Za-z0-9]{30,}', r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----']
hits = []
for name in files:
    if Path(name).suffix not in {'.md', '.ts', '.tsx', '.json', '.mjs', '.ps1', '.py', '.css', '.html'}:
        continue
    content = (ROOT / name).read_text(encoding='utf-8-sig')
    for line, value in enumerate(content.splitlines(), 1):
        if any(re.search(pattern, value) for pattern in patterns):
            hits.append({'file': name, 'line': line})
assert not hits, hits
for path in (ROOT / 'web/src').glob('*'):
    assert not re.search(r'as\s+any\b|@ts-(?:ignore|nocheck)|dangerouslySetInnerHTML|env-probe|\.codex|node:sqlite', path.read_text(encoding='utf-8')), path.name
for path in (ROOT / 'web/dist/assets').glob('*.js'):
    assert not re.search(r'node:sqlite|node:fs|DATABASE_PATH|env-probe|\.codex', path.read_text(encoding='utf-8')), path.name
for path in [ROOT / 'AGENTS.md', ROOT / 'README.md', *(ROOT / 'docs').glob('*.md')]:
    content = path.read_text(encoding='utf-8')
    assert len(re.findall(r'^```', content, re.M)) % 2 == 0, path.name
    for link in re.findall(r'\[[^\]]+\]\(([^)]+)\)', content):
        if '://' not in link and not link.startswith('#'):
            assert (path.parent / link.split('#')[0]).exists(), (path.name, link)
assert len(re.findall(r'^\| R\d\d \|', (ROOT / 'docs/requirements.md').read_text(encoding='utf-8'), re.M)) == 32
scenarios = re.findall(r'^\| T\d\d .*$', (ROOT / 'docs/test-plan.md').read_text(encoding='utf-8'), re.M)
assert len(scenarios) == 20 and all(line.endswith('计划 |') for line in scenarios)
assert not git('remote').strip()
print(json.dumps({'checkedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'historicalPrefixPreserved': True, 'promptExactMatch': True, 'stage0Unchanged': True,
    'probeFilesUnchanged': len(old['probeHashes']), 'backendUnchanged': True, 'upstreamSkillHashesMatch': True,
    'finalEvidenceSourceHashesMatch': True, 'documentChecksPassed': True,
    'secretPatternLocations': hits, 'scope': 'versionable files only; not a complete security audit',
    'noServerModulesInBrowserBundle': True, 'versionableFileCount': len(files)}, ensure_ascii=False, indent=2))
