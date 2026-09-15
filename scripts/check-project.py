"""Read-only scope/source checks. Reports locations only if a secret-like pattern matches."""
from pathlib import Path
import datetime
import hashlib
import json
import re
import subprocess

ROOT = Path(__file__).resolve().parent.parent


def digest(data):
    return hashlib.sha256(data).hexdigest()


def git(*args):
    return subprocess.run(['git', '-c', 'core.quotePath=false', *args], cwd=ROOT,
                          capture_output=True, encoding='utf-8')


baseline = json.loads((ROOT / 'evidence/stage-2/source-baseline.json').read_text(encoding='utf-8'))
archive = (ROOT / 'docs/sources/development-prompts.md').read_bytes()
assert digest(archive[:baseline['previousArchiveBytes']]) == baseline['previousArchiveSha256']
assert digest((ROOT / 'docs/sources/stage-0-audit.md').read_bytes()) == baseline['stage0Sha256']
for name, expected in baseline['probeHashes'].items():
    assert digest((ROOT / name).read_bytes()) == expected, f'Probe changed: {name}'

messages = []
for line in Path(baseline['source']).open(encoding='utf-8'):
    item = json.loads(line)
    payload = item.get('payload', {})
    if item.get('type') == 'response_item' and payload.get('type') == 'message' and payload.get('role') == 'user':
        text = '\n'.join(part.get('text', '') for part in payload.get('content', []) if part.get('type') == 'input_text')
        if text.startswith('请基于已完成的阶段 1A 和阶段 1B，进入并实际执行：'):
            messages.append(text)
assert len(messages) == 1
assert digest(messages[0].encode()) == baseline['promptSha256']
assert ('```text\n' + messages[0] + '\n```').encode() in archive

expected_exits = {
    '02b-input-red-array-fixtures': 1, '03-input-green': 0,
    '04-schema-red': 1, '05-schema-green-regression': 0,
    '06-drafts-red': 1, '07-drafts-green-regression': 0,
    '08-list-red': 1, '09-list-green-regression': 0,
    '10-http-red': 1, '11-http-green-regression': 0,
    '15-unicode-boundary-red': 1, '17-unicode-green-regression': 0,
    '19-final-typecheck': 0, '20-final-unit': 0, '21-final-integration': 0,
    '22-npm-tree': 0, '23-final-build': 0, '24-final-regression': 0,
    '25-final-process-smoke': 0
}
for name, expected in expected_exits.items():
    record = json.loads((ROOT / f'evidence/stage-2/{name}.json').read_text(encoding='utf-8-sig'))
    assert record['exitCode'] == expected and not record['timedOut'], name
    if name in {'19-final-typecheck', '20-final-unit', '21-final-integration', '23-final-build', '24-final-regression', '25-final-process-smoke'}:
        for path, sha in record['sourceHashes'].items():
            assert digest((ROOT / path).read_bytes()).upper() == sha, f'Changed after verification: {path}'

listed = git('ls-files', '--cached', '--others', '--exclude-standard', '-z')
assert listed.returncode == 0
files = sorted(set(name for name in listed.stdout.split('\0') if name))
assert not any(any(part in {'node_modules', 'dist', '.cache', '.tmp'} for part in Path(name).parts) for name in files)
assert not any(re.search(r'\.(?:sqlite|db|sqlite3)(?:-|$)', name) for name in files)
secrets = [re.compile(r'sk-[A-Za-z0-9_-]{24,}'), re.compile(r'gh[pousr]_[A-Za-z0-9]{30,}'),
           re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----')]
hits = []
for name in files:
    path = ROOT / name
    if path.suffix not in {'.md', '.ts', '.json', '.mjs', '.ps1', '.py'}:
        continue
    text = path.read_text(encoding='utf-8-sig')
    for index, line in enumerate(text.splitlines(), 1):
        if any(pattern.search(line) for pattern in secrets):
            hits.append({'path': name, 'line': index})
assert not hits, f'Secret-like locations (values omitted): {hits}'
for path in (ROOT / 'src').rglob('*.ts'):
    text = path.read_text(encoding='utf-8')
    assert not re.search(r'\bas\s+any\b|@ts-(?:ignore|nocheck)|env-probe|\.codex', text), path.name

docs = [ROOT / 'AGENTS.md', ROOT / 'README.md', *(ROOT / 'docs').glob('*.md')]
for path in docs:
    text = path.read_text(encoding='utf-8')
    assert len(re.findall(r'^```', text, re.M)) % 2 == 0, path.name
    for link in re.findall(r'\[[^\]]+\]\(([^)]+)\)', text):
        if '://' not in link and not link.startswith('#'):
            assert (path.parent / link.split('#')[0]).exists(), (path.name, link)
requirements = (ROOT / 'docs/requirements.md').read_text(encoding='utf-8')
assert len(re.findall(r'^\| R\d\d \|', requirements, re.M)) == 32
test_plan = (ROOT / 'docs/test-plan.md').read_text(encoding='utf-8')
scenarios = re.findall(r'^\| T\d\d .*$', test_plan, re.M)
assert len(scenarios) == 20 and all(line.endswith('计划 |') for line in scenarios)
head = git('rev-parse', '--verify', 'HEAD')
staged = git('diff', '--cached', '--name-only')
remotes = git('remote')
assert head.returncode != 0 and not staged.stdout.strip() and not remotes.stdout.strip()
stage2_files = [name for name in files if not name.startswith('tools/env-probe/')]
print(json.dumps({
    'checkedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'historicalPromptPrefixPreserved': True, 'currentPromptExactMatch': True,
    'stage0ReportUnchanged': True, 'probeFilesUnchanged': len(baseline['probeHashes']),
    'finalSourceHashesMatchChecks': True, 'requirementsCount': 32,
    'fullProductScenariosStillPlanned': 20, 'documentLinksAndFencesValid': True,
    'secretPatternHits': hits, 'scope': 'versionable source/docs/evidence only; no secret configuration read',
    'git': {'branch': git('branch', '--show-current').stdout.strip(), 'commits': 0, 'staged': [], 'remotes': []},
    'versionableFilesOutsideProbe': stage2_files,
    'fileHashesOutsideProbe': {name: digest((ROOT / name).read_bytes()) for name in stage2_files}
}, ensure_ascii=False, indent=2))
