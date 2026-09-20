#!/usr/bin/env python3
"""Signaturschlüssel als Textdatei, damit er in die Projektdateien passt.

  scripts/signatur.py erstellen <keystore.jks> <passwortdatei>  > schmeckts-signatur.txt
  scripts/signatur.py lesen <schmeckts-signatur.txt> <ziel.jks>   schreibt den Keystore, gibt das Passwort aus
"""
import base64, re, sys, textwrap

BEGIN, END = '-----BEGIN KEYSTORE (PKCS12, BASE64)-----', '-----END KEYSTORE-----'


def erstellen(jks, pwfile):
    pw = open(pwfile, encoding='utf-8').read().strip()
    data = base64.b64encode(open(jks, 'rb').read()).decode()
    print('Schmeckt’s? – Signaturschlüssel der Android-App')
    print('Nicht weitergeben. Ohne diese Datei lassen sich keine Updates über die installierte App spielen.\n')
    print('Alias: schmeckts')
    print(f'Passwort: {pw}\n')
    print(BEGIN)
    print('\n'.join(textwrap.wrap(data, 76)))
    print(END)


def lesen(txt, jks):
    text = open(txt, encoding='utf-8').read()
    pw = re.search(r'^Passwort: (\S+)\s*$', text, re.M).group(1)
    block = text.split(BEGIN, 1)[1].split(END, 1)[0]
    open(jks, 'wb').write(base64.b64decode(''.join(block.split())))
    print(pw)


if __name__ == '__main__':
    {'erstellen': erstellen, 'lesen': lesen}[sys.argv[1]](*sys.argv[2:4])
