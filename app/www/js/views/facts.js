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
      text: 'Wer so leicht schläft wie deine Katze, hört jede Dose.',
    },
    {id: 'katze-zeit-1', when: ['due'], text: 'Katzen spüren die Uhrzeit, also geht deine Uhr nach.'},
    {id: 'katze-laute-1', when: ['due'], text: 'Unter sich miauen Katzen kaum, das Miau hier gilt dir.'},
    {id: 'katze-laute-3', when: ['due'], text: 'Wenn sie bettelt, schnurrt deine Katze mit Quengelton.'},
    {id: 'katze-tempo-1', when: ['due'], text: 'Mit bis zu 48 km/h ist deine Katze gleich am Napf.'},
    {id: 'katze-name-1', when: ['due'], text: 'Jetzt hört deine Katze sogar auf ihren Namen.'},
    {id: 'katze-sehen-1', when: ['due'], text: 'Nah sehen Katzen unscharf, da helfen die Schnurrhaare.'},
    {id: 'katze-riechen-1', when: ['due'], text: 'Katzen fressen nach Nase, und zimmerwarm duftet’s mehr.'},
    {id: 'katze-starren-1', when: ['due'], text: 'Der Blick von dir zum Napf ist Katzensprache für „los“.'},
    {id: 'katze-schlaf-3', when: ['fresh'], text: 'Pst, hier wird verdaut, und satte Katzen dösen dabei.'},
    {
      id: 'katze-jagd-2',
      when: ['fresh'],
      text: 'Aufs Fressen folgt das Putzen und dann ein Nickerchen.',
    },
    {id: 'katze-zunge-1', when: ['fresh'], text: 'Deine Katze kämmt sich gerade mit ihrer Hakenzunge.'},
    {
      id: 'katze-zaehne-1',
      when: ['fresh'],
      text: 'Kauen tun Katzen kaum, die schneiden und schlucken nur.',
    },
    {
      id: 'katze-territorium-2',
      when: ['fresh'],
      text: 'Als Einzelesser hat deine Katze dein Zuschauen notiert.',
    },
    {
      id: 'katze-temperatur-1',
      when: ['fresh'],
      text: 'Jetzt sucht deine Katze Wärme, sie friert eher als du.',
    },
    {
      id: 'katze-wasser-4',
      when: ['fresh'],
      text: 'Zum Nachspülen tunken manche Katzen die Pfote rein.',
    },
    {
      id: 'katze-mahlzeiten-1',
      when: ['wait'],
      text: 'Häppchen wären Katzen lieber, dein Plan sieht’s anders.',
    },
    {id: 'katze-schlaf-1', when: ['wait'], text: 'Bei 12 bis 16 Stunden Schlaf vergeht das Warten im Nu.'},
    {id: 'katze-fenster-1', when: ['wait'], text: 'Hörst du das Keckern? Deine Katze hat Vögel entdeckt.'},
    {id: 'katze-jagd-1', when: ['wait'], text: 'Auch satte Katzen jagen, frag die Socke unterm Sofa.'},
    {id: 'katze-box-1', when: ['wait'], text: 'Ein Karton beruhigt Katzen messbar, das ist kein Witz.'},
    {
      id: 'katze-hoehe-1',
      when: ['wait'],
      text: 'Vom Schrank aus behält deine Katze auch dich im Blick.',
    },
    {id: 'katze-nacht-1', when: ['evening'], text: 'Wenn es dämmert, wird deine Katze erst richtig wach.'},
    {
      id: 'katze-zoomies-1',
      when: ['evening'],
      text: 'Abends flitzen Katzen grundlos herum, das gehört dazu.',
    },
    {
      id: 'katze-kneten-1',
      when: ['evening'],
      text: 'Knetet deine Katze deinen Schoß, bist du gerade Mama.',
    },
    {
      id: 'katze-schnurren-2',
      when: ['evening'],
      text: 'Dein Feierabend klingt nach 25 bis 150 Hertz Schnurren.',
    },
    {
      id: 'katze-koerper-1',
      when: ['evening'],
      text: 'Blinzel langsam zurück, das verstehen Katzen als Gruß.',
    },
    {
      id: 'katze-koerper-3',
      when: ['evening'],
      text: 'Bauch zeigen heißt bei Katzen Vertrauen, nicht Kraulen.',
    },
    {id: 'katze-sehen-2', when: ['night'], text: 'Ganz ohne Licht sieht auch deine Katze nichts.'},
    {
      id: 'katze-nacht-2',
      when: ['night'],
      text: 'Schlaf gut, im Morgengrauen ist deine Katze schon wach.',
    },
    {
      id: 'katze-hoeren-1',
      when: ['night'],
      text: 'Katzen hören Ultraschall, also auch die Maus im Keller.',
    },
    {
      id: 'katze-hoeren-2',
      when: ['night'],
      text: 'Katzen drehen die Ohren einzeln, eins hat Nachtschicht.',
    },
    {id: 'katze-tuer-1', when: ['night'], text: 'Schließt du die Tür, fehlt der Katze ein Stück Revier.'},
    {
      id: 'katze-mahlzeiten-2',
      when: ['night'],
      text: 'Katzen lieben Routine, also wirst du pünktlich geweckt.',
    },
    {
      id: 'katze-gang-1',
      when: ['night'],
      text: 'Katzen treten in die eigene Spur, darum hörst du nix.',
    },
    {id: 'katze-schmecken-1', text: 'Keine Katze schmeckt Süßes, bei Sahne lockt das Fett.'},
    {id: 'katze-schmecken-2', text: 'Katzen schmecken weniger als du, meckern aber mehr.'},
    {id: 'katze-sehen-3', text: 'Das rote Spielzeug sieht für deine Katze eher grau aus.'},
    {id: 'katze-nase-2', text: 'Zieht deine Katze Grimassen? Dann riecht sie am Gaumen.'},
    {id: 'katze-zitrus-1', text: 'Deine Orange ist sicher, denn Katzen meiden Zitrusduft.'},
    {id: 'katze-milch-1', text: 'Milch macht Katzen oft Bauchweh, das Bilderbuch lügt.'},
    {id: 'katze-schnurrhaare-1', text: 'In flachen Schalen stoßen die Schnurrhaare nirgends an.'},
    {id: 'katze-pfote-1', text: 'Kater angeln öfter mit links, Kätzinnen mit rechts.'},
    {id: 'katze-korb-1', text: 'Gegen die Papiertüte verliert jedes teure Katzenbett.'},
    {id: 'katze-schulter-1', text: 'Lose Schlüsselbeine bringen Katzen durch enge Spalten.'},
    {id: 'katze-koepfchen-1', text: 'Köpfchen ist eine Duftmarke, du gehörst jetzt der Katze.'},
    {id: 'katze-koerper-2', text: 'Steht der Schwanz senkrecht, sagt deine Katze „Hallo“.'},
    {id: 'katze-bad-1', text: 'Katzen folgen dir aufs Klo, da hast du ja endlich Zeit.'},
    {id: 'katze-tastatur-1', text: 'Katzen mögen die warme Tastatur, da schaust du eh hin.'},
    {id: 'katze-sonne-1', text: 'Wandert der Sonnenfleck, zieht deine Katze mit um.'},
    {id: 'katze-wasser-3', text: 'Trotz vollem Napf trinken viele Katzen lieber am Hahn.'},
    {id: 'katze-geruch-2', text: 'Mit der Wange macht deine Katze das neue Sofa zu ihrem.'},
    {id: 'katze-alter-3', text: 'Creme Puff wurde 38 Jahre alt und verschlief das meiste.'},
    {
      id: 'katze-hitze-1',
      when: ['wait'],
      months: SUMMER,
      text: 'Wenn’s heiß ist, frisst deine Katze lieber am Abend.',
    },
    {
      id: 'katze-hitze-2',
      months: SUMMER,
      text: 'Nur an den Pfoten schwitzen Katzen, sonst hilft Spucke.',
    },
    {
      id: 'katze-heizung-1',
      when: ['evening'],
      months: HEATING,
      text: 'Abends wird die Heizung zum Hochbett deiner Katze.',
    },
    {
      id: 'katze-fell-fruehling',
      months: SPRING,
      text: 'Beim Fellwechsel schont Bürsten Sofa und Katzenmagen.',
    },
    {
      id: 'katze-fell-herbst',
      months: AUTUMN,
      text: 'Jetzt wächst das Winterfell, und das ist kein Speck.',
    },
    {
      id: 'katze-herbstlaub',
      when: ['wait'],
      months: LEAVES,
      text: 'Laub raschelt wie eine Maus, also wird es gejagt.',
    },
    {id: 'katze-gruen', months: GREEN, text: 'Warum Katzen Gras knabbern, weiß noch keiner so genau.'},
    {
      id: 'katze-silvester',
      months: DECEMBER,
      text: 'Bei Silvesterkrach hilft ein Versteck mehr als Zureden.',
    },
    {
      id: 'katze-weihnachten',
      months: DECEMBER,
      text: 'Lass das Lametta weg, deine Katze klettert in den Baum.',
    },
    {id: 'katze-weltkatzentag', day: '08-08', text: 'Heute ist Weltkatzentag, bei dir ist das ja jeden Tag.'},
  ],
  Hund: [
    {id: 'hund-nase-1', when: ['due'], text: 'Dein Hund riecht das Futter durch die Schranktür.'},
    {id: 'hund-zeit-1', when: ['due'], text: 'Dein Hund liest keine Uhr, zu spät bist trotzdem du.'},
    {id: 'hund-ohren-1', when: ['due'], text: 'Alle 18 Ohrmuskeln deines Hundes zielen auf die Küche.'},
    {id: 'hund-speichel-1', when: ['due'], text: 'Klappert der Napf, sabbert dein Hund wie bei Pawlow.'},
    {id: 'hund-rudel-1', when: ['due'], text: 'Deine Routinen kennen Hunde besser als dein Kalender.'},
    {id: 'hund-laute-1', when: ['due'], text: 'Bellen kann vieles heißen, gerade heißt es nur eins.'},
    {id: 'hund-koerper-1', when: ['due'], text: 'Gähnt dein Hund jetzt, ist er bloß furchtbar gespannt.'},
    {id: 'hund-schlaf-1', when: ['fresh'], text: 'Jetzt wird gedöst, Hunde schlafen ja 12 bis 14 Stunden.'},
    {id: 'hund-wasser-1', when: ['fresh'], text: 'Hundezungen schöpfen rückwärts, so entsteht die Pfütze.'},
    {id: 'hund-ruhe-1', when: ['fresh'], text: 'Nach dem Fressen ist Siesta, gerade für große Hunde.'},
    {
      id: 'hund-magen-1',
      when: ['fresh'],
      text: 'Viel kauen Hunde nicht, das erledigt ihr saurer Magen.',
    },
    {id: 'hund-teppich-1', when: ['fresh'], text: 'Als Serviette nehmen Hunde den Teppich oder dein Bein.'},
    {id: 'hund-nase-4', when: ['wait'], text: 'Für Hunde ist jeder Laternenpfahl ein Gruppenchat.'},
    {id: 'hund-hoeren-1', when: ['wait'], text: 'Dein Hund hört die Post schon an der Ecke, du dann ihn.'},
    {id: 'hund-koerper-2', when: ['wait'], text: 'Streckt dein Hund den Po hoch, will er mit dir spielen.'},
    {id: 'hund-nase-6', when: ['wait'], text: 'Vielleicht misst dein Hund die Zeit an deinem Duft.'},
    {id: 'hund-buddeln-1', when: ['wait'], text: 'Vorräte vergraben Hunde gern, und zwar in deinem Beet.'},
    {
      id: 'hund-kreis-1',
      when: ['evening'],
      text: 'Hunde drehen sich ins Bett wie einst im hohen Gras.',
    },
    {
      id: 'hund-kauen-1',
      when: ['evening'],
      text: 'Kauen beruhigt, so wird der Knochen zum Feierabendbier.',
    },
    {
      id: 'hund-blick-1',
      when: ['evening'],
      text: 'Schaut ihr euch lange an, gibt’s für beide Oxytocin.',
    },
    {id: 'hund-rhythmus-1', when: ['evening'], text: 'Sobald du dich hinsetzt, legt sich dein Hund auch hin.'},
    {
      id: 'hund-schnueffeln-1',
      when: ['evening'],
      text: 'Schnüffeln macht müde, dein Hund schläft heute tief.',
    },
    {id: 'hund-schlaf-2', when: ['night'], text: 'Zucken die Pfoten, jagt dein Hund ein Traumkaninchen.'},
    {id: 'hund-traum-2', when: ['night'], text: 'Kleine Hunde träumen Kurzfilme, große eher Spielfilme.'},
    {id: 'hund-schnarchen-1', when: ['night'], text: 'Wenn’s schnarcht, ist oft ein kurznasiger Hund schuld.'},
    {id: 'hund-sehen-2', when: ['night'], text: 'Im Halbdunkel sehen Hunde besser, stolpern tust nur du.'},
    {id: 'hund-schlaf-3', when: ['night'], text: 'Zwischen zwei Nickerchen prüft dein Hund kurz die Lage.'},
    {id: 'hund-schlaf-4', when: ['night'], text: 'Wird’s kühl, rollt sich dein Hund zur Brezel zusammen.'},
    {id: 'hund-schmecken-1', text: 'Bei nur rund 1700 Geschmacksknospen isst die Nase mit.'},
    {id: 'hund-schmecken-2', text: 'Hunde schmecken Süßes, der Kuchenblick ist kein Witz.'},
    {id: 'hund-nase-2', text: 'Hunde riechen in Stereo, mit jedem Nasenloch für sich.'},
    {id: 'hund-nase-3', text: 'Damit Duft kleben bleibt, ist die Hundenase nass.'},
    {id: 'hund-rute-2', text: 'Wedelt dein Hund zu seiner Rechten, freut er sich.'},
    {id: 'hund-regen-1', text: 'Dein Hund findet Regen doof und Pfützen herrlich.'},
    {id: 'hund-alter-1', text: 'Je größer ein Hund, desto schneller altert er leider.'},
    {id: 'hund-sehen-1', text: 'Ein roter Ball im Gras ist für Hunde ein Suchbild.'},
    {id: 'hund-zaehne-1', text: 'Dein Hund hat zehn Zähne mehr als du und putzt keinen.'},
    {id: 'hund-tragen-1', text: 'Zur Begrüßung schenkt dein Hund dir gern deinen Schuh.'},
    {id: 'hund-frisur-1', text: 'Neue Frisur ist Hunden egal, neues Parfüm ein Skandal.'},
    {id: 'hund-kopf-1', text: 'Bei „Gassi“ legt dein Hund lauschend den Kopf schief.'},
    {id: 'hund-laecheln-1', text: 'Hängt die Zunge locker raus, lächelt dein Hund.'},
    {id: 'hund-welpe-1', text: 'Welpen sind anfangs blind und taub, riechen aber schon.'},
    {
      id: 'hund-zeit-2',
      when: ['due'],
      months: [3, 10],
      text: 'Die neue Uhrzeit lernt dein Hund in etwa einer Woche.',
    },
    {
      id: 'hund-hitze-1',
      when: ['wait'],
      months: SUMMER,
      text: 'Bei Hitze trinken Hunde mehr, der Napf will Schatten.',
    },
    {
      id: 'hund-asphalt-1',
      when: ['wait'],
      months: SUMMER,
      text: 'Ist der Asphalt der Hand zu heiß, dann den Pfoten auch.',
    },
    {
      id: 'hund-schwitzen-1',
      months: SUMMER,
      text: 'Hunde haben Schweißpfoten, kühlen aber mit der Zunge.',
    },
    {
      id: 'hund-heizung-1',
      when: ['evening'],
      months: HEATING,
      text: 'Trotz Pelz hat dein Hund den Heizungsplatz reserviert.',
    },
    {
      id: 'hund-fell-fruehling',
      months: SPRING,
      text: 'Das Winterfell zieht gerade aus, leider in jede Ecke.',
    },
    {
      id: 'hund-fell-herbst',
      months: AUTUMN,
      text: 'Mit dem Winterfell wird dein Hund langsam zum Teddy.',
    },
    {
      id: 'hund-herbstlaub',
      when: ['wait'],
      months: LEAVES,
      text: 'Laub ist ein Hundefest, die Andenken liegen im Flur.',
    },
    {id: 'hund-regen-2', months: LEAVES, text: 'Nasse Hunde riechen nach nassem Hund, das ist Chemie.'},
    {
      id: 'hund-gruen',
      when: ['wait'],
      months: GREEN,
      text: 'Im Frühjahr grast dein Hund beim Gassi wie ein Schaf.',
    },
    {id: 'hund-silvester', months: DECEMBER, text: 'Silvester ist Hundeohren zu laut, ein Versteck hilft.'},
    {
      id: 'hund-weihnachten',
      months: DECEMBER,
      text: 'Hunde markieren Bäume, nur der im Wohnzimmer ist tabu.',
    },
    {id: 'hund-welthundetag', day: '10-10', text: 'Heute ist Welthundetag, für Hunde ist das jeder Tag.'},
  ],
  Kaninchen: [
    {id: 'kaninchen-sehen-1', when: ['due'], text: 'Vorm Maul ist dein Kaninchen blind, also schnuppert es.'},
    {
      id: 'kaninchen-hoeren-1',
      when: ['due'],
      text: 'Jedes Ohr dreht für sich, und jetzt zeigen beide zu dir.',
    },
    {
      id: 'kaninchen-nase-1',
      when: ['due'],
      text: 'Das Näschen wackelt vor lauter Aufregung jetzt im Turbo.',
    },
    {
      id: 'kaninchen-zeit-1',
      when: ['due'],
      text: 'Kaninchen lernen Routinen fix, vor allem die Futterzeit.',
    },
    {
      id: 'kaninchen-verdauung-1',
      when: ['fresh'],
      text: 'Das bleibt drin, denn Kaninchen können nicht erbrechen.',
    },
    {
      id: 'kaninchen-trinken-1',
      when: ['fresh'],
      text: 'Aus der Schale trinken Kaninchen mehr als aus Flaschen.',
    },
    {
      id: 'kaninchen-putzen-1',
      when: ['fresh'],
      text: 'Jetzt wird geputzt, da ist ein Kaninchen wie eine Katze.',
    },
    {
      id: 'kaninchen-flop-1',
      when: ['fresh'],
      text: 'Falls dein Kaninchen gleich umkippt, entspannt es bloß.',
    },
    {
      id: 'kaninchen-daemmerung-1',
      when: ['wait'],
      text: 'Bis zur Dämmerung wird gedöst, dann steigt die Party.',
    },
    {
      id: 'kaninchen-zaehne-1',
      when: ['wait'],
      text: 'Genagt wird ständig, weil die Zähne lebenslang wachsen.',
    },
    {
      id: 'kaninchen-buddeln-1',
      when: ['wait'],
      text: 'Eine Sandkiste zum Buddeln rettet so manchen Teppich.',
    },
    {id: 'kaninchen-nacht-1', when: ['wait'], text: 'Starrt dein Kaninchen ins Leere, döst es vielleicht nur.'},
    {
      id: 'kaninchen-magen-1',
      when: ['wait'],
      text: 'Im Kaninchenmagen schiebt neues Futter das alte weiter.',
    },
    {
      id: 'kaninchen-heu-1',
      when: ['evening'],
      text: 'An der Heuraufe gibt’s auch abends keinen Küchenschluss.',
    },
    {
      id: 'kaninchen-sozial-2',
      when: ['evening'],
      text: 'Stupst dein Kaninchen dich an, sollst du weiterkraulen.',
    },
    {
      id: 'kaninchen-laute-2',
      when: ['evening'],
      text: 'Das leise Knirschen beim Kraulen ist Kaninchenschnurren.',
    },
    {
      id: 'kaninchen-binky-1',
      when: ['evening'],
      text: 'Ein Sprung mit Schraube heißt Binky und ist pures Glück.',
    },
    {
      id: 'kaninchen-daemmerung-2',
      when: ['evening'],
      text: 'Abends dreht dein Kaninchen auf, während du gähnst.',
    },
    {
      id: 'kaninchen-laute-1',
      when: ['night'],
      text: 'Wenn es nachts klopft, trommelt dein Kaninchen Alarm.',
    },
    {
      id: 'kaninchen-verdauung-2',
      when: ['night'],
      text: 'Blinddarmkot ist der Nachtsnack, den Kaninchen brauchen.',
    },
    {
      id: 'kaninchen-schlaf-1',
      when: ['night'],
      text: 'Dein Kaninchen schläft in Häppchen und frisst genauso.',
    },
    {id: 'kaninchen-sozial-1', text: 'Kaninchen brauchen Kaninchen, du bist da eher Personal.'},
    {id: 'kaninchen-sprung-1', text: 'Zäune bis einen Meter schafft dein Kaninchen im Sprung.'},
    {id: 'kaninchen-ohren-2', text: 'Die langen Ohren sind die Klimaanlage deines Kaninchens.'},
    {id: 'kaninchen-heu-2', text: 'Heu ist der Hauptgang, und alles andere ist nur Beilage.'},
    {id: 'kaninchen-nager-1', text: 'Dein Kaninchen ist kein Nagetier, es nagt nur beruflich.'},
    {id: 'kaninchen-sehen-2', text: 'Schleich dich ruhig an, ein Kaninchen sieht fast rundum.'},
    {
      id: 'kaninchen-hitze',
      when: ['wait'],
      months: SUMMER,
      text: 'Hitze schadet mehr als Kälte, also tut eine Fliese gut.',
    },
    {id: 'kaninchen-heizung', months: HEATING, text: 'Mit dem Pelz braucht dein Kaninchen keine Heizungsluft.'},
    {
      id: 'kaninchen-fell-fruehling',
      months: SPRING,
      text: 'Bürsten erspart deinem Kaninchen jetzt Haare im Magen.',
    },
    {
      id: 'kaninchen-fell-herbst',
      months: AUTUMN,
      text: 'Das Winterfell wächst, und dein Kaninchen wird kugelig.',
    },
    {
      id: 'kaninchen-gruen',
      when: ['due'],
      months: SPRING,
      text: 'Frisches Gras lockt, aber der Bauch braucht erst Übung.',
    },
    {
      id: 'kaninchen-herbstlaub',
      when: ['wait'],
      months: LEAVES,
      text: 'Ein Laubhaufen ist für Kaninchen Bällebad und Snackbar.',
    },
    {
      id: 'kaninchen-silvester',
      months: DECEMBER,
      text: 'Bei Böllern hilft deinem Kaninchen ein dunkles Versteck.',
    },
    {
      id: 'kaninchen-weihnachten',
      months: DECEMBER,
      text: 'Kaninchen naschen am Christbaum, leider auch am Kabel.',
    },
    {
      id: 'kaninchen-weltkaninchentag',
      day: year => nthSaturday(year, 9, 4),
      text: 'Zum Weltkaninchentag geht der Löwenzahn heute aufs Haus.',
    },
  ],
  Vogel: [
    {
      id: 'vogel-herz-1',
      when: ['due'],
      text: 'Wer Hunderte Herzschläge pro Minute hat, wartet ungern.',
    },
    {id: 'vogel-hoeren-1', when: ['due'], text: 'Ohne Ohrmuscheln hört dein Vogel jede Tüte rascheln.'},
    {id: 'vogel-sozial-2', when: ['due'], text: 'Pickt einer, picken alle, nur fehlt gerade das Futter.'},
    {id: 'vogel-kopf-1', when: ['due'], text: 'Merkst du, wie weit dein Vogel den Kopf nach dir dreht?'},
    {id: 'vogel-koerner-1', when: ['fresh'], text: 'Jedes Korn ist geschält, die Schalen sind für dich.'},
    {id: 'vogel-schnabel-1', when: ['fresh'], text: 'Die Sitzstange muss jetzt als Serviette herhalten.'},
    {id: 'vogel-magen-1', when: ['fresh'], text: 'Gekaut wird nicht, das erledigt jetzt der Muskelmagen.'},
    {
      id: 'vogel-kropf-1',
      when: ['fresh'],
      text: 'Das Futter parkt jetzt im Kropf, aber nur ganz kurz.',
    },
    {id: 'vogel-federn-1', when: ['wait'], text: 'Bis dahin wird geölt, das Öl macht dein Vogel selbst.'},
    {id: 'vogel-baden-1', when: ['wait'], text: 'Wird bis dahin gebadet, badet die Tapete gleich mit.'},
    {
      id: 'vogel-stoffwechsel-1',
      when: ['wait'],
      text: 'Kleine Vögel tanken oft, ihr Motor läuft eben schnell.',
    },
    {id: 'vogel-zweige-1', when: ['wait'], text: 'Mit einem frischen Zweig wird bis dahin geschnitzt.'},
    {
      id: 'vogel-hitze',
      when: ['wait'],
      months: SUMMER,
      text: 'Bei Hitze hecheln Vögel, und ein Bad kühlt sie ab.',
    },
    {
      id: 'vogel-schlaf-3',
      when: ['evening'],
      text: 'Vögel schlafen zehn bis zwölf Stunden, beneidest du sie?',
    },
    {
      id: 'vogel-abend-1',
      when: ['evening'],
      text: 'Vorm Schlafen tratscht der Schwarm noch eine Runde.',
    },
    {
      id: 'vogel-licht-winter',
      when: ['evening'],
      months: [11, 12, 1],
      text: 'Im Winter gehen Vögel schon mit der Sonne schlafen.',
    },
    {
      id: 'vogel-schlaf-1',
      when: ['night'],
      text: 'Dein Vogel schläft auf einem Bein, das andere hat frei.',
    },
    {id: 'vogel-schlaf-2', when: ['night'], text: 'Vielleicht döst nur eine Hirnhälfte, die andere wacht.'},
    {id: 'vogel-nacht-1', when: ['night'], text: 'Nymphis erschrecken nachts leicht, da hilft ein Licht.'},
    {id: 'vogel-licht-1', when: ['night'], text: 'Beim ersten Licht ist dein Vogel wach, du leider auch.'},
    {id: 'vogel-schmecken-1', text: 'Ein paar Hundert Geschmacksknospen reichen zum Mäkeln.'},
    {id: 'vogel-sehen-1', text: 'Vögel sehen UV, und darin ist dein Vogel noch bunter.'},
    {id: 'vogel-sprache-1', text: 'Das Schimpfwort von vorhin übt dein Welli sicher schon.'},
    {id: 'vogel-sozial-1', text: 'Ein Vogel allein langweilt sich, zu zweit ist mehr los.'},
    {id: 'vogel-kanarien-1', text: 'Der Kanarienhahn singt, und die Henne gibt die Noten.'},
    {id: 'vogel-heizung', months: HEATING, text: 'Heizungsluft ist Vögeln zu trocken, Duschen tut gut.'},
    {
      id: 'vogel-mauser',
      months: [8, 9, 10],
      text: 'Es ist Mauserzeit, bald reicht’s für ein Kopfkissen.',
    },
    {
      id: 'vogel-fruehling',
      months: SPRING,
      text: 'Im Frühling wird gesungen, egal was der Nachbar sagt.',
    },
    {id: 'vogel-gruen', months: GREEN, text: 'Vogelmiere sprießt wieder, die heißt nicht umsonst so.'},
    {id: 'vogel-herbstlaub', months: LEAVES, text: 'Ein Ast mit Herbstlaub wird fachgerecht geschreddert.'},
    {
      id: 'vogel-silvester',
      months: DECEMBER,
      text: 'Wenn es an Silvester knallt, helfen ein Tuch und Ruhe.',
    },
  ],
  Nager: [
    {
      id: 'nager-kuehlschrank-1',
      when: ['due'],
      text: 'Geht der Kühlschrank auf, pfeift das Meerschwein los.',
    },
    {id: 'nager-riechen-2', when: ['due'], text: 'Dein Nager riecht das Futter längst in deiner Tasche.'},
    {id: 'nager-uhr-1', when: ['due'], text: 'Ratten spüren die Futterzeit und tigern schon mal los.'},
    {
      id: 'nager-vitamin-1',
      when: ['due'],
      text: 'Meerschweine bilden kein Vitamin C, da hilft Paprika.',
    },
    {
      id: 'nager-zaehne-1',
      when: ['fresh'],
      text: 'Nagerzähne wachsen ständig, und Mampfen hält sie kurz.',
    },
    {
      id: 'nager-hamstern-1',
      when: ['fresh'],
      text: 'Hamsterfutter reist erst in den Backen bis ins Nest.',
    },
    {id: 'nager-popcorn-1', when: ['fresh'], text: 'Hüpft’s gleich im Käfig, popcornt dein Meerschwein.'},
    {id: 'nager-atem-1', when: ['fresh'], text: 'Am Atem der anderen riecht eine Ratte, was es gab.'},
    {
      id: 'nager-herbst-vorrat',
      when: ['fresh'],
      months: AUTUMN,
      text: 'Merkst du, wie der Hamster im Herbst mehr bunkert?',
    },
    {id: 'nager-stopfmagen-1', when: ['wait'], text: 'Sein Stopfmagen lässt das Meerschwein dauernd knabbern.'},
    {id: 'nager-tagschlaf-1', when: ['wait'], text: 'Tagsüber schläft der Hamster und nimmt Wecken übel.'},
    {id: 'nager-degu-1', when: ['wait'], text: 'Degus sind am Tag wach, worüber der Hamster nur gähnt.'},
    {
      id: 'nager-hitze',
      when: ['wait'],
      months: SUMMER,
      text: 'Eine kühle Fliese ist Gold, weil Nager kaum schwitzen.',
    },
    {
      id: 'nager-abend-1',
      when: ['evening'],
      text: 'Dein Hamster steht jetzt auf, für ihn ist es Morgen.',
    },
    {
      id: 'nager-schlaf-1',
      when: ['evening'],
      text: 'Ein Meerschwein schläft auch abends nur in Häppchen.',
    },
    {
      id: 'nager-abend-2',
      when: ['evening'],
      text: 'Bei Dämmerung fangen Ratten und Mäuse ihre Schicht an.',
    },
    {id: 'nager-nacht-1', when: ['night'], text: 'Im Käfig ist Rushhour, denn Nager sind oft nachtaktiv.'},
    {
      id: 'nager-laufrad-2',
      when: ['night'],
      text: 'Hamster laufen nachts bis zu zehn Kilometer im Kreis.',
    },
    {id: 'nager-augen-1', when: ['night'], text: 'Ein Meerschwein kann dich angucken und dabei schlafen.'},
    {id: 'nager-riechen-1', text: 'Nach dem Käfigputz riecht für Nager alles nach Umzug.'},
    {id: 'nager-sozial-1', text: 'Ratten wollen eine WG, während Goldhamster solo wohnen.'},
    {id: 'nager-hoeren-1', text: 'Vieles, was Nager tratschen, hörst du zum Glück nicht.'},
    {id: 'nager-lachen-1', text: 'Kitzelst du eine Ratte, lacht sie, nur im Ultraschall.'},
    {id: 'nager-backen-2', text: 'Bis zu ein Fünftel vom Hamster passt in seine Backen.'},
    {id: 'nager-wort-1', text: 'Das Wort „hamstern“ hat sich der Hamster verdient.'},
    {id: 'nager-chinchilla-1', text: 'Chinchillas baden in Sand, weil Wasser ein Drama wär’.'},
    {id: 'nager-heizung', months: HEATING, text: 'Neben der Heizung hockt dein Nager quasi in der Sauna.'},
    {id: 'nager-fruehling', months: SPRING, text: 'Im Frühjahr haart dein Nager, und der Sauger merkt’s.'},
    {
      id: 'nager-silvester',
      months: DECEMBER,
      text: 'Ein stilles Zimmer hilft Nagern gut durch Silvester.',
    },
    {id: 'nager-gruen', months: GREEN, text: 'Das erste Grün sprießt, und dein Meerschwein freut sich.'},
    {
      id: 'nager-herbstlaub',
      months: LEAVES,
      text: 'Im trockenen Laub tobt dein Nager wie im Bällebad.',
    },
    {
      id: 'nager-weihnachten',
      months: DECEMBER,
      text: 'Christbaumnadeln locken Nager, tun ihnen aber nicht gut.',
    },
  ],
};

