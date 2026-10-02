#!/usr/bin/env python3
"""Rejects the marks a writing tool leaves in tracked files and in the commits this branch adds on top of main."""

import re
import subprocess
import sys

SKIP = ('scripts/text-style.py', 'tests/fixtures/')  # this file holds the patterns; fixtures are packaging text
SUBJECT_LIMIT = 72

CHECKS = [
    (re.compile('—'), 'em dash'),
    (re.compile('[\U0001f000-\U0001faff☀-➿⬀-⯿️]'), 'emoji'),
    (
        re.compile(
            r'(?i)\b(seamless(ly)?|effortless(ly)?|delightful|cutting[- ]edge|state[- ]of[- ]the[- ]art|game[- ]chang\w*|'
            r'supercharge\w*|delve[sd]?|a testament to|worth noting|nahtlos\w*|mühelos\w*|revolutionär\w*|kinderleicht|'
            r'im Handumdrehen|leistungsstark\w*|maßgeschneidert\w*|ganzheitlich\w*|zukunftssicher\w*)\b'
        ),
        'a word that sells',
    ),
    (re.compile(r'(?i)^\s*co-authored-by:'), 'co-author trailer'),
    (re.compile(r'(?i)generated (with|by)\s+\[?(claude|an? (ai|assistant|language model))'), '"generated with" line'),
    (re.compile(r'(?i)claude\.ai/code/(session|artifact)'), 'session link'),
    (re.compile(r'(?i)\bclaude[- ]session:'), 'session trailer'),
]


def git(*args):
    return subprocess.run(['git', *args], capture_output=True, text=True, check=True).stdout


def scan(where, text, hits):
    for number, line in enumerate(text.splitlines(), 1):
        for pattern, what in CHECKS:
            if pattern.search(line):
                hits.append(f'{where}:{number}: {what}')


def new_commits():
    for base in ('origin/main', 'main'):
        if subprocess.run(['git', 'rev-parse', '--verify', '--quiet', base], capture_output=True).returncode == 0:
            return git('rev-list', f'{base}..HEAD').split()
    return git('rev-list', '-1', 'HEAD').split()


def main():
    hits = []
    for path in git('ls-files', '-z').split('\0'):
        if not path or path.startswith(SKIP):
            continue
        try:
            with open(path, encoding='utf-8') as fh:
                scan(path, fh.read(), hits)
        except (OSError, UnicodeDecodeError):
            pass  # binary or deleted
    for commit in new_commits():
        message = git('log', '-1', '--format=%B', commit)
        scan(f'commit {commit[:9]}', message, hits)
        merge = len(git('log', '-1', '--format=%P', commit).split()) > 1
        subject = message.splitlines()[0] if message.strip() else ''
        if not merge and len(subject) > SUBJECT_LIMIT:
            hits.append(f'commit {commit[:9]}: subject longer than {SUBJECT_LIMIT} characters')
    for hit in hits:
        print(hit, file=sys.stderr)
    return 1 if hits else 0


if __name__ == '__main__':
    sys.exit(main())
