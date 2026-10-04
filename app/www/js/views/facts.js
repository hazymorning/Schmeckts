/* The overview card's sentences and the cat calendar's facts. Pure data so the tests can check them; they also
   measure every sentence in the real card. */
import {DAY, dayNumber} from '../dates.js';

/* By pool: the moment of the day (momentOf() in views/overview.js), a moment after a meal was left, a birthday.
   {time}, {span} and {pet} come bold; a sentence is only taken when the card knows all it names, {age} the age,
   {Sie} and {sie} the sex of the one pet shown. */
export const POOLS = {
  due: [
    'Die Uhr sagt {meal}, und sie ist hier nicht die Einzige.',
    'Das {meal} ist dran, das hat sich herumgesprochen.',
    'Ein besserer Moment fürs {meal} kommt nicht mehr.',
    'Wer jetzt in die Küche geht, hat sofort Begleitung.',
    'Nur falls es untergeht, das {meal} wäre jetzt dran.',
    'Das {meal} ist dran, also bitte nicht erst aufs Sofa.',
    'Zeit fürs {meal}, und zwar vor der nächsten Folge.',
    'Zeit fürs {meal}, die großen Augen warten schon.',
    'Der Napf ist leer und wird sehr gründlich bewacht.',
    'Ein Wunder, dass du noch sitzt. Das {meal} ist dran.',
    '{Sie} sitzt schon am Napf und tut, als wäre das Zufall.',
    '{Sie} weiß genau, wie spät es ist. Zeit fürs {meal}.',
  ],
  dueFirst: [
    'Heute war noch niemand am Napf, außer zum Nachgucken.',
    'Der Napf ist heute noch unberührt, aus Mangel an Inhalt.',
    'Der Tag läuft schon, nur der Napf ist noch nicht dabei.',
    'Zeit fürs {meal}, heute gab’s ja noch gar nichts.',
    'Heute ist der Napf noch leer, und das wird zum Thema.',
    'Noch nichts heute, und das wird persönlich genommen.',
    'Heute gab’s noch keinen Krümel, die Geduld lässt nach.',
    'Der erste Napf des Tages wird sehnsüchtig erwartet.',
    'Bisher gab’s heute nichts. Das lässt sich ja ändern.',
    'Zeit fürs {meal}, der Tag hat bisher nichts gebracht.',
    'Heute gab’s noch nichts, und {sie} lässt es dich spüren.',
    '{Sie} hat heute noch nichts bekommen und weiß das genau.',
  ],
  fresh: [
    'Der Napf ist voll, und für eine Weile bist du jetzt abgemeldet.',
    'Frisch serviert. Mal sehen, ob es so gut ankommt wie gedacht.',
    'Es gibt Futter, und damit ist erst mal alles gesagt.',
    'Jetzt wird geprüft, gekostet und hoffentlich aufgegessen.',
    'Gerade serviert. Ob’s schmeckt, zeigt sich gleich.',
    'Das Futter steht, der Rest liegt nicht mehr bei dir.',
    'Gerade gab’s Futter, jetzt dürfte kurz Ruhe sein.',
    'Die ersten Happen entscheiden über den ganzen Napf.',
    'Mahlzeit. Bis der Napf leer ist, herrscht Ruhe.',
    'Gerade aufgetischt, und die Welt ist kurz in Ordnung.',
    '{Sie} hat gerade zu tun, Störungen bitte erst später.',
    'Serviert. Jetzt entscheidet {sie}, ob es was taugt.',
  ],
  freshTreat: [
    'Ein Snack zwischendurch, rein aus Gründen der Höflichkeit.',
    'Es gab einen Snack, und keiner muss wissen, der wievielte.',
    'Ein Snack. Gebettelt wurde vorher natürlich nicht.',
    'Ein Leckerli hat noch keinem geschadet, sagt man hier.',
    'Jetzt ist leider bekannt, wo die Snacks liegen.',
    'Manche Blicke überzeugen eben, daher der Snack.',
  ],
  later: [
    'Bis {time} hilft nur Geduld, dann gibt’s wieder was.',
    'Das {meal} kommt gegen {time}, bis dahin wird gedöst.',
    'Bis {time} bleibt Zeit für ein ordentliches Nickerchen.',
    'Es dauert noch bis {time}, auch wenn es anders aussieht.',
    'Gegen {time} gibt’s mehr. Gewartet wird gern im Weg.',
    'Gegen {time} gibt’s {meal}, bis dahin ist der Napf Deko.',
    'Das {meal} ist für {time} verabredet, nicht früher.',
    'Gegen {time} gibt’s {meal}, so sicher wie jeden Tag.',
    'Bis {time} ist Pause. Der Napf weiß das, der Bauch nicht.',
    'Nachschub gibt’s gegen {time}, bis dahin heißt es warten.',
    'Bis {time} hält {sie} durch, mit Würde und Seufzern.',
    'Gegen {time} gibt’s {meal}, und {sie} weiß das längst.',
  ],
  morning: [
    'Heute gab’s noch nichts, aber gegen {time} ist es so weit.',
    'Der erste Napf heute kommt gegen {time}, versprochen.',
    'Gegen {time} gibt’s {meal}, bis dahin wird gegähnt.',
    'Vor {time} bleibt der Napf heute leer, danach nicht mehr.',
    'Das {meal} kommt gegen {time}, ein Weilchen noch.',
    'Gegen {time} gibt’s den ersten Napf. Darauf ist Verlass.',
    'Vor {time} gibt’s nichts, auch nicht für schöne Augen.',
    'Heute geht’s am Napf gegen {time} los, nicht früher.',
    'Gegen {time} gibt’s {meal}, {sie} zählt schon die Minuten.',
  ],
  done: [
    'Für heute ist alles gefressen, oder zumindest alles serviert.',
    'Alles serviert, morgen gegen {time} geht’s weiter.',
    'Der Napf hat Feierabend, das Betteln eher nicht.',
    'Heute gibt’s nichts mehr, da hilft auch kein Gucken.',
    'Das war’s für heute. Nachgeguckt wird trotzdem.',
    'Ab jetzt wird hier nur noch verdaut und geschlafen.',
    'Mehr gibt’s heute nicht, und dabei bleibt es auch.',
    'Was jetzt noch an Blicken kommt, ist Rahmenprogramm.',
    'Für heute ist Schluss, alles Weitere klärt sich morgen.',
    'Für heute ist Schluss, {sie} sieht das vermutlich anders.',
    'Alles serviert. {Sie} wird trotzdem noch mal nachsehen.',
  ],
  night: [
    'Wer um diese Uhrzeit Hunger hat, muss bis {time} durchhalten.',
    'Gefüttert wird gegen {time}, bis dahin ist Schlafenszeit.',
    'Jetzt schon Hunger? Futter gibt’s erst gegen {time}.',
    'Der Napf schläft bis {time}, eigentlich wie alle hier.',
    'Nachfragen ist zwecklos, Futter gibt’s erst gegen {time}.',
    'Falls du gleich geweckt wirst, bleib standhaft bis {time}.',
    'Schlaf gut. Der Napf öffnet wieder gegen {time}.',
    'Erst wird geschlafen, ums Futter geht’s gegen {time}.',
    'Das nächste Futter kommt gegen {time}, nicht vorher.',
    '{Sie} schläft hoffentlich, gefüttert wird gegen {time}.',
    'Falls {sie} dich weckt, Futter gibt’s erst gegen {time}.',
  ],
  today: [
    'Seit {span} wird verdaut, und das ganz in Ruhe.',
    'Das letzte Futter ist {span} her, alles im Lot.',
    'Seit {span} ist Ruhe am Napf, noch jedenfalls.',
    'Vor {span} gab’s Futter, seitdem wird gedöst.',
    'Nach {span} wird so langsam wieder nachgefragt.',
  ],
  yesterday: [
    'Heute ist noch alles offen, vor allem der Napf.',
    'Laut Tagebuch stand heute noch nichts im Napf.',
    'Das Tagebuch wartet heute geduldiger als der Rest.',
    'Falls heute schon gefüttert wurde, fehlt der Eintrag.',
    'Heute ist der Napf noch ein unbeschriebenes Blatt.',
  ],
  lastNight: [
    'Um diese Zeit gehört alles dem Schlaf, nicht dem Napf.',
    'Der Napf hat frei, und alle anderen hoffentlich auch.',
    'Am Napf ist Ruhe, und so soll es bis zum Morgen bleiben.',
    'Jetzt wird geschlafen, das Futter läuft nicht weg.',
    'Der Napf bleibt jetzt leer, egal wer gerade wach ist.',
    'Schlaf gut. Der Napf macht bis morgen früh dasselbe.',
  ],
  older: [
    'Den letzten Eintrag gab’s {since}. Willkommen zurück.',
    'Hier war eine Weile Ruhe. Schön, dass du wieder da bist.',
    'Das Tagebuch hatte Pause, der Napf hoffentlich nicht.',
    'Der letzte Eintrag ist etwas her. Einfach weitermachen.',
  ],
  none: [
    'Noch ist das Tagebuch leer. Mit dem ersten Napf geht es los.',
    'Das Tagebuch ist noch leer, der Napf vermutlich auch.',
    'Fürs erste Kapitel unten rechts auf „Füttern“ tippen.',
    'Hier beginnt das Tagebuch, sobald etwas im Napf landet.',
    'Alles ist bereit, jetzt fehlt nur noch das Futter.',
  ],
  leftDue: [
    'Zeit fürs {meal}. Vielleicht diesmal eine andere Sorte?',
    'Neues {meal}, neues Glück, das letzte war ja nichts.',
    'Zeit fürs {meal}, das letzte ist hoffentlich vergessen.',
    'Das {meal} ist dran, gern mal was anderes als zuletzt.',
  ],
  leftLater: [
    'Der nächste Versuch kommt gegen {time}, mit neuem Glück.',
    'Bis {time} ist Zeit, über die Sorte nachzudenken.',
    'Gegen {time} gibt’s Futter, diesmal mit mehr Begeisterung?',
  ],
  leftDone: [
    'Für heute ist Schluss. Morgen gibt’s eine neue Chance.',
    'Heute lief’s nicht rund, morgen wird neu probiert.',
    'Was übrig blieb, war wohl nicht ganz der Geschmack.',
  ],
  leftToday: ['Vor {span} lief’s eher zäh, seitdem ist Ruhe.', 'Seit {span} steht der Napf, eher unbeachtet.'],
  birthdayToday: [
    'Heute wird gefeiert, und der Napf darf voller sein.',
    'Ein Jahr älter und kein bisschen weniger hungrig.',
    'Alles Gute, und heute darf es ruhig etwas mehr sein.',
    'Das {age}. Jahr ist geschafft, darauf eine Extraportion.',
  ],
  birthdayTomorrow: [
    'Morgen ist Geburtstag, und {pet} ahnt noch nichts.',
    'Noch einmal schlafen, dann hat {pet} Geburtstag.',
  ],
};

