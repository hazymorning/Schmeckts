#!/usr/bin/env python3
"""Erzeugt alles, was nicht als Quelltext im Projekt liegt. Macht nur, was fehlt.

  - die Schriften Figtree und Fraunces in app/www/fonts/ (Download von Google Fonts, per SHA-256 geprüft)
  - das Android-Projekt app/android/ (von Capacitor erzeugt, dann mit app/native/ angepasst:
    Ressourcen, das Foto-Plugin, Manifest mit Deep Links, Kurzbefehlen, Scanner-Modul und ohne exakte Alarme,
    Startbildschirm, Version)
  - die Launcher-Icons für Android 7 aus design/schmeckts-app-icon.svg (ab Android 8 gelten die Vektoren aus app/native/res)

Aufruf: scripts/prepare.py                  normal
        scripts/prepare.py --neu            Android-Projekt vorher löschen und neu erzeugen
        scripts/prepare.py --nur-schriften  nur die Schriften (reicht für Tests im Browser)
"""
import hashlib, os, pathlib, shutil, subprocess, sys, urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
APP = ROOT / 'app'
ANDROID = APP / 'android'
MAIN = ANDROID / 'app/src/main'

# Nur die latin-Teilmenge (enthält ä, ö, ü, ß und typografische Zeichen). Lizenz: www/fonts/OFL-*.txt
# Figtree für alles, Fraunces für Überschriften und Zahlen (Gestaltungsregeln in PROJEKT.md)
FONTS = {
    'figtree-latin.woff2': ('https://fonts.gstatic.com/s/figtree/v9/_Xms-HUzqDCFdgfMm4S9DaRvzig.woff2',
                            '8330490a01c60c196eae00b823de8102275aaa5862e7b76a7af21b8745338928'),
    'fraunces-latin.woff2': ('https://fonts.gstatic.com/s/fraunces/v38/6NU78FyLNQOQZAnv9bYEvDiIdE9Ea92usiIk_WBq8U_9v0c2Wa0KxC9TeP2Xz5c.woff2',
                             '5097cb6923bb6938dcfc373e6f99a19fbb603cc32f740cc1ecd9791af359470b'),
}


def run(*cmd, cwd=ROOT):
    subprocess.run(cmd, cwd=cwd, check=True)


def fonts():
    folder = APP / 'www/fonts'
    for name, (url, sha) in FONTS.items():
        path = folder / name
        if path.exists() and hashlib.sha256(path.read_bytes()).hexdigest() == sha:
            continue
        data = urllib.request.urlopen(url, timeout=60).read()
        if hashlib.sha256(data).hexdigest() != sha:
            sys.exit(f'Prüfsumme stimmt nicht: {name}')
        path.write_bytes(data)
        print('Schrift geladen:', name)


def edit(path, old, new):
    """Ersetzt genau eine Stelle einer Capacitor-Vorlage. Schon angepasst: nichts tun."""
    text = path.read_text(encoding='utf-8')
    if new in text:
        return
    if text.count(old) != 1:
        sys.exit(f'Die Vorlage hat sich geändert, Anpassung prüfen: {path.relative_to(ROOT)}')
    path.write_text(text.replace(old, new), encoding='utf-8')


