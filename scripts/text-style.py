#!/usr/bin/env python3
"""Every text in the repository, checked for the marks a writing tool leaves behind.

Runs over the tracked text files and over the commit messages this branch adds on top of main. Prints every hit
and exits non-zero, so scripts/lint.sh and with it the CI job go red before any of it reaches a reader.
"""

import argparse
import re
import subprocess
import sys

SELF = 'scripts/text-style.py'  # this file holds the patterns themselves, so it is not scanned
SUBJECT_LIMIT = 72

# Characters nobody types on a German keyboard. The en dash, the arrow, the ellipsis and the quotation marks
# are in use all over the project and stay; this is only about the long dash and about pictures in text.
BANNED_CHARS = {
    '—': 'em dash, write the sentence with a comma, a colon or a full stop instead',
}
PICTURES = re.compile('[\U0001f000-\U0001faff☀-➿⬀-⯿️]')

# Words that sell instead of saying. None of them has ever been the right word here, in either language.
SALES = re.compile(
    r'(?i)\b('
    r'seamless(ly)?|effortless(ly)?|delightful|cutting[- ]edge|state[- ]of[- ]the[- ]art|best[- ]in[- ]class|'
    r'game[- ]chang\w*|supercharge\w*|delve[sd]?|a testament to|worth noting|elevate your|unlock the|'
    r'nahtlos\w*|mühelos\w*|revolutionär\w*|kinderleicht|im Handumdrehen|leistungsstark\w*|'
    r'maßgeschneidert\w*|ganzheitlich\w*|zukunftssicher\w*'
    r')\b'
)

# Lines a tool signs its work with.
SIGNATURES = [
    (re.compile(r'(?i)^\s*co-authored-by:'), 'a co-author trailer'),
    (re.compile(r'(?i)generated (with|by)\s+\[?(claude|an? (ai|assistant|language model))'), 'a "generated with" line'),
    (re.compile(r'(?i)claude\.ai/code/(session|artifact)'), 'a session link'),
    (re.compile(r'(?i)\bclaude[- ]session:'), 'a session trailer'),
]


def tracked_files():
    out = subprocess.run(['git', 'ls-files', '-z'], capture_output=True, text=True, check=True).stdout
    return [p for p in out.split('\0') if p and p != SELF]


def read(path):
    try:
        with open(path, encoding='utf-8') as fh:
            return fh.read()
    except (OSError, UnicodeDecodeError):
        return None  # binary or gone: nothing to read here


def scan(where, text, hits, subject_limit=None):
    for number, line in enumerate(text.splitlines(), 1):
        for char, why in BANNED_CHARS.items():
            if char in line:
                hits.append(f'{where}:{number}: {why}')
        if PICTURES.search(line):
            hits.append(f'{where}:{number}: an emoji')
        selling = SALES.search(line)
        if selling:
            hits.append(f'{where}:{number}: "{selling.group(0)}" sells instead of saying what is the case')
        for pattern, why in SIGNATURES:
            if pattern.search(line):
                hits.append(f'{where}:{number}: {why}')
    if subject_limit is not None:
        subject = text.splitlines()[0] if text.splitlines() else ''
        if len(subject) > subject_limit:
            hits.append(f'{where}: the subject is {len(subject)} characters, at most {subject_limit} are allowed')


def new_commits():
    """The commits this branch adds on top of main, or just the tip where main is not at hand (a shallow CI checkout)."""
    for base in ('origin/main', 'main'):
        if subprocess.run(['git', 'rev-parse', '--verify', '--quiet', base], capture_output=True).returncode:
            continue
        out = subprocess.run(['git', 'rev-list', f'{base}..HEAD'], capture_output=True, text=True, check=True).stdout
        return out.split()
    return subprocess.run(['git', 'rev-list', '-1', 'HEAD'], capture_output=True, text=True, check=True).stdout.split()


def from_stdin(what, limit):
    """One text that is not in the repository, such as the title or the body of a pull request."""
    text = sys.stdin.read().strip()
    hits = []
    scan(what, text, hits)
    if limit and len(text) > limit:
        hits.append(f'{what}: {len(text)} characters, at most {limit} are allowed')
    return hits


def from_repository():
    hits = []
    for path in tracked_files():
        text = read(path)
        if text is not None:
            scan(path, text, hits)

    for commit in new_commits():
        message = subprocess.run(['git', 'log', '-1', '--format=%B', commit], capture_output=True, text=True, check=True).stdout
        parents = subprocess.run(['git', 'log', '-1', '--format=%P', commit], capture_output=True, text=True, check=True).stdout.split()
        # A merge subject is written by the forge, not by us, so only its body is held to the rules. A checkout
        # without history has no parents to count, which is why the subject decides as well.
        merge = len(parents) > 1 or message.startswith('Merge ')
        scan(f'commit {commit[:9]}', message, hits, subject_limit=None if merge else SUBJECT_LIMIT)
    return hits


def main(argv):
    parser = argparse.ArgumentParser(description='Check the texts for the marks a writing tool leaves behind.')
    parser.add_argument('--stdin', metavar='WHAT', help='check one text read from stdin, named WHAT, instead of the repository')
    parser.add_argument('--limit', type=int, default=0, metavar='N', help='the most characters that text may have')
    options = parser.parse_args(argv)

    hits = from_stdin(options.stdin, options.limit) if options.stdin else from_repository()
    for hit in hits:
        print(hit, file=sys.stderr)
    return 1 if hits else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
