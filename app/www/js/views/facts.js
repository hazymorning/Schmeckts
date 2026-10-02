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
      text: 'Katzen schlafen meist leicht, ein Dosenklappern und sie sind hellwach.',
    },
    {id: 'katze-zeit-1', when: ['due'], text: 'Katzen haben ein gutes Zeitgefühl, jede Verspätung wird notiert.'},
    {id: 'katze-laute-1', when: ['due'], text: 'Erwachsene Katzen miauen fast nur Menschen an, jetzt mit gutem Grund.'},
    {id: 'katze-laute-3', when: ['due'], text: 'Katzen haben viele Laute, zur Futterzeit reicht meist ein einziger.'},
    {id: 'katze-tempo-1', when: ['due'], text: 'Katzen sprinten bis zu 48 km/h, gleich wird das am Napf vorgeführt.'},
    {id: 'katze-name-1', when: ['due'], text: 'Katzen erkennen ihren Namen, zur Futterzeit lohnt sich das Hinhören.'},
    {id: 'katze-sehen-1', when: ['due'], text: 'Ganz nah sehen Katzen unscharf, am Napf tasten die Schnurrhaare mit.'},
    {id: 'katze-riechen-1', when: ['due'], text: 'Katzen fressen mit der Nase, zimmerwarm duftet Futter stärker.'},
    {id: 'katze-starren-1', when: ['due'], text: 'Der starre Blick zum Napf ist die höflichste Form der Erinnerung.'},
    {id: 'katze-schlaf-3', when: ['fresh'], text: 'Viele Katzen dösen nach dem Fressen erst mal, Verdauen ist Arbeit.'},
    {
      id: 'katze-jagd-2',
      when: ['fresh'],
      text: 'Jagen, fressen, putzen, schlafen: Katzen sind jetzt bei Schritt drei.',
    },
    {id: 'katze-zunge-1', when: ['fresh'], text: 'Katzenzungen sind rau wie Sandpapier, ideal für die Wäsche danach.'},
    {
      id: 'katze-zaehne-1',
      when: ['fresh'],
      text: 'Katzen kauen kaum, sie reißen und schlucken. Daher das Tempo am Napf.',
    },
    {
      id: 'katze-territorium-2',
      when: ['fresh'],
      text: 'Katzen fressen gern ungestört, Zuschauer am Napf sind nicht gefragt.',
    },
    {
      id: 'katze-temperatur-1',
      when: ['fresh'],
      text: 'Jetzt muss ein warmes Plätzchen her, Katzen mögen es wärmer als wir.',
    },
    {
      id: 'katze-wasser-4',
      when: ['fresh'],
      text: 'Danach ein Schluck, manche Katzen prüfen Wasser erst mit der Pfote.',
    },
    {
      id: 'katze-mahlzeiten-1',
      when: ['wait'],
      text: 'Frei lebende Katzen fressen bis zu 20 Happen am Tag, daher das Fragen.',
    },
    {id: 'katze-schlaf-1', when: ['wait'], text: 'Bis dahin wird gedöst, Katzen schlafen 12 bis 16 Stunden am Tag.'},
    {id: 'katze-fenster-1', when: ['wait'], text: 'Bis dahin läuft Katzenfernsehen am Fenster, Vögel im Vollprogramm.'},
    {id: 'katze-jagd-1', when: ['wait'], text: 'Auch satte Katzen jagen, bis dahin muss eben die Socke herhalten.'},
    {id: 'katze-box-1', when: ['wait'], text: 'Ein Karton hilft beim Warten, er senkt bei Katzen messbar den Stress.'},
    {
      id: 'katze-hoehe-1',
      when: ['wait'],
      text: 'Katzen mögen Höhe, vom Schrank aus wird die Küche bis dahin überwacht.',
    },
    {id: 'katze-nacht-1', when: ['evening'], text: 'Katzen sind in der Dämmerung am wachsten, der Abend gehört ihnen.'},
    {
      id: 'katze-zoomies-1',
      when: ['evening'],
      text: 'Abends rasen Katzen gern durch die Wohnung, die Energie muss raus.',
    },
    {
      id: 'katze-kneten-1',
      when: ['evening'],
      text: 'Der Milchtritt auf dem Schoß heißt bei Katzen: Hier ist es gemütlich.',
    },
    {
      id: 'katze-schnurren-2',
      when: ['evening'],
      text: 'Katzen schnurren mit 25 bis 150 Hertz, genau richtig zum Feierabend.',
    },
    {
      id: 'katze-koerper-1',
      when: ['evening'],
      text: 'Langsames Blinzeln ist bei Katzen ein Gruß, zurückblinzeln erlaubt.',
    },
    {
      id: 'katze-koerper-3',
      when: ['evening'],
      text: 'Bauch nach oben heißt bei Katzen Vertrauen, Streicheln bleibt riskant.',
    },
    {id: 'katze-sehen-2', when: ['night'], text: 'Katzen sehen nachts viel besser als wir, nur nicht im Stockdunkeln.'},
    {
      id: 'katze-nacht-2',
      when: ['night'],
      text: 'In der Morgendämmerung werden Katzen munter, frühes Wecken hat System.',
    },
    {
      id: 'katze-hoeren-1',
      when: ['night'],
      text: 'Katzen hören bis in den Ultraschall, heute Nacht entgeht ihnen nichts.',
    },
    {
      id: 'katze-hoeren-2',
      when: ['night'],
      text: 'Katzenohren drehen sich einzeln, eins hört auch im Schlaf noch mit.',
    },
    {id: 'katze-tuer-1', when: ['night'], text: 'Geschlossene Türen sind für Katzen ein Skandal, nachts erst recht.'},
    {
      id: 'katze-mahlzeiten-2',
      when: ['night'],
      text: 'Katzen lieben Routine und mahnen sie notfalls schon vor dem Wecker an.',
    },
    {
      id: 'katze-gang-1',
      when: ['night'],
      text: 'Katzen setzen die Hinterpfoten in die Spur der vorderen, fast lautlos.',
    },
    {id: 'katze-schmecken-1', text: 'Katzen schmecken nichts Süßes, der Blick zum Kuchen gilt der Butter.'},
    {id: 'katze-schmecken-2', text: 'Katzen haben nur einige Hundert Geschmacksknospen, wir Tausende.'},
    {id: 'katze-sehen-3', text: 'Katzen sehen Farben blasser als wir, Rot und Grün verschwimmen.'},
    {id: 'katze-nase-2', text: 'Katzen riechen auch mit dem Gaumen, daher das verdutzte Gesicht.'},
    {id: 'katze-zitrus-1', text: 'Katzen meiden Zitrusduft, die Orangenschale auf dem Tisch ist tabu.'},
    {id: 'katze-milch-1', text: 'Erwachsene Katzen vertragen Milch oft schlecht, Klischee hin oder her.'},
    {id: 'katze-schnurrhaare-1', text: 'Viele Katzen mögen flache Schalen, das schont die Schnurrhaare.'},
    {id: 'katze-pfote-1', text: 'Viele Kater bevorzugen die linke Pfote, Kätzinnen eher die rechte.'},
    {id: 'katze-korb-1', text: 'Teures Körbchen oder Papiertüte? Katzen nehmen oft die Tüte.'},
    {id: 'katze-schulter-1', text: 'Katzen passen durch enge Lücken, ihr Schlüsselbein sitzt nur lose.'},
    {id: 'katze-koepfchen-1', text: 'Gibt eine Katze Köpfchen, markiert sie dich mit Duft. Du gehörst dazu.'},
    {id: 'katze-koerper-2', text: 'Ein steil aufgestellter Schwanz ist bei Katzen ein freundliches Hallo.'},
    {id: 'katze-bad-1', text: 'Katzen folgen dir gern ins Bad, dort sitzt du endlich mal still.'},
    {id: 'katze-tastatur-1', text: 'Katzen lieben die Tastatur: warm und mitten in deinem Blickfeld.'},
    {id: 'katze-sonne-1', text: 'Katzen wandern mit dem Sonnenfleck durch die Wohnung, Solarbetrieb.'},
    {id: 'katze-wasser-3', text: 'Viele Katzen trinken lieber am tropfenden Hahn als aus dem Napf.'},
    {id: 'katze-geruch-2', text: 'Katzen erobern neue Möbel so: schnuppern, markieren, besetzen.'},
    {id: 'katze-alter-3', text: 'Die älteste bekannte Katze wurde 38 Jahre alt, Nickerchen inklusive.'},
    {
      id: 'katze-hitze-1',
      when: ['wait'],
      months: SUMMER,
      text: 'Bei Hitze fressen Katzen lieber abends, mittags zählt der Schatten.',
    },
    {
      id: 'katze-hitze-2',
      months: SUMMER,
      text: 'Katzen schwitzen fast nur an den Pfoten, zum Abkühlen putzen sie sich.',
    },
    {
      id: 'katze-heizung-1',
      when: ['evening'],
      months: HEATING,
      text: 'Abends ist die Heizung Katzenplatz, auch wenn das Fell dort knistert.',
    },
    {
      id: 'katze-fell-fruehling',
      months: SPRING,
      text: 'Katzen wechseln jetzt ins Sommerfell, Bürsten hilft Sofa und Magen.',
    },
    {
      id: 'katze-fell-herbst',
      months: AUTUMN,
      text: 'Jetzt wächst das Winterfell, Katzen wirken dann runder, als sie sind.',
    },
    {
      id: 'katze-herbstlaub',
      when: ['wait'],
      months: LEAVES,
      text: 'Bis dahin tut es raschelndes Laub, für Katzen ein Spielzeug mit Ton.',
    },
    {id: 'katze-gruen', months: GREEN, text: 'Das erste Gras lockt auch Katzen, ein Halm wird jetzt gern probiert.'},
    {
      id: 'katze-silvester',
      months: DECEMBER,
      text: 'Bei Silvesterknallern hilft Katzen ein ruhiger Raum mehr als Zureden.',
    },
    {
      id: 'katze-weihnachten',
      months: DECEMBER,
      text: 'Für Katzen ist der Christbaum ein Kletterbaum mit Spielzeug dran.',
    },
    {id: 'katze-weltkatzentag', day: '08-08', text: 'Heute ist Weltkatzentag. Die Katze weiß es natürlich längst.'},
  ],
  Hund: [
    {id: 'hund-nase-1', when: ['due'], text: 'Hunde riechen zehntausendmal feiner, der Schrank ist kein Versteck.'},
    {id: 'hund-zeit-1', when: ['due'], text: 'Hunde brauchen keine Uhr, die Fütterzeit kennen sie trotzdem genau.'},
    {id: 'hund-ohren-1', when: ['due'], text: 'Hunde bewegen ihre Ohren mit 18 Muskeln, jetzt alle Richtung Küche.'},
    {id: 'hund-speichel-1', when: ['due'], text: 'Schon beim Napfklappern läuft Hunden das Wasser im Maul zusammen.'},
    {id: 'hund-rudel-1', when: ['due'], text: 'Hunde lesen Routinen, der Griff zum Schrank sagt ihnen alles.'},
    {id: 'hund-laute-1', when: ['due'], text: 'Hundebellen kann vieles heißen, kurz vor dem Napf meist nur eins.'},
    {id: 'hund-koerper-1', when: ['due'], text: 'Gähnen vor dem Napf ist bei Hunden eher Anspannung als Müdigkeit.'},
    {id: 'hund-schlaf-1', when: ['fresh'], text: 'Danach wird gedöst, Hunde schlafen 12 bis 14 Stunden am Tag.'},
    {id: 'hund-wasser-1', when: ['fresh'], text: 'Hunde trinken mit nach hinten gerollter Zunge, daher die Pfütze.'},
    {id: 'hund-ruhe-1', when: ['fresh'], text: 'Jetzt lieber nicht toben, große Hunde brauchen nach dem Fressen Ruhe.'},
    {
      id: 'hund-magen-1',
      when: ['fresh'],
      text: 'Hunde kauen wenig, die Hauptarbeit macht jetzt ihr sehr saurer Magen.',
    },
    {id: 'hund-teppich-1', when: ['fresh'], text: 'Viele Hunde nehmen danach den Teppich als Serviette.'},
    {id: 'hund-nase-4', when: ['wait'], text: 'Für Hunde ist jeder Schnüffelstopp beim Gassi wie Zeitunglesen.'},
    {id: 'hund-hoeren-1', when: ['wait'], text: 'Hunde hören den Postboten lange, bevor es klingelt.'},
    {id: 'hund-koerper-2', when: ['wait'], text: 'Vorne runter, hinten hoch heißt bei Hunden: Lass uns spielen.'},
    {id: 'hund-nase-6', when: ['wait'], text: 'Hunde riechen vermutlich die Zeit, dein Duft im Haus wird schwächer.'},
    {id: 'hund-buddeln-1', when: ['wait'], text: 'Hunde verstecken gern Vorräte, im Zweifel mitten im Beet.'},
    {
      id: 'hund-kreis-1',
      when: ['evening'],
      text: 'Vor dem Hinlegen dreht sich der Hund im Kreis, als läge da noch Gras.',
    },
    {
      id: 'hund-kauen-1',
      when: ['evening'],
      text: 'Kauen beruhigt Hunde, abends muss gern noch ein Knochen dran glauben.',
    },
    {
      id: 'hund-blick-1',
      when: ['evening'],
      text: 'Schaut ihr euch jetzt lange an, schütten Hund und Mensch Oxytocin aus.',
    },
    {id: 'hund-rhythmus-1', when: ['evening'], text: 'Hunde richten ihren Tag nach uns, Feierabend gilt auch für sie.'},
    {
      id: 'hund-schnueffeln-1',
      when: ['evening'],
      text: 'Schnüffeln ist Kopfarbeit, nach langen Runden schlafen Hunde tief.',
    },
    {id: 'hund-schlaf-2', when: ['night'], text: 'Zucken heute Nacht die Pfoten, rennt der Hund vermutlich im Traum.'},
    {id: 'hund-traum-2', when: ['night'], text: 'Kleine Hunde träumen öfter als große, die träumen dafür länger.'},
    {id: 'hund-schnarchen-1', when: ['night'], text: 'Auch Hunde schnarchen, solche mit kurzer Nase besonders oft.'},
    {id: 'hund-sehen-2', when: ['night'], text: 'Im Halbdunkel sehen Hunde besser als wir, den Weg zum Napf sowieso.'},
    {id: 'hund-schlaf-3', when: ['night'], text: 'Hunde schlafen nachts in Etappen und sind zwischendurch kurz wach.'},
    {id: 'hund-schlaf-4', when: ['night'], text: 'Bei Kühle schlafen Hunde eingerollt, bei Wärme lang ausgestreckt.'},
    {id: 'hund-schmecken-1', text: 'Hunde haben nur rund 1700 Geschmacksknospen, die Nase macht den Rest.'},
    {id: 'hund-schmecken-2', text: 'Hunde schmecken Süßes, Katzen nicht, der Kuchenblick ist kein Zufall.'},
    {id: 'hund-nase-2', text: 'Jedes Nasenloch riecht für sich, so wissen Hunde, woher es duftet.'},
    {id: 'hund-nase-3', text: 'Die feuchte Hundenase ist Werkzeug, Duftstoffe haften daran besser.'},
    {id: 'hund-rute-2', text: 'Wedelt die Rute nach rechts, vom Hund aus gesehen, ist er entspannt.'},
    {id: 'hund-regen-1', text: 'Viele Hunde meiden Regen und springen trotzdem in jede Pfütze.'},
    {id: 'hund-alter-1', text: 'Große Hunde altern schneller als kleine, Größe hat ihren Preis.'},
    {id: 'hund-sehen-1', text: 'Ein rotes Spielzeug im Gras finden Hunde schwerer als ein blaues.'},
    {id: 'hund-zaehne-1', text: 'Hunde haben 42 Zähne, zehn mehr als wir, und putzen keinen davon.'},
    {id: 'hund-tragen-1', text: 'Der Schuh im Hundemaul ist selten Beute, eher ein Mitbringsel.'},
    {id: 'hund-frisur-1', text: 'Eine neue Frisur ist Hunden egal, ein neues Parfüm fällt ihnen auf.'},
    {id: 'hund-kopf-1', text: 'Mit schiefem Kopf hören Hunde genauer hin, vor allem beim Wort Gassi.'},
    {id: 'hund-laecheln-1', text: 'Ein entspanntes, leicht geöffnetes Maul ist bei Hunden ein Lächeln.'},
    {id: 'hund-welpe-1', text: 'Welpen werden taub und blind geboren, die Nase arbeitet ab Tag eins.'},
    {
      id: 'hund-zeit-2',
      when: ['due'],
      months: [3, 10],
      text: 'Uhren stellen sich in Sekunden um, Hunde brauchen etwa eine Woche.',
    },
    {
      id: 'hund-hitze-1',
      when: ['wait'],
      months: SUMMER,
      text: 'Bei Hitze trinken Hunde mehr, der Wassernapf gehört in den Schatten.',
    },
    {
      id: 'hund-asphalt-1',
      when: ['wait'],
      months: SUMMER,
      text: 'Ist der Asphalt zu heiß für den Handrücken, ist er es auch für Pfoten.',
    },
    {
      id: 'hund-schwitzen-1',
      months: SUMMER,
      text: 'Hunde schwitzen fast nur an den Pfoten, den Rest erledigt die Zunge.',
    },
    {
      id: 'hund-heizung-1',
      when: ['evening'],
      months: HEATING,
      text: 'Der Heizungsplatz ist im Winter heiß begehrt, Fell hin oder her.',
    },
    {
      id: 'hund-fell-fruehling',
      months: SPRING,
      text: 'Im Frühjahr fliegt das Winterfell, der Staubsauger macht Überstunden.',
    },
    {
      id: 'hund-fell-herbst',
      months: AUTUMN,
      text: 'Im Herbst wächst das Winterfell, mancher Hund wird zum Plüschtier.',
    },
    {
      id: 'hund-herbstlaub',
      when: ['wait'],
      months: LEAVES,
      text: 'Herbstlaub ist ein Hundefest, ein paar Blätter wandern mit ins Haus.',
    },
    {id: 'hund-regen-2', months: LEAVES, text: 'Nasser Hund riecht nach nassem Hund, das Handtuch hat jetzt Saison.'},
    {
      id: 'hund-gruen',
      when: ['wait'],
      months: GREEN,
      text: 'Das erste Gras im Frühjahr probieren auch Hunde, halmweise beim Gassi.',
    },
    {id: 'hund-silvester', months: DECEMBER, text: 'Silvester ist für Hundeohren laut, ein ruhiger Rückzugsort hilft.'},
    {
      id: 'hund-weihnachten',
      months: DECEMBER,
      text: 'Der Weihnachtsbaum ist für Hunde vor allem ein Baum, mit allen Folgen.',
    },
    {id: 'hund-welthundetag', day: '10-10', text: 'Heute ist Welthundetag, Hunde feiern wie immer mit vollem Einsatz.'},
  ],
  Kaninchen: [
    {id: 'kaninchen-sehen-1', when: ['due'], text: 'Den Napf vor der Nase sehen Kaninchen kaum, sie erschnuppern ihn.'},
    {
      id: 'kaninchen-hoeren-1',
      when: ['due'],
      text: 'Kaninchenohren drehen sich einzeln, eins ist jetzt sicher auf Empfang.',
    },
    {
      id: 'kaninchen-nase-1',
      when: ['due'],
      text: 'Bei Aufregung wackelt die Kaninchennase schneller, also gerade jetzt.',
    },
    {
      id: 'kaninchen-zeit-1',
      when: ['due'],
      text: 'Kaninchen merken sich Abläufe schnell, die Futterzeit ganz besonders.',
    },
    {
      id: 'kaninchen-verdauung-1',
      when: ['fresh'],
      text: 'Kaninchen können nicht erbrechen, was jetzt drin ist, bleibt drin.',
    },
    {
      id: 'kaninchen-trinken-1',
      when: ['fresh'],
      text: 'Kaninchen trinken aus Schalen mehr als aus Flaschen, Pfütze inklusive.',
    },
    {
      id: 'kaninchen-putzen-1',
      when: ['fresh'],
      text: 'Danach putzen Kaninchen sich wie Katzen, nasses Gesicht mit Absicht.',
    },
    {
      id: 'kaninchen-flop-1',
      when: ['fresh'],
      text: 'Kippt ein Kaninchen jetzt langsam zur Seite, ist es tiefenentspannt.',
    },
    {
      id: 'kaninchen-daemmerung-1',
      when: ['wait'],
      text: 'Kaninchen dösen tagsüber, richtig gefuttert wird in der Dämmerung.',
    },
    {
      id: 'kaninchen-zaehne-1',
      when: ['wait'],
      text: 'Kaninchenzähne wachsen ein Leben lang, bis dahin wird also genagt.',
    },
    {
      id: 'kaninchen-buddeln-1',
      when: ['wait'],
      text: 'Kaninchen buddeln gern, eine Sandkiste vertreibt die Wartezeit.',
    },
    {id: 'kaninchen-nacht-1', when: ['wait'], text: 'Auch mit geöffneten Augen kann ein Kaninchen gerade dösen.'},
    {
      id: 'kaninchen-magen-1',
      when: ['wait'],
      text: 'Kaninchen haben einen Stopfmagen, erst Nachschub schiebt alles weiter.',
    },
    {
      id: 'kaninchen-heu-1',
      when: ['evening'],
      text: 'Ganz zu ist die Küche bei Kaninchen nie, Heu sollte immer da sein.',
    },
    {
      id: 'kaninchen-sozial-2',
      when: ['evening'],
      text: 'Stupst ein Kaninchen beim Streicheln, heißt das meist: weitermachen.',
    },
    {
      id: 'kaninchen-laute-2',
      when: ['evening'],
      text: 'Leises Zähneknirschen beim Streicheln ist das Schnurren der Kaninchen.',
    },
    {
      id: 'kaninchen-binky-1',
      when: ['evening'],
      text: 'Luftsprünge mit Drehung machen Kaninchen nur, wenn es ihnen gut geht.',
    },
    {
      id: 'kaninchen-daemmerung-2',
      when: ['evening'],
      text: 'Abends geht es bei Kaninchen erst los, die Dämmerung ist ihre Zeit.',
    },
    {
      id: 'kaninchen-laute-1',
      when: ['night'],
      text: 'Klopft es heute Nacht, schlägt ein Kaninchen mit dem Hinterlauf Alarm.',
    },
    {
      id: 'kaninchen-verdauung-2',
      when: ['night'],
      text: 'Nachts fressen Kaninchen Blinddarmkot, Nachschlag aus eigener Küche.',
    },
    {
      id: 'kaninchen-schlaf-1',
      when: ['night'],
      text: 'Kaninchen schlafen in Etappen, nachts wird zwischendurch gefuttert.',
    },
    {id: 'kaninchen-sozial-1', text: 'Kaninchen sind Gruppentiere, kein Mensch ersetzt ihnen ein zweites.'},
    {id: 'kaninchen-sprung-1', text: 'Kaninchen springen bis einen Meter hoch, Gehege sind eher Vorschläge.'},
    {id: 'kaninchen-ohren-2', text: 'Lange Ohren geben Wärme ab, für Kaninchen sind sie die Klimaanlage.'},
    {id: 'kaninchen-heu-2', text: 'Die Heuraufe ist für Kaninchen Speisekammer und Bett zugleich.'},
    {id: 'kaninchen-nager-1', text: 'Kaninchen sind keine Nagetiere, auch wenn sie den ganzen Tag nagen.'},
    {id: 'kaninchen-sehen-2', text: 'Kaninchen sehen fast rundum, sogar ein Stück nach hinten.'},
    {
      id: 'kaninchen-hitze',
      when: ['wait'],
      months: SUMMER,
      text: 'Hitze ist für Kaninchen gefährlicher als Kälte, kühle Fliesen helfen.',
    },
    {id: 'kaninchen-heizung', months: HEATING, text: 'Kaninchen vertragen Kälte besser als trockene Heizungsluft.'},
    {
      id: 'kaninchen-fell-fruehling',
      months: SPRING,
      text: 'Im Frühjahr haaren Kaninchen stark, Bürsten spart Haare im Magen.',
    },
    {
      id: 'kaninchen-fell-herbst',
      months: AUTUMN,
      text: 'Im Herbst wächst das Winterfell, Kaninchen werden zur Kugel mit Ohren.',
    },
    {
      id: 'kaninchen-gruen',
      when: ['due'],
      months: SPRING,
      text: 'Frisches Grün lieber nach und nach, der Kaninchenbauch braucht Zeit.',
    },
    {
      id: 'kaninchen-herbstlaub',
      when: ['wait'],
      months: LEAVES,
      text: 'Kaninchen durchwühlen Herbstlaub gern und probieren manches Blatt.',
    },
    {
      id: 'kaninchen-silvester',
      months: DECEMBER,
      text: 'Böller sind für Kaninchen purer Stress, ein dunkler Platz hilft.',
    },
    {
      id: 'kaninchen-weihnachten',
      months: DECEMBER,
      text: 'Kaninchen benagen den Weihnachtsbaum, leider auch die Lichterkette.',
    },
    {
      id: 'kaninchen-weltkaninchentag',
      day: year => nthSaturday(year, 9, 4),
      text: 'Heute ist Weltkaninchentag, ein Grashalm extra wäre angemessen.',
    },
  ],
  Vogel: [
    {
      id: 'vogel-herz-1',
      when: ['due'],
      text: 'Ein Sittichherz schlägt Hunderte Male pro Minute, Warten ist zäh.',
    },
    {id: 'vogel-hoeren-1', when: ['due'], text: 'Vögel haben keine Ohrmuscheln, die Futtertüte hören sie trotzdem.'},
    {id: 'vogel-sozial-2', when: ['due'], text: 'Schwarmvögel fressen gern gemeinsam, gleich sind also alle am Napf.'},
    {id: 'vogel-kopf-1', when: ['due'], text: 'Vögel drehen den Kopf weit herum, kein Griff zur Tüte bleibt geheim.'},
    {id: 'vogel-koerner-1', when: ['fresh'], text: 'Viele Vögel schälen jedes Korn einzeln, das dauert seine Zeit.'},
    {id: 'vogel-schnabel-1', when: ['fresh'], text: 'Nach dem Fressen wetzen Vögel den Schnabel, Tischmanieren eben.'},
    {id: 'vogel-magen-1', when: ['fresh'], text: 'Vögel haben keine Zähne, das Mahlen erledigt der Muskelmagen.'},
    {
      id: 'vogel-kropf-1',
      when: ['fresh'],
      text: 'Bei Sittichen landet das Futter erst mal im Kropf, als Zwischenlager.',
    },
    {id: 'vogel-federn-1', when: ['wait'], text: 'Bis dahin ist Gefiederpflege, das Öl dafür liefert die Bürzeldrüse.'},
    {id: 'vogel-baden-1', when: ['wait'], text: 'Bis dahin Zeit für ein Bad, Vögel spritzen weiter als gedacht.'},
    {
      id: 'vogel-stoffwechsel-1',
      when: ['wait'],
      text: 'Kleine Vögel picken den ganzen Tag, ihr Stoffwechsel läuft schnell.',
    },
    {id: 'vogel-zweige-1', when: ['wait'], text: 'Sittiche benagen gern frische Zweige, das vertreibt die Wartezeit.'},
    {
      id: 'vogel-hitze',
      when: ['wait'],
      months: SUMMER,
      text: 'Bei Hitze sperren Vögel den Schnabel auf, ein Bad kühlt jetzt ab.',
    },
    {
      id: 'vogel-schlaf-3',
      when: ['evening'],
      text: 'Jetzt wird es ruhig, Ziervögel brauchen zehn bis zwölf Stunden Schlaf.',
    },
    {
      id: 'vogel-abend-1',
      when: ['evening'],
      text: 'Vor dem Einschlafen plaudern Vögel noch eine Runde, wie im Schwarm.',
    },
    {
      id: 'vogel-licht-winter',
      when: ['evening'],
      months: [11, 12, 1],
      text: 'Jetzt im Winter gehen Vögel mit dem Licht früh schlafen.',
    },
    {
      id: 'vogel-schlaf-1',
      when: ['night'],
      text: 'Vögel schlafen jetzt auf einem Bein, das andere steckt im Gefieder.',
    },
    {id: 'vogel-schlaf-2', when: ['night'], text: 'Vögel können mit einer Hirnhälfte schlafen, die andere hält Wache.'},
    {id: 'vogel-nacht-1', when: ['night'], text: 'Nymphensittiche schrecken nachts leicht auf, ein Nachtlicht hilft.'},
    {id: 'vogel-licht-1', when: ['night'], text: 'Vögel wachen mit dem ersten Licht auf, ganz ohne Wecker.'},
    {id: 'vogel-schmecken-1', text: 'Vögel haben wenige Hundert Geschmacksknospen und sortieren trotzdem.'},
    {id: 'vogel-sehen-1', text: 'Vögel sehen sogar Ultraviolett, das Gefieder ist für sie noch bunter.'},
    {id: 'vogel-sprache-1', text: 'Wellensittiche lernen oft gehörte Wörter, also Vorsicht beim Fluchen.'},
    {id: 'vogel-sozial-1', text: 'Ziervögel leben ungern allein, zu zweit wird deutlich mehr geplaudert.'},
    {id: 'vogel-kanarien-1', text: 'Bei Kanarienvögeln singen vor allem die Männchen, und zwar ausgiebig.'},
    {id: 'vogel-heizung', months: HEATING, text: 'Heizungsluft ist Vögeln zu trocken, ein Bad oder Sprühnebel hilft.'},
    {
      id: 'vogel-mauser',
      months: [8, 9, 10],
      text: 'Nach dem Sommer mausern viele Vögel, der Käfigboden wird zum Kissen.',
    },
    {
      id: 'vogel-fruehling',
      months: SPRING,
      text: 'Im Frühjahr singen Vögel am meisten, ob der Nachbar will oder nicht.',
    },
    {id: 'vogel-gruen', months: GREEN, text: 'Das erste Grün ist da, Vögel zerpflücken jetzt gern frische Kräuter.'},
    {id: 'vogel-herbstlaub', months: LEAVES, text: 'Vögel zerlegen einen Ast mit Herbstlaub, bevor er richtig hängt.'},
    {
      id: 'vogel-silvester',
      months: DECEMBER,
      text: 'An Silvester hilft Vögeln ein abgedeckter Käfig in einem ruhigen Raum.',
    },
  ],
  Nager: [
    {
      id: 'nager-kuehlschrank-1',
      when: ['due'],
      text: 'Meerschweinchen quieken schon, wenn nur der Kühlschrank aufgeht.',
    },
    {id: 'nager-riechen-2', when: ['due'], text: 'Nager riechen Futter, lange bevor es im Napf liegt.'},
    {id: 'nager-uhr-1', when: ['due'], text: 'Ratten werden vor der Futterzeit unruhig, ihre innere Uhr geht genau.'},
    {
      id: 'nager-vitamin-1',
      when: ['due'],
      text: 'Meerschweinchen bilden kein Vitamin C selbst, Frisches muss also her.',
    },
    {
      id: 'nager-zaehne-1',
      when: ['fresh'],
      text: 'Nagerzähne wachsen ein Leben lang, jedes Knabbern hält sie in Form.',
    },
    {
      id: 'nager-hamstern-1',
      when: ['fresh'],
      text: 'Hamsterbacken sind Vorratstaschen, gespeist wird später im Schlafhaus.',
    },
    {id: 'nager-popcorn-1', when: ['fresh'], text: 'Bei Frischem springen Meerschweinchen vor Freude senkrecht hoch.'},
    {id: 'nager-atem-1', when: ['fresh'], text: 'Ratten riechen am Atem der anderen, was es gerade gab.'},
    {
      id: 'nager-herbst-vorrat',
      when: ['fresh'],
      months: AUTUMN,
      text: 'Im Herbst wird mehr gehamstert, der Vorrat wächst auch ohne Winter.',
    },
    {id: 'nager-stopfmagen-1', when: ['wait'], text: 'Mit ihrem Stopfmagen knabbern Meerschweinchen fast pausenlos.'},
    {id: 'nager-tagschlaf-1', when: ['wait'], text: 'Hamster verschlafen den Tag, wecken sollte man sie besser nicht.'},
    {id: 'nager-degu-1', when: ['wait'], text: 'Degus sind am Tag munter, Hamster schlafen da lieber.'},
    {
      id: 'nager-hitze',
      when: ['wait'],
      months: SUMMER,
      text: 'Nager können kaum schwitzen, eine kühle Fliese hilft jetzt bei Hitze.',
    },
    {
      id: 'nager-abend-1',
      when: ['evening'],
      text: 'Für Hamster beginnt jetzt erst der Tag, die Dämmerung ist ihr Morgen.',
    },
    {
      id: 'nager-schlaf-1',
      when: ['evening'],
      text: 'Meerschweinchen dösen in kurzen Etappen, Feierabend kennen sie kaum.',
    },
    {
      id: 'nager-abend-2',
      when: ['evening'],
      text: 'Ratten und Mäuse werden jetzt in der Dämmerung erst richtig munter.',
    },
    {id: 'nager-nacht-1', when: ['night'], text: 'Viele Nager sind nachtaktiv, im Käfig ist jetzt Hauptverkehrszeit.'},
    {
      id: 'nager-laufrad-2',
      when: ['night'],
      text: 'Hamster laufen nachts bis zu zehn Kilometer im Rad, Ziel unbekannt.',
    },
    {id: 'nager-augen-1', when: ['night'], text: 'Meerschweinchen schlafen oft, ohne die Augen zu schließen.'},
    {id: 'nager-riechen-1', text: 'Nager erkennen viel am Geruch, frisch geputzt wirkt der Käfig fremd.'},
    {id: 'nager-sozial-1', text: 'Meerschweinchen und Ratten brauchen Gesellschaft, Goldhamster nicht.'},
    {id: 'nager-hoeren-1', text: 'Vieles, was Nager einander sagen, ist für unsere Ohren zu hoch.'},
    {id: 'nager-lachen-1', text: 'Ratten lachen, wenn man sie kitzelt, nur eben im Ultraschall.'},
    {id: 'nager-backen-2', text: 'In ihren Backen tragen Hamster bis zu einem Fünftel ihres Gewichts.'},
    {id: 'nager-wort-1', text: 'Das Wort hamstern stammt tatsächlich vom Hamster.'},
    {id: 'nager-chinchilla-1', text: 'Chinchillas baden in Sand, ihr dichtes Fell würde nass kaum trocknen.'},
    {id: 'nager-heizung', months: HEATING, text: 'Direkt an der Heizung wird es Nagern jetzt zu warm und zu trocken.'},
    {id: 'nager-fruehling', months: SPRING, text: 'Im Frühjahr wechseln viele Nager das Fell, mehr Flaum ist normal.'},
    {
      id: 'nager-silvester',
      months: DECEMBER,
      text: 'An Silvester helfen Nagern ein ruhiger Raum und ein Tuch überm Käfig.',
    },
    {id: 'nager-gruen', months: GREEN, text: 'Das erste Grün ist da, Nager wollen jetzt wissen, wie es schmeckt.'},
    {
      id: 'nager-herbstlaub',
      months: LEAVES,
      text: 'In trockenem Herbstlaub wird gewühlt und versteckt, Nager lieben das.',
    },
    {
      id: 'nager-weihnachten',
      months: DECEMBER,
      text: 'Der Weihnachtsbaum ist Nagern egal, jede herabgefallene Nadel nicht.',
    },
  ],
};

