package de.schmeckts.app

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

// Reading packaging text (Ocr.kt) without a device: known varieties, brands, variety, type, consistency
class OcrTest {
    private fun p(vararg fields: Pair<String, Any?>) = Rec(j(mapOf(*fields)) as JsonObject)

    private val varieties =
        listOf(
            p("id" to "shebalachs01", "brand" to "Sheba", "variety" to "Lachs in Soße", "type" to "Nassfutter", "texture" to "sosse"),
            p("id" to "dreamieskaese", "brand" to "Dreamies", "variety" to "Käse", "type" to "Snack"),
        )

    private fun Pack.all() = listOf(brand, variety, type, texture, known)

    @Test
    fun `packaging text - our own varieties win, insensitive to case, hyphens and spaces, and say which one it is`() {
        for (text in listOf("SHEBA\nLACHS IN SOSSE\n85 g", "sheba lachs-in-soße", "Sheba\nLachsinSosse\nNEU")) {
            assertEquals(text, listOf("Sheba", "Lachs in Soße", "Nassfutter", "sosse", "shebalachs01"), readPack(text, varieties).all())
        }
        assertEquals(
            listOf("Käse", "dreamieskaese"),
            listOf(readPack("Dreamies\nmit Käse", varieties).variety, readPack("Dreamies\nmit Käse", varieties).known),
        )
        assertTrue(
            "no known variety without a hit on brand and variety",
            readPack("Sheba\nHuhn in Gelee", varieties).known == null && readPack("Hofmeister\nHuhn in Gelee").known == null,
        )
    }

    @Test
    fun `packaging text - a brand from the list, nothing invented otherwise`() {
        assertTrue("common brands including retail brands", BRANDS.size > 50 && "Whiskas" in BRANDS && "Coshida" in BRANDS)
        assertEquals("Animonda", readPack("ANIMONDA\nCarny Adult\nRind & Huhn\n400 g").brand)
        assertEquals("K-Classic", readPack("K-CLASSIC\nHuhn in Gelee").brand)
        assertEquals("an unknown brand stays empty, the variety is there all the same", "", readPack("Hofmeister\nHuhn in Gelee").brand)
        assertEquals("Huhn in Gelee", readPack("Hofmeister\nHuhn in Gelee").variety)
    }

    @Test
    fun `packaging text - the variety without quantities, advertising, ingredients and bare numbers, at most 40 characters`() {
        val text =
            "Sheba\nNEU\n100 % natürlich\nSelection in Sauce\nmit Lachs\n4 x 85 g\n4008429087455\n" +
                "Zutaten: Fleisch und tierische Nebenerzeugnisse 40 %"
        val got = readPack(text)
        assertEquals("Selection in Sauce mit Lachs", got.variety)
        assertTrue(got.variety.length <= MAX_VARIETY)
        assertTrue(readPack("Whiskas\n1+ Adult Thunfisch in Gelee für ausgewachsene Katzen jeden Alters").variety.length <= MAX_VARIETY)
    }

    @Test
    fun `packaging text - type and consistency from the keywords`() {
        val wet = readPack("Miamor\nFeine Filets\nHuhn in Gelee\nfür Katzen")
        assertEquals(listOf("Nassfutter", "gelee"), listOf(wet.type, wet.texture))
        val treat = readPack("Vitakraft\nKnusper-Sticks mit Lachs\nSnack für Katzen")
        assertEquals(listOf("Snack", "knusprig"), listOf(treat.type, treat.texture))
        val dry = readPack("Josera\nTrockenfutter\nHuhn für Kitten")
        assertEquals(listOf("Trockenfutter", null), listOf(dry.type, dry.texture))
    }

    @Test
    fun `packaging text - with nothing usable everything stays empty`() {
        for (text in listOf("", "   ", "12345\n4008429087455\n850 g", "NEU\n100 % natürlich")) {
            assertEquals(text, listOf("", "", "", null, null), readPack(text, varieties).all())
        }
    }

    @Test
    fun `the brands read, as chips - each in its own spelling, the likeliest first, at most three, pressed on equality only`() {
        val brands = packBrands("SHEBA\nLachs in Soße\nFelix\nWhiskas\nAnimonda\n85 g")
        assertEquals(PACK_BRANDS, brands.size)
        assertEquals("the longest name first, spelled as on the list", listOf("Animonda", "Whiskas"), brands.take(2))
        assertTrue(brands[2] in listOf("Sheba", "Felix"))
        assertEquals(
            listOf("Katzenglück"),
            packBrands(
                "KATZENGLÜCK\nZarte Häppchen",
                listOf(
                    p(
                        "brand" to "Katzenglück",
                        "variety" to "Rind pur",
                    ),
                ),
            ),
        )
        assertEquals("no brand known, no chip", emptyList<String>(), packBrands("Hofmeister\nHuhn in Gelee"))
        assertEquals(
            "the field holds exactly the chip, not a part of it",
            listOf(true, false, false),
            listOf(hasLine("Lachs in  Soße", "lachs in soße"), hasLine("Sheba Lachs", "Lachs"), hasLine("", "Lachs")),
        )
    }

    @Test
    fun `packaging text - the brands of our own varieties count as brands too`() {
        val text = "Katzenglück\nZarte Häppchen\nmit Huhn"
        assertEquals("nothing of our own: the brand is not invented", "", readPack(text).brand)
        val mine = readPack(text, listOf(p("brand" to "Katzenglück", "variety" to "Rind pur", "type" to "Nassfutter")))
        assertEquals(
            "one variety of that brand is enough, and it drops out of the variety",
            listOf("Katzenglück", "Zarte Häppchen mit Huhn"),
            listOf(mine.brand, mine.variety),
        )
        assertEquals(
            "too short to match on",
            "",
            readPack("Bio\nHuhn in Gelee", listOf(p("brand" to "Bio", "variety" to "Rind pur"))).brand,
        )
        assertEquals(
            "whole words only, so no hit inside another one",
            "",
            readPack(
                "Katzenglück\nHuhn in Gelee",
                listOf(
                    p(
                        "brand" to "Glück",
                        "variety" to "Rind pur",
                    ),
                ),
            ).brand,
        )
        assertEquals(
            "a brand already on the list keeps its spelling and is not counted twice",
            "Sheba",
            readPack(
                "Sheba\nLachs pur",
                listOf(
                    p(
                        "brand" to "sheba",
                        "variety" to "Rind",
                    ),
                ),
            ).brand,
        )
    }

