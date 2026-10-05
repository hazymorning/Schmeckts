/* The overview card's sentences and the cat calendar's sheets. Pure data so the tests can check them; they also
   measure every text in the real card and on the real sheet. */
import {DAY, dayKey, dayNumber} from '../dates.js';
import {esc} from '../text.js';
import {sexOf} from '../config.js';

/* By pool: the moment of the day (momentOf() in views/overview.js), a moment after a meal was left, a birthday.
   One sentence, set in two full lines of the card. [Katze] in front: only where every pet shown is a cat. {time},
   {span} and {pet} come bold; a sentence is only taken when the card knows all it names, {age} the age, {Sie} and
   {sie} the sex of the one pet shown. */
export const POOLS = {
  due: [
    'Die Uhr sagt {meal}, der Bauch sagt das schon länger.',
    'Das {meal} ist dran, und die erste Reihe ist besetzt.',
    'Es ist Zeit fürs {meal}. Das wurde dir bereits mitgeteilt.',
    'Das {meal} ist fällig, und die Blicke werden deutlicher.',
    'Wer jetzt in die Küche geht, bekommt sofort Begleitung.',
    'Das {meal} ist dran. Ein Wunder, dass du da noch sitzt.',
    'Zeit fürs {meal}, und zwar noch vor der nächsten Folge.',
    '[Katze] Es ist so weit, dein Bein wurde bereits informiert.',
    '[Katze] Das {meal} ist fällig, und es wird im Minutentakt miaut.',
    '[Katze] Zeit fürs {meal}, es läuft Napfkontrolle Nummer drei.',
    '{Sie} sitzt schon am Napf und tut, als wäre das Zufall.',
    '{Sie} weiß genau, wie spät es ist, nämlich Zeit fürs {meal}.',
  ],
  dueFirst: [
    'Heute gab’s noch nichts, und das hat sich herumgesprochen.',
    'Der Tag läuft schon eine Weile, nur der Napf noch nicht.',
    'Der Napf ist heute noch unberührt, aus Mangel an Inhalt.',
    'Zeit fürs {meal}, denn heute gab’s ja noch gar nichts.',
    'Noch nichts heute, und das wird hier persönlich genommen.',
    'Heute war noch niemand am Napf, außer zum Nachgucken.',
    '[Katze] Bisher gab’s nichts, und der Ton wird langsam vorwurfsvoll.',
    '[Katze] Heute noch nichts im Napf. Das wird gerade laut besprochen.',
    'Heute gab’s noch nichts, und {sie} lässt es dich spüren.',
    '{Sie} hat heute noch nichts bekommen und weiß das genau.',
  ],
  fresh: [
    'Gerade serviert, und ob’s schmeckt, zeigt sich gleich.',
    'Der Napf ist voll, und für eine Weile bist du abgemeldet.',
    'Frisch serviert, und die Begutachtung läuft. Bitte leise.',
    'Es gibt Futter, und damit ist erst mal alles gesagt.',
    'Das Futter steht. Der Rest liegt jetzt nicht mehr bei dir.',
    '[Katze] Gerade serviert. Erst wird gerochen, gefressen später.',
    '[Katze] Frisch serviert. Mal sehen, ob das hier gut genug ist.',
    '{Sie} ist gerade beschäftigt, also bitte nicht stören.',
    'Serviert. Jetzt entscheidet {sie}, ob das hier was taugt.',
  ],
  freshTreat: [
    'Ein Snack zwischendurch, rein aus Gründen der Höflichkeit.',
    'Es gab einen Snack. Wie viele heute schon, bleibt geheim.',
    'Ein Snack. Gebettelt wurde vorher selbstverständlich nicht.',
    'Manche Blicke überzeugen eben, daher dieser Snack.',
    '[Katze] Die Snacktüte hat geraschelt, und mehr braucht es nicht.',
  ],
  later: [
    '{meal} gibt’s gegen {time}, bis dahin wird ausgiebig gedöst.',
    'Gegen {time} gibt’s wieder was. Fragen ist zwecklos, aber üblich.',
    'Bis {time} ist Pause, aber der Bauch weiß davon nichts.',
    'Gegen {time} gibt’s mehr. Bis dahin wird im Weg gewartet.',
    'Gegen {time} gibt’s {meal}, so zuverlässig wie jeden Tag.',
    'Bis {time} ist noch Zeit für ein ordentliches Nickerchen.',
    '[Katze] Gegen {time} gibt’s {meal}, bis dahin wird nur gestarrt.',
    '[Katze] Bis {time} ist Pause. Der Napf wird trotzdem bewacht.',
    '[Katze] Futter gibt’s gegen {time}, vorher gibt’s nur Theater.',
    'Bis {time} hält {sie} noch durch, mit Würde und Seufzern.',
    'Gegen {time} gibt’s {meal}, und {sie} weiß das längst.',
  ],
  morning: [
    'Heute gab’s noch nichts, aber gegen {time} ist es so weit.',
    'Gefüttert wird heute ab {time}, und darauf ist Verlass.',
    'Vor {time} gibt’s nichts, auch nicht für schöne Augen.',
    '{meal} gibt’s gegen {time}, bis dahin heißt es durchhalten.',
    '[Katze] Heute geht’s gegen {time} los, vorher wird nur laut erinnert.',
    '[Katze] Vor {time} bleibt der Napf leer. Gemaunzt wird trotzdem.',
    'Gegen {time} gibt’s {meal}, {sie} zählt schon die Minuten.',
  ],
  done: [
    'Mehr gibt’s heute nicht, aber fragen kostet ja nichts.',
    'Für heute ist alles serviert. Geprüft wird trotzdem noch.',
    'Für heute ist alles gefressen, oder zumindest alles serviert.',
    'Feierabend am Napf, zumindest für alle, die das akzeptieren.',
    'Heute gibt’s nichts mehr, da hilft auch kein Gucken.',
    'Das war’s für heute, morgen gegen {time} geht’s weiter.',
    'Alles ist serviert, der Rest des Tages ist Rahmenprogramm.',
    '[Katze] Der Napf hat Feierabend, das Miauen hat noch Spätschicht.',
    '[Katze] Heute kommt nichts mehr, auch nicht um vier Uhr früh.',
    '[Katze] Für heute ist Schluss. Die Katze sieht das noch anders.',
    'Für heute ist Schluss, {sie} sieht das vermutlich anders.',
    'Alles serviert, aber {sie} wird trotzdem noch mal nachsehen.',
  ],
  night: [
    'Es ist mitten in der Nacht, gefüttert wird erst ab {time}.',
    'Um diese Uhrzeit gibt’s nichts, auch nicht auf Nachfrage.',
    'Wer jetzt Hunger hat, muss leider bis {time} durchhalten.',
    'Der Napf schläft bis {time}, so wie eigentlich alle hier.',
    'Falls du gleich geweckt wirst: Gefüttert wird erst ab {time}.',
    '[Katze] Nachts gibt’s nichts, auch nicht auf deinem Gesicht.',
    '[Katze] Du schläfst. Der Rest der Wohnung geht auf die Jagd.',
    '[Katze] Futter gibt’s ab {time}, geweckt wird aber trotzdem vorher.',
    '{Sie} schläft hoffentlich noch, gefüttert wird erst ab {time}.',
    'Falls {sie} dich gleich weckt: Futter gibt’s erst ab {time}.',
  ],
  today: [
    'Hier wird gerade in aller Ruhe verdaut, bitte nicht stören.',
    'Zuletzt gab’s vor {span} was, seitdem ist Ruhe.',
    'Erst gefressen, dann gedöst. Ein solider Tag bis hierhin.',
    '[Katze] Gefressen, geputzt, geschlafen, also das volle Programm.',
  ],
  yesterday: [
    'Heute ist noch alles offen, und vor allem der Napf.',
    'Laut Tagebuch gab’s noch nichts, hoffentlich irrt es sich.',
    'Das Tagebuch wartet heute deutlich geduldiger als der Rest.',
    'Falls heute schon gefüttert wurde, fehlt noch der Eintrag.',
  ],
  lastNight: [
    'Um diese Zeit gehört alles dem Schlaf und nicht dem Napf.',
    'Der Napf hat frei, und alle anderen hoffentlich auch.',
    'Jetzt wird geschlafen, das Futter läuft ja nicht weg.',
    'Der Napf bleibt jetzt leer, egal wer gerade wach ist.',
    '[Katze] Um diese Uhrzeit wird gejagt, hoffentlich nur Spielzeug.',
  ],
  older: [
    'Hier war eine Weile Ruhe. Schön, dass du wieder da bist.',
    'Das Tagebuch hatte eine Pause, der Napf hoffentlich nicht.',
    'Eine Weile gab’s keinen Eintrag, gefressen wurde trotzdem.',
    'Lange nichts notiert. Einfach mit dem nächsten Napf weiter.',
  ],
  none: [
    'Das Tagebuch ist noch leer, der Napf vermutlich auch.',
    'Noch ist hier alles leer. Mit dem ersten Napf geht’s los.',
    'Alles ist bereit, jetzt fehlt eigentlich nur noch das Futter.',
    'Für das erste Kapitel unten rechts auf „Füttern“ tippen.',
  ],
  leftDue: [
    'Zeit fürs {meal}. Vielleicht diesmal eine andere Sorte?',
    'Neuer Versuch, neues Glück, der letzte war ja nichts.',
    'Das {meal} ist fällig, und das letzte vergessen wir.',
    'Das {meal} ist dran, und diesmal gern mal was anderes.',
  ],
  leftLater: [
    'Gegen {time} wird neu probiert, gern mit mehr Begeisterung.',
    'Bis {time} ist noch Zeit, über die Sorte nachzudenken.',
  ],
  leftDone: [
    'Für heute ist Schluss, und morgen gibt’s neue Chancen.',
    'Was übrig blieb, traf wohl nicht ganz den Geschmack.',
    'Heute lief’s nicht rund, morgen wird einfach neu probiert.',
  ],
  leftToday: [
    'Die letzte Runde lief eher zäh, seitdem ist Ruhe am Napf.',
    'Seit {span} steht der Napf eher unbeachtet da.',
  ],
  birthdayToday: [
    'Heute wird gefeiert, und der Napf darf etwas voller sein.',
    'Ein Jahr älter und dabei kein bisschen satter geworden.',
    'Alles Gute zum Ehrentag, heute darf es etwas mehr sein.',
    'Das {age}. Jahr ist geschafft, darauf eine Extraportion.',
  ],
  birthdayTomorrow: [
    'Morgen ist Geburtstag, und {pet} ahnt noch nichts.',
    'Nur noch einmal schlafen, dann hat {pet} Geburtstag.',
  ],
};