export const GENERAL = [
  {id: 'allg-wasser-1', when: ['due'], text: 'Frisches Wasser gehört dazu, das von gestern schmeckt nach gestern.'},
  {id: 'allg-uhr-1', when: ['due'], text: 'Wer regelmäßig füttert, hat bald Tiere, die die Uhr lesen können.'},
  {id: 'allg-blick-1', when: ['due'], text: 'Blick zum Napf, zu dir, zum Napf: Diese Sprache versteht jeder.'},
  {
    id: 'allg-gewohnheit-1',
    when: ['due'],
    text: 'Mit dem Napf in der Hand hast du bei Tieren gerade den höchsten Rang.',
  },
  {
    id: 'allg-weihnachten',
    when: ['due'],
    months: DECEMBER,
    text: 'Im Dezember gerät vieles durcheinander, die Fütterzeit bleibt.',
  },
  {id: 'allg-stille-1', when: ['fresh'], text: 'Tiere brauchen nach dem Fressen Ruhe, der Staubsauger kann warten.'},
  {id: 'allg-putzen-1', when: ['fresh'], text: 'Nach dem Fressen wird bei vielen Tieren erst mal geputzt.'},
  {
    id: 'allg-verdauen-1',
    when: ['fresh'],
    text: 'Mit vollem Bauch werden auch Tiere müde, das Nickerchen gehört dazu.',
  },
  {id: 'allg-spiel-1', when: ['wait'], text: 'Bis dahin ein bisschen spielen, Bewegung gehört für Tiere zum Tag.'},
  {id: 'allg-suchen-1', when: ['wait'], text: 'Ein paar versteckte Happen, und Tiere haben bis dahin Programm.'},
  {id: 'allg-waage-1', when: ['wait'], text: 'Bis dahin vielleicht mal wiegen, die Waage sieht mehr als das Auge.'},
  {
    id: 'allg-hitze',
    when: ['wait'],
    months: SUMMER,
    text: 'Bei Hitze trinken Tiere mehr, ein Wassernapf im Schatten hilft.',
  },
  {
    id: 'allg-leckerli-1',
    when: ['evening'],
    text: 'Ein Leckerli zum Feierabend ist Zuwendung, Kalorien hat es trotzdem.',
  },
  {id: 'allg-napf-1', when: ['evening'], text: 'Zeit zum Spülen, einen ungespülten Napf riechen Tiere sofort.'},
  {id: 'allg-daemmerung-1', when: ['evening'], text: 'Viele Tiere werden in der Dämmerung noch einmal richtig munter.'},
  {
    id: 'allg-tagebuch-1',
    when: ['evening'],
    text: 'Wer abends mitschreibt, sieht bald Muster, die im Alltag untergehen.',
  },
  {
    id: 'allg-herbst',
    when: ['evening'],
    months: AUTUMN,
    text: 'Im Herbst wird der Schlafplatz wichtiger, die Kuscheldecke hat Saison.',
  },
  {id: 'allg-traum-1', when: ['night'], text: 'Auch Tiere haben Traumschlaf, ein Zucken im Schlaf ist ganz normal.'},
  {id: 'allg-zeit-1', when: ['night'], text: 'Tiere richten sich nach Licht und Bauch, nicht nach der Wanduhr.'},
  {
    id: 'allg-schlaf-1',
    when: ['night'],
    text: 'Viele Tiere schlafen in Etappen, die Nacht am Stück ist Menschensache.',
  },
  {id: 'allg-napf-2', text: 'Ein wackelnder Napf ist für Tiere eher Gegner als Geschirr.'},
  {id: 'allg-napf-3', text: 'Plastiknäpfe halten Gerüche in feinen Kratzern, Keramik nicht.'},
  {id: 'allg-nase-1', text: 'Tiere prüfen erst mit der Nase, der Blick ist nur die zweite Meinung.'},
  {id: 'allg-routine-1', text: 'Tiere lieben Routine, gleiche Zeiten und gleicher Platz geben Halt.'},
  {id: 'allg-neu-1', text: 'Neues Futter lieber nach und nach, Mägen mögen keine Überraschungen.'},
  {id: 'allg-spiel-2', text: 'Neues Spielzeug wird schnell Alltag, die Verpackung nicht.'},
  {id: 'allg-heizung', months: HEATING, text: 'Heizungsluft trocknet Nasen, Fell und Federn, frisches Wasser hilft.'},
  {id: 'allg-fruehling', months: SPRING, text: 'Mehr Licht im Frühling macht auch Tiere munterer.'},
  {id: 'allg-gruen', months: GREEN, text: 'Das erste Grün lockt Tiere ans Fenster, Frühling riecht eben anders.'},
  {
    id: 'allg-herbstlaub',
    months: LEAVES,
    text: 'Raschelndes Laub zählt für viele Tiere zu den spannendsten Geräuschen.',
  },
  {
    id: 'allg-silvester',
    months: DECEMBER,
    text: 'Silvester ist für die meisten Tiere kein Fest, ein Rückzugsort hilft.',
  },
  {
    id: 'allg-zeitumstellung-fruehling',
    day: year => lastSunday(year, 3),
    text: 'Die Uhr springt vor, für Tiere gibt es Frühstück heute gefühlt früher.',
  },
  {
    id: 'allg-zeitumstellung-herbst',
    day: year => lastSunday(year, 10),
    text: 'Die Uhr geht zurück, der Bauch der Tiere macht das nicht mit.',
  },
  {
    id: 'allg-silvester-tag',
    day: '12-31',
    text: 'Heute Abend knallt es, ein Rückzugsort hilft Tieren mehr als Zureden.',
  },
  {id: 'allg-neujahr', day: '01-01', text: 'Frohes neues Jahr! Tiere fragen trotzdem zuerst nach dem Frühstück.'},
  {id: 'allg-heiligabend', day: '12-24', text: 'Heiligabend, und für Tiere zählt vor allem die gewohnte Fütterzeit.'},
  {id: 'allg-haustiertag', day: '04-11', text: 'Tag des Haustiers: Extra-Streicheln erlaubt, Extra-Leckerli auch.'},
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

/* The diary below names every meal, so the variety is only named where it is news. Two lines at 360px hold about
   56 characters; stay under that. */
export const LEADS = {
  none: [
    '{names} {wartet} auf den ersten Eintrag im Tagebuch.',
    'Noch steht nichts im Tagebuch, {names} {wartet}.',
    'Das Tagebuch von {names} beginnt mit dem ersten Napf.',
  ],
  due: [
    'Futterzeit! Zuletzt gab’s {what} um {at}{by}.',
    'Zeit fürs {meal}, zuletzt gefüttert um {at}{by}.',
    'Futterzeit, zuletzt gab’s um {at} {what}{by}.',
  ],
  dueFirst: [
    'Futterzeit! Heute gab’s noch nichts.',
    'Zeit fürs {meal}, heute gab’s noch nichts.',
    'Futterzeit, heute ist noch nichts serviert.',
  ],
  fresh: ['{Ago} gab’s {what}{for}{by}.', '{what} gab’s {ago}{for}{by}.', 'Frisch serviert: {what}{for}{by}, {ago}.'],
  freshTreat: [
    '{Ago} gab’s {what} zum Naschen{for}{by}.',
    '{what} zum Naschen gab’s {ago}{for}{by}.',
    'Naschzeit: {what}{for}{by}, {ago}.',
  ],
  later: [
    '{meal} gegen {time}, zuletzt gefüttert um {at}{by}.',
    'Zuletzt um {at} gefüttert{by}, {meal} gegen {time}.',
    'Pause bis zum {meal} gegen {time}, zuletzt um {at}{by}.',
  ],
  morning: [
    'Heute noch nichts, {meal} gibt’s gegen {time}.',
    'Noch nichts im Napf heute, {meal} gegen {time}.',
    'Der Napf hat heute noch frei, {meal} gegen {time}.',
  ],
  done: [
    'Für heute alles serviert, zuletzt um {at}{by}.',
    'Feierabend am Napf, zuletzt gefüttert um {at}{by}.',
    'Alles serviert für heute, {meal} morgen gegen {time}.',
  ],
  night: [
    'Nachtruhe, {meal} gibt’s gegen {time}.',
    'Schlafenszeit, der Napf öffnet gegen {time}.',
    'Bis zum {meal} gegen {time} wird geschlafen.',
  ],
  today: [
    'Heute gab’s {so} {both}, zuletzt um {at}{by}.',
    'Zuletzt um {at} gefüttert{by}, heute {so} {both}.',
    '{Names} {hat} heute {so} {both} bekommen.',
  ],
  yesterday: [
    'Heute noch nichts, zuletzt gestern um {at}{by}.',
    'Heute steht noch nichts im Tagebuch, zuletzt gestern.',
    'Der Napf hat heute noch frei, zuletzt gestern um {at}.',
  ],
  lastNight: [
    'Zuletzt gab’s gestern {evening}um {at} {what}{by}.',
    'Das letzte Futter gab’s gestern {evening}um {at}.',
    'Gestern {evening}um {at} gab’s zuletzt {what}{by}.',
  ],
  older: [
    'Das letzte Futter gab’s {since}: {what}{by}.',
    'Zuletzt gab’s {since} {what}{by}, seitdem nichts.',
    'Im Tagebuch steht zuletzt {what}{by}, {since}.',
  ],
};

/* Short, so the line follows the lead instead of standing beside it. A {place} that can open a sentence must hold a
   capitalised word. */
export const LINES = {
  waiting: [
    '{names} {wartet} bestimmt schon neben dem Napf.',
    '{names} {uebt} schon mal den vorwurfsvollen Blick.',
    '{names} {hat} die Uhr bestimmt im Blick.',
    '{names} {sitzt} bestimmt schon vor dem Schrank.',
  ],
  birthdayAge: [
    '{pet} wird heute {age}, Extra-Leckerli erlaubt.',
    'Heute wird {pet} {age}, der Napf darf voller sein.',
    '{pet} hat Geburtstag und wird {age}, das Leckerli geht aufs Haus.',
  ],
  birthdayToday: [
    '{pet} hat heute Geburtstag, Extra-Leckerli erlaubt.',
    'Heute hat {pet} Geburtstag, der Napf darf voller sein.',
    'Geburtstag! {pet} feiert, das Leckerli geht aufs Haus.',
  ],
  birthdaySoon: [
    'In {days} hat {pet} Geburtstag.',
    'Noch {days}, dann hat {pet} Geburtstag.',
    '{pet} hat in {days} Geburtstag, das Geschenk gern fressbar.',
  ],
  birthdayTomorrow: [
    'Morgen hat {pet} Geburtstag.',
    'Noch einmal schlafen, dann hat {pet} Geburtstag.',
    'Morgen ist {pet} Geburtstagskind.',
  ],
  premiereLast: [
    'Das gab’s heute zum ersten Mal. Mutig!',
    'Zum ersten Mal im Napf, neues Futter, neues Glück.',
    'Eine Premiere, das stand noch nie im Napf.',
  ],
  premiere: [
    '{sort} gab’s heute zum ersten Mal. Mutig!',
    'Neu im Napf heute: {sort}.',
    'Premiere heute: {sort}, zum ersten Mal im Napf.',
  ],
  milestoneNext: [
    'Das nächste Füttern ist das {m}!',
    'Noch einmal füttern, dann steht das {m} Mal im Tagebuch.',
    'Beim nächsten Füttern ist das {m} Mal fällig.',
  ],
  milestone: [
    'Noch {n} bis zum {m}, fast ein Jubiläum.',
    'Noch {n} füttern, dann ist das {m} erreicht.',
    'Bis zum {m} fehlen noch {n}.',
  ],
  anniversary: [
    'Vor genau {span} ging’s hier los, {n} Mahlzeiten seitdem.',
    'Seit genau {span} im Tagebuch, {n} Mahlzeiten bisher.',
    'Heute vor {span} stand die erste Mahlzeit im Tagebuch.',
  ],
  recordStreak: [
    '{days} am Stück, so lang war die Serie noch nie.',
    'Neuer Rekord: {days} in Folge im Tagebuch.',
    '{days} ohne Lücke, länger als je zuvor.',
  ],
  recordDay: [
    'Schon {n} heute, so viele gab’s noch nie.',
    'Rekordtag: {n}, mehr als je zuvor.',
    '{n} heute, ein neuer Rekord.',
  ],
  earlier: [
    '{meal} war heute {span} früher dran.',
    '{meal} gab’s heute {span} früher, da hatte es wer eilig.',
    'Heute kam das {meal} {span} früher als sonst.',
  ],
  later: [
    '{meal} war heute {span} später dran.',
    '{meal} gab’s heute {span} später, der Napf hat gewartet.',
    'Heute kam das {meal} {span} später als sonst.',
  ],
  sameMinute: [
    'Auf die Minute wie gestern. Wer erzieht hier wen?',
    'Dieselbe Minute wie gestern, die innere Uhr läuft.',
    'Auf die Minute genau wie gestern, Zufall ist das nicht.',
  ],
  snacksCounted: ['Bei so vielen Snacks: {grip}', 'So viele Snacks an einem Tag: {grip}', 'Snacks über Snacks. {grip}'],
  snacks: ['Schon {n} heute: {grip}', 'Heute schon {n}. {grip}', '{n} an einem Tag: {grip}'],
  duel: [
    'Fütter-Duell der Woche: {first} führt {n} zu {m}.',
    '{first} liegt im Fütter-Duell vorn, {n} zu {m}. {second}, da geht was!',
    'Fütter-Duell: {first} führt mit {n} zu {m}, {second} muss ran.',
  ],
  duelTie: [
    'Fütter-Duell der Woche: {score}, Gleichstand.',
    'Gleichstand im Fütter-Duell, {score} für {first} und {second}.',
    '{first} und {second} liegen im Fütter-Duell gleichauf, {score}.',
  ],
  streak: [
    'Seit {since} lückenlos im Tagebuch.',
    '{days} in Folge eingetragen, das nennt man Routine.',
    'Seit {since} kein Tag ohne Eintrag.',
  ],
  idea: [
    'Mal wieder {sort}? Das gab’s seit {days} Tagen nicht.',
    '{sort} war zuletzt vor {days} Tagen dran.',
    'Lange nicht mehr im Napf: {sort}, seit {days} Tagen.',
  ],
  feedRun: [
    '{name} füttert seit {since} am Stück, {other} darf auch mal.',
    '{days} in Folge hat {name} gefüttert. {other}, du bist dran.',
    '{name} hat {days} in Folge gefüttert, {other} sieht zu.',
  ],
  feedRunAlone: [
    '{name} füttert seit {since} ohne Pause.',
    '{days} am Stück hat {name} gefüttert, zuverlässig wie ein Uhrwerk.',
    '{name} hat {days} in Folge gefüttert, Einsatz!',
  ],
  weekday: [
    '{weekday} gibt’s {meal} meist {shift}, heute um {time}.',
    '{weekday} läuft der Napf anders, {meal} heute um {time}.',
    'Am {day} ist {meal} meist {shift} dran, heute um {time}.',
  ],
  week: [
    'Diese Woche schon {meals} aus {sorts}.',
    'Speiseplan der Woche: {meals} aus {sorts}.',
    '{meals} aus {sorts} diese Woche, der Speiseplan steht.',
  ],
  lookback: [
    'Heute vor einem Jahr gab’s {sort}.',
    'Vor genau einem Jahr stand {sort} im Napf.',
    'Rückblick: Heute vor einem Jahr gab’s {sort}.',
  ],
  sorts: [
    'Schon {n} probiert, das Regal ist noch länger.',
    '{n} im Tagebuch, für Feinschmecker ein Anfang.',
    'Bis jetzt {n} probiert.',
  ],
  days: ['Seit {since} im Tagebuch.', 'Tag {n} im Tagebuch.', '{days} Tagebuch, und es geht weiter.'],
};
// values come escaped from the caller
export const fill = (template, values) => template.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? '');