    @Test
    fun `packaging text - the readable lines, none of them twice and at most eight`() {
        val text = "Sheba\nNEU\nSelection in Sauce\nmit Lachs\nSELECTION IN SAUCE\n4 x 85 g\nZutaten: Fleisch 40 %"
        assertEquals("in the order on the packaging", listOf("Sheba", "Selection in Sauce", "mit Lachs"), packLines(text))
        assertEquals("without the brand in front", listOf("Lachs in Soße"), packLines("Sheba\nSheba Lachs in Soße", "sheba"))
        val many = (0 until 12).joinToString("\n") { "Zeile ${"abcdefghijkl"[it]}" }
        assertEquals(PACK_LINES, packLines(many).size)
    }

    @Test
    fun `packaging text - a line that shouts is set in title case`() {
        assertEquals(listOf("Truthahn & Wild an Sauce", "Feine Häppchen"), packLines("TRULAHN & WILD aN SAUCE\nFEINE HÄPPCHEN"))
        assertEquals(
            "a line already written normally is left as it is",
            listOf("Selection in Sauce", "mit Lachs"),
            packLines("Selection in Sauce\nmit Lachs"),
        )
        assertEquals("and the variety with it", "Lachs in Sosse", readPack("SHEBA\nLACHS IN SOSSE").variety)
    }

    @Test
    fun `packaging text - a line that says nothing of its own drops out`() {
        assertEquals(listOf("Huhn ohne Zucker"), packLines("mit\nohne Soja ohne Zusatz von Zucker\nHuhn ohne Zucker\nund mit"))
    }

    @Test
    fun `packaging text - a word the phone almost read is put right`() {
        val mine = listOf(p("brand" to "Miamor", "variety" to "Truthahn & Wild in Sauce", "type" to "Nassfutter", "texture" to "sosse"))
        val read = "MLAMOR\nTRULAHN & WILD aN SAUCE\nAURIN\n100 g"
        assertEquals("a brand from the list, one letter wrong", "Miamor", readPack(read).brand)
        assertEquals(listOf("Miamor", "Truthahn & Wild an Sauce"), packLines(read, "", mine).take(2))
        assertEquals("a word of our own varieties, two letters wrong", "Truthahn & Wild an Sauce", readPack(read, mine).variety)
        assertEquals("a word close to nothing we know stays as it was", "Xylob", packLines("Xylob\nLachs pur")[0])
        assertEquals(
            "and a text that was read properly is not touched",
            "Selection in Sauce mit Lachs",
            readPack("Sheba\nSelection in Sauce\nmit Lachs").variety,
        )
    }

    @Test
    fun `packaging text - the words of Open Pet Food Facts put misread words right as well`() {
        assertTrue("Ragout" in VOCAB_WORDS && "Häppchen" in VOCAB_WORDS && "Trockenfutter" in VOCAB_WORDS)
        assertEquals("Ragout Royal", cleanText("Ragoul Royal"))
        assertEquals("Häppchen in Gelee", cleanText("HÄPPCHEM IN GELEE"))
        assertEquals("Trockenfutter", cleanText("Trockenfuttcr"))
        assertEquals("and the variety with them", "Ragout mit Huhn", readPack("Sheba\nRagoul mit Huhn").variety)
    }

    @Test
    fun `packaging text - how many mistakes a word may carry depends on its length`() {
        assertEquals("three or four letters: one, where exactly one word is that close", "Huhn", cleanText("Hubn"))
        assertEquals("not where two are („Lamm“, „Lamb“)", "Lamn", cleanText("Lamn"))
        assertEquals("five to seven letters: one", "Kitten", cleanText("Kitlen"))
        assertEquals("not two", "Kiflen", cleanText("Kiflen"))
        assertEquals("from eight letters two", "Katzenmilch", cleanText("Katzcnmlch"))
        assertEquals("not three", "Katzcnmlcb", cleanText("Katzcnmlcb"))
    }

    @Test
    fun `packaging text - small words, and a word we know with another ending, stay as they are`() {
        assertEquals("not „Dan“ or „Dein“", "Das ist ein Menü", cleanText("Das ist ein Menü"))
        assertEquals("not „Rind“", "sind", cleanText("sind"))
        assertEquals("not „Sorten“", "Sorte", cleanText("Sorte"))
        assertEquals("not „Zarte“", "zart", cleanText("zart"))
        assertEquals("nor a word of advertising: not „Fisch“", "Frisch & lecker", cleanText("Frisch & lecker"))
        assertEquals("a brand counts from four letters, and its words too: not „Dan“ of „Marly & Dan“", "Dah", cleanText("Dah"))
    }

    @Test
    fun `packaging text - the brands of Open Pet Food Facts count as brands too, after ours`() {
        assertTrue("Carnilove" in VOCAB_BRANDS && "Carnilove" !in BRANDS)
        assertEquals("Carnilove", readPack("Carnilove\nLamm in Sauce").brand)
        assertEquals(
            "matched whole, their names are nothing to put words right to („Qualité & Prix“)",
            "Swedish Natural Quality",
            cleanText("Swedish Natural Quality"),
        )
        assertTrue("Mjamjam" in VOCAB_BRANDS && "MjAMjAM" in BRANDS)
        assertEquals("in the spelling of the list", "MjAMjAM", readPack("MJAMJAN\nHuhn in Gelee").brand)
        assertEquals("a brand of the list first, though shorter", "Pro Plan", readPack("Pro Plan\nCarnilove\nLamm").brand)
        assertEquals("one that only names the animal or the food is none", "", readPack("Katzenfutter mit Lachs").brand)
        assertEquals("nor one under four letters", "", readPack("Dia\nHuhn in Gelee").brand)
    }

