package de.schmeckts.app

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject

class Sex(
    val k: String,
    val label: String,
)

// pets[].sex, absent when not given
val SEXES = listOf(Sex("f", "Weiblich"), Sex("m", "Männlich"))

fun sexOf(pet: Rec?): String? = pet?.str("sex")?.takeIf { s -> SEXES.any { it.k == s } }

val TYPES = listOf("Nassfutter", "Trockenfutter", "Snack", "Sonstiges")

fun typeOf(product: Rec?): String = product?.str("type")?.takeIf { it in TYPES } ?: TYPES[0]

fun typeOfName(type: String?): String = type?.takeIf { it in TYPES } ?: TYPES[0]

/** Keys are stored in the data, never rename them. Every wording says what the pet ate; short stands under the
 *  rating slider, a column for each level. cheer: what the confirmation adds */
class Rating(
    val label: String,
    val short: String,
    val said: String,
    val score: Int,
    val cheer: String,
)

val RATINGS: Map<String, Rating> =
    linkedMapOf(
        "top" to Rating("Alles gefressen", "Alles", "alles gefressen", 100, "Ratzeputz!"),
        "gut" to Rating("Fast alles gefressen", "Fast", "fast alles gefressen", 80, "Beinah wie geleckt."),
        "mittel" to Rating("Die Hälfte gefressen", "Halb", "die Hälfte gefressen", 50, "Halbe-halbe."),
        "eager" to Rating("Nur ein bissl gefressen", "Bissl", "nur ein bissl gefressen", 35, "Probiert ist probiert."),
        "sosse" to Rating("Nur die Soße geleckt", "Soße", "nur die Soße geleckt", 30, "Der Rest war Deko."),
        "schlecht" to Rating("Fast nix gefressen", "Nix", "fast nix gefressen", 0, "Heute lieber nicht."),
        "gern" to Rating("Gern gefressen", "Gern", "gern gefressen", 100, "Läuft!"),
        "normal" to Rating("Normal gefressen", "Normal", "normal gefressen", 80, "Alles im grünen Bereich."),
        "wenig" to Rating("Wenig gefressen", "Wenig", "wenig gefressen", 35, "Heute eher sparsam."),
        "liegen" to Rating("Liegen gelassen", "Nix", "liegen gelassen", 0, "Der Napf bleibt voll."),
        "verputzt" to Rating("Sofort verputzt", "Sofort", "sofort verputzt", 100, "Weg war’s!"),
        "spaeter" to Rating("Später gefressen", "Später", "später gefressen", 70, "Gut Ding will Weile."),
        "angeknabbert" to Rating("Nur angeknabbert", "Bissl", "nur angeknabbert", 35, "Immerhin probiert."),
        "unberuehrt" to Rating("Nicht angerührt", "Nix", "nicht angerührt", 0, "Keine Chance."),
    )

val SCALES: Map<String, List<String>> =
    linkedMapOf(
        "portion" to listOf("top", "gut", "mittel", "eager", "sosse", "schlecht"), // the bowl after the meal
        "bowl" to listOf("gern", "normal", "wenig", "liegen"), // the bowl stands for longer
        "bite" to listOf("verputzt", "spaeter", "angeknabbert", "unberuehrt"), // a single morsel
    )
private val SCALE_OF = mapOf("Nassfutter" to "portion", "Trockenfutter" to "bowl", "Snack" to "bite", "Sonstiges" to "bite")

fun scaleOf(product: Rec?): List<String> = SCALES.getValue(SCALE_OF.getValue(typeOf(product)))

// a rating reminder's buttons: a good, a middling and a poor level, so a meal gone wrong is rated there too
private val QUICK =
    mapOf(
        "portion" to listOf("top", "mittel", "schlecht"),
        "bowl" to listOf("gern", "wenig", "liegen"),
        "bite" to listOf("verputzt", "angeknabbert", "unberuehrt"),
    )

fun quickOf(product: Rec?): List<String> = QUICK.getValue(SCALE_OF.getValue(typeOf(product)))

