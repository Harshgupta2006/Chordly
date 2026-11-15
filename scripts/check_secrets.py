"""Redacted, dependency-free credential checks for source and reachable Git history.

This is a guardrail, not a guarantee that every possible secret format is detected.
Only paths, rule names and line numbers are emitted; never matched values.
"""

import argparse
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
RULES = {
    "private-key": r"-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----",
    "github-token": r"\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b",
    "huggingface-token": r"\bhf_[A-Za-z0-9]{30,}\b",
    "provider-key": r"\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{32,}\b",
    "aws-access-key": r"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b",
    "google-key": r"\bAIza[A-Za-z0-9_-]{35}\b",
    "slack-token": r"\bxox[baprs]-[A-Za-z0-9-]{20,}\b",
    "stripe-secret": r"\b(?:sk|rk)_live_[A-Za-z0-9]{20,}\b",
}
PATTERNS = {name: re.compile(pattern) for name, pattern in RULES.items()}
ASSIGNMENT = re.compile(
    r'''(?im)\b(?:[A-Z_]*(?:API_KEY|ACCESS_TOKEN|CLIENT_SECRET|PRIVATE_KEY|PASSWORD|DATABASE_URL)[A-Z_]*)\s*[=:]\s*["']?([^\s"'`,;]+)'''
)
PLACEHOLDER = re.compile(r"(?i)placeholder|example|change.?me|your[_-]|local|localhost|127\.0\.0\.1|\$\{|process\.env|os\.(?:getenv|environ)|none|false|true|<|>")


def findings(data):
    if b"\0" in data:
        return []
    value = data.decode("utf-8", errors="replace")
    # Notebook text/code remains scanned; omit binary image strings.
    try:
        notebook = json.loads(value)
        if isinstance(notebook, dict) and "nbformat" in notebook:
            for cell in notebook.get("cells", []):
                for output in cell.get("outputs", []):
                    for key in list(output.get("data", {})):
                        if key.startswith("image/"):
                            output["data"].pop(key)
            value = json.dumps(notebook)
    except (ValueError, TypeError):
        pass
    found = []
    for name, pattern in PATTERNS.items():
        for match in pattern.finditer(value):
            found.append((name, value.count("\n", 0, match.start()) + 1))
    for match in ASSIGNMENT.finditer(value):
        literal = match.group(1)
        if len(literal) >= 16 and not PLACEHOLDER.search(literal) and re.search(r"[a-zA-Z]", literal) and re.search(r"[0-9]", literal):
            found.append(("credential-assignment", value.count("\n", 0, match.start()) + 1))
    return sorted(set(found))


def git(*args, input=None):
    return subprocess.run(["git", *args], cwd=ROOT, input=input, stdout=subprocess.PIPE,
                          stderr=subprocess.PIPE, check=True).stdout


def scan(history=False):
    failed, count = False, 0
    paths = git("ls-files", "--cached", "--others", "--exclude-standard", "-z").split(b"\0")
    for raw in sorted(set(paths)):
        path = ROOT / raw.decode("utf-8")
        if not raw or not path.is_file():
            continue
        count += 1
        for rule, line in findings(path.read_bytes()):
            print(f"Potential secret: {path.relative_to(ROOT)}:{line} [{rule}]")
            failed = True
    if history:
        objects = git("rev-list", "--objects", "--all").splitlines()
        names = {row.split(b" ", 1)[0]: row.split(b" ", 1)[-1].decode("utf-8", errors="replace") for row in objects}
        info = git("cat-file", "--batch-check=%(objectname) %(objecttype)", input=b"\n".join(names) + b"\n")
        blobs = [row.split()[0] for row in info.splitlines() if row.endswith(b" blob")]
        process = subprocess.Popen(["git", "cat-file", "--batch"], cwd=ROOT,
                                   stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        for oid in blobs:
            process.stdin.write(oid + b"\n")
            process.stdin.flush()
            header = process.stdout.readline().split()
            data = process.stdout.read(int(header[2]))
            process.stdout.read(1)
            for rule, line in findings(data):
                print(f"Potential historical secret: {names[oid]}:{line} [{rule}, object {oid[:10].decode()}]")
                failed = True
        process.stdin.close()
        if process.wait() != 0:
            raise RuntimeError("Git history scan failed")
        print(f"Scanned {len(blobs)} reachable historical blobs.")
    print(f"Scanned {count} source files; {'potential credentials found' if failed else 'no matching credentials found'}.")
    return int(failed)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--history", action="store_true")
    raise SystemExit(scan(parser.parse_args().history))