export const GENERAL = [
  {id: 'allg-wasser-1', when: ['due'], text: 'Altes Wasser schmeckt nach gestern, füll frisches auf.'},
  {id: 'allg-uhr-1', when: ['due'], text: 'Tiere haben eine innere Uhr, und die klingelt gerade.'},
  {id: 'allg-blick-1', when: ['due'], text: 'Wer vom Napf zu dir und zurück schaut, meint es ernst.'},
  {
    id: 'allg-gewohnheit-1',
    when: ['due'],
    text: 'Sobald du den Napf in der Hand hast, bist du der Star.',
  },
  {
    id: 'allg-weihnachten',
    when: ['due'],
    months: DECEMBER,
    text: 'Im Dezember steht alles Kopf, nur die Fütterzeit nicht.',
  },
  {id: 'allg-stille-1', when: ['fresh'], text: 'Nach dem Fressen will kein Tier den Staubsauger hören.'},
  {id: 'allg-putzen-1', when: ['fresh'], text: 'Wird schon geputzt? Tiere haben eben Tischmanieren.'},
  {
    id: 'allg-verdauen-1',
    when: ['fresh'],
    text: 'Ein voller Bauch macht auch Tieren schwere Lider.',
  },
  {id: 'allg-spiel-1', when: ['wait'], text: 'Eine Spielrunde zwischendurch hält Kopf und Körper fit.'},
  {id: 'allg-suchen-1', when: ['wait'], text: 'Versteckte Happen machen das Warten zur Schatzsuche.'},
  {id: 'allg-waage-1', when: ['wait'], text: 'Was Fell und Federn verstecken, zeigt dir die Waage.'},
  {
    id: 'allg-hitze',
    when: ['wait'],
    months: SUMMER,
    text: 'Bei Hitze wird Wasser in der Sonne schnell zur Suppe.',
  },
  {
    id: 'allg-leckerli-1',
    when: ['evening'],
    text: 'Ein Leckerli zum Abend ist Liebe, und die hat Kalorien.',
  },
  {id: 'allg-napf-1', when: ['evening'], text: 'Spül den Napf abends aus, sonst feiern die Keime durch.'},
  {id: 'allg-daemmerung-1', when: ['evening'], text: 'Viele Tiere drehen in der Dämmerung erst richtig auf.'},
  {
    id: 'allg-tagebuch-1',
    when: ['evening'],
    text: 'Dein Tagebuch weiß noch, was du längst vergessen hast.',
  },
  {
    id: 'allg-herbst',
    when: ['evening'],
    months: AUTUMN,
    text: 'Im Herbst ist der wärmste Schlafplatz hart umkämpft.',
  },
  {id: 'allg-traum-1', when: ['night'], text: 'Wenn Tiere im Schlaf zucken, läuft gerade Traumkino.'},
  {id: 'allg-zeit-1', when: ['night'], text: 'Tiere ticken nach Licht und Bauch, nicht nach der Uhr.'},
  {
    id: 'allg-schlaf-1',
    when: ['night'],
    text: 'Du schläfst am Stück, viele Tiere dagegen in Etappen.',
  },
  {id: 'allg-napf-2', text: 'Wackelt der Napf, wird jede Mahlzeit zum Ringkampf.'},
  {id: 'allg-napf-3', text: 'Ein zerkratzter Plastiknapf merkt sich jeden Geruch.'},
  {id: 'allg-nase-1', text: 'Viele Tiere glauben erst, was sie gerochen haben.'},
  {id: 'allg-routine-1', text: 'Routine klingt öde, aber Tieren gibt sie richtig Halt.'},
  {id: 'allg-neu-1', text: 'Stell Futter langsam um, Mägen mögen keine Abenteuer.'},
  {id: 'allg-spiel-2', text: 'Spielzeug im Wechsel bleibt neu, doch der Karton siegt.'},
  {id: 'allg-heizung', months: HEATING, text: 'Heizungsluft trocknet aus, stell ruhig mehr Wasser hin.'},
  {id: 'allg-fruehling', months: SPRING, text: 'Frühlingsgefühle sind echt, schuld ist das viele Licht.'},
  {id: 'allg-gruen', months: GREEN, text: 'Den Frühling riechen Tiere schon, bevor du ihn siehst.'},
  {
    id: 'allg-herbstlaub',
    months: LEAVES,
    text: 'Raschelt’s im Laub, sind Tierohren sofort auf Empfang.',
  },
  {
    id: 'allg-silvester',
    months: DECEMBER,
    text: 'Bau das Silvesterversteck früh, dann ist’s vertraut.',
  },
  {
    id: 'allg-zeitumstellung-fruehling',
    day: year => lastSunday(year, 3),
    text: 'Die Uhr springt vor, und keiner hat die Tiere gefragt.',
  },
  {
    id: 'allg-zeitumstellung-herbst',
    day: year => lastSunday(year, 10),
    text: 'Kein Bauch kennt die Winterzeit, heute knurrt’s früher.',
  },
  {
    id: 'allg-silvester-tag',
    day: '12-31',
    text: 'Heute knallt’s, hol alle rein und zieh die Vorhänge zu.',
  },
  {id: 'allg-neujahr', day: '01-01', text: 'Tiere haben keine Vorsätze fürs neue Jahr, nur Hunger.'},
  {id: 'allg-heiligabend', day: '12-24', text: 'Die Gans ist für dich, Tiere bleiben heute beim Napf.'},
  {id: 'allg-haustiertag', day: '04-11', text: 'Heute ist Tag des Haustiers, also gilt Streichelpflicht.'},
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

/* The cards below show every meal, when and by whom, so a lead never says that again: it tells where the day stands
   and what comes next. Only a meal older than the diary on the home page is named. Each wording is one natural
   sentence and says one thing; with the aside, three lines at 393px hold about 100 characters. */
export const LEADS = {
  none: [
    '{names} {wartet} auf den ersten Eintrag.',
    'Mit dem ersten Napf beginnt das Tagebuch.',
    'Hier entsteht gleich das Tagebuch von {names}.',
    'Nach dem ersten Napf geht’s hier richtig los.',
  ],
  due: [
    'Futterzeit! Das {meal} ist dran.',
    'Jetzt wäre ein guter Moment fürs {meal}.',
    '{names} {findet}, es ist Zeit fürs {meal}.',
    'Zeit fürs {meal}, der Bauch knurrt schon.',
  ],
  dueFirst: [
    'Futterzeit! Heute gab’s noch nichts.',
    'Zeit fürs {meal}, heute gab’s noch nichts.',
    '{names} {wartet} heute noch auf den ersten Napf.',
    'Der erste Napf des Tages ist überfällig.',
  ],
  fresh: [
    'Guten Appetit, {names}!',
    'Frisch aufgetischt, guten Appetit!',
    '{names} {hat} jetzt erst mal zu tun.',
    'Der Napf ist voll, jetzt heißt es schmatzen.',
  ],
  freshTreat: [
    'Ein Snack zwischendurch muss sein.',
    '{names} {hat} gerade genascht.',
    'Zwischendurch ein Häppchen, wie fein.',
  ],
  later: [
    'Das {meal} gibt’s gegen {time}.',
    'Bis zum {meal} gegen {time} ist Pause.',
    'Gegen {time} steht das {meal} an.',
    '{names} {wartet} aufs {meal} gegen {time}.',
  ],
  morning: [
    'Gegen {time} gibt’s heute den ersten Napf.',
    'Das {meal} steht gegen {time} an.',
    '{names} {freut} sich aufs {meal} gegen {time}.',
    'Bis zum {meal} gegen {time} ist noch Ruhe.',
  ],
  done: [
    'Für heute ist alles serviert.',
    'Küche zu, morgen gegen {time} geht’s weiter.',
    'Der Napf hat jetzt Feierabend bis morgen.',
    'Das war’s für heute mit dem Napf.',
    '{names} {ist} für heute rundum versorgt.',
  ],
  night: [
    'Nachtruhe, das {meal} gibt’s gegen {time}.',
    'Schlafenszeit, der Napf öffnet gegen {time}.',
    'Bis gegen {time} ist Nachtruhe.',
    'Süße Träume, gegen {time} gibt’s Futter.',
  ],
  today: ['Seit {span} ist Ruhe am Napf.', 'Das letzte Futter ist {span} her.', 'Seit {span} hat der Napf Pause.'],
  yesterday: [
    'Heute ist noch nichts eingetragen.',
    'Heute stand noch nichts im Napf.',
    '{names} {wartet} heute noch auf den ersten Napf.',
    'Seit {span} ist Ruhe am Napf.',
  ],
  lastNight: [
    'Nachtruhe, der Napf hat frei.',
    'Schlafenszeit, auch für den Napf.',
    'Es ist Nacht, {names} {ist} im Traumland.',
  ],
  older: [
    'Zuletzt gab’s {since} {what}{by}.',
    'Das letzte Futter stand {since} im Napf.',
    'Eine Weile hat hier niemand was eingetragen.',
  ],
};

/* Short, so the line follows the lead instead of standing beside it. A {place} that can open a sentence must hold a
   capitalised word. */
export const LINES = {
  waiting: [
    '{names} {wartet} bestimmt schon neben dem Napf.',
    '{names} {uebt} schon mal den vorwurfsvollen Blick.',
    '{names} {hat} sicher schon eine Beschwerde parat.',
    '{names} {sitzt} bestimmt schon vor dem Schrank.',
    'Wetten, dass {names} schon vor dem Napf {sitzt}?',
  ],
  birthdayAge: [
    '{pet} wird heute {age}, da darf der Napf voller sein.',
    'Heute wird {pet} {age}, Extra-Leckerli ist Pflicht.',
    'Alles Gute, {pet} wird heute {age}!',
  ],
  birthdayToday: [
    '{pet} hat heute Geburtstag, Extra-Leckerli erlaubt.',
    'Alles Gute, {pet}, heute ist dein Geburtstag!',
    '{pet} hat Geburtstag und darf sich was wünschen.',
  ],
  birthdaySoon: [
    'In {days} hat {pet} Geburtstag.',
    'Noch {days}, dann hat {pet} Geburtstag.',
    'In {days} hat {pet} Geburtstag, Geschenk zum Fressen?',
  ],
  birthdayTomorrow: [
    'Morgen hat {pet} Geburtstag.',
    'Noch einmal schlafen, dann hat {pet} Geburtstag.',
    'Morgen hat {pet} Geburtstag und ahnt noch nichts.',
  ],
  premiereLast: [
    'Das gab’s heute zum ersten Mal, wie mutig.',
    'Das stand heute zum allerersten Mal im Napf.',
    'Eine echte Premiere, das gab’s hier noch nie.',
  ],
  premiere: [
    '{sort} gab’s heute zum ersten Mal, wie mutig.',
    'Heute stand zum ersten Mal {sort} im Napf.',
    'Mit {sort} gab’s heute eine echte Premiere.',
  ],
  milestoneNext: [
    'Das nächste Füttern ist schon das {m} Mal.',
    'Noch einmal füttern, dann ist das {m} Mal voll.',
    'Beim nächsten Füttern wird das {m} Mal gefeiert.',
  ],
  milestone: [
    'Noch {n} füttern, dann ist das {m} erreicht.',
    'Bis zum {m} fehlen nur noch {n}.',
    'Das {m} ist nah, es fehlen nur noch {n}.',
  ],
  anniversary: [
    'Seit genau {span} schreibst du hier mit.',
    'Heute vor {span} stand die erste Mahlzeit im Tagebuch.',
    '{n} Mahlzeiten in genau {span}, das ist ein Jubiläum.',
  ],
  recordStreak: [
    '{days} am Stück, so lang war die Serie noch nie.',
    'Mit {days} in Folge stellt das Tagebuch Rekord auf.',
    '{days} ohne Lücke, das gab’s hier noch nie.',
  ],
  recordDay: [
    'So viele Mahlzeiten an einem Tag gab’s noch nie.',
    'Heute gab’s so viele Mahlzeiten wie noch nie.',
    'Rekord, an keinem Tag gab’s bisher öfter Futter.',
  ],
  earlier: [
    'Das {meal} war heute {span} früher dran.',
    'Heute gab’s das {meal} {span} früher als sonst.',
    'Da hatte es wer eilig, das {meal} gab’s {span} früher.',
  ],
  later: [
    'Das {meal} war heute {span} später dran.',
    'Heute gab’s das {meal} {span} später als sonst.',
    'Der Bauch hat’s gemerkt, das {meal} gab’s {span} später.',
  ],
  sameMinute: [
    'Auf die Minute wie gestern, wer erzieht hier wen?',
    'Dieselbe Minute wie gestern, die innere Uhr läuft.',
    'Genau wie gestern auf die Minute, fast unheimlich.',
  ],
  snacks: ['So viele Snacks heute, {grip}', 'Snacks über Snacks, {grip}', 'Bei so vielen Snacks ist klar, {grip}'],
  duel: [
    '{first} führt im Fütter-Duell gerade {n} zu {m}.',
    '{first} liegt {n} zu {m} vorn, {second}, da geht was!',
    'Mit {n} zu {m} gewinnt {first} das Fütter-Duell.',
  ],
  duelTie: [
    'Im Fütter-Duell der Woche steht es {score}.',
    '{first} und {second} liegen gleichauf, {score}.',
    'Beim Füttern steht es {score}, das wird knapp.',
  ],
  streak: [
    'Seit {since} ist kein Tag ohne Eintrag geblieben.',
    '{days} in Folge eingetragen, das nennt man Routine.',
    'Das Tagebuch läuft seit {since} ohne Lücke.',
  ],
  idea: [
    'Mal wieder {sort}? Das gab’s seit {days} Tagen nicht.',
    '{sort} war zuletzt vor {days} Tagen dran.',
    '{sort} war seit {days} Tagen nicht mehr im Napf.',
  ],
  feedRun: [
    '{name} füttert seit {since} am Stück, {other} darf auch mal.',
    '{days} in Folge hat {name} gefüttert, {other} ist dran.',
    '{name} hat {days} in Folge gefüttert, {other} schaut zu.',
  ],
  feedRunAlone: [
    '{name} füttert seit {since} ohne Pause.',
    '{days} am Stück hat {name} gefüttert, wie ein Uhrwerk.',
    '{name} hat {days} in Folge gefüttert, starker Einsatz.',
  ],
  weekday: [
    '{weekday} gibt’s das {meal} meist {shift}, heute um {time}.',
    '{weekday} tickt die Küche anders, das {meal} gab’s um {time}.',
    'Am {day} ist das {meal} meist {shift} dran, heute um {time}.',
  ],
  week: [
    'Diese Woche gab’s schon {meals} aus {sorts}.',
    'Der Speiseplan der Woche zählt {meals} aus {sorts}.',
    '{meals} aus {sorts} in einer Woche, schön bunt.',
  ],
  lookback: [
    'Heute vor einem Jahr gab’s {sort}.',
    'Vor genau einem Jahr stand {sort} im Napf.',
    'Weißt du noch, heute vor einem Jahr gab’s {sort}.',
  ],
  sorts: [
    'Schon {n} probiert, und das Regal ist noch länger.',
    '{n} im Tagebuch sind für Feinschmecker ein Anfang.',
    'Mit {n} war das schon eine kleine Weltreise.',
  ],
  days: [
    'Seit {since} schreibst du hier mit.',
    'Heute ist Tag {n} im Tagebuch.',
    '{days} Tagebuch, und die Geschichte geht weiter.',
  ],
};
// values come escaped from the caller
export const fill = (template, values) => template.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? '');
