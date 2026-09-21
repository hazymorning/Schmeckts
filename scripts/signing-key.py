#!/usr/bin/env python3
"""The signing key as a text file, so that it fits alongside the project files.

  scripts/signing-key.py create <keystore.jks> <passwordfile>       > schmeckts-signing-key.txt
  scripts/signing-key.py read <schmeckts-signing-key.txt> <out.jks>   writes the keystore, prints the password
"""
import base64
import re
import sys
import textwrap

BEGIN, END = '-----BEGIN KEYSTORE (PKCS12, BASE64)-----', '-----END KEYSTORE-----'


def create(jks, pwfile):
    pw = open(pwfile, encoding='utf-8').read().strip()
    data = base64.b64encode(open(jks, 'rb').read()).decode()
    print('Schmeckt’s? – signing key of the Android app')
    print('Do not pass this on. Without this file no updates can be installed over the installed app.\n')
    print('Alias: schmeckts')
    print(f'Password: {pw}\n')
    print(BEGIN)
    print('\n'.join(textwrap.wrap(data, 76)))
    print(END)


def read(txt, jks):
    text = open(txt, encoding='utf-8').read()
    # "Passwort" is what files written before the move to English say; both are accepted.
    found = re.search(r'^(?:Password|Passwort): (\S+)\s*$', text, re.M)
    if not found or BEGIN not in text:
        sys.exit(f'{txt} is not a signing key file: it needs a "Password:" line and the keystore block.')
    pw = found.group(1)
    block = text.split(BEGIN, 1)[1].split(END, 1)[0]
    open(jks, 'wb').write(base64.b64decode(''.join(block.split())))
    print(pw)


if __name__ == '__main__':
    {'create': create, 'read': read}[sys.argv[1]](*sys.argv[2:4])
