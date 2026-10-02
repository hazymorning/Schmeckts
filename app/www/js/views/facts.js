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
      text: 'Katzen hören eine Dose auch im Tiefschlaf.',
    },
    {id: 'katze-zeit-1', when: ['due'], text: 'Katzen merken sich die Futterzeit auf die Minute.'},
    {id: 'katze-laute-1', when: ['due'], text: 'Katzen miauen fast nur für Menschen. Das hier gilt dir.'},
    {id: 'katze-laute-3', when: ['due'], text: 'Bettelnde Katzen schnurren mit einem leisen Quengelton.'},
    {id: 'katze-tempo-1', when: ['due'], text: 'Katzen schaffen bis zu 48 km/h. Zum Napf reicht weniger.'},
    {id: 'katze-name-1', when: ['due'], text: 'Jetzt hört deine Katze sogar auf ihren Namen.'},
    {id: 'katze-sehen-1', when: ['due'], text: 'Den Napf direkt vor der Nase sehen Katzen nur unscharf.'},
    {id: 'katze-riechen-1', when: ['due'], text: 'Katzen fressen mit der Nase. Zimmerwarm riecht es mehr.'},
    {id: 'katze-starren-1', when: ['due'], text: 'Erst du, dann der Napf, dann wieder du. Klare Ansage.'},
    {id: 'katze-schlaf-3', when: ['fresh'], text: 'Pst, hier wird verdaut. Satte Katzen dösen gern.'},
    {
      id: 'katze-jagd-2',
      when: ['fresh'],
      text: 'Aufs Fressen folgt das Putzen und dann ein Nickerchen.',
    },
    {id: 'katze-zunge-1', when: ['fresh'], text: 'Jetzt putzt sich deine Katze mit ihrer rauen Zunge.'},
    {
      id: 'katze-zaehne-1',
      when: ['fresh'],
      text: 'Katzen kauen kaum. Sie schneiden und schlucken.',
    },
    {
      id: 'katze-territorium-2',
      when: ['fresh'],
      text: 'Katzen fressen gern ungestört, ganz ohne Publikum.',
    },
    {
      id: 'katze-temperatur-1',
      when: ['fresh'],
      text: 'Nach dem Fressen sucht deine Katze ein warmes Plätzchen.',
    },
    {
      id: 'katze-wasser-4',
      when: ['fresh'],
      text: 'Manche Katzen trinken, indem sie die Pfote eintunken.',
    },
    {
      id: 'katze-mahlzeiten-1',
      when: ['wait'],
      text: 'Katzen fressen von Natur aus lieber kleine Happen.',
    },
    {id: 'katze-schlaf-1', when: ['wait'], text: 'Katzen verschlafen 12 bis 16 Stunden am Tag.'},
    {id: 'katze-fenster-1', when: ['wait'], text: 'Hörst du das Keckern? Deine Katze hat Vögel entdeckt.'},
    {id: 'katze-jagd-1', when: ['wait'], text: 'Auch satte Katzen jagen. Frag mal die Socke unterm Sofa.'},
    {id: 'katze-box-1', when: ['wait'], text: 'Ein Karton beruhigt Katzen. Das wurde sogar gemessen.'},
    {
      id: 'katze-hoehe-1',
      when: ['wait'],
      text: 'Vom Schrank aus behält deine Katze auch dich im Blick.',
    },
    {id: 'katze-nacht-1', when: ['evening'], text: 'Wenn es dämmert, wird deine Katze erst richtig wach.'},
    {
      id: 'katze-zoomies-1',
      when: ['evening'],
      text: 'Abends flitzen viele Katzen wild herum. Ganz normal.',
    },
    {
      id: 'katze-kneten-1',
      when: ['evening'],
      text: 'Knetet deine Katze dich, fühlt sie sich wie bei Mama.',
    },
    {
      id: 'katze-schnurren-2',
      when: ['evening'],
      text: 'Schnurren mit 25 bis 150 Hertz entspannt auch dich.',
    },
    {
      id: 'katze-koerper-1',
      when: ['evening'],
      text: 'Blinzel langsam zurück. Für Katzen ist das ein Gruß.',
    },
    {
      id: 'katze-koerper-3',
      when: ['evening'],
      text: 'Ein gezeigter Bauch heißt Vertrauen. Kraulen ist heikel.',
    },
    {id: 'katze-sehen-2', when: ['night'], text: 'Ganz ohne Licht sieht auch deine Katze nichts.'},
    {
      id: 'katze-nacht-2',
      when: ['night'],
      text: 'Schlaf gut. Im Morgengrauen ist deine Katze wieder wach.',
    },
    {
      id: 'katze-hoeren-1',
      when: ['night'],
      text: 'Katzen hören Ultraschall, zum Beispiel Mäuse.',
    },
    {
      id: 'katze-hoeren-2',
      when: ['night'],
      text: 'Katzen drehen jedes Ohr für sich. Eins hört immer zu.',
    },
    {id: 'katze-tuer-1', when: ['night'], text: 'Schließt du die Tür, fehlt der Katze ein Stück Revier.'},
    {
      id: 'katze-mahlzeiten-2',
      when: ['night'],
      text: 'Katzen lieben feste Zeiten, morgens auch beim Wecken.',
    },
    {
      id: 'katze-gang-1',
      when: ['night'],
      text: 'Katzen schleichen auf Zehenspitzen. Daher hörst du nix.',
    },
    {id: 'katze-schmecken-1', text: 'Katzen schmecken kein Süß. Bei Sahne lockt das Fett.'},
    {id: 'katze-schmecken-2', text: 'Katzen schmecken weniger als du, meckern aber mehr.'},
    {id: 'katze-sehen-3', text: 'Das rote Spielzeug sieht für deine Katze eher grau aus.'},
    {id: 'katze-nase-2', text: 'Zieht deine Katze Grimassen, riecht sie mit dem Gaumen.'},
    {id: 'katze-zitrus-1', text: 'Katzen mögen keinen Zitrusduft. Deine Orange ist sicher.'},
    {id: 'katze-milch-1', text: 'Milch verträgt kaum eine Katze. Das Bilderbuch irrt.'},
    {id: 'katze-schnurrhaare-1', text: 'In flachen Schalen stoßen die Schnurrhaare nirgends an.'},
    {id: 'katze-pfote-1', text: 'Kater angeln öfter mit links, Kätzinnen mit rechts.'},
    {id: 'katze-korb-1', text: 'Gegen die Papiertüte verliert jedes teure Katzenbett.'},
    {id: 'katze-schulter-1', text: 'Lose Schlüsselbeine machen Katzen so biegsam.'},
    {id: 'katze-koepfchen-1', text: 'Köpfchen ist eine Duftmarke. Du gehörst jetzt dazu.'},
    {id: 'katze-koerper-2', text: 'Steht der Schwanz senkrecht, sagt deine Katze „Hallo“.'},
    {id: 'katze-bad-1', text: 'Katzen kommen gern mit aufs Klo. Da hast du ja Zeit.'},
    {id: 'katze-tastatur-1', text: 'Katzen mögen die Tastatur: warm, und du schaust hin.'},
    {id: 'katze-sonne-1', text: 'Wandert der Sonnenfleck, zieht deine Katze mit um.'},
    {id: 'katze-wasser-3', text: 'Viele Katzen trinken lieber am Hahn als aus dem Napf.'},
    {id: 'katze-geruch-2', text: 'Mit der Wange macht deine Katze das neue Sofa zu ihrem.'},
    {id: 'katze-alter-3', text: 'Die älteste Katze, Creme Puff, wurde 38 Jahre alt.'},
    {
      id: 'katze-hitze-1',
      when: ['wait'],
      months: SUMMER,
      text: 'Wenn’s heiß ist, frisst deine Katze lieber am Abend.',
    },
    {
      id: 'katze-hitze-2',
      months: SUMMER,
      text: 'Katzen schwitzen nur an den Pfoten. Putzen kühlt.',
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
      text: 'Im Fellwechsel hilft Bürsten. Das schont Sofa und Magen.',
    },
    {
      id: 'katze-fell-herbst',
      months: AUTUMN,
      text: 'Jetzt wächst das Winterfell. Das ist kein Speck.',
    },
    {
      id: 'katze-herbstlaub',
      when: ['wait'],
      months: LEAVES,
      text: 'Raschelndes Laub klingt nach Maus und wird gejagt.',
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
      text: 'Lametta lieber weglassen, Katzen verschlucken es leicht.',
    },
    {id: 'katze-weltkatzentag', day: '08-08', text: 'Heute ist Weltkatzentag. Bei dir ist das ja jeden Tag.'},
  ],
  Hund: [
    {id: 'hund-nase-1', when: ['due'], text: 'Dein Hund riecht das Futter durch die Schranktür.'},
    {id: 'hund-zeit-1', when: ['due'], text: 'Dein Hund kennt keine Uhr, aber die Futterzeit.'},
    {id: 'hund-ohren-1', when: ['due'], text: 'Hunde haben 18 Ohrmuskeln. Jetzt zeigen alle zur Küche.'},
    {id: 'hund-speichel-1', when: ['due'], text: 'Klappert der Napf, sabbert dein Hund wie bei Pawlow.'},
    {id: 'hund-rudel-1', when: ['due'], text: 'Dein Hund kennt deinen Alltag besser als dein Kalender.'},
    {id: 'hund-laute-1', when: ['due'], text: 'Bellen kann vieles heißen. Gerade heißt es: Hunger.'},
    {id: 'hund-koerper-1', when: ['due'], text: 'Gähnen kann bei Hunden auch Aufregung heißen.'},
    {id: 'hund-schlaf-1', when: ['fresh'], text: 'Jetzt wird gedöst. Hunde schlafen bis zu 14 Stunden.'},
    {id: 'hund-wasser-1', when: ['fresh'], text: 'Hunde schöpfen mit der Zunge. Daher die Pfütze am Napf.'},
    {id: 'hund-ruhe-1', when: ['fresh'], text: 'Nach dem Fressen lieber Ruhe, gerade bei großen Hunden.'},
    {
      id: 'hund-magen-1',
      when: ['fresh'],
      text: 'Hunde kauen wenig. Den Rest macht der saure Magen.',
    },
    {id: 'hund-teppich-1', when: ['fresh'], text: 'Als Serviette nehmen Hunde den Teppich oder dein Bein.'},
    {id: 'hund-nase-4', when: ['wait'], text: 'Für Hunde ist jeder Laternenpfahl ein Gruppenchat.'},
    {id: 'hund-hoeren-1', when: ['wait'], text: 'Dein Hund hört den Postboten lange vor dir.'},
    {id: 'hund-koerper-2', when: ['wait'], text: 'Streckt dein Hund den Po hoch, will er mit dir spielen.'},
    {id: 'hund-nase-6', when: ['wait'], text: 'Forscher vermuten: Hunde riechen, wie die Zeit vergeht.'},
    {id: 'hund-buddeln-1', when: ['wait'], text: 'Hunde verstecken gern Vorräte, zum Beispiel im Beet.'},
    {
      id: 'hund-kreis-1',
      when: ['evening'],
      text: 'Hunde drehen sich vorm Hinlegen im Kreis. Das ist uralt.',
    },
    {
      id: 'hund-kauen-1',
      when: ['evening'],
      text: 'Kauen beruhigt. Der Knochen ist das Feierabendbier.',
    },
    {
      id: 'hund-blick-1',
      when: ['evening'],
      text: 'Wenn ihr euch anseht, schütten beide Oxytocin aus.',
    },
    {id: 'hund-rhythmus-1', when: ['evening'], text: 'Sobald du dich hinsetzt, legt sich dein Hund auch hin.'},
    {
      id: 'hund-schnueffeln-1',
      when: ['evening'],
      text: 'Schnüffeln macht Hunde richtig müde.',
    },
    {id: 'hund-schlaf-2', when: ['night'], text: 'Zucken die Pfoten, jagt dein Hund ein Traumkaninchen.'},
    {id: 'hund-traum-2', when: ['night'], text: 'Kleine Hunde träumen Kurzfilme, große eher Spielfilme.'},
    {id: 'hund-schnarchen-1', when: ['night'], text: 'Kurznasige Hunde schnarchen oft besonders laut.'},
    {id: 'hund-sehen-2', when: ['night'], text: 'Im Halbdunkel sehen Hunde besser als du.'},
    {id: 'hund-schlaf-3', when: ['night'], text: 'Zwischen zwei Nickerchen prüft dein Hund kurz die Lage.'},
    {id: 'hund-schlaf-4', when: ['night'], text: 'Wird’s kühl, rollt sich dein Hund zur Brezel zusammen.'},
    {id: 'hund-schmecken-1', text: 'Hunde haben rund 1700 Geschmacksknospen, du 9000.'},
    {id: 'hund-schmecken-2', text: 'Hunde schmecken Süßes. Daher der Blick auf den Kuchen.'},
    {id: 'hund-nase-2', text: 'Hunde riechen in Stereo, jedes Nasenloch für sich.'},
    {id: 'hund-nase-3', text: 'Die Hundenase ist nass, damit Gerüche besser haften.'},
    {id: 'hund-rute-2', text: 'Wedelt dein Hund eher nach rechts, freut er sich.'},
    {id: 'hund-regen-1', text: 'Dein Hund findet Regen doof und Pfützen herrlich.'},
    {id: 'hund-alter-1', text: 'Je größer ein Hund, desto schneller altert er leider.'},
    {id: 'hund-sehen-1', text: 'Ein roter Ball im Gras ist für Hunde ein Suchbild.'},
    {id: 'hund-zaehne-1', text: 'Dein Hund hat zehn Zähne mehr als du und putzt keinen.'},
    {id: 'hund-tragen-1', text: 'Zur Begrüßung schenkt dein Hund dir gern deinen Schuh.'},
    {id: 'hund-frisur-1', text: 'Deine neue Frisur ist Hunden egal, neues Parfüm nicht.'},
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
      text: 'Bei Hitze trinken Hunde mehr. Napf in den Schatten!',
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
      text: 'Hunde schwitzen an den Pfoten und kühlen mit der Zunge.',
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
      text: 'Hunde lieben Laub. Die Reste landen im Flur.',
    },
    {id: 'hund-regen-2', months: LEAVES, text: 'Den Geruch von nassem Hund machen Bakterien im Fell.'},
    {
      id: 'hund-gruen',
      when: ['wait'],
      months: GREEN,
      text: 'Im Frühjahr grast dein Hund beim Gassi wie ein Schaf.',
    },
    {id: 'hund-silvester', months: DECEMBER, text: 'An Silvester hilft deinem Hund ein ruhiges Versteck.'},
    {
      id: 'hund-weihnachten',
      months: DECEMBER,
      text: 'Hunde markieren Bäume, nur der im Wohnzimmer ist tabu.',
    },
    {id: 'hund-welthundetag', day: '10-10', text: 'Heute ist Welthundetag. Für Hunde ist das jeder Tag.'},
  ],
  Kaninchen: [
    {id: 'kaninchen-sehen-1', when: ['due'], text: 'Direkt vor dem Maul sieht ein Kaninchen nichts.'},
    {
      id: 'kaninchen-hoeren-1',
      when: ['due'],
      text: 'Jedes Ohr dreht sich einzeln. Jetzt zeigen beide zu dir.',
    },
    {
      id: 'kaninchen-nase-1',
      when: ['due'],
      text: 'Das Näschen wackelt jetzt vor Aufregung im Eiltempo.',
    },
    {
      id: 'kaninchen-zeit-1',
      when: ['due'],
      text: 'Kaninchen merken sich die Futterzeit sehr schnell.',
    },
    {
      id: 'kaninchen-verdauung-1',
      when: ['fresh'],
      text: 'Kaninchen können nicht erbrechen. Was drin ist, bleibt.',
    },
    {
      id: 'kaninchen-trinken-1',
      when: ['fresh'],
      text: 'Aus der Schale trinken Kaninchen mehr als aus Flaschen.',
    },
    {
      id: 'kaninchen-putzen-1',
      when: ['fresh'],
      text: 'Jetzt wird geputzt. Da sind Kaninchen wie Katzen.',
    },
    {
      id: 'kaninchen-flop-1',
      when: ['fresh'],
      text: 'Kippt dein Kaninchen gleich um, ist es nur entspannt.',
    },
    {
      id: 'kaninchen-daemmerung-1',
      when: ['wait'],
      text: 'Tagsüber wird gedöst. In der Dämmerung geht es los.',
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
      text: 'Die Heuraufe hat auch abends geöffnet.',
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
      text: 'Nachts fressen Kaninchen Blinddarmkot. Das muss so sein.',
    },
    {
      id: 'kaninchen-schlaf-1',
      when: ['night'],
      text: 'Dein Kaninchen schläft in Häppchen und frisst genauso.',
    },
    {id: 'kaninchen-sozial-1', text: 'Kaninchen brauchen Kaninchen. Du bist eher Personal.'},
    {id: 'kaninchen-sprung-1', text: 'Kaninchen springen über Zäune bis zu einem Meter.'},
    {id: 'kaninchen-ohren-2', text: 'Die langen Ohren sind die Klimaanlage deines Kaninchens.'},
    {id: 'kaninchen-heu-2', text: 'Heu ist der Hauptgang. Alles andere ist Beilage.'},
    {id: 'kaninchen-nager-1', text: 'Kaninchen sind gar keine Nagetiere. Sie nagen nur gern.'},
    {id: 'kaninchen-sehen-2', text: 'Kaninchen sehen fast rundum. Anschleichen klappt nicht.'},
    {
      id: 'kaninchen-hitze',
      when: ['wait'],
      months: SUMMER,
      text: 'Hitze macht Kaninchen mehr zu schaffen als Kälte.',
    },
    {id: 'kaninchen-heizung', months: HEATING, text: 'Mit dem Pelz braucht dein Kaninchen keine Heizungsluft.'},
    {
      id: 'kaninchen-fell-fruehling',
      months: SPRING,
      text: 'Im Fellwechsel hilft Bürsten gegen Haare im Magen.',
    },
    {
      id: 'kaninchen-fell-herbst',
      months: AUTUMN,
      text: 'Das Winterfell wächst. Dein Kaninchen wird kugelig.',
    },
    {
      id: 'kaninchen-gruen',
      when: ['due'],
      months: SPRING,
      text: 'Frisches Gras langsam steigern, der Bauch braucht Zeit.',
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
      text: 'Ein Vogelherz schlägt Hunderte Male pro Minute.',
    },
    {id: 'vogel-hoeren-1', when: ['due'], text: 'Ohne Ohrmuscheln hört dein Vogel jede Tüte rascheln.'},
    {id: 'vogel-sozial-2', when: ['due'], text: 'Pickt einer, picken alle. Fehlt nur noch das Futter.'},
    {id: 'vogel-kopf-1', when: ['due'], text: 'Merkst du, wie weit dein Vogel den Kopf nach dir dreht?'},
    {id: 'vogel-koerner-1', when: ['fresh'], text: 'Jedes Korn wird geschält. Die Schalen bleiben für dich.'},
    {id: 'vogel-schnabel-1', when: ['fresh'], text: 'Die Sitzstange muss jetzt als Serviette herhalten.'},
    {id: 'vogel-magen-1', when: ['fresh'], text: 'Vögel kauen nicht. Das macht der Muskelmagen.'},
    {
      id: 'vogel-kropf-1',
      when: ['fresh'],
      text: 'Das Futter landet erst mal im Kropf.',
    },
    {id: 'vogel-federn-1', when: ['wait'], text: 'Zum Putzen macht dein Vogel sein eigenes Öl.'},
    {id: 'vogel-baden-1', when: ['wait'], text: 'Wenn dein Vogel badet, wird die Tapete gleich mit nass.'},
    {
      id: 'vogel-stoffwechsel-1',
      when: ['wait'],
      text: 'Kleine Vögel fressen oft, ihr Stoffwechsel ist schnell.',
    },
    {id: 'vogel-zweige-1', when: ['wait'], text: 'Ein frischer Zweig zum Knabbern vertreibt die Zeit.'},
    {
      id: 'vogel-hitze',
      when: ['wait'],
      months: SUMMER,
      text: 'Bei Hitze hecheln Vögel. Ein Bad kühlt sie ab.',
    },
    {
      id: 'vogel-schlaf-3',
      when: ['evening'],
      text: 'Vögel schlafen zehn bis zwölf Stunden. Beneidenswert.',
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
    {id: 'vogel-schlaf-2', when: ['night'], text: 'Vögel können mit einer Hirnhälfte schlafen.'},
    {id: 'vogel-nacht-1', when: ['night'], text: 'Nymphis erschrecken nachts leicht. Ein Nachtlicht hilft.'},
    {id: 'vogel-licht-1', when: ['night'], text: 'Beim ersten Licht ist dein Vogel wach, du leider auch.'},
    {id: 'vogel-schmecken-1', text: 'Ein paar Hundert Geschmacksknospen reichen zum Mäkeln.'},
    {id: 'vogel-sehen-1', text: 'Vögel sehen UV-Licht. Darin ist dein Vogel noch bunter.'},
    {id: 'vogel-sprache-1', text: 'Das Schimpfwort von vorhin übt dein Welli sicher schon.'},
    {id: 'vogel-sozial-1', text: 'Allein langweilt sich ein Vogel. Zu zweit ist mehr los.'},
    {id: 'vogel-kanarien-1', text: 'Kanarienhähne singen, die Hennen hören kritisch zu.'},
    {id: 'vogel-heizung', months: HEATING, text: 'Heizungsluft ist Vögeln zu trocken. Eine Dusche hilft.'},
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
      text: 'Meerschweinchen bilden kein Vitamin C. Paprika hilft.',
    },
    {
      id: 'nager-zaehne-1',
      when: ['fresh'],
      text: 'Nagerzähne wachsen immer weiter. Kauen hält sie kurz.',
    },
    {
      id: 'nager-hamstern-1',
      when: ['fresh'],
      text: 'Hamster tragen ihr Futter in den Backen ins Nest.',
    },
    {id: 'nager-popcorn-1', when: ['fresh'], text: 'Wildes Hüpfen heißt bei Meerschweinchen Popcornen.'},
    {id: 'nager-atem-1', when: ['fresh'], text: 'Am Atem der anderen riecht eine Ratte, was es gab.'},
    {
      id: 'nager-herbst-vorrat',
      when: ['fresh'],
      months: AUTUMN,
      text: 'Merkst du, wie der Hamster im Herbst mehr bunkert?',
    },
    {id: 'nager-stopfmagen-1', when: ['wait'], text: 'Meerschweinchen knabbern dauernd. Ihr Magen braucht das.'},
    {id: 'nager-tagschlaf-1', when: ['wait'], text: 'Tagsüber schläft der Hamster und nimmt Wecken übel.'},
    {id: 'nager-degu-1', when: ['wait'], text: 'Degus sind tagsüber wach, Hamster eher nachts.'},
    {
      id: 'nager-hitze',
      when: ['wait'],
      months: SUMMER,
      text: 'Nager schwitzen kaum. Eine kühle Fliese hilft.',
    },
    {
      id: 'nager-abend-1',
      when: ['evening'],
      text: 'Dein Hamster steht jetzt auf, für ihn ist es Morgen.',
    },
    {
      id: 'nager-schlaf-1',
      when: ['evening'],
      text: 'Meerschweinchen schlafen auch abends nur kurz.',
    },
    {
      id: 'nager-abend-2',
      when: ['evening'],
      text: 'Bei Dämmerung fangen Ratten und Mäuse ihre Schicht an.',
    },
    {id: 'nager-nacht-1', when: ['night'], text: 'Viele Nager sind nachtaktiv. Im Käfig ist jetzt Betrieb.'},
    {
      id: 'nager-laufrad-2',
      when: ['night'],
      text: 'Hamster laufen nachts bis zu zehn Kilometer im Kreis.',
    },
    {id: 'nager-augen-1', when: ['night'], text: 'Meerschweinchen schlafen manchmal mit offenen Augen.'},
    {id: 'nager-riechen-1', text: 'Nach dem Käfigputz riecht für Nager alles nach Umzug.'},
    {id: 'nager-sozial-1', text: 'Ratten wollen eine WG. Goldhamster wohnen lieber allein.'},
    {id: 'nager-hoeren-1', text: 'Nager reden viel im Ultraschall. Du hörst davon nichts.'},
    {id: 'nager-lachen-1', text: 'Ratten lachen beim Kitzeln, aber im Ultraschall.'},
    {id: 'nager-backen-2', text: 'In Hamsterbacken passt ein Fünftel des Körpergewichts.'},
    {id: 'nager-wort-1', text: 'Das Wort „hamstern“ hat sich der Hamster verdient.'},
    {id: 'nager-chinchilla-1', text: 'Chinchillas baden in Sand. Wasser wäre ein Drama.'},
    {id: 'nager-heizung', months: HEATING, text: 'Neben der Heizung ist es deinem Nager zu warm.'},
    {id: 'nager-fruehling', months: SPRING, text: 'Im Frühjahr haart dein Nager. Der Staubsauger merkt’s.'},
    {
      id: 'nager-silvester',
      months: DECEMBER,
      text: 'Ein stilles Zimmer hilft Nagern gut durch Silvester.',
    },
    {id: 'nager-gruen', months: GREEN, text: 'Das erste Grün ist da. Meerschweinchen freuen sich.'},
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
  {id: 'allg-wasser-1', when: ['due'], text: 'Frisches Wasser dazu? Altes schmeckt nach gestern.'},
  {id: 'allg-uhr-1', when: ['due'], text: 'Die innere Uhr deines Tieres klingelt gerade.'},
  {id: 'allg-blick-1', when: ['due'], text: 'Der Blick vom Napf zu dir und zurück ist eindeutig.'},
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
    text: 'Bei Hitze das Wasser lieber in den Schatten stellen.',
  },
  {
    id: 'allg-leckerli-1',
    when: ['evening'],
    text: 'Ein Leckerli am Abend ist Liebe. Und Kalorien.',
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
  {id: 'allg-zeit-1', when: ['night'], text: 'Für Tiere zählen Licht und Hunger mehr als die Uhr.'},
  {
    id: 'allg-schlaf-1',
    when: ['night'],
    text: 'Du schläfst am Stück, viele Tiere dagegen in Etappen.',
  },
  {id: 'allg-napf-2', text: 'Wackelt der Napf, wird jede Mahlzeit zum Ringkampf.'},
  {id: 'allg-napf-3', text: 'Ein zerkratzter Plastiknapf merkt sich jeden Geruch.'},
  {id: 'allg-nase-1', text: 'Viele Tiere glauben erst, was sie gerochen haben.'},
  {id: 'allg-routine-1', text: 'Routine klingt langweilig. Tieren gibt sie Sicherheit.'},
  {id: 'allg-neu-1', text: 'Neues Futter langsam einführen, der Magen dankt es.'},
  {id: 'allg-spiel-2', text: 'Spielzeug im Wechsel bleibt spannend.'},
  {id: 'allg-heizung', months: HEATING, text: 'Heizungsluft trocknet aus. Stell ruhig mehr Wasser hin.'},
  {id: 'allg-fruehling', months: SPRING, text: 'Frühlingsgefühle gibt es wirklich. Schuld ist das Licht.'},
  {id: 'allg-gruen', months: GREEN, text: 'Den Frühling riechen Tiere schon, bevor du ihn siehst.'},
  {
    id: 'allg-herbstlaub',
    months: LEAVES,
    text: 'Raschelt’s im Laub, sind Tierohren sofort auf Empfang.',
  },
  {
    id: 'allg-silvester',
    months: DECEMBER,
    text: 'Richte das Versteck für Silvester früh ein.',
  },
  {
    id: 'allg-zeitumstellung-fruehling',
    day: year => lastSunday(year, 3),
    text: 'Die Uhr wird vorgestellt. Die Tiere hat keiner gefragt.',
  },
  {
    id: 'allg-zeitumstellung-herbst',
    day: year => lastSunday(year, 10),
    text: 'Heute knurrt der Bauch eine Stunde früher.',
  },
  {
    id: 'allg-silvester-tag',
    day: '12-31',
    text: 'Heute knallt’s. Hol alle rein und zieh die Vorhänge zu.',
  },
  {id: 'allg-neujahr', day: '01-01', text: 'Frohes neues Jahr! Tiere brauchen keine guten Vorsätze.'},
  {id: 'allg-heiligabend', day: '12-24', text: 'Die Gans ist für dich. Dein Tier bleibt beim Napf.'},
  {id: 'allg-haustiertag', day: '04-11', text: 'Heute ist Tag des Haustiers. Es gilt Streichelpflicht.'},
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
    'Mahlzeit, {names}!',
    'Frisch aufgetischt, ran an den Napf!',
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
    'Alles Gute, {pet} wird {age}!',
  ],
  birthdayToday: [
    '{pet} hat heute Geburtstag, Extra-Leckerli erlaubt.',
    'Alles Gute, {pet}, heute ist dein Geburtstag!',
    '{pet} hat Geburtstag und darf sich was wünschen.',
  ],
  birthdaySoon: [
    'In {days} hat {pet} Geburtstag.',
    'In {days} feiert {pet} Geburtstag.',
    'In {days} hat {pet} Geburtstag. Schon ein Geschenk?',
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
    'Mit {sort} gab’s eine echte Premiere.',
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
    '{days} in Folge sind ein neuer Rekord fürs Tagebuch.',
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
    'Auf dem Speiseplan der Woche: {meals} aus {sorts}.',
    '{meals} aus {sorts} in einer Woche, schön bunt.',
  ],
  lookback: [
    'Heute vor einem Jahr gab’s {sort}.',
    'Vor genau einem Jahr stand {sort} im Napf.',
    'Weißt du noch, heute vor einem Jahr gab’s {sort}.',
  ],
  sorts: [
    'Schon {n} probiert, und das Regal ist noch länger.',
    '{n} probiert, für Feinschmecker ist das ein Anfang.',
    'Mit {n} war das schon eine kleine Weltreise.',
  ],
  days: [
    'Seit {since} schreibst du hier mit.',
    'Heute ist Tag {n} im Tagebuch.',
    '{days} Tagebuch, und es geht weiter.',
  ],
};
// values come escaped from the caller
export const fill = (template, values) => template.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? '');

// small words two sentences side by side may share without sounding repetitive
const STOP = new Set(
  `der die das dem den des ein eine einen einem einer und oder aber auch noch schon mal nur ist sind war hat haben
  gibt gab sie dein deine dich dir man sich hier nicht nichts auf aufs aus bei mit von vom zum zur für fürs bis seit
  nach vor wie was`.split(/\s+/),
);
// content words cut to a light stem, so Tag, Tage and Tagen match; numbers do not count, 3 Stunden is not 3 Tage
const words = text =>
  new Set(
    text
      .replace(/<[^>]*>/g, ' ')
      .toLowerCase()
      .split(/[^\p{L}]+/u)
      .filter(w => w.length > 2 && !STOP.has(w))
      .map(w => w.replace(/(?<=.{3})(e[nrs]?|[ns])$/, '')),
  );
export function sharesWord(a, b) {
  const seen = words(a);
  return [...words(b)].some(w => seen.has(w));
}