    @Test
    fun `packaging text - and, plus and slash between two words stand between spaces, in plain text too`() {
        assertEquals(
            listOf("Huhn & Lachs", "Rind / Lamm", "Ente + Pute", "Adult 1+"),
            packLines("HUHN &LACHS\nRind/Lamm\nEnte+Pute\nAdult 1+"),
        )
        assertEquals("spaced already: left as it is", "Huhn & Lachs", cleanText("Huhn & Lachs"))
    }

    @Test
    fun `packaging text - a shouting line is set in title case whatever stands between its words`() {
        assertEquals("„&“ and figures are no letters", "Huhn & Lachs 1+", cleanText("HUHN & LACHS 1+"))
        assertEquals("Rind 100 %", cleanText("RIND 100 %"))
    }

    @Test
    fun `packaging text - promises glued together come apart, and a line of nothing but promises drops out`() {
        assertEquals(
            listOf("Huhn ohne Zucker"),
            packLines("ohne Sojaohne Zusaon Zucker\nohneSoja\nohne künstliche Farbstoffe\nHuhn ohne Zucker"),
        )
        val bean = packLines("Lamm mit Bohne ohne Zucker")
        assertTrue("„Bohne“ is no glued promise: $bean", bean.size == 1 && !jsRe("\\bB ohne").containsMatchIn(bean[0]))
    }

    @Test
    fun `packaging text - a brand read off a logo in small letters is written as on the list`() {
        assertEquals("Miamor", readPack("miamor\nHuhn in Gelee").brand)
        assertEquals("the chips too", listOf("Miamor", "MjAMjAM", "Huhn in Gelee"), packLines("miamor\nmjamjam\nHuhn in Gelee"))
        assertEquals("a brand of several words is also just words", listOf("dein Bestes Rind"), packLines("dein Bestes Rind"))
    }

    @Test
    fun `packaging text - words run together are taken apart, and Mt is mit`() {
        assertEquals("a small word glued to the next", "ohne Zusatz von Zucker", cleanText("ohne Zusatz vonZucker"))
        assertEquals("so the promise goes", listOf("Huhn in Sauce"), packLines("ohne Soja ohne Zusatz vonZucker\nHuhn in Sauce"))
        assertEquals("a shouted word glued to the next, then put right", "Zarte Häppchen Huhn", cleanText("ZARTE HÄPPCHENHuhy"))
        assertEquals("Mit Thunfisch", cleanText("Mt Thunfisch"))
        assertEquals("Mit Thunfisch & Huhn", cleanText("mt THUNFISCH & HUHN"))
        assertEquals("brands written so stay", "GimCat MjAMjAM PetBalance Inaba", cleanText("GimCat MjAMjAM PetBalance Inaba"))
    }

    @Test
    fun `packaging text - a long variety is cut where the next language begins, or after a whole word`() {
        assertEquals(
            "Zarte Häppchen mit Huhn & Pute",
            readPack("Bozita\nZarte Häppchen mit Huhn & Pute / Kyckling & Kalkon / Kylling & Kalkun").variety,
        )
        assertEquals(
            "not in the middle of a word, and not with „in“ at the end",
            "Zarte Häppchen mit Huhn und Truthahn",
            readPack("Zarte Häppchen mit Huhn und Truthahn in feiner Sauce").variety,
        )
    }

    @Test
    fun `packaging text - a small word opening a later line of the variety is written small, and one opening the variety goes`() {
        assertEquals("Thunfisch & Huhn in Sauce", readPack("Sheba\nMIT THUNFISCH & HUHN\nIN SAUCE").variety)
        assertEquals("inside it stays", "Selection in Sauce mit Lachs", readPack("Sheba\nSelection in Sauce\nmit Lachs").variety)
        assertEquals("the chips as read", listOf("mit Thunfisch & Huhn", "in Sauce"), packLines("mit Thunfisch & Huhn\nin Sauce"))
    }

    @Test
    fun `packaging text - the marks the recogniser leaves are put right`() {
        assertEquals("a single letter opening a line is a scrap", "Huhn & Lachs", cleanText("T Huhn & Lachs"))
        assertEquals("a single figure opening a line, a paw print", "in Sauce", cleanText("3 in Sauce"))
        assertEquals("or ending it", "Huhn & Lachs", cleanText("Huhn & Lachs 3"))
        assertEquals("a single letter at the end stays", "Zeile a", cleanText("Zeile a"))
        assertEquals("two marks are no scrap", "Adult 1+", cleanText("Adult 1+"))
        assertEquals("a figure stuck to an „&“", "Chicken & Turkey", cleanText("CHICKEN 8& TURKEY"))
        assertEquals("a figure inside a word is a letter", "Swedish", cleanText("SWED1SH"))
        assertEquals("a word with a capital inside is a scrap", "Sterilised", cleanText("Sterilised wrH"))
        assertEquals("a scrap glued to a word we know goes with the mistakes", "Sterilised", cleanText("Sterilísedwa"))
        assertEquals("a mark in front of the logo", listOf("Bozita", "Huhn"), packLines("+BOZITA\nHuhn"))
        assertEquals("Catz", cleanText("Catz eRoed"))
        assertEquals(
            "not one that starts with a capital, and not one we know",
            "GimCat PetBalance MjAMjAM",
            cleanText("GimCat PetBalance MjAMjAM"),
        )
    }

    @Test
    fun `packaging text - two words we know run together come apart where one names a brand, a line or a badge`() {
        assertEquals("Ragout Royale", cleanText("Rägoutroyale"))
        assertEquals("Natural Ingredients", cleanText("NATURALINGREDIENTS"))
        assertEquals("a word we know stays whole", "Trockenfutter", cleanText("Trockenfutter"))
        assertEquals("and so does one of two ordinary words", "Lachsfilet", cleanText("Lachsfilet"))
    }

