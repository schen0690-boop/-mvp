"""Optional standard-library evidence check, not a product test or runtime dependency."""
from pathlib import Path
import datetime
import hashlib
import json
import re
import subprocess

root = Path(__file__).resolve().parents[3]
probe = root / "tools/env-probe"
evidence = probe / "evidence"
raw_baseline = json.loads((evidence / "baseline.json").read_text(encoding="utf-8"))["files"]
# Normalize comparison keys, never rewrite the archived source or baseline hashes.
baseline = {name.replace("\\", "/"): value for name, value in raw_baseline.items()}
listed = subprocess.run(
    ["git", "ls-files", "--others", "--exclude-standard", "-z"],
    cwd=root, capture_output=True, check=True,
).stdout.decode("utf-8").split("\0")
files = [root / name for name in listed if name]
problems = []
for path in files:
    if path.suffix not in {".md", ".json", ".ts", ".tsx", ".mjs", ".ps1", ".py"} and path.name != ".gitignore":
        continue
    text = path.read_text(encoding="utf-8-sig")
    if re.search(r"(?i)-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bsk-[A-Za-z0-9_-]{20,}|\bgh[pousr]_[A-Za-z0-9]{30,}", text):
        problems.append("credential-like pattern: " + str(path.relative_to(root)))
    if path.suffix == ".md" and "sources" not in path.parts:
        for link in re.findall(r"\[[^\]]*\]\(([^)]+)\)", text):
            if not re.match(r"https?://", link) and not (path.parent / link.split("#")[0]).exists():
                problems.append("missing link: " + str(path.relative_to(root)) + ": " + link)

requirements = (root / "docs/requirements.md").read_text(encoding="utf-8")
tests = (root / "docs/test-plan.md").read_text(encoding="utf-8")
ids = re.findall(r"^\| (R\d+) \|", requirements, re.M)
cases = [line for line in tests.splitlines() if re.match(r"^\| T\d+", line)]
assert len(ids) == len(set(ids)) == 32
assert len(cases) == 20 and all(line.endswith("| 计划 |") for line in cases)
archive = (root / "docs/sources/development-prompts.md").read_bytes()
prefix = archive[:archive.index(b"\n\n## P2")]
assert hashlib.sha256(prefix).hexdigest() == baseline["docs/sources/development-prompts.md"]
assert hashlib.sha256((root / "docs/sources/stage-0-audit.md").read_bytes()).hexdigest() == baseline["docs/sources/stage-0-audit.md"]
records = []
for path in sorted(evidence.glob("[0-9][0-9]-*.json")):
    record = json.loads(path.read_text(encoding="utf-8-sig"))
    expected = 1 if record["name"] == "08-intentional-negative" else 0
    assert record["exitCode"] == expected and not record["timedOut"]
    records.append({"evidence": path.name, "exitCode": record["exitCode"], "expectedExitCode": expected})
assert len(records) == 12
package = json.loads((probe / "package.json").read_text(encoding="utf-8"))
lock = json.loads((probe / "package-lock.json").read_text(encoding="utf-8"))
for kind in ["dependencies", "devDependencies"]:
    assert package[kind] == lock["packages"][""][kind]
for path in (probe / "tests").rglob("*.ts"):
    assert not re.search(r"\b(?:test|it|describe)\.(?:only|skip)\s*\(", path.read_text(encoding="utf-8"))
for name in ["node_modules/react/package.json", "dist/client/index.html", ".cache/npm/example", ".tmp/check.sqlite", "evidence/raw/playwright-report.json", "evidence/screenshots/environment.png"]:
    assert subprocess.run(["git", "check-ignore", "-q", "tools/env-probe/" + name], cwd=root).returncode == 0
changes = {
    "modifiedExisting": [name for name, digest in baseline.items() if hashlib.sha256((root / name).read_bytes()).hexdigest() != digest],
    "newAuthoredAndEvidenceFiles": [str(path.relative_to(root)).replace("\\", "/") for path in files if str(path.relative_to(root)).replace("\\", "/") not in baseline],
}
(evidence / "file-changes.json").write_text(json.dumps(changes, ensure_ascii=False, indent=2), encoding="utf-8")
result = {
    "checkedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "requirements": 32, "productTestsAllPlanned": 20,
    "oldPromptPrefixUnchanged": True, "stage0ArchiveUnchanged": True,
    "executionRecords": records, "lockMatchesPackage": True, "problems": problems,
}
(evidence / "final-checks.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(result, ensure_ascii=False))
assert not problems
