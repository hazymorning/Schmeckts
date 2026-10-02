#!/usr/bin/env python3
"""Generates the Android project app/android from the Capacitor template and app/native.

Usage: scripts/prepare.py [--fresh]
"""

import os
import pathlib
import shutil
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
APP = ROOT / 'app'
ANDROID = APP / 'android'
MAIN = ANDROID / 'app/src/main'

# Android refuses a versionCode below the installed one, and builds before the 0.1.0 version restart reached 10400.
VERSION_OFFSET = 20000


def run(*cmd, cwd=ROOT):
    subprocess.run(cmd, cwd=cwd, check=True)


def edit(path, old, new):
    """Replaces exactly one spot in a Capacitor template, unless already patched."""
    text = path.read_text(encoding='utf-8')
    if new in text:
        return
    if text.count(old) != 1:
        sys.exit(f'the template has changed, check the patch: {path.relative_to(ROOT)}')
    path.write_text(text.replace(old, new), encoding='utf-8')


def android(fresh):
    if fresh and ANDROID.exists():
        shutil.rmtree(ANDROID)
    if not (APP / 'node_modules').exists():
        run('npm', 'ci', '--no-audit', '--no-fund', cwd=APP)
    if not ANDROID.exists():
        run('npx', 'cap', 'add', 'android', cwd=APP)

    shutil.copytree(APP / 'native/res', MAIN / 'res', dirs_exist_ok=True)
    shutil.copytree(APP / 'native/java', MAIN / 'java', dirs_exist_ok=True)

    # drop the template's splash.png (the Capacitor logo) so drawable/splash.xml applies, and its launcher foreground
    for png in [*(MAIN / 'res').glob('drawable*/splash.png'), *(MAIN / 'res').glob('mipmap-*/ic_launcher_foreground.png')]:
        png.unlink()
    # at minSdk 24 aapt2 keeps only drawable-v24/ over drawable/, so the template's vector would displace our logo
    (MAIN / 'res/drawable-v24/ic_launcher_foreground.xml').unlink(missing_ok=True)
    for folder in (MAIN / 'res').glob('drawable-*'):
        if not any(folder.iterdir()):
            folder.rmdir()

    edit(
        MAIN / 'AndroidManifest.xml',
        'android:supportsRtl="true"',
        'android:supportsRtl="true"\n        android:networkSecurityConfig="@xml/network_security_config"\n'
        # no cloud backup, only the direct transfer to a new device
        '        android:dataExtractionRules="@xml/data_extraction_rules"\n        android:fullBackupContent="@xml/backup_rules"',
    )

    edit(
        MAIN / 'AndroidManifest.xml',
        '                <category android:name="android.intent.category.LAUNCHER" />\n            </intent-filter>\n',
        '                <category android:name="android.intent.category.LAUNCHER" />\n            </intent-filter>\n'
        '            <intent-filter>\n'
        '                <action android:name="android.intent.action.VIEW" />\n'
        '                <category android:name="android.intent.category.DEFAULT" />\n'
        '                <category android:name="android.intent.category.BROWSABLE" />\n'
        '                <data android:scheme="schmeckts" />\n'
        '            </intent-filter>\n'
        '            <meta-data android:name="android.app.shortcuts" android:resource="@xml/shortcuts" />\n'
        # exchange files from other apps; MainActivity turns SEND into VIEW
        '            <intent-filter>\n'
        '                <action android:name="android.intent.action.VIEW" />\n'
        '                <category android:name="android.intent.category.DEFAULT" />\n'
        '                <category android:name="android.intent.category.BROWSABLE" />\n'
        '                <data android:mimeType="application/json" />\n'
        '            </intent-filter>\n'
        '            <intent-filter>\n'
        '                <action android:name="android.intent.action.SEND" />\n'
        '                <category android:name="android.intent.category.DEFAULT" />\n'
        '                <data android:mimeType="application/json" />\n'
        '            </intent-filter>\n',
    )

    # install Google's scanner module with the app, not on first use
    edit(
        MAIN / 'AndroidManifest.xml',
        '        </provider>\n    </application>',
        '        </provider>\n'
        '        <meta-data android:name="com.google.mlkit.vision.DEPENDENCIES" android:value="barcode_ui" />\n'
        # alarms are lost on reboot and app update, so the feeding reminder sets them again
        '        <receiver android:name=".FeedReceiver" android:exported="false">\n'
        '            <intent-filter>\n'
        '                <action android:name="android.intent.action.BOOT_COMPLETED" />\n'
        '                <action android:name="android.intent.action.MY_PACKAGE_REPLACED" />\n'
        '            </intent-filter>\n'
        '        </receiver>\n'
        '    </application>',
    )

    # local-notifications brings the exact-alarm permission along; reminders only need an approximate time
    edit(
        MAIN / 'AndroidManifest.xml',
        '<manifest xmlns:android="http://schemas.android.com/apk/res/android">',
        '<manifest xmlns:android="http://schemas.android.com/apk/res/android" xmlns:tools="http://schemas.android.com/tools">',
    )
    edit(
        MAIN / 'AndroidManifest.xml',
        '    <uses-permission android:name="android.permission.INTERNET" />\n',
        '    <uses-permission android:name="android.permission.INTERNET" />\n'
        '    <uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" tools:node="remove" />\n'
        # getUserMedia in the WebView needs this permission; without a camera the app falls back to the camera app
        '    <uses-permission android:name="android.permission.CAMERA" />\n'
        '    <uses-feature android:name="android.hardware.camera" android:required="false" />\n',
    )

    edit(
        MAIN / 'res/values/styles.xml',
        '        <item name="android:background">@drawable/splash</item>\n    </style>',
        '        <item name="android:background">@drawable/splash</item>\n'
        '        <item name="windowSplashScreenBackground">@color/splash_background</item>\n'
        '        <item name="windowSplashScreenAnimatedIcon">@drawable/splash_logo</item>\n'
        '        <item name="postSplashScreenTheme">@style/AppTheme.NoActionBar</item>\n    </style>',
    )

    gradle = ANDROID / 'app/build.gradle'
    edit(
        gradle,
        "apply plugin: 'com.android.application'\n",
        "apply plugin: 'com.android.application'\n\n"
        '// The version number lives only in app/package.json. versionCode: ' + str(VERSION_OFFSET) + ' + (1.2.3 → 10203)\n'
        "def appVersion = new groovy.json.JsonSlurper().parse(file('../../package.json')).version\n"
        'def appVersionCode = ' + str(VERSION_OFFSET) + " + appVersion.tokenize('.').collect { it as int }.inject(0) { acc, n -> acc * 100 + n }\n",
    )
    edit(
        gradle,
        '        versionCode 1\n        versionName "1.0"',
        '        versionCode appVersionCode\n        versionName appVersion\n'
        # phones only: text recognition ships a library per processor family, and x86 would roughly double the APK
        '        ndk { abiFilters "armeabi-v7a", "arm64-v8a" }',
    )

    # the app only uses scan() through Play services, and the bundled ML Kit model would add around 20 MB
    edit(
        gradle,
        '    buildTypes {\n',
        '    packaging {\n'
        "        jniLibs { excludes += ['**/libbarhopper_v3.so'] } // only for startScan and readBarcodesFromImage\n"
        '    }\n'
        '    buildTypes {\n',
    )
    edit(gradle, ":!CVS:!thumbs.db:!picasa.ini:!*~'", ":!CVS:!thumbs.db:!picasa.ini:!*~:!mlkit_barcode_models'")

    gradle_wrapper_bin()
    (ANDROID / 'local.properties').write_text(f'sdk.dir={os.environ.get("ANDROID_HOME", "/opt/android-sdk")}\n')


def gradle_wrapper_bin():
    """-bin is about half the download of -all, which only adds sources and documentation."""
    props = ANDROID / 'gradle/wrapper/gradle-wrapper.properties'
    text = props.read_text(encoding='utf-8')
    if '-all.zip' in text:
        props.write_text(text.replace('-all.zip', '-bin.zip'), encoding='utf-8')


if __name__ == '__main__':
    android('--fresh' in sys.argv)
    print('preparation done')