    @Test
    fun `packaging text - a lone word two mistakes from a brand of the list is that brand`() {
        assertEquals("Miamor", cleanText("miama"))
        assertEquals("Miamor", readPack("miama\nHuhn in Gelee").brand)
        assertEquals("the chip too", listOf("Miamor"), packBrands("miama\nHuhn in Gelee"))
        assertEquals("a word we know stays", "Katze", cleanText("Katze"))
        assertEquals("only a word standing alone", "miama Royale", cleanText("miama Royale"))
        assertEquals("not for a brand under six letters", "Fepox", cleanText("Fepox"))
    }

    @Test
    fun `packaging text - of a line in several languages the German part stays`() {
        assertEquals(listOf("Huhn & Pute"), packLines("CHICKEN 8& TURKEY / Huhn & Pute / Kyckling & Kal"))
        assertEquals("Huhn & Pute", readPack("Bozita\nCHICKEN & TURKEY / Huhn & Pute / Kyckling & Kalkon").variety)
        assertEquals("two German parts: the line as it is", listOf("Rind / Lamm"), packLines("Rind / Lamm"))
        assertEquals(
            "English in front of the German words goes as well",
            "Huhn & Pute",
            readPack("Bozita\nSterilised with CHICKEN & TURKEY Huhn & Pute / Kyckling & Kalkon").variety,
        )
        assertEquals("a word of neither stays", "Sterilised Huhn & Pute", readPack("Bozita\nSterilised Huhn & Pute").variety)
        assertEquals("none: the same", listOf("Chicken / Kyckling"), packLines("Chicken / Kyckling"))
    }

    @Test
    fun `packaging text - a brand named by its product line, or by the first word of its logo`() {
        val pink = "Ragout Royale\nT HUHN & LACHS\nIN SAUCE\nohne Soja ohne Zusatz von Zucker"
        assertEquals(listOf("Miamor", "Ragout Royale Huhn & Lachs in Sauce"), listOf(readPack(pink).brand, readPack(pink).variety))
        assertEquals(listOf("Miamor"), packBrands(pink))
        assertEquals("Animonda", readPack("Carny\nRind & Huhn").brand)
        assertEquals("a brand read wins over one named by a line", "Sheba", readPack("Sheba\nRagout Royale\nHuhn").brand)
        assertEquals("the first word of a logo, the rest a scrap", "Catz Finefood", readPack("Catz eRoed\nRind & Ente").brand)
        assertEquals("not inside a line of more words", "", readPack("Catz Rind & Ente").brand)
        assertEquals("not an ordinary word", "", readPack("Happy Birthday\nHuhn").brand)
        assertEquals("the whole brand as ever", "Dein Bestes", readPack("Dein Bestes\nHuhn").brand)
    }

    @Test
    fun `packaging text - badges and slogans say nothing, and what is left out says nothing on its own`() {
        assertEquals(
            listOf("Huhn & Pute"),
            packLines(
                "Feinere Stückchen mit Taurin\nSwedish Natural Ingredients\nSuitable for sterilised\nGrain)\nAdapted Energy\n" +
                    "100 % Animal Protein\nAurin\nHuhn & Pute",
            ),
        )
        assertEquals(listOf("Huhn in Sauce"), packLines("Soja ohne Zusatz Von Zucker\nohne Sojaohne Zusatz von Zu\nHuhn in Sauce"))
        assertEquals(
            listOf("Zarte Stückchen in Sauce", "Sterilised", "Almo Nature"),
            packLines("Zarte Stückchen in Sauce\nSterilised\nAlmo Nature"),
        )
    }

    private class W(
        val text: String,
        val gap: Double? = null,
        val size: Double? = null,
    )

    private class R(
        val text: String,
        val h: Double,
        val top: Double,
        val left: Double = 40.0,
        val tilt: Double = 0.0,
        val lang: String = "de",
        val words: List<W>? = null,
    )

    private fun row(
        text: String,
        h: Number,
        top: Number,
        left: Number = 40,
        tilt: Double = 0.0,
        lang: String = "de",
        words: List<W>? = null,
    ) = R(text, h.toDouble(), top.toDouble(), left.toDouble(), tilt, lang, words)

    // The recogniser's answer for a few lines, one block each. The words stand side by side with a word space (a third
    // of the height), or as given in words: a smaller word sitting on the line. tilt in radians.
    private fun plugin(
        rows: List<R>,
        width: Int = 800,
        height: Int = 1000,
    ): Reading {
        val lines =
            rows.map { r ->
                val ux = Math.cos(r.tilt)
                val uy = Math.sin(r.tilt)

                fun at(
                    s: Double,
                    d: Double,
                ) = jsRound(r.left + s * ux - d * uy) to jsRound(r.top + s * uy + d * ux)

                fun shape(
                    s0: Double,
                    s1: Double,
                    d0: Double,
                    d1: Double,
                ): Map<String, Any> {
                    val corners = listOf(at(s0, d0), at(s1, d0), at(s1, d1), at(s0, d1))
                    return linkedMapOf(
                        "boundingBox" to
                            mapOf(
                                "left" to corners.minOf { it.first },
                                "top" to corners.minOf { it.second },
                                "right" to corners.maxOf { it.first },
                                "bottom" to corners.maxOf { it.second },
                            ),
                        "cornerPoints" to corners.map { mapOf("x" to it.first, "y" to it.second) },
                        "recognizedLanguage" to r.lang,
                    )
                }
                var end = 0.0
                val elements =
                    (r.words ?: r.text.split(" ").map { W(it) }).mapIndexed { i, w ->
                        val from = if (i > 0) end + (w.gap ?: (r.h / 3)) else 0.0
                        val size = w.size ?: r.h
                        end = from + w.text.length * size * 0.6
                        mapOf("text" to w.text) + shape(from, end, r.h - size, r.h)
                    }
                mapOf("text" to r.text) + shape(0.0, end, 0.0, r.h) + mapOf("elements" to elements)
            }
        return readingOf(
            j(
                mapOf(
                    "text" to rows.joinToString("\n") { it.text },
                    "blocks" to lines.map { mapOf("text" to it["text"], "lines" to listOf(it)) },
                ),
            ) as JsonObject,
            width,
            height,
        )
    }

