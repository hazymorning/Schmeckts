/* Everything the overview's line more can say, beside the facts of the day (views/overview.js words them from what
   glance() found): the facts about the animals, and every way of saying each kind of line. Pure data, so that a test
   can read all of it: nothing here names a rating or a verdict, nothing is longer than two sentences.
   A fact: {id, text, months, day}. The id stays put, so the memory of what was shown (prefs.overview) survives a
   change to the list. months: the months it holds in, 1 to 12; without, all year. day: the day it comes on as a
   message, „MM-DD“, or a function of the year for a date that moves. FACTS per species, GENERAL for every animal
   beside them; „Andere“ and a mixed household take the general ones only. */

const mmdd = d => `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/* The last Sunday of a month (the clocks change), and the n-th Saturday (the rabbits have their day) */
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
    {id: 'katze-schmecken-1', text: 'Katzen schmecken nichts Süßes. Ihnen fehlt der Rezeptor dafür.'},
    {id: 'katze-schmecken-2', text: 'Katzen haben nur einige Hundert Geschmacksknospen, Menschen mehrere Tausend.'},
    {id: 'katze-riechen-1', text: 'Katzen fressen mit der Nase: Zimmerwarm riecht Futter stärker als kühlschrankkalt.'},
    {id: 'katze-riechen-2', text: 'Mit Schnupfen fressen viele Katzen schlecht, weil sie ihr Futter kaum riechen.'},
    {id: 'katze-mahlzeiten-1', text: 'Frei lebende Katzen fressen viele kleine Mahlzeiten über den Tag verteilt.'},
    {id: 'katze-wasser-1', text: 'Viele Katzen trinken lieber, wenn das Wasser nicht direkt neben dem Futter steht.'},
    {
      id: 'katze-schlaf-1',
      text: 'Katzen verschlafen 12 bis 16 Stunden am Tag. Den Rest der Zeit denken sie vermutlich ans Essen.',
    },
    {
      id: 'katze-sehen-1',
      text: 'Was direkt vor ihrer Nase liegt, sehen Katzen unscharf. Die Schnurrhaare tasten das Futter ab.',
    },
    {
      id: 'katze-sehen-2',
      text: 'Im Dunkeln sehen Katzen viel besser als wir, aber nicht in völliger Finsternis. Ein bisschen Restlicht brauchen auch sie.',
    },
    {
      id: 'katze-sehen-3',
      text: 'Katzen sehen Farben, aber blasser als wir. Rot und Grün können sie kaum auseinanderhalten.',
    },
    {
      id: 'katze-hoeren-1',
      text: 'Katzen hören viel höhere Töne als Menschen, bis weit in den Ultraschall. Das Rascheln einer Maus entgeht ihnen nicht.',
    },
    {
      id: 'katze-hoeren-2',
      text: 'Katzenohren drehen sich unabhängig voneinander. Der Napf wird also auch gehört, wenn sie scheinbar schlafen.',
    },
    {
      id: 'katze-schnurrhaare-1',
      text: 'Die Schnurrhaare sind so empfindlich, dass ein enger Napf sie stören kann. Viele Katzen mögen flache Schalen lieber.',
    },
    {
      id: 'katze-nase-2',
      text: 'Katzen haben ein zweites Riechorgan im Gaumen. Das Flehmen, dieser offene Mund mit starrem Blick, gehört dazu.',
    },
    {
      id: 'katze-zunge-1',
      text: 'Die Katzenzunge ist rau wie Schmirgelpapier. Ihre kleinen Häkchen kämmen das Fell und schaben Fleisch vom Knochen.',
    },
    {
      id: 'katze-schlaf-2',
      text: 'Der Katzenschlaf ist meist leicht. Beim ersten Klappern einer Dose ist die Katze hellwach.',
    },
    {
      id: 'katze-schlaf-3',
      text: 'Viele Katzen dösen nach dem Fressen erst mal eine Runde. Verdauen ist schließlich Arbeit.',
    },
    {
      id: 'katze-nacht-1',
      text: 'Katzen sind vor allem in der Dämmerung aktiv, morgens und abends. Das Frühstück um fünf hat also System.',
    },
    {
      id: 'katze-wasser-2',
      text: 'Katzen trinken von Natur aus wenig. Einen guten Teil ihres Wassers holen sie sich aus dem Futter.',
    },
    {
      id: 'katze-wasser-3',
      text: 'Fließendes Wasser finden viele Katzen spannender als stehendes. Ein tropfender Hahn hat schon manchen Napf geschlagen.',
    },
    {id: 'katze-jagd-1', text: 'Auch satte Katzen jagen. Der Jagdtrieb hängt nicht am Hunger.'},
    {
      id: 'katze-jagd-2',
      text: 'Ein paar Minuten Spiel vor dem Fressen passen zum Katzenrhythmus: erst jagen, dann fressen, dann putzen, dann schlafen.',
    },
    {id: 'katze-spiel-1', text: 'Für eine Katze ist ein Papierknäuel oft spannender als das teure Spielzeug daneben.'},
    {
      id: 'katze-spring-1',
      text: 'Eine Katze springt aus dem Stand etwa das Fünffache ihrer Körperlänge. Die Küchenzeile ist keine Hürde.',
    },
    {
      id: 'katze-koerper-1',
      text: 'Ein langsames Blinzeln ist bei Katzen ein freundliches Zeichen. Zurückblinzeln ist erlaubt.',
    },
    {
      id: 'katze-koerper-2',
      text: 'Ein hoch aufgestellter Schwanz mit leicht gebogener Spitze heißt bei Katzen meist: Hallo, schön dich zu sehen.',
    },
    {
      id: 'katze-koerper-3',
      text: 'Der Bauch nach oben heißt bei Katzen: Ich vertraue dir. Streicheln darf man dort trotzdem meist nicht.',
    },
    {
      id: 'katze-koepfchen-1',
      text: 'Reibt die Katze den Kopf an dir, markiert sie dich als ihr Eigentum. Du gehörst jetzt dazu.',
    },
    {id: 'katze-laute-1', text: 'Erwachsene Katzen miauen fast nur Menschen an. Untereinander regeln sie das anders.'},
    {
      id: 'katze-laute-2',
      text: 'Katzen haben ein breites Repertoire an Lauten, vom Gurren bis zum Schnattern am Fenster. Letzteres gilt den Vögeln.',
    },
    {
      id: 'katze-schnurren-1',
      text: 'Katzen schnurren nicht nur, wenn sie zufrieden sind. Manche tun es auch, um sich selbst zu beruhigen.',
    },
    {
      id: 'katze-schnurren-2',
      text: 'Das Schnurren liegt bei etwa 25 bis 150 Hertz. Für viele Menschen ist es der entspannendste Ton im Haus.',
    },
    {
      id: 'katze-krallen-1',
      text: 'Kratzen ist für Katzen Krallenpflege und Markierung zugleich. Ein Kratzbaum schont deshalb auch das Sofa.',
    },
    {
      id: 'katze-krallen-2',
      text: 'Katzen ziehen ihre Krallen ein, wenn sie sie nicht brauchen. So bleiben sie beim Laufen scharf.',
    },
    {
      id: 'katze-zaehne-1',
      text: 'Katzen haben 30 Zähne. Zum Kauen sind sie kaum gemacht, sie reißen und schlucken eher.',
    },
    {
      id: 'katze-verdauung-1',
      text: 'Viele Katzen knabbern ab und zu Gras. Warum genau, ist nicht ganz geklärt, aber es scheint der Verdauung zu helfen.',
    },
    {
      id: 'katze-milch-1',
      text: 'Milch ist für die meisten erwachsenen Katzen nichts: Ihnen fehlt das Enzym für Milchzucker. Das Klischee stammt vom Bauernhof.',
    },
    {
      id: 'katze-alter-1',
      text: 'Ältere Katzen riechen und schmecken oft schlechter. Leicht angewärmtes Futter riecht stärker und fällt ihnen leichter.',
    },
    {
      id: 'katze-alter-2',
      text: 'Mit etwa zwölf Jahren gilt eine Katze als Senior. Viele werden deutlich älter, mit Nickerchen als Geheimrezept.',
    },
    {
      id: 'katze-temperatur-1',
      text: 'Katzen mögen es warm: Ihre Wohlfühltemperatur liegt höher als unsere. Deshalb liegt sie auf dem Laptop.',
    },
    {
      id: 'katze-territorium-1',
      text: 'Katzen fressen ungern dort, wo sie auch ihr Geschäft erledigen. Napf und Klo brauchen Abstand.',
    },
    {
      id: 'katze-territorium-2',
      text: 'Bei mehreren Katzen frisst jede lieber an ihrem eigenen Napf. Teilen ist nicht ihre Stärke.',
    },
    {
      id: 'katze-mahlzeiten-2',
      text: 'Katzen mögen Routine. Fütterzeiten, die sich verschieben, werden lautstark angemahnt.',
    },
    {
      id: 'katze-hitze-1',
      months: SUMMER,
      text: 'Bei Hitze fressen viele Katzen weniger und lieber abends, wenn es kühler wird. Mittags zählt vor allem der Schattenplatz.',
    },
    {
      id: 'katze-hitze-2',
      months: SUMMER,
      text: 'Katzen schwitzen fast nur über die Pfoten. Zum Abkühlen putzen sie sich, und die Feuchtigkeit verdunstet im Fell.',
    },
    {
      id: 'katze-heizung-1',
      months: HEATING,
      text: 'Im Winter ist der Platz an der Heizung heiß begehrt. Die trockene Luft dort lässt das Fell knistern, der Katze ist das egal.',
    },
    {
      id: 'katze-fell-fruehling',
      months: SPRING,
      text: 'Im Frühjahr wechselt die Katze ins Sommerfell. Bürsten hilft jetzt beiden: dem Sofa und dem Katzenmagen.',
    },
    {
      id: 'katze-fell-herbst',
      months: AUTUMN,
      text: 'Im Herbst wächst das Winterfell, dichter und weicher. Die Katze wirkt dann rundlicher, als sie ist.',
    },
    {
      id: 'katze-herbstlaub',
      months: LEAVES,
      text: 'Raschelndes Herbstlaub ist für Katzen ein Spielzeug mit Soundeffekt. Draußen wie drinnen, wenn eins hereingetragen wird.',
    },
    {
      id: 'katze-gruen',
      months: GREEN,
      text: 'Das erste Grün im Frühling lockt auch Katzen. Frisches Gras wird jetzt gern probiert, ein Halm reicht meist.',
    },
    {
      id: 'katze-silvester',
      months: DECEMBER,
      text: 'Silvesterknaller sind für Katzenohren eine Zumutung. Ein ruhiger Raum mit offener Tür hilft mehr als gutes Zureden.',
    },
    {
      id: 'katze-weihnachten',
      months: DECEMBER,
      text: 'Weihnachtsbaum und Katze sind eine schwierige Kombination. Lametta und Kugeln sind in Katzenaugen Spielzeug.',
    },
    {
      id: 'katze-weltkatzentag',
      day: '08-08',
      text: 'Heute ist Weltkatzentag. Falls das jemand im Haus noch nicht gemerkt hat: Die Katze weiß es.',
    },
  ],
  Hund: [
    {id: 'hund-schmecken-1', text: 'Hunde haben rund 1700 Geschmacksknospen, Menschen etwa fünfmal so viele.'},
    {id: 'hund-schmecken-2', text: 'Anders als Katzen schmecken Hunde auch Süßes.'},
    {id: 'hund-riechen-1', text: 'Beim Futter zählt für Hunde vor allem, wie es riecht.'},
    {id: 'hund-zeit-1', text: 'Hunde kennen ihre Fütterzeiten meist besser als jede Uhr.'},
    {
      id: 'hund-nase-1',
      text: 'Eine Hundenase riecht zehntausendmal feiner als unsere. Das Leckerli in deiner Tasche ist also kein Geheimnis.',
    },
    {
      id: 'hund-nase-2',
      text: 'Hunde riechen mit jedem Nasenloch getrennt. So wissen sie, aus welcher Richtung der Braten duftet.',
    },
    {id: 'hund-nase-3', text: 'Die feuchte Nase hilft beim Riechen. Duftstoffe bleiben auf ihr besser hängen.'},
    {
      id: 'hund-nase-4',
      text: 'Hunde lesen die Nachrichten mit der Nase. Der Spaziergang mit vielen Stopps ist Zeitunglesen.',
    },
    {
      id: 'hund-nase-5',
      text: 'Ein Hund merkt sich Menschen vor allem am Geruch. Ein neues Parfüm kann kurz für Verwirrung sorgen.',
    },
    {
      id: 'hund-rute-1',
      text: 'Wedeln heißt nicht immer Freude. Wie hoch und wie schnell die Rute geht, sagt oft mehr.',
    },
    {
      id: 'hund-kauen-1',
      text: 'Kauen beruhigt Hunde. Nach einem aufregenden Tag muss deshalb oft der Knochen dran glauben.',
    },
    {
      id: 'hund-regen-1',
      text: 'Viele Hunde mögen keinen Regen, gehen aber begeistert in jede Pfütze. Logik ist nicht ihre Stärke.',
    },
    {id: 'hund-rudel-1', text: 'Hunde sind Rudeltiere. Viele fressen entspannter, wenn jemand in der Nähe ist.'},
    {
      id: 'hund-alter-1',
      text: 'Ab wann ein Hund alt ist, hängt von seiner Größe ab. Kleine Hunde bleiben oft länger jung als große.',
    },
    {
      id: 'hund-alter-2',
      text: 'Ältere Hunde riechen und hören schlechter, und das Bett wird wichtiger. Der Napf wird trotzdem pünktlich erwartet.',
    },
    {id: 'hund-schlaf-1', text: 'Hunde schlafen 12 bis 14 Stunden am Tag, Welpen und Senioren noch mehr.'},
    {id: 'hund-schlaf-2', text: 'Hunde träumen. Das Zucken der Pfoten im Schlaf ist meist die Jagd im Traum.'},
    {
      id: 'hund-hoeren-1',
      text: 'Hunde hören viel höhere Töne als wir. Den Postboten hören sie lange, bevor es klingelt.',
    },
    {
      id: 'hund-sehen-1',
      text: 'Hunde sehen Bewegungen besser als Farben. Ein rotes Spielzeug im Gras ist für sie schwerer zu finden als ein blaues.',
    },
    {
      id: 'hund-koerper-1',
      text: 'Gähnen ist bei Hunden oft kein Zeichen von Müdigkeit, sondern von Stress oder Beschwichtigung.',
    },
    {
      id: 'hund-koerper-2',
      text: 'Die Spielverbeugung, Vorderkörper unten, Hinterteil oben, ist eine Einladung. Wer sie annimmt, hat einen Freund.',
    },
    {id: 'hund-schwitzen-1', text: 'Hunde schwitzen kaum. Sie kühlen sich über die Zunge und die Pfoten.'},
    {
      id: 'hund-zaehne-1',
      text: 'Hunde haben 42 Zähne, deutlich mehr als wir. Die meisten davon sind zum Reißen da, nicht zum Mahlen.',
    },
    {
      id: 'hund-wasser-1',
      text: 'Hunde trinken schlabbernd mit der Zunge, und dabei geht viel daneben. Die Pfütze neben dem Napf ist normal.',
    },
    {
      id: 'hund-laute-1',
      text: 'Bellen ist bei Hunden ein ganzes Vokabular: Begrüßung, Warnung, Aufforderung. Der Tonfall macht den Unterschied.',
    },
    {
      id: 'hund-tragen-1',
      text: 'Hunde tragen gern etwas im Maul herum. Der Schuh ist selten Beute, eher ein Mitbringsel.',
    },
    {
      id: 'hund-hitze-1',
      months: SUMMER,
      text: 'Bei Hitze fressen viele Hunde weniger und trinken mehr. Der Napf darf in den Schatten.',
    },
    {
      id: 'hund-hitze-2',
      months: SUMMER,
      text: 'Hunde kühlen sich über die Zunge. An heißen Tagen ist Hecheln Schwerstarbeit, und der Schatten ist der beste Platz.',
    },
    {
      id: 'hund-asphalt-1',
      months: SUMMER,
      text: 'Heißer Asphalt tut auch Hundepfoten weh. Der Handrücken auf dem Boden sagt, ob es zu heiß ist.',
    },
    {
      id: 'hund-heizung-1',
      months: HEATING,
      text: 'Im Winter ist der Platz vor der Heizung heiß begehrt. Das Fell hält warm, aber ein wenig Luxus schadet nicht.',
    },
    {
      id: 'hund-fell-fruehling',
      months: SPRING,
      text: 'Im Frühjahr fliegt das Winterfell. Bürsten hilft, und der Staubsauger macht Überstunden.',
    },
    {
      id: 'hund-fell-herbst',
      months: AUTUMN,
      text: 'Im Herbst wächst das Winterfell nach. Manche Hunde wirken dann doppelt so flauschig.',
    },
    {
      id: 'hund-herbstlaub',
      months: LEAVES,
      text: 'Herbstlaub ist für Hunde ein Fest: rascheln, wühlen, schnüffeln. Und zu Hause gibt es Blätter gratis dazu.',
    },
    {
      id: 'hund-regen-2',
      months: LEAVES,
      text: 'Nasser Hund riecht nach nassem Hund. Im Herbst öfter als sonst, und das Handtuch an der Tür hat Saison.',
    },
    {
      id: 'hund-gruen',
      months: GREEN,
      text: 'Das erste Grün im Frühjahr wird auch von Hunden probiert. Ein paar Halme Gras gehören für viele zum Spaziergang.',
    },
    {
      id: 'hund-silvester',
      months: DECEMBER,
      text: 'Silvester ist für Hundeohren laut. Ein ruhiger Raum und Gelassenheit helfen mehr als Trost.',
    },
    {
      id: 'hund-weihnachten',
      months: DECEMBER,
      text: 'Der Weihnachtsbaum ist für Hunde vor allem eins: ein Baum. Was Hunde mit Bäumen machen, weiß jeder.',
    },
    {
      id: 'hund-welthundetag',
      day: '10-10',
      text: 'Heute ist Welthundetag. Der Hund feiert das wie jeden Tag: mit vollem Einsatz.',
    },
  ],
  Kaninchen: [
    {id: 'kaninchen-daemmerung-1', text: 'Kaninchen fressen am meisten in der Dämmerung, morgens und abends.'},
    {id: 'kaninchen-heu-1', text: 'Heu sollte immer da sein. Das Kauen hält die Zähne der Kaninchen kurz.'},
    {id: 'kaninchen-verdauung-1', text: 'Kaninchen können nicht erbrechen. Umso wichtiger ist, was im Napf landet.'},
    {id: 'kaninchen-zaehne-1', text: 'Kaninchenzähne wachsen ein Leben lang. Nagen ist deshalb Pflicht, kein Hobby.'},
    {
      id: 'kaninchen-buddeln-1',
      text: 'Kaninchen buddeln von Natur aus. Eine Kiste mit Erde oder Sand ist für sie ein Spielplatz.',
    },
    {
      id: 'kaninchen-sozial-1',
      text: 'Kaninchen sind Gruppentiere. Allein gehalten fehlt ihnen etwas, das kein Mensch ersetzen kann.',
    },
    {
      id: 'kaninchen-sozial-2',
      text: 'Wenn Kaninchen sich gegenseitig putzen, ist das Zuneigung. Beim Menschen bedeutet das Stupsen: weitermachen.',
    },
    {
      id: 'kaninchen-laute-1',
      text: 'Kaninchen sind fast stumm. Ein Klopfen mit den Hinterläufen ist Alarm, ein leises Zähneknirschen meist Wohlbehagen.',
    },
    {
      id: 'kaninchen-koerper-1',
      text: 'Ein Kaninchen, das auf der Seite liegt und die Beine streckt, fühlt sich sicher. Das ist die höchste Auszeichnung.',
    },
    {
      id: 'kaninchen-binky-1',
      text: 'Der Luftsprung mit Körperdrehung heißt Binky. Ein Kaninchen macht ihn nur, wenn es ihm richtig gut geht.',
    },
    {
      id: 'kaninchen-sehen-1',
      text: 'Kaninchen sehen fast rundum, nur direkt vor der Nase nicht. Was im Napf liegt, wird erschnuppert.',
    },
    {
      id: 'kaninchen-hoeren-1',
      text: 'Kaninchenohren drehen sich unabhängig voneinander und sind ein Kühlsystem obendrein.',
    },
    {
      id: 'kaninchen-verdauung-2',
      text: 'Kaninchen fressen einen Teil ihres Kots noch einmal, den Blinddarmkot. Das ist normal und sogar wichtig.',
    },
    {id: 'kaninchen-trinken-1', text: 'Aus einer Schale trinken Kaninchen meist mehr als aus einer Flasche.'},
    {
      id: 'kaninchen-nacht-1',
      text: 'Kaninchen dösen tagsüber viel, oft mit offenen Augen. Wach sind sie in der Dämmerung.',
    },
    {
      id: 'kaninchen-hitze',
      months: SUMMER,
      text: 'Hitze ist für Kaninchen gefährlicher als Kälte. Ein Schattenplatz und kühle Fliesen sind im Sommer Gold wert.',
    },
    {
      id: 'kaninchen-heizung',
      months: HEATING,
      text: 'Kaninchen halten Kälte besser aus als trockene Heizungsluft. Das Winterfell ist dichter, als man denkt.',
    },
    {
      id: 'kaninchen-fell-fruehling',
      months: SPRING,
      text: 'Im Frühjahr wechseln Kaninchen das Fell, und zwar reichlich. Bürsten hilft, denn geschluckte Haare sind für sie ein Problem.',
    },
    {
      id: 'kaninchen-fell-herbst',
      months: AUTUMN,
      text: 'Im Herbst wächst das Winterfell. Ein Kaninchen sieht dann aus wie eine Kugel mit Ohren.',
    },
    {
      id: 'kaninchen-gruen',
      months: SPRING,
      text: 'Das erste Grün im Frühjahr ist für Kaninchen ein Festmahl. Ein paar Halme zum Anfang, damit der Bauch sich umgewöhnen kann.',
    },
    {
      id: 'kaninchen-herbstlaub',
      months: LEAVES,
      text: 'Herbstlaub wird von Kaninchen gern untersucht, manches Blatt auch gefressen. Buddeln macht darin doppelt Spaß.',
    },
    {
      id: 'kaninchen-silvester',
      months: DECEMBER,
      text: 'Böller sind für Kaninchen purer Stress. Ein abgedunkelter, ruhiger Platz hilft am Silvesterabend.',
    },
    {
      id: 'kaninchen-weihnachten',
      months: DECEMBER,
      text: 'Der Weihnachtsbaum ist für Kaninchen ein Nagebaum. Tannennadeln werden gern probiert, die Kabel der Lichterkette leider auch.',
    },
    {
      id: 'kaninchen-weltkaninchentag',
      day: year => nthSaturday(year, 9, 4),
      text: 'Heute ist Weltkaninchentag. Ein Grashalm extra wäre angemessen.',
    },
  ],
  Vogel: [
    {id: 'vogel-schmecken-1', text: 'Vögel haben nur wenige Hundert Geschmacksknospen.'},
    {
      id: 'vogel-sehen-1',
      text: 'Vögel sehen mehr Farben als wir, sogar Ultraviolett. Das bunte Gefieder ist für sie noch bunter.',
    },
    {
      id: 'vogel-koerner-1',
      text: 'Viele Vögel schälen jedes Korn einzeln mit dem Schnabel. Die Hülsen im Napf täuschen: Er ist nicht voll, nur voller Schalen.',
    },
    {
      id: 'vogel-schlaf-1',
      text: 'Vögel schlafen auf einem Bein, um Wärme zu sparen. Das andere steckt warm im Gefieder.',
    },
    {
      id: 'vogel-sozial-1',
      text: 'Die meisten Ziervögel sind Schwarmtiere. Zu zweit sind sie gesprächiger und ruhiger zugleich.',
    },
    {
      id: 'vogel-federn-1',
      text: 'Federn werden täglich geputzt und eingefettet. Die Bürzeldrüse liefert das Öl dafür.',
    },
    {
      id: 'vogel-hitze',
      months: SUMMER,
      text: 'Bei Hitze sperren Vögel den Schnabel auf und halten die Flügel leicht ab. Ein Bad hilft ihnen beim Abkühlen.',
    },
    {
      id: 'vogel-heizung',
      months: HEATING,
      text: 'Trockene Heizungsluft macht Vögeln zu schaffen. Ein Badehaus oder ein Sprühnebel sind jetzt beliebt.',
    },
    {
      id: 'vogel-mauser',
      months: [8, 9, 10],
      text: 'Nach dem Sommer beginnt bei vielen Vögeln die Mauser. Alte Federn fallen, neue wachsen, und der Käfigboden sieht aus wie ein Kissen.',
    },
    {
      id: 'vogel-fruehling',
      months: SPRING,
      text: 'Im Frühjahr singen Vögel am meisten. Das gilt drinnen wie draußen, ob der Nachbar es will oder nicht.',
    },
    {
      id: 'vogel-licht-winter',
      months: [11, 12, 1],
      text: 'Im Winter sind die Tage kurz, und Vögel richten sich nach dem Licht. Früher schlafen ist dann normal.',
    },
    {
      id: 'vogel-silvester',
      months: DECEMBER,
      text: 'Feuerwerk erschreckt Vögel besonders. An Silvester hilft ein abgedeckter Käfig in einem ruhigen Raum.',
    },
    {
      id: 'vogel-gruen',
      months: GREEN,
      text: 'Das erste Grün im Frühjahr ist auch für Vögel interessant: Frische Zweige und Kräuter werden gern zerpflückt.',
    },
    {
      id: 'vogel-herbstlaub',
      months: LEAVES,
      text: 'Ein Ast mit Herbstlaub im Käfig ist Beschäftigung pur. Zerlegt ist er schneller, als man ihn aufgehängt hat.',
    },
  ],
  Nager: [
    {id: 'nager-zaehne-1', text: 'Bei Nagern wachsen die Schneidezähne ein Leben lang nach.'},
    {
      id: 'nager-nacht-1',
      text: 'Viele Nager sind nachtaktiv. Das Laufrad um drei Uhr morgens ist keine Bosheit, sondern Programm.',
    },
    {
      id: 'nager-hamstern-1',
      text: 'Hamsterbacken sind echte Vorratstaschen. Was jetzt im Napf fehlt, liegt oft im Schlafhaus.',
    },
    {
      id: 'nager-riechen-1',
      text: 'Nager erkennen einander am Geruch. Nach dem Käfigputz ist die Wohnung erst mal fremd, bis sie wieder nach ihnen riecht.',
    },
    {
      id: 'nager-sozial-1',
      text: 'Meerschweinchen und Ratten leben in Gruppen, Goldhamster allein. Bei Nagern ist Gesellschaft eine Frage der Art.',
    },
    {
      id: 'nager-hoeren-1',
      text: 'Nager hören Töne, die für uns zu hoch sind. Vieles, was sie einander sagen, bekommen wir gar nicht mit.',
    },
    {
      id: 'nager-hitze',
      months: SUMMER,
      text: 'Hitze ist für Nager gefährlich, sie können kaum schwitzen. Eine kühle Fliese oder ein Tontopf im Käfig hilft.',
    },
    {
      id: 'nager-heizung',
      months: HEATING,
      text: 'Ein Käfig direkt an der Heizung wird zu trocken und zu warm. Nager mögen es gleichmäßig temperiert.',
    },
    {
      id: 'nager-herbst-vorrat',
      months: AUTUMN,
      text: 'Im Herbst hamstern viele Nager mehr als sonst. Der Vorrat im Schlafhaus wächst, auch ohne Winter im Haus.',
    },
    {
      id: 'nager-fruehling',
      months: SPRING,
      text: 'Im Frühjahr wechseln viele Nager das Fell. Ein bisschen mehr Flaum im Käfig ist normal.',
    },
    {
      id: 'nager-silvester',
      months: DECEMBER,
      text: 'Böller und Raketen erschrecken Nager sehr. Ein ruhiger Raum und ein Tuch über dem Käfig helfen an Silvester.',
    },
    {
      id: 'nager-gruen',
      months: GREEN,
      text: 'Das erste Grün im Frühjahr wird auch von Nagern gern probiert. Löwenzahn steht dabei hoch im Kurs.',
    },
    {
      id: 'nager-herbstlaub',
      months: LEAVES,
      text: 'Trockenes Herbstlaub im Käfig ist ein beliebtes Spiel: rascheln, wühlen, verstecken.',
    },
    {
      id: 'nager-weihnachten',
      months: DECEMBER,
      text: 'Der Weihnachtsbaum ist vielen Nagern egal, die herabfallenden Nadeln nicht. Sie werden gründlich untersucht.',
    },
  ],
};
export const GENERAL = [
  {id: 'allg-wasser-1', text: 'Frisches Wasser gehört zu jeder Mahlzeit.'},
  {id: 'allg-neu-1', text: 'Neues Futter am besten nach und nach unter das gewohnte mischen.'},
  {
    id: 'allg-uhr-1',
    text: 'Wer regelmäßig füttert, hat bald ein Tier, das die Uhr lesen kann. Zumindest zu den Fütterzeiten.',
  },
  {id: 'allg-napf-1', text: 'Napf und Wasserschale werden beim Putzen gern übersehen. Tiere merken es zuerst.'},
  {id: 'allg-routine-1', text: 'Tiere lieben Routine. Gleiche Zeiten, gleicher Platz, und der Tag hat Struktur.'},
  {
    id: 'allg-waage-1',
    text: 'Ob ein Tier zu- oder abnimmt, sieht man im Alltag kaum. Eine Waage sagt es zuverlässiger als das Auge.',
  },
  {
    id: 'allg-nase-1',
    text: 'Fast alle Haustiere entscheiden mit der Nase, ob etwas fressbar ist. Der Blick in den Napf ist nur die zweite Meinung.',
  },
  {
    id: 'allg-alter-1',
    text: 'Mit dem Alter ändert sich der Geschmack, bei Tieren wie bei Menschen. Ein neuer Favorit mit zehn ist keine Seltenheit.',
  },
  {
    id: 'allg-tagebuch-1',
    text: 'Wer mitschreibt, sieht Muster, die im Alltag untergehen. Genau dafür ist dieses Tagebuch da.',
  },
  {
    id: 'allg-spiel-1',
    text: 'Ein bisschen Spiel vor dem Fressen macht bei vielen Tieren Appetit. Bewegung gehört zum Rhythmus.',
  },
  {
    id: 'allg-leckerli-1',
    text: 'Ein Leckerli ist für ein Tier vor allem Zuwendung. Kalorien hat es trotzdem, auch wenn es klein aussieht.',
  },
  {
    id: 'allg-stille-1',
    text: 'Viele Tiere fressen lieber in Ruhe. Ein Napf im Durchgangsverkehr wird gern erst nachts geleert.',
  },
  {
    id: 'allg-hitze',
    months: SUMMER,
    text: 'Bei Hitze fressen viele Tiere weniger und trinken mehr. Ein zweiter Wassernapf im Schatten ist im Sommer nie verkehrt.',
  },
  {
    id: 'allg-heizung',
    months: HEATING,
    text: 'Heizungsluft trocknet Nasen, Fell und Federn. Frisches Wasser ist im Winter genauso wichtig wie im Sommer.',
  },
  {
    id: 'allg-fruehling',
    months: SPRING,
    text: 'Der Frühling weckt auch Haustiere: mehr Licht, mehr Bewegung, mehr Appetit.',
  },
  {
    id: 'allg-herbst',
    months: AUTUMN,
    text: 'Im Herbst wird das Fell dichter und der Schlafplatz wichtiger. Die Kuscheldecke hat wieder Saison.',
  },
  {
    id: 'allg-gruen',
    months: GREEN,
    text: 'Das erste Grün im Frühjahr lockt fast alle Haustiere nach draußen oder ans Fenster. Frühling riecht eben anders.',
  },
  {
    id: 'allg-herbstlaub',
    months: LEAVES,
    text: 'Raschelndes Laub gehört im Herbst zu den spannendsten Geräuschen für viele Tiere.',
  },
  {
    id: 'allg-silvester',
    months: DECEMBER,
    text: 'Silvester ist für die meisten Tiere kein Fest. Ein ruhiger Raum mit offener Tür ist das beste Geschenk.',
  },
  {
    id: 'allg-weihnachten',
    months: DECEMBER,
    text: 'Weihnachten ändert die Zeiten im Haus, und Tiere merken das. Die Fütterzeit bleibt für sie der Fixpunkt.',
  },
  {
    id: 'allg-zeitumstellung-fruehling',
    day: year => lastSunday(year, 3),
    text: 'Ab heute gibt es Frühstück eine Stunde früher. Zumindest laut Uhr.',
  },
  {
    id: 'allg-zeitumstellung-herbst',
    day: year => lastSunday(year, 10),
    text: 'Ab heute gibt es Frühstück eine Stunde später. Zumindest laut Uhr, das Tier sieht das anders.',
  },
  {
    id: 'allg-silvester-tag',
    day: '12-31',
    text: 'Feuerwerk heute Abend. Ein Rückzugsort mit offener Tür hilft mehr als gutes Zureden.',
  },
  {
    id: 'allg-neujahr',
    day: '01-01',
    text: 'Frohes neues Jahr! Für das Tier beginnt es wie jedes andere: mit der Frage, wann es Frühstück gibt.',
  },
  {
    id: 'allg-heiligabend',
    day: '12-24',
    text: 'Heiligabend. Das Tier wünscht sich vor allem, dass die Fütterzeit auch heute gilt.',
  },
  {
    id: 'allg-haustiertag',
    day: '04-11',
    text: 'Heute ist Tag des Haustiers. Ein Extra-Streicheln ist erlaubt, ein Extra-Leckerli auch.',
  },
];

/* The facts that hold on a day: those of the species with the general ones, for any other or a mixed household the
   general ones alone, in their months. dated: only those bound to this very day; otherwise those without a day. */
export function factsOn(species, date, dated = false) {
  const list = [...(FACTS[species] || []), ...GENERAL],
    month = date.getMonth() + 1,
    today = mmdd(date),
    year = date.getFullYear();
  const on = f => (typeof f.day === 'function' ? f.day(year) : f.day);
  return list.filter(f => (!f.months || f.months.includes(month)) && (dated ? on(f) === today : !f.day));
}

/* Every way of saying each kind of line, as templates with {places} that views/overview.js fills in. What is
   only true today (class 1) and what takes turns by the day (class 2); pick() there chooses one a day. Every kind
   has three, the first one the wording of 0.14.0. The names in a duel and a feeding run are people's. */
export const LINES = {
  birthdayAge: [
    '{pet} hat heute Geburtstag und wird {age}. Extra-Leckerli erlaubt.',
    'Heute wird {pet} {age}. Da darf der Napf ruhig etwas voller sein.',
    '{age} Jahre! {pet} hat heute Geburtstag, und das Leckerli geht aufs Haus.',
  ],
  birthdayToday: [
    '{pet} hat heute Geburtstag. Extra-Leckerli erlaubt.',
    'Heute ist ein großer Tag: {pet} hat Geburtstag. Der Napf darf ruhig etwas voller sein.',
    'Geburtstag! {pet} feiert heute, und das Leckerli geht aufs Haus.',
  ],
  birthdaySoon: [
    'In {days} hat {pet} Geburtstag.',
    'Nur noch {days}, dann hat {pet} Geburtstag. Das Geschenk darf gern fressbar sein.',
    '{pet} hat in {days} Geburtstag. Zeit, sich etwas Besonderes zu überlegen.',
  ],
  birthdayTomorrow: [
    'Morgen hat {pet} Geburtstag.',
    'Morgen ist es so weit: {pet} hat Geburtstag. Das Leckerli liegt hoffentlich schon bereit.',
    'Noch einmal schlafen, dann hat {pet} Geburtstag.',
  ],
  premiereLast: [
    'Das gab es heute zum ersten Mal. Mutig!',
    'Das gab es heute zum ersten Mal. Neues Futter, neues Glück.',
    'Eine Premiere heute: Das stand noch nie im Napf.',
  ],
  premiere: [
    'Heute zum ersten Mal im Napf: {sort}. Mutig!',
    'Neu im Napf heute: {sort}. Schauen wir mal.',
    'Premiere: {sort} gab es heute zum ersten Mal.',
  ],
  milestoneNext: [
    'Das nächste Füttern ist das {m}! Fast schon ein Jubiläum.',
    'Noch einmal füttern, dann steht das {m} Mal im Tagebuch. Jubiläumsstimmung liegt in der Luft.',
    'Das {m} Mal steht an. Beim nächsten Füttern ist es so weit.',
  ],
  milestone: [
    'Noch {n} füttern bis zum {m}. Fast schon ein Jubiläum.',
    'Nur noch {n} füttern, dann ist das {m} erreicht. Das Tagebuch zählt mit.',
    'Bis zum {m} sind es noch {n} füttern. Das Jubiläum rückt näher.',
  ],
  anniversary: [
    'Vor genau {span} ging es hier los. {n} Mahlzeiten seitdem.',
    'Heute vor {span} stand die erste Mahlzeit im Tagebuch. Seitdem sind {n} dazugekommen.',
    'Seit genau {span} wird hier mitgeschrieben, {n} Mahlzeiten lang. Zeit für ein kleines Jubiläum.',
  ],
  recordStreak: [
    '{days} am Stück, so lang war die Serie noch nie.',
    'Neuer Rekord: {days} in Folge im Tagebuch.',
    '{days} ohne Lücke, länger als je zuvor. Das nennt man Disziplin.',
  ],
  recordDay: [
    'Heute schon {n}, so viele gab es noch an keinem Tag.',
    'Rekordtag: {n}, mehr als je zuvor an einem Tag.',
    '{n} heute, ein neuer Rekord. Ob das Tier das auch so sieht?',
  ],
  earlier: [
    '{meal} heute {span} früher als sonst.',
    '{meal} gab es heute {span} früher als sonst. Jemand hatte es eilig.',
    'Heute war das {meal} {span} früher dran als gewohnt.',
  ],
  later: [
    '{meal} heute {span} später als sonst.',
    '{meal} gab es heute {span} später als sonst. Der Napf hat gewartet.',
    'Heute war das {meal} {span} später dran als gewohnt.',
  ],
  sameMinute: [
    'Auf die Minute wie gestern. Wer hier wen erzogen hat, ist die Frage.',
    'Dieselbe Uhrzeit wie gestern, auf die Minute. Die innere Uhr läuft.',
    'Auf die Minute genau wie gestern. Zufall gibt es bei Fütterzeiten nicht.',
  ],
  snacksCounted: ['Bei so vielen Snacks: {grip}', 'So viele Snacks an einem Tag: {grip}', 'Snacks über Snacks. {grip}'],
  snacks: ['Schon {n} heute: {grip}', 'Heute schon {n}. {grip}', '{n} an einem Tag: {grip}'],
  duel: [
    'Im Fütter-Duell dieser Woche führt {first} mit {n} zu {m}. {second}, da geht noch was!',
    'Fütter-Duell der Woche: {first} liegt mit {n} zu {m} vorn. {second}, Zeit aufzuholen.',
    '{first} führt das Fütter-Duell dieser Woche mit {n} zu {m} an. {second}, das Sofa hält dich nicht fest.',
  ],
  duelTie: [
    'Fütter-Duell dieser Woche: {score} zwischen {first} und {second}. Spannend!',
    'Gleichstand im Fütter-Duell: {score} für {first} und {second}. Die nächste Mahlzeit entscheidet.',
    '{first} und {second} liegen im Fütter-Duell dieser Woche gleichauf, {score}. Es bleibt spannend.',
  ],
  streak: [
    'Seit {since} lückenlos eingetragen. Dafür {you} ein Leckerli verdient.',
    'Seit {since} kein Tag ohne Eintrag. Das Tagebuch ist beeindruckt.',
    '{days} in Folge, jeden Tag ein Eintrag. Das nennt man Routine.',
  ],
  idea: [
    'Wie wär’s mal wieder mit {sort}? Das gab es seit {days} Tagen nicht.',
    '{sort} war zuletzt vor {days} Tagen dran. Vielleicht mal wieder?',
    'Kleine Erinnerung: {sort} gab es seit {days} Tagen nicht mehr.',
  ],
  feedRun: [
    '{name} hat {days} in Folge gefüttert. {other}, das Sofa vermisst dich nicht.',
    '{days} am Stück hat {name} gefüttert. {other}, du bist dran.',
    '{name} füttert seit {since} ohne Pause. {other}, das Tier kennt dich noch, oder?',
  ],
  feedRunAlone: [
    '{name} hat {days} in Folge gefüttert. Das nennt man Einsatz.',
    '{days} am Stück hat {name} gefüttert. Der Napf hat einen Stammgast.',
    '{name} füttert seit {since} ohne Pause. Zuverlässig wie ein Uhrwerk.',
  ],
  weekday: [
    '{weekday} gibt es meist {shift} {meal}, heute um {time}.',
    '{weekday} läuft der Tag anders: {meal} gibt es meist {shift}, heute um {time}.',
    'Am {day} ist {meal} meist {shift} dran als sonst, heute um {time}.',
  ],
  week: [
    'Diese Woche standen schon {meals} aus {sorts} auf dem Speiseplan.',
    '{meals} aus {sorts} diese Woche. Der Speiseplan ist gut gefüllt.',
    'Die Woche bisher: {meals}, {sorts}. Es geht voran.',
  ],
  lookback: [
    'Heute vor einem Jahr gab es {sort}.',
    'Vor genau einem Jahr stand {sort} im Napf. Erinnert sich noch jemand?',
    'Heute vor einem Jahr: {sort}. Die Zeit vergeht, der Napf bleibt.',
  ],
  sorts: [
    'Schon {n} probiert. Das Regal im Laden ist noch länger.',
    '{n} stehen bisher im Tagebuch. Für einen Feinschmecker ist das erst der Anfang.',
    'Bis jetzt {n} probiert. Das Sortiment ist damit nicht erschöpft.',
  ],
  days: [
    'Seit {since} im Tagebuch.',
    'Seit {since} wird hier mitgeschrieben. Aus Einträgen werden Muster.',
    '{days} Tagebuch, und es geht weiter. Jeder Eintrag zählt.',
  ],
};
/* A template with its places filled: „{pet}“ becomes what is given for pet, already escaped and set in bold by
   the caller */
export const fill = (template, values) => template.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? '');