def android(fresh):
    if fresh and ANDROID.exists():
        shutil.rmtree(ANDROID)
    if not (APP / 'node_modules').exists():
        run('npm', 'ci', '--no-audit', '--no-fund', cwd=APP)
    if not ANDROID.exists():
        run('npx', 'cap', 'add', 'android', cwd=APP)

    # Eigene Ressourcen (Netzwerkregeln, Farben, Startbildschirm, Icon, Kurzbefehle) und das Foto-Plugin
    shutil.copytree(APP / 'native/res', MAIN / 'res', dirs_exist_ok=True)
    shutil.copytree(APP / 'native/java', MAIN / 'java', dirs_exist_ok=True)

    # Startbild der Vorlage (Capacitor-Logo) entfernen, stattdessen gilt drawable/splash.xml
    for png in (MAIN / 'res').glob('drawable*/splash.png'):
        png.unlink()
    # Vordergrund des App-Icons aus der Vorlage: Bei minSdk 24 behält aapt2 von drawable/ und drawable-v24/ nur die
    # höhere Version, der Vektor der Vorlage würde also unser Logo (drawable/ic_launcher_foreground.xml) verdrängen
    (MAIN / 'res/drawable-v24/ic_launcher_foreground.xml').unlink(missing_ok=True)
    for folder in (MAIN / 'res').glob('drawable-*'):
        if not any(folder.iterdir()):
            folder.rmdir()

    edit(MAIN / 'AndroidManifest.xml',
         'android:supportsRtl="true"',
         'android:supportsRtl="true"\n        android:networkSecurityConfig="@xml/network_security_config"\n'
         # Datenschutz: keine Cloud-Sicherung, nur die direkte Übertragung auf ein neues Gerät; build-apk.sh prüft das
         '        android:dataExtractionRules="@xml/data_extraction_rules"\n        android:fullBackupContent="@xml/backup_rules"')

    # Deep Links schmeckts://… (auch für Quick Shortcut Maker und Tasker) und die statischen Kurzbefehle
    edit(MAIN / 'AndroidManifest.xml',
         '                <category android:name="android.intent.category.LAUNCHER" />\n            </intent-filter>\n',
         '                <category android:name="android.intent.category.LAUNCHER" />\n            </intent-filter>\n'
         '            <intent-filter>\n'
         '                <action android:name="android.intent.action.VIEW" />\n'
         '                <category android:name="android.intent.category.DEFAULT" />\n'
         '                <category android:name="android.intent.category.BROWSABLE" />\n'
         '                <data android:scheme="schmeckts" />\n'
         '            </intent-filter>\n'
         '            <meta-data android:name="android.app.shortcuts" android:resource="@xml/shortcuts" />\n')

    # Googles Scanner-Modul (scan() aus @capacitor-mlkit/barcode-scanning) schon bei der Installation laden.
    edit(MAIN / 'AndroidManifest.xml',
         '        </provider>\n    </application>',
         '        </provider>\n'
         '        <meta-data android:name="com.google.mlkit.vision.DEPENDENCIES" android:value="barcode_ui" />\n'
         '    </application>')

    # Erinnerung zum Bewerten (@capacitor/local-notifications): ungefähre Zeit genügt. Das Recht für exakte Alarme, das
    # das Plugin mitbringt, fliegt aus dem fertigen Manifest; build-apk.sh prüft das.
    edit(MAIN / 'AndroidManifest.xml',
         '<manifest xmlns:android="http://schemas.android.com/apk/res/android">',
         '<manifest xmlns:android="http://schemas.android.com/apk/res/android" xmlns:tools="http://schemas.android.com/tools">')
    edit(MAIN / 'AndroidManifest.xml',
         '    <uses-permission android:name="android.permission.INTERNET" />\n',
         '    <uses-permission android:name="android.permission.INTERNET" />\n'
         '    <uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" tools:node="remove" />\n'
         # Eigene Kamera für Packungsfotos (getUserMedia in der WebView): Capacitor reicht die Kamera-Anfrage der WebView an
         # Android weiter (BridgeWebChromeClient.onPermissionRequest), das geht nur mit dem Recht im Manifest. Gefragt wird
         # beim ersten Gebrauch. Kein Zwang zur Kamera: Ohne sie nimmt die App den Weg über die Kamera-App. build-apk.sh prüft das.
         '    <uses-permission android:name="android.permission.CAMERA" />\n'
         '    <uses-feature android:name="android.hardware.camera" android:required="false" />\n')

    # Das eigene Foto-Plugin anmelden
    edit(MAIN / 'java/de/schmeckts/app/MainActivity.java',
         'public class MainActivity extends BridgeActivity {}',
         'public class MainActivity extends BridgeActivity {\n'
         '    @Override\n'
         '    public void onCreate(android.os.Bundle savedInstanceState) {\n'
         '        registerPlugin(FotoPlugin.class); // app/native/java, für den Kurzbefehl „Packung fotografieren“\n'
         '        super.onCreate(savedInstanceState);\n'
         '    }\n'
         '}')

    edit(MAIN / 'res/values/styles.xml',
         '        <item name="android:background">@drawable/splash</item>\n    </style>',
         '        <item name="android:background">@drawable/splash</item>\n'
         '        <item name="windowSplashScreenBackground">@color/splash_background</item>\n'
         '        <item name="windowSplashScreenAnimatedIcon">@drawable/splash_logo</item>\n'  # hell und dunkel, app/native/res
         '        <item name="postSplashScreenTheme">@style/AppTheme.NoActionBar</item>\n    </style>')

    gradle = ANDROID / 'app/build.gradle'
    edit(gradle, "apply plugin: 'com.android.application'\n",
         "apply plugin: 'com.android.application'\n\n"
         "// Die Versionsnummer steht nur in app/package.json. versionCode: 1.2.3 → 10203\n"
         "def appVersion = new groovy.json.JsonSlurper().parse(file('../../package.json')).version\n"
         "def appVersionCode = appVersion.tokenize('.').collect { it as int }.inject(0) { acc, n -> acc * 100 + n }\n")
    edit(gradle, '        versionCode 1\n        versionName "1.0"',
         '        versionCode appVersionCode\n        versionName appVersion')

    # Nur scan(): Barcodes liest Googles Scanner in den Play-Diensten. Das mitgelieferte ML-Kit-Modell für die
    # eigene Kameravorschau des Plugins (startScan) braucht die App nicht, ohne es ist die APK rund 20 MB kleiner.
    edit(gradle, '    buildTypes {\n',
         '    packaging {\n'
         '        jniLibs { excludes += [\'**/libbarhopper_v3.so\'] } // nur für startScan und readBarcodesFromImage\n'
         '    }\n'
         '    buildTypes {\n')
    edit(gradle, ":!CVS:!thumbs.db:!picasa.ini:!*~'", ":!CVS:!thumbs.db:!picasa.ini:!*~:!mlkit_barcode_models'")

    run(sys.executable, str(ROOT / 'design/render-icons.py'))
    (ANDROID / 'local.properties').write_text(f"sdk.dir={os.environ.get('ANDROID_HOME', '/opt/android-sdk')}\n")


if __name__ == '__main__':
    fonts()
    if '--nur-schriften' not in sys.argv:
        android('--neu' in sys.argv)
    print('Vorbereitung fertig')