    @Test
    fun `packaging photos - the lines with their size, place and direction`() {
        val read = plugin(listOf(row("Huhn in Gelee", 60, 100, left = 50), row("Auri", 24, 400, tilt = 0.35, lang = "und")))
        assertEquals(2, read.lines.size)
        val (level, slanted) = read.lines
        assertEquals(
            listOf("Huhn in Gelee", 60.0, 50 + (11 * 36 + 2 * 20) / 2.0, 0.0, "de", listOf("Huhn", "in", "Gelee")),
            listOf(level.text, level.h, level.cx, level.tilt, level.lang, level.elements.map { it.text }),
        )
        assertTrue("a slanted line is as tall as it is", Math.abs(slanted.h - 24) < 1 && Math.abs(slanted.tilt - 0.35) < 0.02)
        assertTrue("while its box is taller", slanted.box.bottom - slanted.box.top > 40)
        assertEquals(
            "no box, no line",
            0,
            readingOf(parseJson("""{"text":"x","blocks":[{"lines":[{"text":"ohne Box"}]}]}""") as JsonObject).lines.size,
        )
    }

    @Test
    fun `packaging photos - a space where the words stand apart, none where they touch`() {
        val read =
            plugin(
                listOf(
                    row("HUHN &LACHS", 90, 100, words = listOf(W("HUHN"), W("&"), W("LACHS"))),
                    row("Pas tete", 30, 300, words = listOf(W("Pas"), W("tete", gap = 3.0))),
                ),
            )
        assertEquals(listOf("Huhn & Lachs", "Pastete"), packLines(read))
        val badges =
            plugin(
                listOf(
                    row("Huhn in Gelee", 60, 100),
                    row("ohne Sojaohne Zucker", 30, 300, words = listOf(W("ohne"), W("Soja"), W("ohne", gap = 60.0), W("Zucker"))),
                ),
            )
        assertEquals("two badges read as one line come apart, and promises go", listOf("Huhn in Gelee"), packLines(badges))
    }

    @Test
    fun `packaging photos - a small scrap in front of large print is dropped unless it is a word`() {
        assertEquals(listOf("Huhn"), packLines(plugin(listOf(row("A HUHN", 90, 100, words = listOf(W("A", size = 11.0), W("HUHN")))))))
        val word = plugin(listOf(row("mit HUHN & LACHS", 90, 100, words = listOf(W("mit", size = 11.0), W("HUHN"), W("&"), W("LACHS")))))
        assertEquals("the small „mit“, read right, stays", listOf("Mit Huhn & Lachs"), packLines(word))
        val line =
            plugin(
                listOf(row("Ragout", 40, 40), row("mlt", 30, 100), row("HUHN & LACHS", 90, 140), row("4URI", 30, 260), row("Sud", 30, 320)),
            )
        assertEquals("nor as a line of three letters or fewer of its own", listOf("Ragout", "Huhn & Lachs"), packLines(line))
        val ours = listOf(p("brand" to "Almo Nature", "variety" to "Thunfisch im Sud"))
        assertEquals("unless it is a word we know", listOf("Ragout", "Huhn & Lachs", "Sud"), packLines(line, "", ours))
    }

    @Test
    fun `packaging photos - badges, small print and scraps of the picture stay out, unless they name something known`() {
        val read =
            plugin(
                listOf(
                    row("Feine Filets", 60, 100),
                    row("Huhn in Gelee", 60, 180),
                    row("Auri", 24, 400, tilt = 0.35),
                    row("mit Lachs", 20, 450, tilt = 0.4),
                    row("Schonend gegart", 20, 500, tilt = -0.3),
                    row("Abgefüllt in Europa", 8, 900),
                    row("Rind", 8, 950),
                    row("Leckerer Genuss", 30, 700),
                ),
            )
        assertEquals(listOf("Feine Filets", "Huhn in Gelee", "mit Lachs", "Leckerer Genuss", "Rind"), packLines(read))
        val turned =
            plugin(
                listOf(
                    row("Huhn in Gelee", 60, 100, tilt = Math.PI / 2, left = 400),
                    row(
                        "Feine Filets",
                        60,
                        100,
                        tilt =
                            Math.PI / 2,
                        left = 300,
                    ),
                ),
            )
        assertEquals("a photo taken sideways is no badge", listOf("Feine Filets", "Huhn in Gelee"), packLines(turned).sorted())
        assertEquals(
            "plain text has no sizes, so nothing goes for being small",
            listOf("Auri", "Abgefüllt in Europa"),
            packLines("Auri\nAbgefüllt in Europa"),
        )
    }