// JavaScript's /i also folds letters beyond ASCII
fun ri(pattern: String) = Regex("(?iu)$pattern")

class TextureItem(
    val key: String,
    val label: String,
    val re: Regex,
)

class Textures(
    val title: String,
    val items: List<TextureItem>,
)

// keys are stored in the data, the pattern guesses a missing texture from the name
val TEXTURES: Map<String, Textures> =
    linkedMapOf(
        "Nassfutter" to
            Textures(
                "Konsistenz",
                listOf(
                    TextureItem("sosse", "In Soße", ri("so(ß|ss)e|sauce|gravy")),
                    TextureItem("gelee", "In Gelee", ri("gelee|jelly|aspik")),
                    TextureItem("pastete", "Pastete", ri("pastete|p[aâ]t[eé]|terrine")),
                    TextureItem("mousse", "Mousse", ri("mousse")),
                    TextureItem("block", "Fester Block", ri("loaf|block")),
                    TextureItem("suppe", "Suppe", ri("suppe|soup|brühe")),
                ),
            ),
        "Snack" to
            Textures(
                "Snack-Art",
                listOf(
                    TextureItem("knusprig", "Knusprig", ri("knusp|crunch")),
                    TextureItem("weich", "Weich", ri("soft|weich")),
                    TextureItem("creme", "Creme", ri("creme|crème|cream|paste")),
                    TextureItem("milch", "Milch", ri("milch|milk|drink")),
                    TextureItem("stick", "Stick", ri("stick|streifen")),
                    TextureItem("kau", "Kauartikel", ri("kau|chew")),
                ),
            ),
    )

fun textureOf(
    product: Rec?,
    key: String?,
): TextureItem? = TEXTURES[typeOf(product)]?.items?.find { it.key == key }

fun guessTexture(product: Rec): String? = guessTexture(product.str("type"), product.str("brand"), product.str("variety"))

fun guessTexture(
    type: String?,
    brand: String?,
    variety: String?,
): String? = TEXTURES[typeOfName(type)]?.items?.find { it.re.containsMatchIn("${brand ?: ""} ${variety ?: ""}") }?.key

// stored with this spelling when found in packaging text; when several match, the longest wins
val BRANDS =
    listOf(
        "Whiskas",
        "Sheba",
        "Felix",
        "Kitekat",
        "Gourmet",
        "Perfect Fit",
        "Purina One",
        "Pro Plan",
        "Friskies",
        "Dreamies",
        "Catessy",
        "Vitakraft",
        "Animonda",
        "Miamor",
        "Schesir",
        "Catz Finefood",
        "MAC’s",
        "Wildes Land",
        "Herrmann’s",
        "Cosma",
        "Feringa",
        "Smilla",
        "Concept for Life",
        "Purizon",
        "Josera",
        "Happy Cat",
        "Bosch",
        "Sanabelle",
        "Royal Canin",
        "Hill’s",
        "Eukanuba",
        "Iams",
        "Select Gold",
        "Real Nature",
        "Multifit",
        "Wolfsblut",
        "Dr. Clauder’s",
        "Granatapet",
        "Leonardo",
        "Almo Nature",
        "Applaws",
        "Yarrah",
        "Defu",
        "Christopherus",
        "Mera",
        "MjAMjAM",
        "Bozita",
        "Platinum",
        "Kattovit",
        "Lily’s Kitchen",
        "Edgard & Cooper",
        "Coshida",
        "Orlando",
        "Winston",
        "Cachet",
        "Romeo",
        "K-Classic",
        "Dein Bestes",
    )

// a script logo often cannot be read, so a line printed larger names the brand; only lines no other brand uses
val PRODUCT_LINES =
    listOf(
        "Miamor" to listOf("Ragout Royale", "Feine Filets", "Feine Beutel", "Milde Mahlzeit", "Trinkfein"),
        "Animonda" to listOf("Carny", "Vom Feinsten", "Rafiné", "Integra Protect", "GranCarno"),
        "Sheba" to listOf("Selection in Sauce", "Sauce Spéciale", "Fresh & Fine", "Craft Collection", "Fine Flakes"),
        "Felix" to listOf("So gut wie es aussieht", "Sensations", "Tasty Shreds"),
        "Gourmet" to listOf("Mon Petit", "Nature’s Creations"),
        "Catz Finefood" to listOf("Purrrr"),
        "Happy Cat" to listOf("Minkas"),
        "Vitakraft" to listOf("Poésie"),
    )