const mmdd = d => `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// the clocks change on the last Sunday of March and October
function lastSunday(year, month) {
  const d = new Date(year, month, 0);
  d.setDate(d.getDate() - d.getDay());
  return mmdd(d);
}

/* The cat calendar by format, a format for each weekday (WEEK). Keep ids stable. verdict, back: the stamp and the
   answer on the back of a Stimmt’s?. m, f: the wording for the household's one cat of that sex, {name} its name;
   {deine Katze} becomes „dein Kater“ for a tom. months, only in Wissen: 1-12, outside them the sheet is skipped. */
export const FACTS = {
  Katzenlogik: [
    {id: 'lo001', text: 'Der beste Platz ist immer der, auf dem du gerade sitzen wolltest.'},
    {id: 'lo002', text: 'Ein Karton für zwei Euro schlägt jedes Katzenbett für achtzig.'},
    {id: 'lo003', text: 'Eine geschlossene Tür ist für jede Katze eine offene Frage.'},
    {id: 'lo004', text: 'Was auf dem Tisch steht, steht dort nur vorläufig, bis die Katze kommt.'},
    {id: 'lo005', text: 'Frisch gewaschene, warme Wäsche zieht Katzen an wie sonst nichts im Haus.'},
    {id: 'lo006', text: 'Sobald man den Boden sieht, gilt ein Napf bei Katzen als leer.'},
    {id: 'lo007', text: 'Je teurer das Spielzeug, desto spannender die Verpackung.'},
    {id: 'lo008', text: 'Schmusen will die Katze genau dann, wenn du gehen musst.'},
    {id: 'lo009', text: 'Wer sich mit Katze auf den Boden setzt, gilt ab sofort als Möbelstück.'},
    {id: 'lo010', text: 'Eine Zeitung wird erst interessant, wenn gerade jemand darin liest.'},
    {id: 'lo011', text: 'Laptop auf, Katze drauf. Wärme und Aufmerksamkeit in einem.'},
    {id: 'lo012', text: 'Um vier Uhr morgens wird Frühstück zur sehr dringenden Angelegenheit.'},
    {id: 'lo013', text: 'Katzen kommen gern mit aufs Klo, denn da hast du ja endlich mal Zeit.'},
    {id: 'lo014', text: 'Jede Tür muss geöffnet werden, durchgehen ist dann optional.'},
    {id: 'lo015', text: 'Der Sonnenfleck wandert durchs Zimmer, und die Katze zieht mit um.'},
    {id: 'lo016', text: 'Haargummis verschwinden nicht, sie werden gejagt und versteckt.'},
    {id: 'lo017', text: 'Ein Glas am Tischrand ist bei Katzen nur eine Frage der Zeit.'},
    {id: 'lo018', text: 'Kaum liegst du auf dem Sofa, ist dein Bauch das neue Lieblingskissen.'},
    {id: 'lo019', text: 'Katzen besuchen am liebsten Menschen, die Katzen nicht mögen.'},
    {id: 'lo020', text: 'Dasselbe Futter schmeckt frisch nachgefüllt gleich viel besser.'},
    {id: 'lo021', text: 'Wer Gemüse schneidet, wird überwacht. Es könnte ja Fleisch werden.'},
    {id: 'lo022', text: 'Eine Dose öffnet man nie unbemerkt, auch nicht drei Zimmer weiter.'},
    {id: 'lo023', text: 'Ein wichtiger Videocall ist die perfekte Bühne für einen großen Auftritt.'},
    {id: 'lo024', text: 'Alles, was flach auf dem Boden liegt, wird sofort zur neuen Liegefläche.'},
    {id: 'lo025', text: 'Ein neues Möbelstück wird zuerst von der Katze abgenommen.'},
    {id: 'lo026', text: 'Ein Katzenbett ist ein gemütlicher Ort, an dem Katzen niemals schlafen.'},
    {id: 'lo027', text: 'Wer ein schönes Foto machen will, bekommt garantiert den Hinterkopf.'},
    {id: 'lo028', text: 'Die eigene Wasserschale ist langweilig, dein Wasserglas dagegen spannend.'},
    {id: 'lo029', text: 'Je weniger du die Katze rufst, desto eher kommt sie von ganz allein.'},
    {id: 'lo030', text: 'Der Weg in die Küche führt immer zwischen deinen Füßen hindurch.'},
    {id: 'lo031', text: 'Mit einer Katze auf dem Schoß wird Aufstehen verschoben.'},
    {id: 'lo032', text: 'Kommt ein Paket an, ist der Inhalt egal, die Katze zieht in den Karton.'},
    {id: 'lo033', text: 'Der Morgen beginnt nicht mit dem Wecker, sondern wenn die Katze das sagt.'},
    {id: 'lo034', text: 'Katzengras ist langweilig, die teure Zimmerpflanze schmeckt besser.'},
    {id: 'lo035', text: 'Eine geputzte Fensterscheibe hält genau bis zur ersten Nase.'},
    {id: 'lo036', text: 'Kaum telefonierst du, hat die Katze plötzlich viel zu erzählen.'},
    {id: 'lo037', text: 'Ein schwarzer Pulli findet jedes weiße Katzenhaar im Umkreis.'},
    {id: 'lo038', text: 'Was du gerade suchst, liegt ziemlich sicher unter der Katze.'},
    {id: 'lo039', text: 'Draußen will die Katze rein, drinnen will sie gleich wieder raus.'},
    {id: 'lo040', text: 'Wer mit Katze ein Puzzle legt, hat am Ende garantiert ein Teil weniger.'},
  ],
  'Stimmt’s?': [
    {
      id: 'st001',
      text: 'Eine fallende Katze landet immer sicher auf allen vier Pfoten.',
      verdict: 'Stimmt nicht',
      back: 'Aus geringer Höhe fehlt ihnen oft die Zeit, sich rechtzeitig zu drehen.',
    },
    {
      id: 'st002',
      text: 'Ein Schälchen Milch ist für Katzen ein gesunder Leckerbissen.',
      verdict: 'Stimmt nicht',
      back: 'Erwachsene Katzen vertragen Milch meist schlecht, Wasser ist besser.',
    },
    {
      id: 'st003',
      text: 'Katzen sind nachtaktiv und deshalb vor allem im Dunkeln unterwegs.',
      verdict: 'Stimmt nicht',
      back: 'Sie sind dämmerungsaktiv. Daher kommt auch das Wecken um fünf Uhr früh.',
    },
    {
      id: 'st004',
      text: 'Wenn eine Katze schnurrt, geht es ihr immer gut, ganz ohne Ausnahme.',
      verdict: 'Stimmt nicht',
      back: 'Katzen schnurren auch bei Schmerzen und Angst, vermutlich zur Beruhigung.',
    },
    {
      id: 'st005',
      text: 'Katzen können Süßes schmecken und mögen deshalb manchmal Kuchen.',
      verdict: 'Stimmt nicht',
      back: 'Ihnen fehlt der Rezeptor für Süßes. Kuchen ist also reine Neugier.',
    },
    {
      id: 'st006',
      text: 'Katzen sehen auch in völliger Dunkelheit noch alles ganz genau.',
      verdict: 'Stimmt nicht',
      back: 'Wenig Licht genügt ihnen, aber ganz ohne sieht auch keine Katze etwas.',
    },
    {
      id: 'st007',
      text: 'Katzen haben neun Leben, das weiß doch jedes Kind auf der Welt.',
      verdict: 'Kommt drauf an',
      back: 'Auf Deutsch sind es sieben Leben, auf Englisch neun, je nach Sprache.',
    },
    {
      id: 'st008',
      text: 'Eine schwarze Katze, die deinen Weg kreuzt, bringt Unglück.',
      verdict: 'Stimmt nicht',
      back: 'In Großbritannien und Japan gelten sie als Glücksbringer.',
    },
    {
      id: 'st009',
      text: 'Katzen sind geborene Einzelgänger und leben am liebsten ganz allein.',
      verdict: 'Nicht ganz',
      back: 'Verwilderte Katzen leben oft in Gruppen verwandter Weibchen.',
    },
    {
      id: 'st010',
      text: 'Alle Katzen hassen Wasser und würden niemals freiwillig schwimmen.',
      verdict: 'Nicht alle',
      back: 'Türkisch-Van-Katzen gehen sogar freiwillig schwimmen, und das gern.',
    },
    {
      id: 'st011',
      text: 'Alle Kätzchen haben anfangs blaue Augen, ganz gleich welcher Rasse.',
      verdict: 'Stimmt',
      back: 'Die eigentliche Augenfarbe zeigt sich erst nach einigen Wochen.',
    },
    {
      id: 'st012',
      text: 'Dreifarbige Glückskatzen sind fast immer weiblich, Kater gibt es kaum.',
      verdict: 'Stimmt',
      back: 'Das liegt an den Genen für die Fellfarbe auf dem X-Chromosom.',
    },
    {
      id: 'st013',
      text: 'Rote Katzen sind meistens Kater, rote Kätzinnen sind eher selten.',
      verdict: 'Stimmt',
      back: 'Etwa vier von fünf roten Katzen sind männlich, das liegt an den Genen.',
    },
    {
      id: 'st014',
      text: 'Katzen erkennen ihren eigenen Namen unter vielen anderen Wörtern.',
      verdict: 'Stimmt',
      back: 'Das zeigen Studien. Ob sie auch reagieren, ist eine ganz andere Frage.',
    },
    {
      id: 'st015',
      text: 'Katzen unterhalten sich untereinander vor allem mit lautem Miauen.',
      verdict: 'Kaum',
      back: 'Erwachsene Katzen miauen fast nur für uns Menschen, untereinander kaum.',
    },
    {
      id: 'st016',
      text: 'Wer gegen Katzen allergisch ist, reagiert eigentlich auf ihr Fell.',
      verdict: 'Stimmt nicht',
      back: 'Auslöser ist ein Eiweiß aus Speichel und Haut, das am Fell nur haftet.',
    },
    {
      id: 'st017',
      text: 'Katzen fressen Gras nur dann, wenn ihnen der Magen gerade wehtut.',
      verdict: 'Meist nicht',
      back: 'Die meisten fressen Gras ohne jedes Bauchweh. Warum, ist noch unklar.',
    },
    {
      id: 'st018',
      text: 'Eine satte Katze hat keinen Grund mehr zu jagen und lässt es bleiben.',
      verdict: 'Stimmt nicht',
      back: 'Hunger und Jagdtrieb sind getrennt gesteuert, gejagt wird also immer.',
    },
    {
      id: 'st019',
      text: 'Katzen sehen die Welt nur in Schwarz, Weiß und ein paar Grautönen.',
      verdict: 'Stimmt nicht',
      back: 'Sie sehen Farben, nur blasser: Blau gut, Rot und Grün dagegen kaum.',
    },
    {
      id: 'st020',
      text: 'Katzen können überhaupt nicht schwitzen, an keiner Stelle des Körpers.',
      verdict: 'Doch',
      back: 'Allerdings nur an den Pfoten, beim Tierarzt oft als feuchte Abdrücke.',
    },
    {
      id: 'st021',
      text: 'Mit zwei Jahren gilt eine Katze bereits als vollständig erwachsen.',
      verdict: 'Stimmt',
      back: 'Umgerechnet ist eine zweijährige Katze etwa 24 Menschenjahre alt.',
    },
    {
      id: 'st022',
      text: 'Katzenminze wirkt bei jeder Katze, egal wie alt oder wie ruhig sie ist.',
      verdict: 'Stimmt nicht',
      back: 'Ob Katzenminze wirkt, ist erblich. Viele Katzen lässt sie völlig kalt.',
    },
    {
      id: 'st023',
      text: 'Katzen trinken von Natur aus viel und brauchen ständig frisches Wasser.',
      verdict: 'Stimmt nicht',
      back: 'Ihre Vorfahren deckten den Wasserbedarf vor allem über die Beute.',
    },
    {
      id: 'st024',
      text: 'Fisch ist für Katzen schon immer das natürlichste Futter gewesen.',
      verdict: 'Stimmt nicht',
      back: 'Ihre Vorfahren lebten in Wüste und Steppe, da gab es kaum Fisch.',
    },
    {
      id: 'st025',
      text: 'Katzen kauen ihr Futter gründlich, so wie wir unser Essen auch.',
      verdict: 'Kaum',
      back: 'Ihre Backenzähne schneiden wie Scheren, richtig gekaut wird kaum.',
    },
    {
      id: 'st026',
      text: 'Katzen leben erst seit den alten Ägyptern zusammen mit Menschen.',
      verdict: 'Länger',
      back: 'Auf Zypern lag schon vor 9500 Jahren eine Katze im Grab eines Menschen.',
    },
    {
      id: 'st027',
      text: 'Isaac Newton hat neben der Schwerkraft auch die Katzenklappe erfunden.',
      verdict: 'Wohl nicht',
      back: 'Die Geschichte ist hübsch und wird gern erzählt, belegt ist sie nicht.',
    },
    {
      id: 'st028',
      text: 'Löwen schnurren genauso wie Hauskatzen, nur entsprechend lauter.',
      verdict: 'Kaum',
      back: 'Wer brüllen kann, schnurrt nicht richtig, und Hauskatzen brüllen nicht.',
    },
    {
      id: 'st029',
      text: 'Katzen träumen im Schlaf, so wie wir Menschen das auch tun.',
      verdict: 'Vermutlich',
      back: 'Sie haben einen Traumschlaf wie wir, oft erkennbar an zuckenden Pfoten.',
    },
    {
      id: 'st030',
      text: 'Katzen mögen den frischen Duft von Orangen und Zitronen besonders.',
      verdict: 'Stimmt nicht',
      back: 'Die meisten finden Zitrusduft unangenehm, Orangen sind also sicher.',
    },
    {
      id: 'st031',
      text: 'Katzen haben mehr Knochen im Körper als ein erwachsener Mensch.',
      verdict: 'Stimmt',
      back: 'Rund 230 gegen 206, und allein im Schwanz steckt etwa jeder zehnte.',
    },
    {
      id: 'st032',
      text: 'Katzen haben verschiedene Blutgruppen, ganz ähnlich wie wir Menschen.',
      verdict: 'Stimmt',
      back: 'Es gibt A, B und das seltene AB, wichtig etwa bei Bluttransfusionen.',
    },
    {
      id: 'st033',
      text: 'Alle Kätzchen aus einem Wurf haben ganz sicher immer denselben Vater.',
      verdict: 'Nicht unbedingt',
      back: 'Ein einziger Wurf kann tatsächlich Kätzchen von mehreren Vätern haben.',
    },
    {
      id: 'st034',
      text: 'Getigerte Katzen tragen auf der Stirn ein deutlich sichtbares M.',
      verdict: 'Stimmt',
      back: 'Fast alle, und über die Herkunft des M gibt es viele schöne Legenden.',
    },
    {
      id: 'st035',
      text: 'Weiße Katzen mit blauen Augen sind auffällig oft taub geboren.',
      verdict: 'Stimmt',
      back: 'Das Gen für weißes Fell wirkt sich leider oft auch auf das Innenohr aus.',
    },
    {
      id: 'st036',
      text: 'Katzen wissen nur dann, wo du bist, wenn sie dich auch sehen können.',
      verdict: 'Stimmt nicht',
      back: 'Sie merken sich auch, aus welcher Richtung deine Stimme zuletzt kam.',
    },
    {
      id: 'st037',
      text: 'Kätzchen kommen blind zur Welt und öffnen erst nach Tagen die Augen.',
      verdict: 'Stimmt',
      back: 'Und taub dazu. Das Schnurren der Mutter spüren sie trotzdem.',
    },
    {
      id: 'st038',
      text: 'Wohnungskatzen leben im Schnitt kürzer als Katzen mit Freigang.',
      verdict: 'Stimmt nicht',
      back: 'Im Gegenteil, Wohnungskatzen werden im Schnitt deutlich älter.',
    },
    {
      id: 'st039',
      text: 'Katzen erkennen sich im Spiegel und wissen, dass sie es selbst sind.',
      verdict: 'Stimmt nicht',
      back: 'Den Spiegeltest bestehen sie nicht, das Gegenüber bleibt verdächtig.',
    },
    {
      id: 'st040',
      text: 'Katzen spüren Erdbeben schon Stunden vorher und werden unruhig.',
      verdict: 'Unbelegt',
      back: 'Es gibt viele Berichte, aber bisher keinen sicheren Nachweis dafür.',
    },
  ],
  Kurios: [
    {id: 'ku001', text: 'In Rom leben Katzen genau an der Stelle, an der Caesar ermordet wurde.'},
    {id: 'ku002', text: 'Die CIA testete in den 60ern Katzen als Wanzen. Gehorsam war das Problem.'},
    {id: 'ku003', text: 'Ägyptische Katzenmumien wurden im 19. Jahrhundert als Dünger verschifft.'},
    {id: 'ku004', text: 'Im mexikanischen Xalapa trat 2013 ein Kater zur Bürgermeisterwahl an.'},
    {id: 'ku005', text: 'Ein Kater namens Stubbs war 20 Jahre Ehrenbürgermeister in Alaska.'},
    {id: 'ku006', text: 'In Japan war eine Katze namens Tama offiziell Bahnhofsvorsteherin.'},
    {id: 'ku007', text: 'Die erste Katze im All hieß Félicette und flog 1963 für Frankreich.'},
    {id: 'ku008', text: 'Auf Shackletons Schiff fuhr ein Kater mit, er hieß Mrs. Chippy.'},
    {id: 'ku009', text: 'Der Schiffskater Simon bekam 1949 eine britische Tapferkeitsmedaille.'},
    {id: 'ku010', text: 'Die Eremitage in Sankt Petersburg beschäftigt seit Langem Katzen.'},
    {id: 'ku011', text: 'In der Downing Street gibt es ein Amt für den obersten Mäusefänger.'},
    {id: 'ku012', text: 'Auf Churchills Landsitz lebt stets ein roter Kater namens Jock.'},
    {id: 'ku013', text: 'In Japan gibt es Inseln, auf denen mehr Katzen als Menschen leben.'},
    {id: 'ku014', text: 'Das erste Katzencafé eröffnete 1998 in Taipeh, nicht in Japan.'},
    {id: 'ku015', text: 'Schon 1894 filmte das Edison-Studio zwei boxende Katzen.'},
    {id: 'ku016', text: 'Die älteste bekannte Katze, Creme Puff aus Texas, wurde 38 Jahre alt.'},
    {id: 'ku017', text: 'In Hemingways Haus leben bis heute Katzen mit sechs Zehen.'},
    {id: 'ku018', text: 'Percy Shaw erfand 1934 die Katzenaugen auf Straßen, dank einer Katze.'},
    {id: 'ku019', text: 'Im alten Ägypten trauerte man um die Katze mit rasierten Augenbrauen.'},
    {id: 'ku020', text: 'Im alten Ägypten wurden Katzen millionenfach mumifiziert und bestattet.'},
    {id: 'ku021', text: 'Die nordische Göttin Freya fuhr einen Wagen, gezogen von zwei Katzen.'},
    {id: 'ku022', text: 'Winkt die japanische Glückskatze links, lockt sie Kunden, rechts Geld.'},
    {id: 'ku023', text: 'In Istanbul steht eine Bronzestatue für die Straßenkatze Tombili.'},
    {id: 'ku024', text: 'Beim Katzenfest in Ypern werfen Narren Plüschkatzen vom Turm.'},
    {id: 'ku025', text: 'Ein italienischer Kater erbte 2011 rund zehn Millionen Euro.'},
    {id: 'ku026', text: 'Brennereikater Towser fing in Schottland rund 29.000 Mäuse, ein Weltrekord.'},
    {id: 'ku027', text: 'Kater Hamlet lebte 1984 sieben Wochen versteckt in einem Flugzeug.'},
    {id: 'ku028', text: 'Im Tokioter Gotokuji-Tempel stehen Tausende Winkekatzen.'},
    {id: 'ku029', text: 'Karl Lagerfelds Katze Choupette hatte zwei Zofen und aß mit am Tisch.'},
    {id: 'ku030', text: 'In der Altstadt von Kotor in Montenegro gibt es ein eigenes Katzenmuseum.'},
    {id: 'ku031', text: 'In Amsterdam gibt es ein Tierheim für Katzen auf einem Hausboot.'},
    {id: 'ku032', text: 'Mark Twains Katzen hießen unter anderem Beelzebub und Sour Mash.'},
    {id: 'ku033', text: 'Straßenkater Bob machte einen Londoner Musiker zum Bestsellerautor.'},
    {id: 'ku034', text: 'Abraham Lincoln hielt im Weißen Haus zwei Katzen, Tabby und Dixie.'},
    {id: 'ku035', text: 'In Thailand beschreibt ein uraltes Katzenbuch, welche Katzen Glück bringen.'},
    {id: 'ku036', text: 'Kuching auf Borneo klingt wie Malaiisch für Katze und hat ein Katzenmuseum.'},
    {id: 'ku037', text: 'Die Katze Trim umsegelte mit Matthew Flinders als erste Katze Australien.'},
    {id: 'ku038', text: 'Katze Holly lief 2012 in Florida rund 300 Kilometer nach Hause.'},
    {id: 'ku039', text: 'Kater Dewey lebte fast 19 Jahre in einer Stadtbibliothek in Iowa.'},
    {id: 'ku040', text: 'Kater Tiddles lebte 13 Jahre in der Damentoilette des Bahnhofs Paddington.'},
  ],
  Wissen: [
    {id: 'k001', text: 'Katzen hören Töne bis etwa 85 Kilohertz, Hunde dagegen nur bis rund 45.'},
    {id: 'k002', text: 'Jedes Katzenohr hat 32 Muskeln und dreht sich unabhängig vom anderen.'},
    {id: 'k003', text: 'Was direkt vor der Nase liegt, sieht eine Katze nur verschwommen.'},
    {id: 'k004', text: 'Katzenpupillen weiten sich auf das 135-Fache, unsere auf das 15-Fache.'},
    {id: 'k006', text: 'Katzen sehen schon bei einem Sechstel des Lichts, das wir brauchen.'},
    {id: 'k008', text: 'Katzen sehen vermutlich UV-Licht, das für uns unsichtbar ist.'},
    {id: 'k009', text: 'Katzenaugen leuchten im Dunkeln dank einer Spiegelschicht im Auge.'},
    {id: 'k011', text: 'Wir haben Tausende Geschmacksknospen, Katzen dagegen nur rund 470.'},
    {id: 'k012', text: 'Mit Schnupfen verweigern viele Katzen das Futter, sie riechen es nicht.'},
    {id: 'k013', text: 'Beim Flehmen, dem Grimassenziehen, riechen Katzen mit dem Gaumen.'},
    {id: 'k014', text: 'Katzen haben auch an den Vorderbeinen Tasthaare, kurz über der Pfote.'},
    {id: 'k015', text: 'Beim Zubeißen klappen die Schnurrhaare nach vorn und tasten mit.'},
    {id: 'k016', text: 'Jede Katzennase hat ein Muster, so einzigartig wie ein Fingerabdruck.'},
    {id: 'k017', text: 'Scharf sehen Katzen schlechter als wir, im Dunkeln aber viel besser.'},
    {id: 'k018', text: 'Das Blickfeld einer Katze umfasst rund 200 Grad, unseres etwa 180.'},
    {id: 'k019', text: 'Lose Schlüsselbeine lassen Katzen durch erstaunlich enge Lücken.'},
    {id: 'k020', text: 'Den losen Bauchbeutel, Urbeutel genannt, haben auch schlanke Katzen.'},
    {id: 'k021', text: 'Die Falte außen am Katzenohr heißt Henry-Tasche, ihr Zweck ist unklar.'},
    {id: 'k024', text: 'Katzen laufen auf Zehenspitzen, die Ferse sitzt weit oben am Bein.'},
    {id: 'k025', text: 'Vorne haben Katzen fünf Zehen, hinten dagegen meist nur vier.'},
    {id: 'k027', text: 'Kopfüber klettern Katzen schlecht, ihre Krallen zeigen nach hinten.'},
    {id: 'k028', text: 'Hohle Häkchen auf der Zunge tragen beim Putzen Speichel ins Fell.'},
    {id: 'k029', text: 'Ist das dritte Augenlid einer Katze zu sehen, stimmt oft etwas nicht.'},
    {id: 'k031', text: 'Die Farbe der Pfotenballen passt meistens zur Fellfarbe direkt darüber.'},
    {id: 'k032', text: 'Siamkatzen werden dort dunkel, wo ihr Körper am kühlsten ist.'},
    {id: 'k039', text: 'Mit rund 50 Wirbeln ist eine Katze viel biegsamer als wir mit 33.'},
    {id: 'k040', text: 'Im Sprint schafft eine Hauskatze kurz fast 50 Kilometer pro Stunde.'},
    {id: 'k041', text: 'Aus dem Stand springen Katzen etwa fünfmal so hoch, wie sie groß sind.'},
    {id: 'k042', text: 'Den Dreh im Fall beherrschen Kätzchen mit etwa sieben Wochen.'},
    {id: 'k044', text: 'Eine Katzenschwangerschaft dauert nur gut neun Wochen.'},
    {
      id: 'k046',
      text: 'Kater sind häufiger Linkspfoter, weibliche Katzen öfter Rechtspfoter.',
      m: 'Kater wie {name} sind häufiger Linkspfoter, teste das ruhig mal.',
      f: 'Katzen wie {name} sind häufiger Rechtspfoter, teste das ruhig mal.',
    },
    {id: 'k047', text: 'Wie genau Katzen schnurren, ist bis heute nicht vollständig geklärt.'},
    {id: 'k048', text: 'An der Schnauze sitzen meist 24 Schnurrhaare, in vier Reihen.'},
    {id: 'k049', text: 'Draußen frisst eine Katze rund zehn Mäuse am Tag, jede eine Mahlzeit.'},
    {id: 'k050', text: 'Mit vollem Napf fressen Katzen bis zu zwanzigmal am Tag ein bisschen.'},
    {id: 'k051', text: 'Neues Futter schmeckt Katzen oft am besten, bis es nicht mehr neu ist.'},
    {id: 'k052', text: 'Hat ein Futter mal Übelkeit gemacht, meiden Katzen es oft lange.'},
    {id: 'k053', text: 'Am liebsten fressen Katzen ihr Futter etwa körperwarm, wie Beute.'},
    {id: 'k056', text: 'Viele Katzen trinken lieber an einem Ort weit weg vom Futternapf.'},
    {id: 'k057', text: 'Beim Trinken ziehen Katzen mit der Zungenspitze eine Wassersäule hoch.'},
    {id: 'k058', text: 'Ohne Taurin im Futter werden Katzen blind und herzkrank.'},
    {id: 'k059', text: 'Katzen können aus Möhren kein Vitamin A gewinnen, nur aus Fleisch.'},
    {id: 'k061', text: 'Zwiebeln und Knoblauch sind für Katzen giftig, auch gekocht.'},
    {id: 'k062', text: 'Schon Blütenstaub von Lilien kann für Katzen tödlich sein.'},
    {id: 'k063', text: 'Katzen fressen am liebsten allein, sie sind geborene Einzeljäger.'},
    {id: 'k064', text: 'Flache, breite Näpfe mögen viele Katzen lieber als tiefe, enge Schalen.'},
    {id: 'k066', text: 'Beim Betteln mischen Katzen ins Schnurren einen Ton wie Babyweinen.'},
    {id: 'k067', text: 'In einer Studie wählte die Hälfte der Katzen Zuwendung statt Futter.'},
    {id: 'k068', text: 'Manche rohen Fische enthalten ein Enzym, das Vitamin B1 zerstört.'},
    {id: 'k070', text: 'Nassfutter besteht zu vier Fünfteln aus Wasser, Trockenfutter kaum.'},
    {id: 'k071', text: 'Was die Mutter fraß, mögen ihre Kätzchen später oft ebenfalls.'},
    {id: 'k074', text: 'Blinzelst du langsam, blinzeln viele Katzen zurück. Das ist ein Gruß.'},
    {id: 'k075', text: 'Ein senkrecht hochgestellter Schwanz ist ein freundliches Hallo.'},
    {id: 'k076', text: 'Beim Köpfchengeben markiert dich {deine Katze} mit Duft aus den Wangen.'},
    {id: 'k077', text: 'Beim Krallenwetzen hinterlassen Katzen Duftmarken aus den Pfoten.'},
    {id: 'k078', text: 'Beim Milchtritt treten Katzen wie einst an der Zitze ihrer Mutter.'},
    {id: 'k079', text: 'Das Keckern beim Anblick von Vögeln ist bis heute nicht ganz erklärt.'},
    {id: 'k080', text: 'Für die plötzlichen Rennattacken gibt es einen Fachbegriff: FRAP.'},
    {id: 'k082', text: 'Katzen erkennen die Stimme ihres Menschen unter fremden Stimmen.'},
    {id: 'k084', text: 'Katzen binden sich an ihre Menschen ähnlich wie Babys an ihre Eltern.'},
    {id: 'k085', text: 'Im Tierheim senkte ein simpler Karton den Stress von Katzen messbar.'},
    {id: 'k086', text: 'Katzen setzen sich sogar in Quadrate aus Klebeband auf dem Boden.'},
    {id: 'k088', text: 'Eine Katze verschläft rund zwei Drittel ihres ganzen Lebens.'},
    {id: 'k090', text: 'Katzen verbringen bis zur Hälfte ihrer wachen Zeit mit Putzen.'},
    {id: 'k092', text: 'Kätzchen unter einem halben Jahr lässt Katzenminze meist kalt.'},
    {id: 'k093', text: 'Das Wälzen in Katzenminze schützt Katzen wohl auch vor Mücken.'},
    {id: 'k097', text: 'Spielzeug wirkt wie Beute, wenn es sich von der Katze wegbewegt.'},
    {id: 'k098', text: 'Dasselbe Spielzeug langweilt Katzen schon nach wenigen Minuten.'},
    {id: 'k101', text: 'Alle Hauskatzen stammen von der Afrikanischen Wildkatze ab.'},
    {id: 'k120', text: 'Die Katze ist Deutschlands häufigstes Haustier, klar vor dem Hund.'},
    {id: 'k121', text: 'In Deutschland leben wieder Tausende Wildkatzen, vor allem im Wald.'},
    {id: 'k122', text: 'Die Wildkatze hat einen buschigen Schwanz mit stumpfem schwarzem Ende.'},
    {id: 'k132', text: 'Die Schwarzfußkatze fängt bei etwa jeder zweiten Jagd etwas.'},
    {id: 'k133', text: 'Geparden können nicht brüllen, dafür zwitschern sie fast wie Vögel.'},
    {id: 'k134', text: 'Tiger sind nicht nur im Fell gestreift, auch ihre Haut darunter.'},
    {id: 'k135', text: 'Schneeleoparden wärmen sich mit ihrem langen Schwanz wie mit einem Schal.'},
    {id: 'k137', text: 'Nach dem zweiten Jahr zählt jedes Katzenjahr etwa vier Menschenjahre.'},
    {id: 'k142', text: 'Bei großer Hitze fressen viele Katzen weniger und lieber erst am Abend.', months: [6, 7, 8]},
    {id: 'k143', text: 'Im Herbst wächst das dichtere Winterfell. Das ist kein Speck.', months: [9, 10, 11]},
    {id: 'k144', text: 'Im Frühjahr verlieren Katzen ihr Winterfell, Bürsten hilft.', months: [3, 4, 5]},
    {id: 'k146', text: 'Lametta lieber weglassen, Katzen verschlucken es leicht beim Spielen.', months: [12]},
  ],
  Flachwitz: [
    {id: 'fw001', text: 'Welche Katze sollte man besser nicht ins Haus lassen? Die Katastrophe.'},
    {id: 'fw002', text: 'Was ist ein Kater nach einer langen Party? Ein Kater mit Kater.'},
    {id: 'fw003', text: 'Warum liegen Katzen auf der Tastatur? Sie behalten die Maus im Auge.'},
    {id: 'fw004', text: 'Welches Müsli steht bei Katzen jeden Morgen auf dem Tisch? Mäusli.'},
    {id: 'fw005', text: 'Was sagt eine Katze im Fitnessstudio? Ich trainiere für den Muskelkater.'},
    {id: 'fw006', text: 'Wo kaufen Katzen am liebsten ihr Spielzeug ein? Natürlich im Katalog.'},
    {id: 'fw007', text: 'Was sagt die Maus zur Katze? Nichts, sie ist doch nicht lebensmüde.'},
    {id: 'fw008', text: 'Welches Musical singt eine Katze unter der Dusche? Natürlich Miau Mia.'},
    {id: 'fw009', text: 'Wie nennt man eine Katze, die durch die Luft fliegt? Katapult.'},
    {id: 'fw010', text: 'Was ruft eine Katze, wenn sie im Zirkus zaubert? Abrakatzabra.'},
    {id: 'fw011', text: 'Wie nennt man eine Katze, die immer zu spät kommt? Schleichkatze.'},
    {id: 'fw012', text: 'Welche Hauptstadt steht bei Katzen ganz oben auf der Liste? Kathmandu.'},
    {id: 'fw013', text: 'Wo machen Katzen Urlaub? Auf den Kanarischen Inseln.'},
    {id: 'fw014', text: 'Welches Auto würde eine Katze fahren, wenn sie dürfte? Einen Jaguar.'},
    {id: 'fw015', text: 'Was bestellt eine Katze im griechischen Restaurant? Natürlich Mäusaka.'},
    {id: 'fw016', text: 'Was hat eine Katze, das wirklich kein anderes Tier hat? Kätzchen.'},
    {id: 'fw017', text: 'Sagt die Katze: Wau. Die andere staunt. Na ja, ich lerne Fremdsprachen.'},
    {id: 'fw018', text: 'Welche Farbe würde eine Katze für ihr Körbchen aussuchen? Mauve.'},
    {id: 'fw019', text: 'Warum sitzt die Katze sonntags vorm Fernseher? Sie wartet auf die Maus.'},
    {id: 'fw020', text: 'Was frühstückt ein Kater am liebsten? Ein Katerfrühstück.'},
    {id: 'fw021', text: 'Welches Kartenspiel spielen Katzen, wenn es draußen regnet? Mau-Mau.'},
    {id: 'fw022', text: 'Was macht eine Katze in der Wüste? Sie sucht das größte Katzenklo der Welt.'},
    {id: 'fw023', text: 'Wie heißt der Kater, der auf dem Todesstern wohnt? Natürlich Darth Kater.'},
    {id: 'fw024', text: 'Welcher Krimi läuft bei Katzen jeden Sonntagabend? Der Tatzort.'},
    {id: 'fw025', text: 'Was fährt nachts über die Skipiste und schnurrt dabei? Die Schneekatze.'},
    {id: 'fw026', text: 'Welcher Fisch trägt einen Schnurrbart wie eine Katze? Der Katzenwels.'},
    {id: 'fw027', text: 'Welche Katze hat acht Beine und zwei Schwänze? Zwei Katzen.'},
    {id: 'fw028', text: 'Welche Stadt in Deutschland mögen Katzen? Katzenelnbogen.'},
    {id: 'fw029', text: 'Welchen Komponisten hören Katzen beim Abendessen am liebsten? Miauzart.'},
    {id: 'fw030', text: 'Was ist das Lieblingsinstrument von Katzen? Die Maultrommel.'},
    {id: 'fw031', text: 'Welches Schulfach mögen Katzen am liebsten, gleich nach Pause? Mausik.'},
    {id: 'fw032', text: 'Wie nennt man eine Katze, die Bücher frisst? Leseratte mit Identitätskrise.'},
    {id: 'fw033', text: 'Wie viele Katzen braucht man für eine Glühbirne? Keine, Katzen lassen wechseln.'},
    {id: 'fw034', text: 'Was macht eine Katze, die im Büro am Kopierer steht? Pfotokopien.'},
    {id: 'fw035', text: 'Was ist eine Katze in der Badewanne? Ein Notfall mit nassen Pfoten.'},
    {id: 'fw036', text: 'Was ist das Lieblingsgemüse von Katzen? Mais, das klingt fast wie Maus.'},
    {id: 'fw037', text: 'Wie heißt der berühmteste König aller Katzen? Natürlich Kater der Große.'},
    {id: 'fw038', text: 'Was sagt der Kater zur Katze? Du bist die Mieze meines Lebens.'},
    {id: 'fw039', text: 'Was liest ein frommer Kater vor dem Schlafengehen? Den Katerchismus.'},
    {id: 'fw040', text: 'Was nützt einer Katze ein Navi? Nichts, sie kommt trotzdem nicht.'},
  ],
  Sprache: [
    {id: 'sp001', text: 'Franzosen haben keinen Frosch im Hals, sondern eine Katze.'},
    {id: 'sp002', text: 'Wer auf Japanisch eine Katzenzunge hat, verträgt kein heißes Essen.'},
    {id: 'sp003', text: 'Wer abwartet, der schaut auf Niederländisch die Katze aus dem Baum.'},
    {id: 'sp004', text: 'Wer auf Spanisch Katze statt Hase gibt, haut jemanden übers Ohr.'},
    {id: 'sp005', text: 'Auf Englisch regnet es Katzen und Hunde, wenn es richtig schüttet.'},
    {id: 'sp006', text: 'Ist etwas großartig, nennt man es auf Englisch den Schlafanzug der Katze.'},
    {id: 'sp007', text: 'Der Kater am Morgen danach kommt vom Katarrh, nicht vom Tier.'},
    {id: 'sp008', text: '„Mieze“ war ursprünglich ein Kosename für Frauen, die Maria hießen.'},
    {id: 'sp009', text: 'Auf Japanisch macht die Katze „nyan“, auf Koreanisch „yaong“.'},
    {id: 'sp010', text: '„Katzenwäsche“ ist eigentlich unfair, Katzen putzen sich stundenlang.'},
    {id: 'sp011', text: 'Die alten Ägypter nannten die Katze „miu“. Klingt vertraut.'},
    {id: 'sp012', text: 'Am Katzentisch saßen früher Kinder und Gäste, die man nicht so mochte.'},
    {id: 'sp013', text: 'Wer katzbuckelt, verbeugt sich so tief, dass ein Katzenbuckel entsteht.'},
    {id: 'sp014', text: '„Die Katze aus dem Sack lassen“ heißt auf Englisch Wort für Wort genauso.'},
    {id: 'sp015', text: 'Wer auf Französisch andere Katzen zu peitschen hat, hat Besseres zu tun.'},
    {id: 'sp016', text: 'Wer selbstzufrieden grinst, hat auf Englisch den Kanarienvogel gefressen.'},
    {id: 'sp017', text: 'Wer auf Polnisch eine Katze hat, hat einen kleinen Knall.'},
    {id: 'sp018', text: '„Um den heißen Brei“ schlich ursprünglich die Katze herum.'},
    {id: 'sp019', text: 'Auf Spanisch waren nur vier Katzen da, wenn kaum jemand kam.'},
    {id: 'sp020', text: 'Wer nachmacht, ist auf Englisch eine Nachmachkatze: copycat.'},
    {id: 'sp021', text: 'Ein kurzes Nickerchen heißt auf Englisch Katzenschlaf, „catnap“.'},
    {id: 'sp022', text: 'Neugier bringt die Katze um, warnt ein englisches Sprichwort.'},
    {id: 'sp023', text: 'Wenn auf Italienisch eine Katze auf etwas brütet, ist irgendwas faul.'},
    {id: 'sp024', text: 'In Japan leiht man sich bei viel Arbeit sogar die Pfote einer Katze.'},
    {id: 'sp025', text: 'Wo wir Perlen vor die Säue werfen, geben Japaner Katzen Goldmünzen.'},
    {id: 'sp026', text: 'Unser gebranntes Kind ist im Französischen eine verbrühte Katze.'},
    {id: 'sp027', text: 'Klartext heißt auf Französisch: eine Katze eine Katze nennen.'},
    {id: 'sp028', text: 'Dass Mäuse tanzen, wenn die Katze weg ist, sagt man in vielen Sprachen.'},
    {id: 'sp029', text: 'Das Wort Katze kam mit den Römern zu uns, aus dem lateinischen cattus.'},
    {id: 'sp030', text: 'Die Katze heißt auf Thai „maew“ und auf Chinesisch „mao“, wie gemaunzt.'},
    {id: 'sp031', text: 'Ein Fassadenkletterer ist auf Englisch ein Katzeneinbrecher.'},
    {id: 'sp032', text: 'Wer beim Raten aufgibt, gibt auf Französisch der Katze seine Zunge.'},
    {id: 'sp033', text: 'Runde Pflastersteine heißen auch Katzenköpfe, wegen ihrer Größe.'},
    {id: 'sp034', text: '„Bei Nacht sind alle Katzen grau“ heißt: Im Dunkeln fallen Unterschiede nicht auf.'},
    {id: 'sp035', text: 'Wo es eng ist, kann man auf Englisch keine Katze schwingen.'},
    {id: 'sp036', text: 'Gefundenes behalten heißt auf Japanisch wörtlich Katzenhaufen.'},
    {id: 'sp037', text: 'Katzenmusik nennt man schiefes Gejaule, nach verliebten Katern.'},
  ],
};
// Sunday first, as getDay() counts
export const WEEK = ['Wissen', 'Katzenlogik', 'Stimmt’s?', 'Kurios', 'Wissen', 'Flachwitz', 'Sprache'];

// sheets for their day, which comes before the weekday's; day: "MM-DD", or a function of the year for days that move
export const DATED = [
  {id: 'he001', text: 'Heute beantwortet man in den USA die Fragen seiner Katze. Viel Erfolg.', day: '01-22'},
  {id: 'he002', text: 'Valentinstag. Rote Rosen sind für Katzen ungiftig, Lilien nicht.', day: '02-14'},
  {id: 'he003', text: 'Heute ist Tag der Katze, jedenfalls in Europa. Im August nochmal.', day: '02-17'},
  {id: 'he004', text: 'Heute ist in Japan Katzentag: 2-2-2 klingt wie nyan, nyan, nyan.', day: '02-22'},
  {id: 'he005', text: 'Heute ist in den USA Knuddel-deine-Katze-Tag. Frag sie lieber vorher.', day: '06-04'},
  {id: 'he006', text: 'Heute ist Weltkatzentag. Bei dir ist das ja eigentlich jeden Tag.', day: '08-08'},
  {id: 'he007', text: 'Heute ist in den USA Katzentag. Man kann nie genug davon haben.', day: '10-29'},
  {id: 'he008', text: 'Heute ist in Italien Tag der schwarzen Katze, als Glücksbringer.', day: '11-17'},
  {id: 'he009', text: 'Heiligabend. Ein gut verankerter Baum erspart heute viel Aufregung.', day: '12-24'},
  {id: 'he010', text: 'Bei Silvesterkrach hilft ein Versteck mehr als Zureden.', day: '12-31'},
  {
    id: 'he011',
    text: 'Heute ist Zeitumstellung, aber der Katzenmagen stellt sich nicht um.',
    day: year => [lastSunday(year, 3), lastSunday(year, 10)],
  },
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
// the seed keeps sheets up to two apart in a list, often on the same theme, off turns in a row
const ORDERS = Object.fromEntries(Object.entries(FACTS).map(([format, list]) => [format, shuffled(list, 90950)]));
const START = 20454; // 1 January 2026 as dayNumber() counts it
const inSeason = (f, month) => !f.months || f.months.includes(month);
// dayNumber() counts a local date as UTC counts the same date
const dateOf = day => new Date((day + 0.5) * DAY);
const monthOf = day => dateOf(day).getUTCMonth() + 1;
const formatOf = day => WEEK[dateOf(day).getUTCDay()];
export const formatOn = date => formatOf(dayNumber(date));

export function datedOn(date) {
  const d = new Date(date),
    on = mmdd(d);
  return DATED.find(f => [typeof f.day === 'function' ? f.day(d.getFullYear()) : f.day].flat().includes(on)) || null;
}

/* The days of a format from START on take its sheets in turn; one out of season is skipped, so none comes twice
   before the others have had their turn. */
export function factOn(date) {
  const today = dayNumber(date),
    format = formatOf(today),
    order = ORDERS[format];
  let at = 0;
  for (let day = Math.min(START, today); ; day++) {
    if (formatOf(day) !== format) continue;
    const month = monthOf(day);
    while (!inSeason(order[at % order.length], month)) at++;
    if (day === today) break;
    at++;
  }
  return order[at % order.length];
}
// the day's sheet: the one bound to it, otherwise the weekday's; format is null for a dated one
export function sheetOn(date) {
  const dated = datedOn(date);
  return dated ? {sheet: dated, format: null} : {sheet: factOn(date), format: formatOn(date)};
}
/* sheetDay: the day of the sheet on top, "YYYY-MM-DD". Before today it still hangs over today's sheet: the last one
   seen, whatever came in between. Its noon, or null. */
export function hangingDay(sheetDay, now) {
  if (!sheetDay || sheetDay >= dayKey(now)) return null;
  const [y, m, d] = sheetDay.split('-').map(Number);
  return new Date(y, m - 1, d, 12).getTime();
}

// the household's only cat, if its sex is known: the variants and „dein Kater“ speak of it
export function catOf(pets) {
  const cats = pets.filter(p => p.species === 'Katze');
  return cats.length === 1 && sexOf(cats[0]) ? cats[0] : null;
}
export function sheetText(sheet, cat, back = false) {
  const text = back ? sheet.back : (cat && sheet[cat.sex]) || sheet.text,
    yours = cat?.sex === 'm' ? 'ein Kater' : 'eine Katze';
  return fill(text, {name: cat && esc(cat.name)}).replace(/\{([Dd])eine Katze\}/g, (_, d) => d + yours);
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