    @Test
    fun `packaging photos - the flavour names the variety, size decides between equals, and what stands near joins`() {
        val carny =
            plugin(
                listOf(
                    row("animonda", 50, 40),
                    row("Carny", 120, 120),
                    row("Adult", 30, 260),
                    row("Rind & Huhn", 40, 300),
                    row("Mit Rind und Huhn schmeckt es jeder Katze", 40, 800),
                ),
            )
        assertEquals(
            "the flavour, not the larger print, is the main line; what stands close above joins, the brand and a far line do not",
            listOf("Animonda", "Carny Adult Rind & Huhn"),
            listOf(readPack(carny).brand, readPack(carny).variety),
        )
        assertEquals(
            "a logo the brand was not read from is no variety",
            "Rind & Ente",
            readPack(plugin(listOf(row("Catz eRoed", 120, 100), row("Rind & Ente", 80, 400)))).variety,
        )
        assertEquals(
            "larger print without a flavour does not win",
            "Huhn in Gelee",
            readPack(plugin(listOf(row("Feine Filets", 90, 100), row("Huhn in Gelee", 58, 700)))).variety,
        )
        assertEquals(
            "between two with a flavour, one clearly larger wins",
            "Rind & Huhn",
            readPack(plugin(listOf(row("Mit Rind und Huhn schmeckt es jeder Katze", 50, 100), row("Rind & Huhn", 90, 700)))).variety,
        )
        assertEquals(
            "about as large: the one standing first",
            "Rind & Huhn",
            readPack(plugin(listOf(row("Rind & Huhn", 42, 100), row("Mit Rind und Huhn schmeckt es jeder Katze", 40, 700)))).variety,
        )
        assertEquals(
            "without any keyword the largest",
            "Senior Menü",
            readPack(plugin(listOf(row("Senior Menü", 90, 100), row("Classic Adult", 40, 700)))).variety,
        )
        val block =
            plugin(listOf(row("Ragout Royal", 52, 170, left = 200), row("HUHN & LACHS", 90, 246), row("in Sauce", 36, 350, left = 300)))
        assertEquals("in reading order", "Ragout Royal Huhn & Lachs in Sauce", readPack(block).variety)
        val long = plugin(listOf(row("Zarte Filetstreifen in feiner Sauce", 90, 100), row("Huhn, Lachs und Forelle mit Gemüse", 80, 200)))
        assertEquals("nothing that would make it too long", "Huhn, Lachs und Forelle mit Gemüse", readPack(long).variety)
        val classic = plugin(listOf(row("Zorv eRoed", 120, 100), row("CLASSIC ADULT", 30, 250), row("Rind & Ente", 80, 400)))
        assertEquals("a brand only Open Pet Food Facts knows counts only where the logo stands", "", readPack(classic).brand)
        assertEquals(
            "and there it does",
            "Carnilove",
            readPack(plugin(listOf(row("Carnilove", 120, 100), row("Lamm & Wildschwein", 60, 400)))).brand,
        )
    }

    @Test
    fun `packaging photos - the brand where the logo stands wins over a longer one in small print`() {
        val rows = listOf(row("Sheba", 80, 40), row("Lachs in Soße", 50, 150), row("Ein Produkt wie Perfect Fit", 20, 900))
        assertEquals("Sheba", readPack(plugin(rows)).brand)
        assertEquals("plain text: the longest", "Perfect Fit", readPack(rows.joinToString("\n") { it.text }).brand)
    }

    @Test
    fun `packaging photos - more lines than chips, the largest stay, in the order they stand`() {
        val rows = (0 until 10).map { row("Zeile ${"abcdefghij"[it]}", if (it < 8) 30 else 60, 100 + it * 80) }
        assertEquals(listOf("a", "b", "c", "d", "e", "f", "i", "j").map { "Zeile $it" }, packLines(plugin(rows)))
    }

    private fun boxOf(b: Box?) = b?.let { listOf(it.left, it.top, it.right, it.bottom) }

    @Test
    fun `packaging photos - the part around the variety is read again, and laid over the first reading`() {
        val f = fixture("ocr/miamor-ragout-royal.json") as JsonObject
        val first = readingOf(f["result"] as JsonObject, f["width"].asLong!!.toInt(), f["height"].asLong!!.toInt())
        val crop = focusOf(first)!!
        assertEquals("the three lines, a quarter more on every side", listOf(0.0, 113.0, 825.0, 443.0), boxOf(crop))
        assertEquals("nothing stands out", null, focusOf(plugin(listOf(row("Huhn in Gelee", 40, 100), row("Feine Filets", 40, 200)))))
        assertEquals("plain text has no places", null, focusOf(Reading("Huhn in Gelee\nFeine Filets", 0, 0, emptyList())))
        // Read again at twice the size: the small „mit“ comes out right this time
        val second =
            plugin(
                listOf(
                    row("Ragout Royal", 104, 110, left = 410, lang = "fr"),
                    row("mit HUHN & LACHS", 180, 266, left = 116, words = listOf(W("mit", size = 22.0), W("HUHN"), W("&"), W("LACHS"))),
                    row("in Sauce", 72, 478, left = 600),
                ),
                1650,
                660,
            )
        val joined = joinReadings(first, second, Crop(crop, 2.0))
        assertEquals("Ragout Royal mit Huhn & Lachs in Sauce", readPack(joined).variety)
        assertEquals(
            "each line once, as read the second time",
            listOf("Ragout Royal", "mit HUHN & LACHS", "in Sauce"),
            joined.lines
                .map {
                    it.text
                }.filter { Regex("HUHN|Ragout|Sauce").containsMatchIn(it) },
        )
        val moved = joined.lines.first { it.text == "in Sauce" }
        assertEquals("moved back into the photo", listOf(300.0, 352.0, 36.0), listOf(moved.box.left, moved.box.top, moved.h))
        // A line the cut goes through stays as first read, and the scrap of it read again does not come twice
        val cut =
            joinReadings(
                plugin(listOf(row("Huhn in Gelee", 60, 100), row("Zusammensetzung Fleisch", 20, 300))),
                plugin(listOf(row("Huhn in Gelee", 60, 50), row("Zusammense", 10, 250))),
                Crop(Box(0.0, 50.0, 800.0, 310.0), 1.0),
            )
        assertEquals(listOf("Huhn in Gelee", "Zusammensetzung Fleisch"), cut.lines.map { it.text }.sorted())
    }

    private class Fixture(
        val name: String,
        val o: JsonObject,
    ) {
        val width get() = o["width"].asLong!!.toInt()
        val height get() = o["height"].asLong!!.toInt()
    }

    private fun fixtures() =
        java.io
            .File(FIXTURES, "ocr")
            .listFiles()!!
            .filter { it.name.endsWith(".json") }
            .sortedBy { it.name }
            .map { Fixture(it.name, parseJson(it.readText()) as JsonObject) }

    // a fixture's reading as the app has it: the first one, with the second laid over it where the fixture has one
    private fun readingIn(
        f: Fixture,
        again: Boolean,
    ): Reading {
        val first = readingOf(f.o["result"] as JsonObject, f.width, f.height)
        val s = f.o["second"] as? JsonObject
        if (!again || s == null) return first
        val c = s["crop"] as JsonObject
        val crop =
            Crop(Box(c["left"].asDouble!!, c["top"].asDouble!!, c["right"].asDouble!!, c["bottom"].asDouble!!), s["scale"].asDouble!!)
        return joinReadings(first, readingOf(s["result"] as JsonObject, s["width"].asLong!!.toInt(), s["height"].asLong!!.toInt()), crop)
    }