val TYPE_WORDS =
    listOf(
        "Trockenfutter" to ri("trockenfutter|trockennahrung|kroketten|kibble|dry food"),
        "Snack" to ri("snack|leckerli|leckerchen|belohnung|treat"),
        "Nassfutter" to ri("nassfutter|nassnahrung|wet food"),
    )

// Words match only at their start (so "Elemente" is no duck); liver, heart and cheese also end compounds.
// flavoursOf() returns groups in this order.
private fun start(words: String) = "(?<!\\p{L})(?:$words)"

private val FISH_KINDS =
    start(
        "hering|makrele|sardine|sardelle|seelachs|kabeljau|forelle|weißfisch|seehecht|rotbarsch|dorsch|scholle|sprotte|" +
            "herring|mackerel|cod(?!\\p{L})|trout|whitefish",
    )
private val FISH_KINDS_RE = ri(FISH_KINDS)
val FLAVORS: List<Pair<String, Regex>> =
    listOf(
        "Thunfisch" to ri(start("thunfisch|tuna")),
        "Lachs" to ri(start("lachs|wildlachs|salmon")),
        "Huhn" to ri(start("huhn|hühn|chicken|geflügel")),
        "Pute" to ri(start("pute|truthahn|turkey")),
        "Rind" to ri(start("rind|beef")),
        "Ente" to ri(start("ente|duck")),
        "Lamm" to ri(start("lamm|lamb")),
        "Kaninchen" to ri(start("kaninchen|hase|rabbit")),
        "Wild" to ri(start("wild(?!schwein|lachs)|hirsch|reh|rentier|elch|fasan|wachtel|venison|pheasant")),
        "Wildschwein" to ri(start("wildschwein|boar")),
        "Schwein" to ri(start("schwein|pork")),
        "Kalb" to ri(start("kalb|veal")),
        "Pferd" to ri(start("pferd|horse")),
        "Ziege" to ri(start("ziege|goat")),
        "Strauß" to ri(start("strauß|strauss|ostrich")),
        "Känguru" to ri(start("känguru|kangaroo")),
        "Büffel" to ri(start("büffel|buffalo")),
        "Garnele" to ri(start("garnele|krabbe|shrimp|prawn")),
        "Fisch" to ri("${start("fisch|fish")}|$FISH_KINDS"),
        "Leber" to ri("leber|liver"),
        "Herz" to ri("(?<!\\p{L})herz(?!haft)|(?<=\\p{L})herz"),
        "Käse" to ri("käse|cheese"),
    )
private val OWN_FISH = listOf("Thunfisch", "Lachs") // fish with a group of their own

// Generic fish counts only when no fish with its own group is named ("Lachs mit Fischöl" is salmon). Cached because
// every redraw asks for the same names again.
private val flavoursKnown = HashMap<String, List<String>>()
private const val FLAVOURS_REMEMBERED = 2000

fun flavoursOf(text: String?): List<String> {
    val t = text ?: ""
    synchronized(flavoursKnown) { flavoursKnown[t]?.let { return it } }
    val hits = FLAVORS.filter { it.second.containsMatchIn(t) }.map { it.first }
    val out = hits.filter { it != "Fisch" || FISH_KINDS_RE.containsMatchIn(t) || hits.none { x -> x in OWN_FISH } }
    synchronized(flavoursKnown) {
        if (flavoursKnown.size >= FLAVOURS_REMEMBERED) flavoursKnown.clear()
        flavoursKnown[t] = out
    }
    return out
}