const mmdd = d => `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// the clocks change on the last Sunday of March and October
function lastSunday(year, month) {
  const d = new Date(year, month, 0);
  d.setDate(d.getDate() - d.getDay());
  return mmdd(d);
}

/* The cat calendar. Keep ids stable. day: "MM-DD", or a function of the year for days that move; such a fact comes
   only then. months: 1-12, outside them the fact is skipped. */
export const FACTS = [
  {id: 'k001', text: 'Katzen hören bis etwa 85 Kilohertz, Hunde nur bis rund 45.'},
  {id: 'k002', text: 'Jedes Katzenohr hat 32 Muskeln und dreht sich unabhängig vom anderen.'},
  {id: 'k003', text: 'Was direkt vor der Nase liegt, sieht eine Katze nur verschwommen.'},
  {id: 'k004', text: 'Katzenpupillen weiten sich auf das 135-Fache, unsere auf das 15-Fache.'},
  {id: 'k005', text: 'Ganz ohne Licht sieht auch eine Katze nichts.'},
  {id: 'k006', text: 'Katzen sehen schon bei einem Sechstel des Lichts, das wir brauchen.'},
  {id: 'k007', text: 'Rot und Grün kann eine Katze kaum unterscheiden, Blau dagegen gut.'},
  {id: 'k008', text: 'Katzen sehen vermutlich UV-Licht, das für uns unsichtbar ist.'},
  {id: 'k009', text: 'Katzenaugen leuchten im Dunkeln dank einer Spiegelschicht im Auge.'},
  {id: 'k010', text: 'Süßes schmecken Katzen nicht, ihnen fehlt der Rezeptor dafür.'},
  {id: 'k011', text: 'Katzen haben nur rund 470 Geschmacksknospen, wir Tausende.'},
  {id: 'k012', text: 'Mit Schnupfen verweigern viele Katzen das Futter, sie riechen es nicht.'},
  {id: 'k013', text: 'Beim Flehmen, dem Grimassenziehen, riechen Katzen mit dem Gaumen.'},
  {id: 'k014', text: 'Katzen haben auch an den Vorderbeinen Tasthaare, kurz über der Pfote.'},
  {id: 'k015', text: 'Beim Zubeißen klappen die Schnurrhaare nach vorn und tasten mit.'},
  {id: 'k016', text: 'Jede Katzennase gilt als so einzigartig wie ein Fingerabdruck.'},
  {id: 'k017', text: 'Scharf sehen Katzen schlechter als wir, im Dunkeln aber viel besser.'},
  {id: 'k018', text: 'Das Blickfeld einer Katze umfasst rund 200 Grad, unseres etwa 180.'},
  {id: 'k019', text: 'Lose Schlüsselbeine lassen Katzen durch erstaunlich enge Lücken.'},
  {id: 'k020', text: 'Den losen Bauchbeutel, Urbeutel genannt, haben auch schlanke Katzen.'},
  {id: 'k021', text: 'Die Falte außen am Katzenohr heißt Henry-Tasche, ihr Zweck ist unklar.'},
  {id: 'k022', text: 'Katzen schwitzen nur an den Pfoten, beim Tierarzt sieht man es oft.'},
  {id: 'k023', text: 'Etwa jeder zehnte Knochen einer Katze steckt im Schwanz.'},
  {id: 'k024', text: 'Katzen laufen auf Zehenspitzen, die Ferse sitzt weit oben am Bein.'},
  {id: 'k025', text: 'Vorne haben Katzen fünf Zehen, hinten meist nur vier.'},
  {id: 'k026', text: 'In Hemingways Haus leben bis heute Katzen mit sechs Zehen.'},
  {id: 'k027', text: 'Kopfüber klettern Katzen schlecht, ihre Krallen zeigen nach hinten.'},
  {id: 'k028', text: 'Hohle Häkchen auf der Zunge tragen beim Putzen Speichel ins Fell.'},
  {id: 'k029', text: 'Ist das dritte Augenlid einer Katze zu sehen, stimmt oft etwas nicht.'},
  {id: 'k030', text: 'Getigerte Katzen tragen fast alle ein M auf der Stirn.'},
  {id: 'k031', text: 'Die Farbe der Pfotenballen passt meist zur Fellfarbe darüber.'},
  {id: 'k032', text: 'Siamkatzen werden dort dunkel, wo ihr Körper am kühlsten ist.'},
  {id: 'k033', text: 'Dreifarbige Glückskatzen sind fast immer weiblich.'},
  {id: 'k034', text: 'Rote Katzen sind meistens Kater, etwa vier von fünf.'},
  {id: 'k035', text: 'Weiße Katzen mit blauen Augen sind auffällig oft taub.'},
  {id: 'k036', text: 'Alle Kätzchen kommen mit blauen Augen zur Welt.'},
  {id: 'k037', text: 'Katzen haben Blutgruppen, nämlich A, B und das seltene AB.'},
  {id: 'k038', text: 'Katzen können kaum kauen, ihre Backenzähne schneiden wie Scheren.'},
  {id: 'k039', text: 'Mit rund 50 Wirbeln ist eine Katze viel biegsamer als wir mit 33.'},
  {id: 'k040', text: 'Im Sprint schafft eine Hauskatze kurz fast 50 Kilometer pro Stunde.'},
  {id: 'k041', text: 'Aus dem Stand springen Katzen etwa fünfmal so hoch, wie sie groß sind.'},
  {id: 'k042', text: 'Den Dreh im Fall beherrschen Kätzchen mit etwa sieben Wochen.'},
  {id: 'k043', text: 'Neugeborene Kätzchen sind blind und taub, das Schnurren spüren sie.'},
  {id: 'k044', text: 'Eine Katzenschwangerschaft dauert nur gut neun Wochen.'},
  {id: 'k045', text: 'Kätzchen aus einem Wurf können verschiedene Väter haben.'},
  {id: 'k046', text: 'Kater sind öfter Linkspfoter, Katzen öfter Rechtspfoter.'},
  {id: 'k047', text: 'Wie Katzen schnurren, ist bis heute nicht ganz geklärt.'},
  {id: 'k048', text: 'An der Schnauze sitzen meist 24 Schnurrhaare, in vier Reihen.'},
  {id: 'k049', text: 'Draußen frisst eine Katze rund zehn Mäuse am Tag, jede eine Mahlzeit.'},
  {id: 'k050', text: 'Mit vollem Napf fressen Katzen bis zu zwanzigmal am Tag ein bisschen.'},
  {id: 'k051', text: 'Neues Futter schmeckt Katzen oft am besten, bis es nicht mehr neu ist.'},
  {id: 'k052', text: 'Hat ein Futter mal Übelkeit gemacht, meiden Katzen es oft lange.'},
  {id: 'k053', text: 'Am liebsten fressen Katzen ihr Futter etwa körperwarm, wie Beute.'},
  {id: 'k054', text: 'Katzen stammen aus Wüste und Steppe, Fisch war dort kaum zu haben.'},
  {id: 'k055', text: 'Katzen trinken wenig, ihre Vorfahren bekamen Wasser aus der Beute.'},
  {id: 'k056', text: 'Viele Katzen trinken lieber weit weg vom Futternapf.'},
  {id: 'k057', text: 'Beim Trinken ziehen Katzen mit der Zungenspitze eine Wassersäule hoch.'},
  {id: 'k058', text: 'Ohne Taurin im Futter werden Katzen blind und herzkrank.'},
  {id: 'k059', text: 'Katzen können aus Möhren kein Vitamin A gewinnen, nur aus Fleisch.'},
  {id: 'k060', text: 'Milch vertragen die meisten erwachsenen Katzen schlecht.'},
  {id: 'k061', text: 'Zwiebeln und Knoblauch sind für Katzen giftig, auch gekocht.'},
  {id: 'k062', text: 'Schon Blütenstaub von Lilien kann für Katzen tödlich sein.'},
  {id: 'k063', text: 'Katzen fressen am liebsten allein, sie sind geborene Einzeljäger.'},
  {id: 'k064', text: 'Flache, breite Näpfe mögen viele Katzen lieber als tiefe.'},
  {id: 'k065', text: 'Gras fressen Katzen auch ohne Bauchweh. Warum, ist noch unklar.'},
  {id: 'k066', text: 'Beim Betteln mischen Katzen ins Schnurren einen Ton wie Babyweinen.'},
  {id: 'k067', text: 'In einer Studie wählte die Hälfte der Katzen Zuwendung statt Futter.'},
  {id: 'k068', text: 'Manche rohen Fische enthalten ein Enzym, das Vitamin B1 zerstört.'},
  {id: 'k069', text: 'Katzen jagen auch satt, Hunger und Jagdtrieb sind getrennt gesteuert.'},
  {id: 'k070', text: 'Nassfutter besteht zu vier Fünfteln aus Wasser, Trockenfutter kaum.'},
  {id: 'k071', text: 'Was die Mutter fraß, mögen Kätzchen später oft auch.'},
  {id: 'k072', text: 'Erwachsene Katzen miauen kaum untereinander. Das Miau ist für uns.'},
  {id: 'k073', text: 'Katzen schnurren auch, wenn sie Schmerzen oder Angst haben.'},
  {id: 'k074', text: 'Blinzelst du langsam, blinzeln viele Katzen zurück. Das ist ein Gruß.'},
  {id: 'k075', text: 'Ein senkrecht hochgestellter Schwanz ist ein freundliches Hallo.'},
  {id: 'k076', text: 'Beim Köpfchengeben markiert dich deine Katze mit Duft aus den Wangen.'},
  {id: 'k077', text: 'Beim Krallenwetzen hinterlassen Katzen Duftmarken aus den Pfoten.'},
  {id: 'k078', text: 'Beim Milchtritt treten Katzen wie einst an der Zitze ihrer Mutter.'},
  {id: 'k079', text: 'Das Keckern beim Anblick von Vögeln ist bis heute nicht ganz erklärt.'},
  {id: 'k080', text: 'Für die plötzlichen Rennattacken gibt es einen Fachbegriff: FRAP.'},
  {id: 'k081', text: 'Katzen erkennen ihren Namen. Ob sie reagieren, ist eine andere Frage.'},
  {id: 'k082', text: 'Katzen erkennen die Stimme ihres Menschen unter fremden Stimmen.'},
  {id: 'k083', text: 'Katzen merken sich, wo du bist, auch wenn sie dich nur hören.'},
  {id: 'k084', text: 'Katzen binden sich an ihre Menschen ähnlich wie Babys an ihre Eltern.'},
  {id: 'k085', text: 'Im Tierheim senkte ein simpler Karton den Stress von Katzen messbar.'},
  {id: 'k086', text: 'Katzen setzen sich sogar in Quadrate aus Klebeband auf dem Boden.'},
  {id: 'k087', text: 'Katzen sind dämmerungsaktiv. Der frühe Morgen gehört leider dazu.'},
  {id: 'k088', text: 'Eine Katze verschläft rund zwei Drittel ihres Lebens.'},
  {id: 'k089', text: 'Zuckende Pfoten im Schlaf: Katzen haben Traumschlaf wie wir.'},
  {id: 'k090', text: 'Katzen putzen sich bis zur Hälfte ihrer wachen Zeit.'},
  {id: 'k091', text: 'Auf Katzenminze reagieren längst nicht alle Katzen, das ist erblich.'},
  {id: 'k092', text: 'Kätzchen unter einem halben Jahr lässt Katzenminze meist kalt.'},
  {id: 'k093', text: 'Das Wälzen in Katzenminze schützt Katzen wohl auch vor Mücken.'},
  {id: 'k094', text: 'Katzen mögen keinen Zitrusduft. Deine Orange ist sicher.'},
  {id: 'k095', text: 'Katzen kommen gern mit aufs Klo. Da hast du ja Zeit.'},
  {id: 'k096', text: 'Verwilderte Katzen leben oft in Gruppen, meist verwandte Weibchen.'},
  {id: 'k097', text: 'Spielzeug wirkt wie Beute, wenn es sich von der Katze wegbewegt.'},
  {id: 'k098', text: 'Dasselbe Spielzeug langweilt Katzen schon nach wenigen Minuten.'},
  {id: 'k099', text: 'Türkisch-Van-Katzen gehen freiwillig schwimmen.'},
  {id: 'k100', text: 'Auf Zypern lag schon vor 9500 Jahren eine Katze in einem Menschengrab.'},
  {id: 'k101', text: 'Alle Hauskatzen stammen von der Afrikanischen Wildkatze ab.'},
  {id: 'k102', text: 'Im alten Ägypten trauerte man um die Katze mit rasierten Augenbrauen.'},
  {id: 'k103', text: 'Katzen wurden in Ägypten millionenfach mumifiziert.'},
  {id: 'k104', text: 'Die nordische Göttin Freya fuhr einen Wagen, gezogen von zwei Katzen.'},
  {id: 'k105', text: 'Die erste Katze im All hieß Félicette und flog 1963 für Frankreich.'},
  {id: 'k106', text: 'Auf Shackletons Schiff fuhr ein Kater mit, er hieß Mrs. Chippy.'},
  {id: 'k107', text: 'Der Schiffskater Simon bekam 1949 eine britische Tapferkeitsmedaille.'},
  {id: 'k108', text: 'Ein Kater namens Stubbs war 20 Jahre Ehrenbürgermeister in Alaska.'},
  {id: 'k109', text: 'In Japan war eine Katze namens Tama offiziell Bahnhofsvorsteherin.'},
  {id: 'k110', text: 'Die Eremitage in Sankt Petersburg beschäftigt seit Langem Katzen.'},
  {id: 'k111', text: 'In der Downing Street gibt es ein Amt für den obersten Mäusefänger.'},
  {id: 'k112', text: 'Auf Churchills Landsitz lebt stets ein roter Kater namens Jock.'},
  {id: 'k113', text: 'In Japan gibt es Inseln, auf denen mehr Katzen als Menschen leben.'},
  {id: 'k114', text: 'Das erste Katzencafé eröffnete 1998 in Taipeh, nicht in Japan.'},
  {id: 'k115', text: 'Schon 1894 filmte das Edison-Studio zwei boxende Katzen.'},
  {id: 'k116', text: 'Die älteste bekannte Katze, Creme Puff aus Texas, wurde 38 Jahre alt.'},
  {id: 'k117', text: 'Winkt die japanische Glückskatze links, lockt sie Kunden, rechts Geld.'},
  {id: 'k118', text: 'Newton soll die Katzenklappe erfunden haben. Belegt ist das nicht.'},
  {id: 'k119', text: 'Percy Shaw erfand 1934 die Katzenaugen auf Straßen, dank einer Katze.'},
  {id: 'k120', text: 'Die Katze ist Deutschlands häufigstes Haustier, klar vor dem Hund.'},
  {id: 'k121', text: 'In Deutschland leben wieder Tausende Wildkatzen, vor allem im Wald.'},
  {id: 'k122', text: 'Die Wildkatze hat einen buschigen Schwanz mit stumpfem schwarzem Ende.'},
  {id: 'k123', text: 'Der Kater am Morgen danach kommt vom Katarrh, nicht vom Tier.'},
  {id: 'k124', text: '„Mieze“ war ursprünglich ein Kosename für Maria.'},
  {id: 'k125', text: 'Im Deutschen haben Katzen sieben Leben, im Englischen neun.'},
  {id: 'k126', text: 'Auf Japanisch macht die Katze „nyan“, auf Koreanisch „yaong“.'},
  {id: 'k127', text: '„Katzenwäsche“ ist eigentlich unfair, Katzen putzen sich stundenlang.'},
  {id: 'k128', text: 'Die alten Ägypter nannten die Katze „miu“. Klingt vertraut.'},
  {id: 'k129', text: 'Schwarze Katzen gelten in Großbritannien und Japan als Glücksbringer.'},
  {id: 'k130', text: 'Allergien löst ein Eiweiß aus Speichel und Haut aus, nicht das Fell.'},
  {id: 'k131', text: 'Löwen können brüllen, aber kaum schnurren. Hauskatzen umgekehrt.'},
  {id: 'k132', text: 'Die Schwarzfußkatze fängt bei etwa jeder zweiten Jagd etwas.'},
  {id: 'k133', text: 'Geparden können nicht brüllen, aber zwitschern wie Vögel.'},
  {id: 'k134', text: 'Tiger sind auch auf der Haut gestreift, nicht nur im Fell.'},
  {id: 'k135', text: 'Schneeleoparden nutzen ihren langen Schwanz als Schal.'},
  {id: 'k136', text: 'Mit zwei Jahren ist eine Katze umgerechnet etwa 24 Menschenjahre alt.'},
  {id: 'k137', text: 'Nach dem zweiten Jahr zählt jedes Katzenjahr etwa vier Menschenjahre.'},
  {id: 'k138', text: 'Wohnungskatzen werden im Schnitt deutlich älter als Freigänger.'},
  {id: 'k139', text: 'Heute ist Weltkatzentag. Bei dir ist das ja jeden Tag.', day: '08-08'},
  {id: 'k140', text: 'Heute ist Tag der Katze, jedenfalls in Europa. Im August nochmal.', day: '02-17'},
  {
    id: 'k141',
    text: 'Zeitumstellung? Der Katzenmagen stellt sich nicht um.',
    day: year => [lastSunday(year, 3), lastSunday(year, 10)],
  },
  {id: 'k142', text: 'Bei Hitze fressen viele Katzen weniger und lieber abends.', months: [6, 7, 8]},
  {id: 'k143', text: 'Im Herbst wächst das dichtere Winterfell. Das ist kein Speck.', months: [9, 10, 11]},
  {id: 'k144', text: 'Im Frühjahr verlieren Katzen ihr Winterfell, Bürsten hilft.', months: [3, 4, 5]},
  {id: 'k145', text: 'Bei Silvesterkrach hilft ein Versteck mehr als Zureden.', day: '12-31'},
  {id: 'k146', text: 'Lametta lieber weglassen, Katzen verschlucken es leicht.', months: [12]},
];

// mixed once with a fixed seed, the same order on every phone
function shuffled(list, seed) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const j = Math.floor((seed / 2 ** 32) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
// the seed keeps facts up to two apart in the list, often on the same theme, off days in a row
const ORDER = shuffled(
  FACTS.filter(f => !f.day),
  2093,
);
const START = 20454; // 1 January 2026 as dayNumber() counts it
const inSeason = (f, month) => !f.months || f.months.includes(month);
// dayNumber() counts a local date as UTC counts the same date
const monthOf = day => new Date((day + 0.5) * DAY).getUTCMonth() + 1;

// a fact bound to this day, which comes before the others
export function datedOn(date) {
  const d = new Date(date),
    on = mmdd(d);
  return FACTS.find(f => [typeof f.day === 'function' ? f.day(d.getFullYear()) : f.day].flat().includes(on)) || null;
}

/* One sheet a day from START on, every fact in its turn; one out of season is skipped, so none comes twice before
   the others have had their turn. torn: sheets torn off on this phone, each the next fact in season. */
export function factOn(date, torn = 0) {
  const today = dayNumber(date);
  let at = 0;
  for (let day = Math.min(START, today); ; day++) {
    const month = monthOf(day);
    while (!inSeason(ORDER[at % ORDER.length], month)) at++;
    if (day === today) break;
    at++;
  }
  const open = ORDER.filter(f => inSeason(f, monthOf(today)));
  return open[(open.indexOf(ORDER[at % ORDER.length]) + torn) % open.length];
}

// values come escaped from the caller; one missing stays as it is, so a test sees it
export const fill = (template, values) => template.replace(/\{(\w+)\}/g, (all, key) => values[key] ?? all);
// small words a heading and its sentence may share without sounding repetitive
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