    @Test
    fun `packaging photos - the thumbnail is the square around the text, never too close and inside the photo`() {
        fun inside(
            q: Square,
            width: Int,
            height: Int,
        ) = q.x >= 0 && q.y >= 0 && q.x + q.side <= width && q.y + q.side <= height

        // a pixel of rounding either way
        fun holds(
            q: Square,
            b: Box,
            scale: Double = 1.0,
        ) = q.x <= b.left * scale + 1 &&
            q.y <= b.top * scale + 1 &&
            q.x + q.side >= b.right * scale - 1 &&
            q.y + q.side >= b.bottom * scale - 1
        for (f in fixtures()) {
            val read = readingIn(f, SECOND_PASS)
            val short = minOf(f.width, f.height)
            val q = textSquare(read, f.width, f.height)
            val largest = read.lines.maxByOrNull { it.h }!!
            assertTrue("${f.name}: inside the photo", q != null && inside(q, f.width, f.height))
            assertTrue("${f.name}: never too close, at most the short side", q!!.side >= CLOSEST * short && q.side <= short)
            assertTrue("${f.name}: the largest print is in it", holds(q, largest.box))
            assertEquals("${f.name}: a reading of the photo turned gives none", null, textSquare(read, f.height, f.width))
        }
        val miamor = readingIn(fixtures().first { it.name == "miamor-ragout-royal.json" }, SECOND_PASS)
        assertTrue(
            "more text than the square holds: the small print gives way, not the brand",
            holds(
                textSquare(miamor, 825, 1100)!!,
                miamor.lines
                    .first {
                        it.text ==
                            "miamor"
                    }.box,
            ),
        )
        val rows = listOf(row("Sheba", 60, 300, left = 200), row("Huhn in Gelee", 40, 380, left = 200))
        val read = plugin(rows)
        val q = textSquare(read, 800, 1000)!!
        val text = Box(200.0, 300.0, read.lines.maxOf { it.box.right }, 420.0)
        assertTrue("the text and some room around it", holds(q, text) && inside(q, 800, 1000))
        assertEquals("little text: no closer than the share of the short side", (CLOSEST * 800).toInt(), q.side)
        val half = textSquare(read, 400, 500)!!
        assertTrue(
            "the same photo smaller: the same square smaller",
            Math.abs(half.x - q.x / 2.0) <= 1 && Math.abs(half.y - q.y / 2.0) <= 1 && Math.abs(half.side - q.side / 2.0) <= 1,
        )
        val stray = rows + row("Auri", 30, 60, left = 40, tilt = 0.5) + row("Rind", 8, 900, left = 700)
        val sq = textSquare(plugin(stray), 800, 1000)!!
        assertEquals("a slanted scrap of the picture and tiny print leave it", listOf(q.x, q.y, q.side), listOf(sq.x, sq.y, sq.side))
        val corner = plugin(listOf(row("Sheba", 60, 900, left = 500), row("Huhn in Gelee", 40, 960, left = 500)))
        val edge = textSquare(corner, 800, 1000)!!
        assertTrue("text near an edge: pushed inside", inside(edge, 800, 1000) && holds(edge, corner.lines[1].box))
        assertEquals("a photo of another shape, or turned: none", null, textSquare(read, 1000, 800))
        assertEquals("a reading without its size: none", null, textSquare(plugin(rows, 0, 0), 800, 1000))
        assertEquals("a single line: none", null, textSquare(plugin(rows.take(1)), 800, 1000))
        assertEquals("a figure is no text", null, textSquare(plugin(listOf(rows[0], row("4 x 85 g", 40, 380))), 800, 1000))
        assertEquals("plain text has no places", null, textSquare(Reading("Sheba\nHuhn in Gelee", 0, 0, emptyList()), 800, 1000))
    }

    @Test
    fun `packaging photos - four pouches as 0_15_0 read them, put right`() {
        // Miamor in a script logo that could not be read, the small „mit“ read as a „T“ half as tall as the flavour
        val pink =
            plugin(
                listOf(
                    row("Ragout Royale", 52, 120, left = 250),
                    row("T HUHN & LACHS", 90, 200, words = listOf(W("T", size = 45.0), W("HUHN"), W("&"), W("LACHS"))),
                    row("IN SAUCE", 36, 310, left = 300),
                    row(
                        "ohne Soja ohne Zusatz von Zucker",
                        18,
                        700,
                        words = listOf(W("ohne"), W("Soja"), W("ohne", gap = 40.0), W("Zusatz"), W("von"), W("Zucker")),
                    ),
                    row("Feinere Stückchen mit Taurin", 20, 600, tilt = 0.4),
                ),
            )
        assertEquals(
            listOf("Miamor", "Ragout Royale Huhn & Lachs in Sauce", listOf("Ragout Royale", "Huhn & Lachs", "In Sauce"), listOf("Miamor")),
            listOf(readPack(pink).brand, readPack(pink).variety, packLines(pink), packBrands(pink)),
        )
        // The logo read as „miama“, the line as „Ract Rqyale“, a paw print as a „3“
        val green =
            plugin(
                listOf(
                    row("miama", 60, 40),
                    row("Ract Rqyale", 40, 120, left = 250),
                    row("mit TRUTHAHN & WILD", 90, 200, words = listOf(W("mit", size = 30.0), W("TRUTHAHN"), W("&"), W("WILD"))),
                    row("3 IN SAUCE", 36, 310, left = 300),
                    row("Aurin", 24, 600, tilt = 0.4),
                ),
            )
        assertEquals(
            listOf("Miamor", "Truthahn & Wild in Sauce", listOf("Miamor", "Ract Royale", "Mit Truthahn & Wild", "In Sauce")),
            listOf(readPack(green).brand, readPack(green).variety, packLines(green)),
        )
        // Bozita: three languages in one line, „with“ read as „wrH“, an „8“ stuck to the „&“, badges in English
        val blue =
            plugin(
                listOf(
                    row("Sterilised wrH", 100, 1150),
                    row("CHICKEN 8& TURKEY / Huhn & Pute / Kyckling & Kalkon", 40, 1300),
                    row("SWEDISH NATURAL INGREDIENTS", 30, 1380),
                    row("SUITABLE FOR STERILISED", 24, 1500),
                    row("GRAIN FREE RECIPE", 24, 1560),
                    row("ADAPTED ENERGY LEVEL", 24, 1620),
                    row("100% ANIMAL PROTEIN", 24, 1680),
                    row("BOZITA", 150, 1870),
                    row("SWEDISH NATURAL QUALITY", 110, 2030),
                ),
                1800,
                2400,
            )
        assertEquals(
            listOf("Bozita", "Sterilised Huhn & Pute", listOf("Sterilised", "Huhn & Pute", "Bozita")),
            listOf(readPack(blue).brand, readPack(blue).variety, packLines(blue)),
        )
    }