/** Keys are stored in the data; a kind from a newer app version is kept and shown generically. 'meal' weighs it
 *  against the meals in the `within` hours before (a stink takes a day to come through, hunger means the last meal
 *  did not last, what does not agree comes back up within hours), 'day' only against the day. The home card's rail
 *  keeps this order, the most frequent first. */
class Observation(
    val icon: String,
    val label: String,
    val said: String,
    val about: String,
    val within: Int = 0,
    val window: String = "",
    val after: String = "",
)

val OBSERVATIONS: Map<String, Observation> =
    linkedMapOf(
        "happy" to
            Observation(
                "o_happy",
                "Gut drauf",
                "Notiert: gut drauf. Das hört man gern.",
                "meal",
                24,
                "in den 24 Stunden",
                "innerhalb eines Tages",
            ),
        "stink" to
            Observation(
                "o_stink",
                "Stunk",
                "Notiert: Stunk. Lüften schadet sicher nicht.",
                "meal",
                24,
                "in den 24 Stunden",
                "innerhalb eines Tages",
            ),
        "hungry" to
            Observation(
                "o_hungry",
                "Extra hungrig",
                "Notiert: extra hungrig. Vielleicht war die Portion knapp.",
                "meal",
                3,
                "in den drei Stunden",
                "innerhalb von drei Stunden",
            ),
        "tired" to Observation("o_tired", "Besonders müde", "Notiert: besonders müde. Ein ruhiger Tag tut gut.", "day"),
        "vomit" to
            Observation(
                "o_vomit",
                "Erbrochen",
                "Notiert: Erbrechen. Hoffentlich bleibt es dabei.",
                "meal",
                6,
                "in den sechs Stunden",
                "innerhalb von sechs Stunden",
            ),
    )
private val UNKNOWN_OBSERVATION = Observation("sparkle", "Beobachtung", "Notiert.", "day")

fun observationOf(kind: String?): Observation = OBSERVATIONS[kind] ?: UNKNOWN_OBSERVATION

// rating reminder, minutes after serving, 0 = off
val REMIND = listOf(0, 60, 180, 360)
const val REMIND_DEFAULT = 180 // used when the switch is turned on with nothing chosen yet
const val REMIND_ASKED = "tipp:erinnern" // hiddenHints: the reminder was chosen, or asked about once after a meal
const val REMIND_MAX_H = 24

fun tidyRemind(m: Double?): Int =
    if (m != null && m.isFinite() && m > 0) minOf(REMIND_MAX_H.toLong(), maxOf(1L, jsRound(m / 60))).toInt() * 60 else 0

const val REMIND_MAX_AGE = 10 * 60_000L // older meals get no reminder scheduled
const val PENDING_WINDOW = 48 * 3_600_000L // older open meals no longer ask for a rating
const val DEMO = "demo" // id prefix of sample data, removed on connecting

/** What a release brought that one can see, newest first. Only the newest shows, as a card after an update, until it
 *  is hidden (neu:<v> in prefs.hiddenHints, so v never changes). off: a setting it needs and what to say while that
 *  is off. go: where the card leads, 'pet' being the pet editor and 'evaluation' „Vorlieben“. */
class News(
    val v: String,
    val title: String,
    val say: String,
    val why: String,
    val go: Pair<String, String>?,
    val off: Pair<String, String>?,
)

private fun pairOf(a: JsonArray?) = a?.let { it[0].asString!! to it[1].asString!! }

val NEWS: List<News> by lazy {
    resourceJson("news.json").asArray!!.map {
        val o = it as JsonObject
        News(
            o["v"].asString!!,
            o["title"].asString!!,
            o["say"].asString!!,
            o["why"].asString!!,
            pairOf(o["go"].asArray),
            pairOf(o["off"].asArray),
        )
    }
}

// data files in src/main/resources, read the same way in the app and in plain JUnit
fun resourceJson(name: String) =
    parseJson(
        (Config::class.java.classLoader ?: ClassLoader.getSystemClassLoader())
            .getResourceAsStream(name)!!
            .bufferedReader(Charsets.UTF_8)
            .use { it.readText() },
    )

private object Config
