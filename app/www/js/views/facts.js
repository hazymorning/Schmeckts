/* Wordings for the overview card. Pure data so a test can check them: no ratings or verdicts, at most two sentences,
   asides at most 70 characters.
   An aside: {id, text, when?, months?, day?}. Keep ids stable, prefs.overview remembers them. when: the moments it fits
   ('due', 'fresh', 'wait', 'evening', 'night'), default any. months: 1-12, default all year. day: "MM-DD", or a
   function of the year for a date that moves. */

const mmdd = d => `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// for dates that move each year
export function lastSunday(year, month) {
  const d = new Date(year, month, 0);
  d.setDate(d.getDate() - d.getDay());
  return mmdd(d);
}
export function nthSaturday(year, month, n) {
  const d = new Date(year, month - 1, 1);
  d.setDate(1 + ((13 - d.getDay()) % 7) + 7 * (n - 1));
  return mmdd(d);
}
const SUMMER = [6, 7, 8],
  HEATING = [11, 12, 1, 2],
  SPRING = [3, 4, 5],
  AUTUMN = [9, 10, 11],
  LEAVES = [10, 11],
  GREEN = [3, 4],
  DECEMBER = [12];

export const FACTS = {
  Katze: [
    {
      id: 'katze-schlaf-2',
      when: ['due'],
      text: 'Katzenschlaf ist leicht. Die Dose hört sie immer.',
    },
    {id: 'katze-zeit-1', when: ['due'], text: 'Katzen spüren die Uhrzeit. Deine Uhr geht wohl nach.'},
    {id: 'katze-laute-1', when: ['due'], text: 'Untereinander miauen Katzen kaum. Das hier gilt dir.'},
    {id: 'katze-laute-3', when: ['due'], text: 'Bettelschnurren hat einen Quengelton. Wirkt, oder?'},
    {id: 'katze-tempo-1', when: ['due'], text: 'Katzen rennen 48 km/h. Gleich, auf zwei Metern Flur.'},
    {id: 'katze-name-1', when: ['due'], text: 'Katzen kennen ihren Namen. Jetzt hören sie sogar hin.'},
    {id: 'katze-sehen-1', when: ['due'], text: 'Nah sehen Katzen unscharf. Die Schnurrhaare lotsen.'},
    {id: 'katze-riechen-1', when: ['due'], text: 'Katzen fressen nach Nase. Zimmerwarm duftet’s mehr.'},
    {id: 'katze-starren-1', when: ['due'], text: 'Du, Napf, du, Napf. Katzen zeigen mit Blicken.'},
    {id: 'katze-schlaf-3', when: ['fresh'], text: 'Satte Katzen dösen. Bitte leise, hier wird verdaut.'},
    {
      id: 'katze-jagd-2',
      when: ['fresh'],
      text: 'Jagen, fressen, putzen, schlafen. Jetzt: Punkt drei.',
    },
    {id: 'katze-zunge-1', when: ['fresh'], text: 'Katzenzungen haben winzige Haken. Jetzt wird gekämmt.'},
    {
      id: 'katze-zaehne-1',
      when: ['fresh'],
      text: 'Katzen kauen kaum. Schneiden, schlucken, fertig.',
    },
    {
      id: 'katze-territorium-2',
      when: ['fresh'],
      text: 'Katzen sind Einzelesser. Zuschauen wurde notiert.',
    },
    {
      id: 'katze-temperatur-1',
      when: ['fresh'],
      text: 'Jetzt ein warmes Eck. Katzen frieren eher als du.',
    },
    {
      id: 'katze-wasser-4',
      when: ['fresh'],
      text: 'Noch ein Schluck. Manche Katzen tunken die Pfote rein.',
    },
    {
      id: 'katze-mahlzeiten-1',
      when: ['wait'],
      text: 'Katzen sind Häppchenesser. Dein Plan sieht’s anders.',
    },
    {id: 'katze-schlaf-1', when: ['wait'], text: 'Katzen schlafen 12 bis 16 Stunden. Warten passt rein.'},
    {id: 'katze-fenster-1', when: ['wait'], text: 'Vögel am Fenster werden angekeckert. Katzenkino.'},
    {id: 'katze-jagd-1', when: ['wait'], text: 'Satte Katzen jagen auch. Die Socke weiß Bescheid.'},
    {id: 'katze-box-1', when: ['wait'], text: 'Katzen im Karton sind messbar ruhiger. Kein Witz.'},
    {
      id: 'katze-hoehe-1',
      when: ['wait'],
      text: 'Vom Schrank aus sieht man mehr. Katzen wissen das.',
    },
    {id: 'katze-nacht-1', when: ['evening'], text: 'Katzen sind Dämmerungstiere. Jetzt ist Hauptsendezeit.'},
    {
      id: 'katze-zoomies-1',
      when: ['evening'],
      text: 'Abends rasen Katzen grundlos herum. Ganz normal.',
    },
    {
      id: 'katze-kneten-1',
      when: ['evening'],
      text: 'Milchtritt ist Babykram. Dein Schoß ist jetzt Mama.',
    },
    {
      id: 'katze-schnurren-2',
      when: ['evening'],
      text: 'Schnurren: 25 bis 150 Hertz. Feierabendfrequenz.',
    },
    {
      id: 'katze-koerper-1',
      when: ['evening'],
      text: 'Blinzel langsam zurück. Katzen verstehen das als Gruß.',
    },
    {
      id: 'katze-koerper-3',
      when: ['evening'],
      text: 'Bauch oben heißt Vertrauen. Nicht „bitte kraulen“.',
    },
    {id: 'katze-sehen-2', when: ['night'], text: 'Katzen sehen im Halbdunkel gut. Stockdunkel auch nix.'},
    {
      id: 'katze-nacht-2',
      when: ['night'],
      text: 'Katzen werden im Morgengrauen wach. Dein Wecker nicht.',
    },
    {
      id: 'katze-hoeren-1',
      when: ['night'],
      text: 'Katzen hören Ultraschall. Die Maus im Keller auch.',
    },
    {
      id: 'katze-hoeren-2',
      when: ['night'],
      text: 'Katzenohren drehen einzeln. Eins hat Nachtschicht.',
    },
    {id: 'katze-tuer-1', when: ['night'], text: 'Geschlossene Tür? Für Katzen eine Revierlücke.'},
    {
      id: 'katze-mahlzeiten-2',
      when: ['night'],
      text: 'Katzen lieben Routine. Den Wecker überholen sie.',
    },
    {
      id: 'katze-gang-1',
      when: ['night'],
      text: 'Hinterpfote in die Spur der vorderen. Darum so leise.',
    },
    {id: 'katze-schmecken-1', text: 'Süßes schmecken Katzen nicht. Sie wollen die Sahne.'},
    {id: 'katze-schmecken-2', text: 'Katzen: wenige Geschmacksknospen, viele Meinungen.'},
    {id: 'katze-sehen-3', text: 'Rot sehen Katzen eher grau. Das rote Spielzeug auch.'},
    {id: 'katze-nase-2', text: 'Das Gesicht heißt Flehmen. Gerochen wird am Gaumen.'},
    {id: 'katze-zitrus-1', text: 'Katzen meiden Zitrusduft. Die Orange bleibt deine.'},
    {id: 'katze-milch-1', text: 'Milch macht vielen Katzen Bauchweh. Bilderbuch lügt.'},
    {id: 'katze-schnurrhaare-1', text: 'Flache Schalen schonen Schnurrhaare. Tiefe nerven.'},
    {id: 'katze-pfote-1', text: 'Kater sind öfter Linkspfoter, Kätzinnen Rechtspfoter.'},
    {id: 'katze-korb-1', text: 'Teures Bett, billige Tüte. Die Katze wählt die Tüte.'},
    {id: 'katze-schulter-1', text: 'Lose Schlüsselbeine machen Katzen zu Lückenprofis.'},
    {id: 'katze-koepfchen-1', text: 'Köpfchen heißt: Duft drauf. Du gehörst jetzt ihr.'},
    {id: 'katze-koerper-2', text: 'Schwanz steil hoch heißt bei Katzen: Hallo, du.'},
    {id: 'katze-bad-1', text: 'Katzen folgen dir aufs Klo. Endlich hast du Zeit.'},
    {id: 'katze-tastatur-1', text: 'Katzen lieben Tastaturen. Warm, und du guckst eh hin.'},
    {id: 'katze-sonne-1', text: 'Katzen ziehen mit dem Sonnenfleck um. Solarbetrieb.'},
    {id: 'katze-wasser-3', text: 'Voller Napf, Katze am Hahn. Fließend muss es sein.'},
    {id: 'katze-geruch-2', text: 'Neues Sofa? Schnuppern, Wange dran, besetzt.'},
    {id: 'katze-alter-3', text: 'Rekordkatze Creme Puff wurde 38 Jahre. Meist verpennt.'},
    {
      id: 'katze-hitze-1',
      when: ['wait'],
      months: SUMMER,
      text: 'Bei Hitze fressen Katzen eher abends. Jetzt: Schatten.',
    },
    {
      id: 'katze-hitze-2',
      months: SUMMER,
      text: 'Katzen schwitzen an den Pfoten. Sonst kühlt Spucke.',
    },
    {
      id: 'katze-heizung-1',
      when: ['evening'],
      months: HEATING,
      text: 'Katzen lieben Wärme. Abends ist die Heizung Hochbett.',
    },
    {
      id: 'katze-fell-fruehling',
      months: SPRING,
      text: 'Fellwechsel. Bürsten rettet Sofa und Katzenmagen.',
    },
    {
      id: 'katze-fell-herbst',
      months: AUTUMN,
      text: 'Das Winterfell wächst. Nicht dick, nur flauschig.',
    },
    {
      id: 'katze-herbstlaub',
      when: ['wait'],
      months: LEAVES,
      text: 'Laub raschelt wie Beute. Also wird Laub gejagt.',
    },
    {id: 'katze-gruen', months: GREEN, text: 'Katzen knabbern Gras. Warum, weiß keiner so genau.'},
    {
      id: 'katze-silvester',
      months: DECEMBER,
      text: 'Silvesterkrach? Ein Versteck hilft mehr als Zureden.',
    },
    {
      id: 'katze-weihnachten',
      months: DECEMBER,
      text: 'Christbaum heißt für Katzen Kletterbaum. Lametta weg.',
    },
    {id: 'katze-weltkatzentag', day: '08-08', text: 'Heute ist Weltkatzentag. Wie immer, nur offiziell.'},
  ],
  Hund: [
    {id: 'hund-nase-1', when: ['due'], text: 'Zehntausendmal feinere Nase. Die Schranktür ist Deko.'},
    {id: 'hund-zeit-1', when: ['due'], text: 'Hunde lesen keine Uhr. Zu spät bist trotzdem du.'},
    {id: 'hund-ohren-1', when: ['due'], text: '18 Ohrmuskeln, und alle zielen gerade auf die Küche.'},
    {id: 'hund-speichel-1', when: ['due'], text: 'Napf klappert, Maul läuft. Pawlow nickt zufrieden.'},
    {id: 'hund-rudel-1', when: ['due'], text: 'Hunde kennen deine Routinen besser als dein Kalender.'},
    {id: 'hund-laute-1', when: ['due'], text: 'Bellen hat viele Bedeutungen. Jetzt gerade genau eine.'},
    {id: 'hund-koerper-1', when: ['due'], text: 'Gähnt er jetzt, ist er nicht müde. Nur sehr gespannt.'},
    {id: 'hund-schlaf-1', when: ['fresh'], text: 'Jetzt wird gedöst. Tagesziel: 12 bis 14 Stunden.'},
    {id: 'hund-wasser-1', when: ['fresh'], text: 'Hundezunge schöpft rückwärts, die Pfütze ist Physik.'},
    {id: 'hund-ruhe-1', when: ['fresh'], text: 'Toben mit vollem Bauch? Große Hunde machen Siesta.'},
    {
      id: 'hund-magen-1',
      when: ['fresh'],
      text: 'Gekaut wurde kaum. Der Hundemagen ist eh sauer.',
    },
    {id: 'hund-teppich-1', when: ['fresh'], text: 'Seine Serviette heißt Teppich. Manchmal auch Hosenbein.'},
    {id: 'hund-nase-4', when: ['wait'], text: 'Jeder Laternenpfahl ist für Hunde ein Gruppenchat.'},
    {id: 'hund-hoeren-1', when: ['wait'], text: 'Der Hund hört die Post an der Ecke. Du gleich auch.'},
    {id: 'hund-koerper-2', when: ['wait'], text: 'Po hoch, Brust runter. Auf Hündisch: Spielst du mit?'},
    {id: 'hund-nase-6', when: ['wait'], text: 'Dein Duft verblasst. Vielleicht ist das seine Uhr.'},
    {id: 'hund-buddeln-1', when: ['wait'], text: 'Hunde legen Vorräte an. Bevorzugtes Lager: dein Beet.'},
    {
      id: 'hund-kreis-1',
      when: ['evening'],
      text: 'Er dreht sich ins Bett, wie einst im hohen Gras.',
    },
    {
      id: 'hund-kauen-1',
      when: ['evening'],
      text: 'Kauen beruhigt. Der Knochen ist sein Feierabendbier.',
    },
    {
      id: 'hund-blick-1',
      when: ['evening'],
      text: 'Ein langer Blick, und ihr seid beide auf Oxytocin.',
    },
    {id: 'hund-rhythmus-1', when: ['evening'], text: 'Sein Tagesplan ist deiner. Du sitzt, also liegt er.'},
    {
      id: 'hund-schnueffeln-1',
      when: ['evening'],
      text: 'Schnüffeln strengt an. Viel gelesen, tief geschlafen.',
    },
    {id: 'hund-schlaf-2', when: ['night'], text: 'Zucken die Pfoten, jagt er wohl ein Traumkaninchen.'},
    {id: 'hund-traum-2', when: ['night'], text: 'Kleine Hunde träumen viele Kurzfilme, große Spielfilme.'},
    {id: 'hund-schnarchen-1', when: ['night'], text: 'Wer schnarcht da? Kurznasige Hunde sind oft die Täter.'},
    {id: 'hund-sehen-2', when: ['night'], text: 'Im Halbdunkel sieht er besser. Stolpern tust nur du.'},
    {id: 'hund-schlaf-3', when: ['night'], text: 'Hunde schlafen in Etappen. Dazwischen: Lagecheck.'},
    {id: 'hund-schlaf-4', when: ['night'], text: 'Kühl: Hund als Brezel. Warm: Hund als Bügelbrett.'},
    {id: 'hund-schmecken-1', text: 'Nur rund 1700 Geschmacksknospen. Die Nase isst mit.'},
    {id: 'hund-schmecken-2', text: 'Hunde schmecken Süßes. Den Kuchenblick meint er ernst.'},
    {id: 'hund-nase-2', text: 'Hunde riechen in Stereo, jedes Nasenloch für sich.'},
    {id: 'hund-nase-3', text: 'Die nasse Nase ist Absicht. Daran bleibt Duft kleben.'},
    {id: 'hund-rute-2', text: 'Rute schwingt nach seiner Rechten? Dann ist alles gut.'},
    {id: 'hund-regen-1', text: 'Regen ist doof, Pfützen sind herrlich. Hundelogik.'},
    {id: 'hund-alter-1', text: 'Je größer der Hund, desto schneller altert er. Unfair.'},
    {id: 'hund-sehen-1', text: 'Roter Ball im grünen Gras: für Hunde ein Suchbild.'},
    {id: 'hund-zaehne-1', text: '42 Zähne, zehn mehr als du. Geputzt wird keiner.'},
    {id: 'hund-tragen-1', text: 'Der Schuh im Maul ist ein Begrüßungsgeschenk. Deiner.'},
    {id: 'hund-frisur-1', text: 'Neue Frisur ist ihm egal. Neues Parfüm ist ein Skandal.'},
    {id: 'hund-kopf-1', text: 'Schiefer Kopf, volle Konzentration. Teste mal „Gassi“.'},
    {id: 'hund-laecheln-1', text: 'Locker hängendes Maul, Zunge raus: So lächeln Hunde.'},
    {id: 'hund-welpe-1', text: 'Welpen kommen blind und taub zur Welt. Die Nase nicht.'},
    {
      id: 'hund-zeit-2',
      when: ['due'],
      months: [3, 10],
      text: 'Uhr umgestellt, Hund nicht. Das dauert etwa eine Woche.',
    },
    {
      id: 'hund-hitze-1',
      when: ['wait'],
      months: SUMMER,
      text: 'Bei Hitze trinkt er mehr. Der Wassernapf will Schatten.',
    },
    {
      id: 'hund-asphalt-1',
      when: ['wait'],
      months: SUMMER,
      text: 'Asphalt zu heiß für den Handrücken? Für Pfoten auch.',
    },
    {
      id: 'hund-schwitzen-1',
      months: SUMMER,
      text: 'Hunde haben Schweißpfoten. Gekühlt wird per Zunge.',
    },
    {
      id: 'hund-heizung-1',
      when: ['evening'],
      months: HEATING,
      text: 'Trotz Pelzmantel: Der Heizungsplatz ist reserviert.',
    },
    {
      id: 'hund-fell-fruehling',
      months: SPRING,
      text: 'Das Winterfell zieht aus. Leider in jede Ecke.',
    },
    {
      id: 'hund-fell-herbst',
      months: AUTUMN,
      text: 'Winterfell im Anmarsch. Der Hund wird langsam Teddy.',
    },
    {
      id: 'hund-herbstlaub',
      when: ['wait'],
      months: LEAVES,
      text: 'Laub ist ein Hundefest. Im Flur liegen die Andenken.',
    },
    {id: 'hund-regen-2', months: LEAVES, text: 'Nasser Hund riecht nach nassem Hund. Chemie, leider.'},
    {
      id: 'hund-gruen',
      when: ['wait'],
      months: GREEN,
      text: 'Frisches Gras im Frühjahr? Beim Gassi spielt er Schaf.',
    },
    {id: 'hund-silvester', months: DECEMBER, text: 'Silvester ist Hundeohren zu laut. Ein Versteck hilft.'},
    {
      id: 'hund-weihnachten',
      months: DECEMBER,
      text: 'Ein Baum im Wohnzimmer. Was soll ein Hund da denken?',
    },
    {id: 'hund-welthundetag', day: '10-10', text: 'Heute ist Welthundetag. Für ihn ist das jeder Tag.'},
  ],
  Kaninchen: [
    {id: 'kaninchen-sehen-1', when: ['due'], text: 'Vor der Nase sehen Kaninchen nichts. Die Nase schon.'},
    {
      id: 'kaninchen-hoeren-1',
      when: ['due'],
      text: 'Kaninchenohren drehen einzeln. Gerade beide zu dir.',
    },
    {
      id: 'kaninchen-nase-1',
      when: ['due'],
      text: 'Schnelle Kaninchennase heißt Aufregung. Rate mal, warum.',
    },
    {
      id: 'kaninchen-zeit-1',
      when: ['due'],
      text: 'Kaninchen lernen Routinen fix. Die Futterzeit zuerst.',
    },
    {
      id: 'kaninchen-verdauung-1',
      when: ['fresh'],
      text: 'Kaninchen können nicht erbrechen. Kein Rückgaberecht.',
    },
    {
      id: 'kaninchen-trinken-1',
      when: ['fresh'],
      text: 'Schale schlägt Flasche: Kaninchen trinken daraus mehr.',
    },
    {
      id: 'kaninchen-putzen-1',
      when: ['fresh'],
      text: 'Jetzt gibt’s Katzenwäsche. Mit Kaninchenpfoten.',
    },
    {
      id: 'kaninchen-flop-1',
      when: ['fresh'],
      text: 'Umgekippt? Bei Kaninchen heißt das: tiefenentspannt.',
    },
    {
      id: 'kaninchen-daemmerung-1',
      when: ['wait'],
      text: 'Tagsüber Dösen, Dämmerung Party. So planen Kaninchen.',
    },
    {
      id: 'kaninchen-zaehne-1',
      when: ['wait'],
      text: 'Kaninchenzähne wachsen lebenslang. Daher das Genage.',
    },
    {
      id: 'kaninchen-buddeln-1',
      when: ['wait'],
      text: 'Kaninchen buddeln gern. Lieber im Sand als im Teppich.',
    },
    {id: 'kaninchen-nacht-1', when: ['wait'], text: 'Augen auf, Hirn auf Standby. Kaninchen dösen oft so.'},
    {
      id: 'kaninchen-magen-1',
      when: ['wait'],
      text: 'Stopfmagen heißt: Bei Kaninchen schiebt Futter Futter.',
    },
    {
      id: 'kaninchen-heu-1',
      when: ['evening'],
      text: 'Kaninchen kennen keinen Küchenschluss. Heu bleibt da.',
    },
    {
      id: 'kaninchen-sozial-2',
      when: ['evening'],
      text: 'Dein Kaninchen stupst dich? Übersetzt: weiterkraulen.',
    },
    {
      id: 'kaninchen-laute-2',
      when: ['evening'],
      text: 'Leises Zähneknirschen beim Kraulen? Kaninchenschnurren.',
    },
    {
      id: 'kaninchen-binky-1',
      when: ['evening'],
      text: 'Sprung mit Schraube heißt Binky. Pures Kaninchenglück.',
    },
    {
      id: 'kaninchen-daemmerung-2',
      when: ['evening'],
      text: 'Dämmerung: Du gähnst, das Kaninchen dreht auf.',
    },
    {
      id: 'kaninchen-laute-1',
      when: ['night'],
      text: 'Klopft’s nachts? Kein Geist, ein Kaninchen gibt Alarm.',
    },
    {
      id: 'kaninchen-verdauung-2',
      when: ['night'],
      text: 'Nachtsnack der Kaninchen: Blinddarmkot. Hausmannskost.',
    },
    {
      id: 'kaninchen-schlaf-1',
      when: ['night'],
      text: 'Kaninchen schlafen in Häppchen. Fressen auch.',
    },
    {id: 'kaninchen-sozial-1', text: 'Kaninchen brauchen Kaninchen. Du bist nur Personal.'},
    {id: 'kaninchen-sprung-1', text: 'Kaninchen springen bis einen Meter hoch. Und dein Zaun?'},
    {id: 'kaninchen-ohren-2', text: 'Kaninchenohren kühlen. Klimaanlage, Modell Löffel.'},
    {id: 'kaninchen-heu-2', text: 'Für Kaninchen ist Heu Hauptgang. Der Rest ist Beilage.'},
    {id: 'kaninchen-nager-1', text: 'Kaninchen sind keine Nagetiere. Sie nagen nur beruflich.'},
    {id: 'kaninchen-sehen-2', text: 'Kaninchen sehen fast rundum. Anschleichen lohnt nicht.'},
    {
      id: 'kaninchen-hitze',
      when: ['wait'],
      months: SUMMER,
      text: 'Hitze schadet Kaninchen mehr als Kälte. Fliese ist Gold.',
    },
    {id: 'kaninchen-heizung', months: HEATING, text: 'Lieber kalt als Heizungsluft. Kaninchen haben ja Pelz.'},
    {
      id: 'kaninchen-fell-fruehling',
      months: SPRING,
      text: 'Haarsaison: lieber in die Bürste als ins Kaninchen.',
    },
    {
      id: 'kaninchen-fell-herbst',
      months: AUTUMN,
      text: 'Winterfell wächst. Das Kaninchen geht jetzt als Kugel.',
    },
    {
      id: 'kaninchen-gruen',
      when: ['due'],
      months: SPRING,
      text: 'Gras, endlich! Langsam, der Kaninchenbauch übt noch.',
    },
    {
      id: 'kaninchen-herbstlaub',
      when: ['wait'],
      months: LEAVES,
      text: 'Herbstlaub ist ein Bällebad für Kaninchen. Mit Snacks.',
    },
    {
      id: 'kaninchen-silvester',
      months: DECEMBER,
      text: 'Kaninchen hassen Böller. Ein dunkles Versteck hilft.',
    },
    {
      id: 'kaninchen-weihnachten',
      months: DECEMBER,
      text: 'Christbaum: Kaninchen-Buffet. Lichterkette: leider auch.',
    },
    {
      id: 'kaninchen-weltkaninchentag',
      day: year => nthSaturday(year, 9, 4),
      text: 'Heute ist Weltkaninchentag. Löwenzahn geht aufs Haus.',
    },
  ],
  Vogel: [
    {
      id: 'vogel-herz-1',
      when: ['due'],
      text: 'Sittichherz: Hunderte Schläge pro Minute. Geduld: null.',
    },
    {id: 'vogel-hoeren-1', when: ['due'], text: 'Vögel haben keine Ohrmuscheln. Und hören jede Tüte.'},
    {id: 'vogel-sozial-2', when: ['due'], text: 'Schwarmregel: Einer pickt, alle picken. Du bist dran.'},
    {id: 'vogel-kopf-1', when: ['due'], text: 'Vögel drehen den Kopf weit herum. Du wirst beobachtet.'},
    {id: 'vogel-koerner-1', when: ['fresh'], text: 'Jedes Korn wird geschält. Die Schalen sind für dich.'},
    {id: 'vogel-schnabel-1', when: ['fresh'], text: 'Die Sitzstange ist nach dem Fressen die Serviette.'},
    {id: 'vogel-magen-1', when: ['fresh'], text: 'Vögel kauen nicht. Das macht jetzt der Muskelmagen.'},
    {
      id: 'vogel-kropf-1',
      when: ['fresh'],
      text: 'Das Futter parkt jetzt im Kropf. Kurzparkzone.',
    },
    {id: 'vogel-federn-1', when: ['wait'], text: 'Bis dahin wird geölt. Bürzeldrüse, eigene Herstellung.'},
    {id: 'vogel-baden-1', when: ['wait'], text: 'Bis dahin ein Bad? Die Tapete badet gleich mit.'},
    {
      id: 'vogel-stoffwechsel-1',
      when: ['wait'],
      text: 'Kleiner Vogel, schneller Motor. Gepickt wird ständig.',
    },
    {id: 'vogel-zweige-1', when: ['wait'], text: 'Ein frischer Zweig, und bis dahin wird geschnitzt.'},
    {
      id: 'vogel-hitze',
      when: ['wait'],
      months: SUMMER,
      text: 'Vögel schwitzen nicht, sie hecheln. Ein Bad hilft.',
    },
    {
      id: 'vogel-schlaf-3',
      when: ['evening'],
      text: 'Ziervögel schlafen zehn bis zwölf Stunden. Neidisch?',
    },
    {
      id: 'vogel-abend-1',
      when: ['evening'],
      text: 'Vorm Schlafen wird noch getratscht. Schwarmtradition.',
    },
    {
      id: 'vogel-licht-winter',
      when: ['evening'],
      months: [11, 12, 1],
      text: 'Im Winter schlafen Vögel mit der Sonne ein. Also früh.',
    },
    {
      id: 'vogel-schlaf-1',
      when: ['night'],
      text: 'Vögel schlafen auf einem Bein. Das andere hat frei.',
    },
    {id: 'vogel-schlaf-2', when: ['night'], text: 'Eine Hirnhälfte schläft, die andere hat Nachtdienst.'},
    {id: 'vogel-nacht-1', when: ['night'], text: 'Nymphensittiche sind nachts schreckhaft. Nachtlicht an?'},
    {id: 'vogel-licht-1', when: ['night'], text: 'Erstes Licht, Vogel wach. Du dann leider auch.'},
    {id: 'vogel-schmecken-1', text: 'Wenige Hundert Geschmacksknospen. Reicht zum Mäkeln.'},
    {id: 'vogel-sehen-1', text: 'Vögel sehen UV. Dein Vogel ist bunter, als du denkst.'},
    {id: 'vogel-sprache-1', text: 'Wellis plappern nach. Leider auch das Wort von vorhin.'},
    {id: 'vogel-sozial-1', text: 'Ziervögel sind ungern Single. Zu zweit ist mehr los.'},
    {id: 'vogel-kanarien-1', text: 'Der Kanarienhahn singt, die Henne hört kritisch zu.'},
    {id: 'vogel-heizung', months: HEATING, text: 'Heizungsluft ist Vögeln zu trocken. Sprühnebel, bitte.'},
    {
      id: 'vogel-mauser',
      months: [8, 9, 10],
      text: 'Mauserzeit. Bald reicht’s für ein Kopfkissen.',
    },
    {
      id: 'vogel-fruehling',
      months: SPRING,
      text: 'Frühjahr ist Gesangssaison. Der Nachbar hat kein Veto.',
    },
    {id: 'vogel-gruen', months: GREEN, text: 'Vogelmiere sprießt wieder. Der Name ist kein Zufall.'},
    {id: 'vogel-herbstlaub', months: LEAVES, text: 'Herbstlaub am Ast? Wird fachgerecht geschreddert.'},
    {
      id: 'vogel-silvester',
      months: DECEMBER,
      text: 'Silvesterplan für Vögel: Tuch drüber, Tür zu, Ruhe.',
    },
  ],
  Nager: [
    {
      id: 'nager-kuehlschrank-1',
      when: ['due'],
      text: 'Kühlschrank auf, Meerschweinchen pfeift. Pawlow nickt.',
    },
    {id: 'nager-riechen-2', when: ['due'], text: 'Nager riechen das Futter schon in deiner Hosentasche.'},
    {id: 'nager-uhr-1', when: ['due'], text: 'Ratten tigern vor der Futterzeit los. Innere Uhr.'},
    {
      id: 'nager-vitamin-1',
      when: ['due'],
      text: 'Meerschweinchen bauen kein Vitamin C. Paprika schon.',
    },
    {
      id: 'nager-zaehne-1',
      when: ['fresh'],
      text: 'Nagerzähne wachsen immer weiter. Essen ist Zahnpflege.',
    },
    {
      id: 'nager-hamstern-1',
      when: ['fresh'],
      text: 'Hamster packen erst ein. Gegessen wird im Nest.',
    },
    {id: 'nager-popcorn-1', when: ['fresh'], text: 'Freudensprünge heißen bei Meerschweinchen Popcornen.'},
    {id: 'nager-atem-1', when: ['fresh'], text: 'Ratten riechen am Kumpelatem: Was gab’s? Ah, Gurke.'},
    {
      id: 'nager-herbst-vorrat',
      when: ['fresh'],
      months: AUTUMN,
      text: 'Im Herbst bunkern Hamster mehr. Heizung hin oder her.',
    },
    {id: 'nager-stopfmagen-1', when: ['wait'], text: 'Meerschweinchen mampfen fast nonstop. Stopfmagen halt.'},
    {id: 'nager-tagschlaf-1', when: ['wait'], text: 'Hamster schlafen tagsüber. Wecken nimmt er dir übel.'},
    {id: 'nager-degu-1', when: ['wait'], text: 'Degus sind tagsüber wach. Der Hamster findet’s albern.'},
    {
      id: 'nager-hitze',
      when: ['wait'],
      months: SUMMER,
      text: 'Nager schwitzen kaum. Kühle Fliesen sind jetzt Luxus.',
    },
    {
      id: 'nager-abend-1',
      when: ['evening'],
      text: 'Beim Hamster klingelt jetzt der Wecker. Guten Morgen.',
    },
    {
      id: 'nager-schlaf-1',
      when: ['evening'],
      text: 'Meerschweinchen machen Feierabend in Häppchen.',
    },
    {
      id: 'nager-abend-2',
      when: ['evening'],
      text: 'Dämmerung heißt für Ratten und Mäuse: Schichtbeginn.',
    },
    {id: 'nager-nacht-1', when: ['night'], text: 'Viele Nager sind nachtaktiv. Im Käfig ist Rushhour.'},
    {
      id: 'nager-laufrad-2',
      when: ['night'],
      text: 'Hamster rennen nachts bis zu zehn Kilometer. Im Kreis.',
    },
    {id: 'nager-augen-1', when: ['night'], text: 'Meerschweinchen gucken dich an und schlafen dabei.'},
    {id: 'nager-riechen-1', text: 'Frisch geputzter Käfig riecht für Nager nach Umzug.'},
    {id: 'nager-sozial-1', text: 'Ratten wollen eine WG. Goldhamster wohnen allein.'},
    {id: 'nager-hoeren-1', text: 'Nager tratschen zu hoch für uns. Vielleicht besser so.'},
    {id: 'nager-lachen-1', text: 'Ratten lachen beim Kitzeln. Leider im Ultraschall.'},
    {id: 'nager-backen-2', text: 'In Hamsterbacken passt bis zu ein Fünftel Hamster.'},
    {id: 'nager-wort-1', text: '„Hamstern“ ist nach dem Hamster benannt. Zu Recht.'},
    {id: 'nager-chinchilla-1', text: 'Chinchillas baden in Sand. Nasser Pelz wär’ ein Drama.'},
    {id: 'nager-heizung', months: HEATING, text: 'Käfig an der Heizung? Für Nager Sauna ohne Aufguss.'},
    {id: 'nager-fruehling', months: SPRING, text: 'Im Frühjahr haaren Nager. Der Staubsauger merkt’s.'},
    {
      id: 'nager-silvester',
      months: DECEMBER,
      text: 'Silvester: ruhiger Raum, Tuch drüber. Nager danken.',
    },
    {id: 'nager-gruen', months: GREEN, text: 'Das erste Grün sprießt. Für Meerschweinchen: Salatbar.'},
    {
      id: 'nager-herbstlaub',
      months: LEAVES,
      text: 'Trockenes Laub ist für Nager ein Bällebad. Nur lauter.',
    },
    {
      id: 'nager-weihnachten',
      months: DECEMBER,
      text: 'Der Christbaum ist Nagern egal. Seine Nadeln nicht.',
    },
  ],
};

export const GENERAL = [
  {id: 'allg-wasser-1', when: ['due'], text: 'Wasser von gestern schmeckt nach gestern. Also frisch.'},
  {id: 'allg-uhr-1', when: ['due'], text: 'Tiere haben eine innere Uhr. Die klingelt gerade.'},
  {id: 'allg-blick-1', when: ['due'], text: 'Blick zum Napf, zu dir, zum Napf. Klarer geht’s nicht.'},
  {
    id: 'allg-gewohnheit-1',
    when: ['due'],
    text: 'Mit dem Napf in der Hand bist du gerade der Star.',
  },
  {
    id: 'allg-weihnachten',
    when: ['due'],
    months: DECEMBER,
    text: 'Im Dezember wackelt alles. Die Fütterzeit nicht.',
  },
  {id: 'allg-stille-1', when: ['fresh'], text: 'Nach dem Fressen Ruhe. Der Staubsauger darf warten.'},
  {id: 'allg-putzen-1', when: ['fresh'], text: 'Erst der Napf, dann die Wäsche. Tischmanieren eben.'},
  {
    id: 'allg-verdauen-1',
    when: ['fresh'],
    text: 'Voller Bauch, schwere Lider. Bei Tieren nicht anders.',
  },
  {id: 'allg-spiel-1', when: ['wait'], text: 'Spielen hält Körper und Kopf fit. Bis zum Napf ist Zeit.'},
  {id: 'allg-suchen-1', when: ['wait'], text: 'Ein paar Happen verstecken, und Tiere haben einen Job.'},
  {id: 'allg-waage-1', when: ['wait'], text: 'Fell und Federn schummeln. Die Waage nicht.'},
  {
    id: 'allg-hitze',
    when: ['wait'],
    months: SUMMER,
    text: 'Hitze macht Durst. Wasser in der Sonne wird zur Suppe.',
  },
  {
    id: 'allg-leckerli-1',
    when: ['evening'],
    text: 'Ein Leckerli zum Feierabend? Auch Liebe hat Kalorien.',
  },
  {id: 'allg-napf-1', when: ['evening'], text: 'Abends den Napf spülen. Sonst feiern die Keime weiter.'},
  {id: 'allg-daemmerung-1', when: ['evening'], text: 'Dämmerung ist Hauptsendezeit. Viele Tiere drehen auf.'},
  {
    id: 'allg-tagebuch-1',
    when: ['evening'],
    text: 'Ein Tagebuch merkt sich, was du längst vergessen hast.',
  },
  {
    id: 'allg-herbst',
    when: ['evening'],
    months: AUTUMN,
    text: 'Herbst: Der warme Schlafplatz wird jetzt hart umkämpft.',
  },
  {id: 'allg-traum-1', when: ['night'], text: 'Zucken im Schlaf heißt Traumkino. Bitte nicht stören.'},
  {id: 'allg-zeit-1', when: ['night'], text: 'Tiere ticken nach Licht und Bauch. Die Uhr ist Deko.'},
  {
    id: 'allg-schlaf-1',
    when: ['night'],
    text: 'Viele Tiere schlafen in Etappen. Wir sind die Ausnahme.',
  },
  {id: 'allg-napf-2', text: 'Wackelt der Napf, wird das Fressen zum Ringkampf.'},
  {id: 'allg-napf-3', text: 'Plastik ist nachtragend: Gerüche bleiben in Kratzern.'},
  {id: 'allg-nase-1', text: 'Viele Tiere glauben erst, was sie gerochen haben.'},
  {id: 'allg-routine-1', text: 'Routine klingt öde. Tieren gibt sie Halt.'},
  {id: 'allg-neu-1', text: 'Futterwechsel langsam. Mägen sind keine Abenteurer.'},
  {id: 'allg-spiel-2', text: 'Spielzeug im Wechsel bleibt neu. Der Karton gewinnt eh.'},
  {id: 'allg-heizung', months: HEATING, text: 'Heizungsluft dörrt Nasen und Fell. Mehr Wasser hilft.'},
  {id: 'allg-fruehling', months: SPRING, text: 'Mehr Licht, mehr Hormone. Frühlingsgefühle sind echt.'},
  {id: 'allg-gruen', months: GREEN, text: 'Frühling riecht anders. Tiernasen merken das vor dir.'},
  {
    id: 'allg-herbstlaub',
    months: LEAVES,
    text: 'Raschelt’s im Laub, sind Tierohren sofort auf Empfang.',
  },
  {
    id: 'allg-silvester',
    months: DECEMBER,
    text: 'Silvesterversteck jetzt bauen. Bis dahin ist’s vertraut.',
  },
  {
    id: 'allg-zeitumstellung-fruehling',
    day: year => lastSunday(year, 3),
    text: 'Uhr vor, Frühstück früher. Tiere wurden nicht gefragt.',
  },
  {
    id: 'allg-zeitumstellung-herbst',
    day: year => lastSunday(year, 10),
    text: 'Uhr zurück, Bauch nicht. Tiere haben heute eher Hunger.',
  },
  {
    id: 'allg-silvester-tag',
    day: '12-31',
    text: 'Heute knallt’s. Vorhang zu, Radio an, alle Tiere rein.',
  },
  {id: 'allg-neujahr', day: '01-01', text: 'Frohes Neues! Vorsätze haben Tiere keine, Hunger schon.'},
  {id: 'allg-heiligabend', day: '12-24', text: 'Heiligabend. Gans für dich, Napf für die Tiere.'},
  {id: 'allg-haustiertag', day: '04-11', text: 'Tag des Haustiers. Heute gilt Streichelpflicht.'},
];

/* dated: only facts bound to this day. moment: a short moment takes only facts made for it, 'wait' also those for
   any moment, null only those for any moment, undefined all. */
export function factsOn(species, date, dated = false, moment) {
  const own = FACTS[species] || [],
    list = [...own, ...GENERAL.filter(f => dated || !own.length || f.when)],
    month = date.getMonth() + 1,
    today = mmdd(date),
    year = date.getFullYear();
  const on = f => (typeof f.day === 'function' ? f.day(year) : f.day),
    fits = f => moment === undefined || (f.when ? f.when.includes(moment) : moment === null || moment === 'wait');
  return list.filter(f => (!f.months || f.months.includes(month)) && (dated ? on(f) === today : !f.day && fits(f)));
}

/* The diary below names every meal, so the variety is only named where it is news. With the aside, three lines at
   393px hold about 100 characters: a lead stays under 44 with a short name, an aside under 56. */
export const LEADS = {
  none: [
    '{names} {wartet} auf den ersten Eintrag.',
    'Seite eins, noch leer. {names} {wartet} schon.',
    'Noch kein Napf im Tagebuch. Das wird.',
  ],
  due: [
    'Futterzeit! Zuletzt gab’s {what} um {at}{by}.',
    'Zeit fürs {meal}, zuletzt um {at}{by}.',
    'Der Napf ruft, zuletzt gab’s um {at} {what}{by}.',
  ],
  dueFirst: [
    'Futterzeit! Heute gab’s noch nichts.',
    'Zeit fürs {meal}, heute noch nichts.',
    'Heute noch kein Napf. Höchste Zeit.',
  ],
  fresh: [
    '{Ago} gab’s {what}{for}{by}.',
    '{what}{for}{by}, {ago}. Mahlzeit!',
    'Frisch serviert: {what}{for}{by}, {ago}.',
  ],
  freshTreat: [
    '{Ago} gab’s {what} zum Naschen{for}{by}.',
    'Naschzeit: {what}{for}{by}, {ago}.',
    'Snack-Alarm: {what}{for}{by}, {ago}.',
  ],
  later: [
    '{meal} gegen {time}, zuletzt um {at}{by}.',
    'Zuletzt um {at}{by}, {meal} gegen {time}.',
    'Nächster Halt: {meal} gegen {time}.',
  ],
  morning: [
    'Heute noch nichts, {meal} gegen {time}.',
    'Noch Ruhe am Napf, {meal} gegen {time}.',
    'Bisher nichts, {meal} gegen {time}.',
  ],
  done: [
    'Für heute alles serviert, zuletzt um {at}{by}.',
    'Feierabend am Napf, zuletzt um {at}{by}.',
    'Küche zu. {meal} morgen gegen {time}.',
  ],
  night: [
    'Nachtruhe. {meal} gibt’s gegen {time}.',
    'Schlafenszeit, der Napf öffnet gegen {time}.',
    'Psst, Nacht. {meal} gegen {time}.',
  ],
  today: ['Heute gab’s {so} {both}.', 'Heute {so} {both}, zuletzt {at}{by}.', '{Names} {hat} heute {so} {both} intus.'],
  yesterday: [
    'Heute noch nichts, zuletzt gestern um {at}{by}.',
    'Heute ist noch nichts eingetragen.',
    'Heute noch Ruhe am Napf, zuletzt gestern.',
  ],
  lastNight: [
    'Zuletzt gab’s gestern {evening}um {at} {what}{by}.',
    'Letztes Futter: gestern {evening}um {at}.',
    'Gestern {evening}um {at} gab’s zuletzt {what}{by}.',
  ],
  older: [
    'Zuletzt gab’s {since} {what}{by}.',
    'Funkstille im Tagebuch, zuletzt {since}.',
    'Zuletzt im Napf: {what}, {since}.',
  ],
};

/* Short, so the line follows the lead instead of standing beside it. A {place} that can open a sentence must hold a
   capitalised word. */
export const LINES = {
  waiting: [
    '{names} {wartet} bestimmt schon am Napf.',
    '{names} {uebt} schon den vorwurfsvollen Blick.',
    '{names} {hat} bereits eine Beschwerde formuliert.',
    '{names} {sitzt} bestimmt schon vor dem Schrank.',
  ],
  birthdayAge: [
    '{pet} wird heute {age}. Extra-Leckerli erlaubt.',
    'Heute wird {pet} {age}, der Napf darf voller sein.',
    '{pet} wird {age}! Torte gibt’s nicht, Leckerli schon.',
  ],
  birthdayToday: [
    '{pet} hat heute Geburtstag. Extra-Leckerli erlaubt.',
    'Geburtstag von {pet}, der Napf darf voller sein.',
    'Geburtstag! {pet} nimmt Glückwünsche in Leckerli an.',
  ],
  birthdaySoon: [
    'In {days} hat {pet} Geburtstag.',
    'Noch {days}, dann hat {pet} Geburtstag.',
    '{pet} hat in {days} Geburtstag. Geschenk bitte essbar.',
  ],
  birthdayTomorrow: [
    'Morgen hat {pet} Geburtstag.',
    'Noch einmal schlafen, dann hat {pet} Geburtstag.',
    'Morgen ist {pet} Geburtstagskind und ahnt nichts.',
  ],
  premiereLast: [
    'Das gab’s heute zum ersten Mal. Mutig!',
    'Zum ersten Mal im Napf. Neues Futter, neues Glück.',
    'Premiere im Napf, das gab’s noch nie.',
  ],
  premiere: [
    '{sort} gab’s heute zum ersten Mal. Mutig!',
    'Neu im Napf heute: {sort}.',
    'Premiere heute: {sort}. Der rote Teppich liegt.',
  ],
  milestoneNext: [
    'Das nächste Füttern ist Nummer {m}',
    'Noch einmal füttern, dann ist das {m} Mal voll.',
    'Nächstes Füttern: das {m} Mal. Korken bereit?',
  ],
  milestone: [
    'Noch {n} bis zum {m}, fast ein Jubiläum.',
    'Noch {n} füttern, dann ist das {m} erreicht.',
    'Bis zum {m} fehlen noch {n}. Sekt kalt stellen?',
  ],
  anniversary: [
    'Vor {span} ging’s los. {n} Mahlzeiten seitdem.',
    'Seit genau {span} im Tagebuch, {n} Mahlzeiten bisher.',
    'Jubiläum: {n} Mahlzeiten in genau {span}.',
  ],
  recordStreak: [
    '{days} am Stück, so lang war die Serie noch nie.',
    'Neuer Rekord: {days} in Folge im Tagebuch.',
    '{days} ohne Lücke. Das gab’s hier noch nie.',
  ],
  recordDay: [
    'Schon {n} heute, so viele gab’s noch nie.',
    'Rekordtag: {n}, mehr als je zuvor.',
    '{n} heute, neuer Rekord.',
  ],
  earlier: [
    '{meal} war heute {span} früher dran.',
    '{meal} gab’s heute {span} früher. Eilig gehabt?',
    'Heute kam das {meal} {span} früher als sonst.',
  ],
  later: [
    '{meal} war heute {span} später dran.',
    '{meal} gab’s {span} später. Der Bauch hat’s gemerkt.',
    'Heute kam das {meal} {span} später als sonst.',
  ],
  sameMinute: [
    'Auf die Minute wie gestern. Wer erzieht hier wen?',
    'Dieselbe Minute wie gestern, die innere Uhr läuft.',
    'Auf die Minute genau wie gestern. Unheimlich.',
  ],
  snacksCounted: ['Bei so vielen Snacks: {grip}', 'So viele Snacks an einem Tag: {grip}', 'Snacks über Snacks. {grip}'],
  snacks: ['Schon {n} heute: {grip}', 'Heute schon {n}. {grip}', '{n} an einem Tag: {grip}'],
  duel: [
    'Fütter-Duell der Woche: {first} führt {n} zu {m}.',
    '{first} führt {n} zu {m}. {second}, da geht was!',
    '{n} zu {m} für {first}. {second}, aufholen!',
  ],
  duelTie: [
    'Fütter-Duell der Woche: {score}, Gleichstand.',
    'Gleichstand im Fütter-Duell, {score}.',
    '{first} und {second} liegen gleichauf, {score}. Spannend.',
  ],
  streak: [
    'Seit {since} lückenlos im Tagebuch.',
    '{days} in Folge eingetragen. Das nennt man Routine.',
    'Seit {since} kein Tag ohne Eintrag. Respekt.',
  ],
  idea: [
    'Mal wieder {sort}? Gab’s seit {days} Tagen nicht.',
    '{sort} war zuletzt vor {days} Tagen dran.',
    'Lange nicht gesehen: {sort}, seit {days} Tagen.',
  ],
  feedRun: [
    '{name} füttert seit {since} am Stück. {other} darf auch mal.',
    '{days} in Folge {name}. {other}, du bist dran.',
    '{name} hat {days} in Folge gefüttert, {other} schaut zu.',
  ],
  feedRunAlone: [
    '{name} füttert seit {since} ohne Pause.',
    '{days} am Stück hat {name} gefüttert. Wie ein Uhrwerk.',
    '{name} hat {days} in Folge gefüttert. Einsatz!',
  ],
  weekday: [
    '{weekday} gibt’s {meal} meist {shift}, heute um {time}.',
    '{weekday} tickt der Napf anders, {meal} heute um {time}.',
    'Am {day} ist {meal} meist {shift} dran, heute um {time}.',
  ],
  week: [
    'Diese Woche schon {meals} aus {sorts}.',
    'Speiseplan der Woche: {meals} aus {sorts}.',
    '{meals} aus {sorts} diese Woche. Abwechslung!',
  ],
  lookback: [
    'Heute vor einem Jahr gab’s {sort}.',
    'Vor genau einem Jahr stand {sort} im Napf.',
    'Heute vor einem Jahr: {sort}. Wie die Zeit vergeht.',
  ],
  sorts: [
    'Schon {n} probiert, das Regal ist noch länger.',
    '{n} im Tagebuch. Für Feinschmecker ein Anfang.',
    'Bis jetzt {n} probiert. Eine kleine Weltreise.',
  ],
  days: ['Seit {since} im Tagebuch.', 'Tag {n} im Tagebuch.', '{days} Tagebuch, und die Saga geht weiter.'],
};
// values come escaped from the caller
export const fill = (template, values) => template.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? '');