    @Test
    fun `packaging photos - a line in another language weighs less as the variety, and stays a chip`() {
        val read = plugin(listOf(row("Pollo Rustico", 60, 100, lang = "it"), row("Senior Menü", 60, 700, lang = "de-DE")))
        assertEquals("Senior Menü", readPack(read).variety)
        assertEquals(2, packLines(read).size)
        val same = plugin(listOf(row("Pollo Rustico", 60, 100, lang = "und"), row("Senior Menü", 60, 700, lang = "de")))
        assertFalse("„und“, no language named: no weight taken", readPack(same).variety == "Senior Menü")
    }

    @Test
    fun `packaging photos - the size of a photo, straight from its header`() {
        fun segment(
            marker: Int,
            body: List<Int>,
        ) = listOf(0xff, marker, (body.size + 2) shr 8, (body.size + 2) and 255) + body

        fun jpeg(vararg parts: List<Int>) =
            okio.ByteString
                .of(
                    *(
                        listOf(0xff, 0xd8) +
                            parts.flatMap {
                                it
                            }
                    ).map { it.toByte() }.toByteArray(),
                ).base64()
        val frame = segment(0xc0, listOf(8, 0x04, 0x4c, 0x03, 0x39, 3)) // 1100 high, 825 wide
        val tables = segment(0xdb, List(65) { 1 })
        assertEquals(825 to 1100, jpegSize(jpeg(segment(0xe0, List(14) { 0 }), tables, frame)))
        assertEquals(
            "behind the large preview a camera puts in front",
            825 to 1100,
            jpegSize(jpeg(segment(0xe1, List(30000) { 7 }), frame)),
        )
        assertEquals(
            "progressive, and the Huffman tables in between are no frame",
            20 to 10,
            jpegSize(
                jpeg(
                    segment(
                        0xc4,
                        List(20) {
                            0
                        },
                    ),
                    segment(0xc2, listOf(8, 0, 10, 0, 20, 3)),
                ),
            ),
        )
        for (bad in listOf("", "kein Foto!", okio.ByteString.of(*"GIF89a".toByteArray()).base64())) assertEquals(bad, 0 to 0, jpegSize(bad))
    }

    // What the app makes of one fixture, and where that differs from what was expected: {field: what came out}
    private fun misses(
        f: Fixture,
        again: Boolean,
    ): Map<String, Any?> {
        val products = (f.o["products"] as? JsonArray)?.map { Rec(it as JsonObject) } ?: emptyList()
        val read = readingIn(f, again)
        val got = readPack(read, products)
        val chips = packLines(read, "", products)
        val want = f.o["expected"] as JsonObject

        fun same(
            value: String?,
            expected: kotlinx.serialization.json.JsonElement?,
        ) = ((expected as? JsonArray)?.map { it.asString } ?: listOf(expected.asString)).any { norm(it) == norm(value) }
        val out = LinkedHashMap<String, Any?>()
        if (!same(got.brand, want["brand"])) out["brand"] = got.brand
        if (!same(got.variety, want["variety"])) out["variety"] = got.variety
        for ((k, v) in listOf("type" to got.type, "texture" to got.texture)) {
            if (want[k].asString != null &&
                v != want[k].asString
            ) {
                out[k] = v ?: ""
            }
        }
        val wantChips = (want["chips"] as? JsonArray)?.map { it.asString }
        if (wantChips != null && chips != wantChips) out["chips"] = chips
        return out
    }

    @Test
    fun `packaging photos - the fixtures from real readings, with the hit rate`() {
        val all = fixtures()
        for (f in all) {
            val want = f.o["expected"] as? JsonObject

            fun ok(x: kotlinx.serialization.json.JsonElement?) = x.asString != null || ((x as? JsonArray)?.isNotEmpty() == true)
            assertTrue("${f.name}: brand and variety are filled in", ok(want?.get("brand")) && ok(want?.get("variety")))
            assertTrue(
                "${f.name}: the size and the answer",
                f.width > 0 && f.height > 0 && ((f.o["result"] as? JsonObject)?.get("blocks") is JsonArray),
            )
        }
        val rows = all.map { it to misses(it, SECOND_PASS) }

        fun count(pick: (Map<String, Any?>) -> Boolean) = "${rows.count { pick(it.second) }}/${rows.size}"
        println(
            "OCR fixtures: brand ${count {
                "brand" !in it
            }}, variety ${count { "variety" !in it }}, both ${count { "brand" !in it && "variety" !in it }}",
        )
        for ((f, miss) in rows) if (miss.isNotEmpty()) println("  ${f.name}: $miss")
        val broken =
            rows
                .filter { (f, miss) ->
                    (f.o["expected"] as JsonObject)["locked"].asBoolean == true && miss.isNotEmpty()
                }.map { it.first.name }
        assertEquals("a fixture that was read right once stays right", emptyList<String>(), broken)
    }
}
