package de.schmeckts.app

import kotlinx.serialization.json.JsonObject
import org.junit.Test

// Redraw after a rating and opening the history page and „Vorlieben“ with five years of made-up data (2 pets, 2 meals a
// day, 150 varieties). The limits catch blowups, not noise. The old perf_test.py.

private const val LIMIT_MS = 100
private const val REPORT_MS = 300
private const val YEARS = 5
private val BRANDS = listOf("Sheba", "Felix", "Animonda", "Miamor", "Gourmet", "Whiskas", "Catz", "MjAMjAM", "Bozita", "Almo")
private val FLAVORS =
    listOf(
        "Lachs",
        "Huhn",
        "Rind",
        "Pute",
        "Ente",
        "Thunfisch",
        "Lamm",
        "Kaninchen",
        "Wild",
        "Forelle",
        "Käse",
        "Leber",
        "Herz",
        "Garnele",
        "Kalb",
    )
private val TEXTURES = listOf("in Soße", "in Gelee", "Pastete", "Mousse", "Filets")
private val RATED_AS = listOf("top", "gut", "mittel", "sosse", "schlecht")

private fun household(
    years: Int,
    now: Long,
): Db {
    val rnd = java.util.Random(7)
    val day = 86_400_000L
    val pets = listOf(pet("petminka001", "Minka", "createdAt" to 1), pet("pettiger001", "Tiger", "createdAt" to 2))
    val products =
        (0 until 150).map { i ->
            product("sorte%05d".format(i), BRANDS[i % 10], "${FLAVORS[i % 15]} ${TEXTURES[i % 5]}", "Nassfutter", "createdAt" to i)
        }
    val liking = pets.flatMap { p -> products.map { x -> (p["id"] to x["id"]) to rnd.nextDouble() } }.toMap()
    val servings =
        (0 until years * 365 * 2).map { n ->
            val at = now - 3 * 3_600_000L - n * day / 2
            val sort = products[rnd.nextInt(150)]["id"] as String
            val rated =
                pets.associate { p ->
                    val like = liking.getValue(p["id"] to sort)
                    val weights = listOf(like * 4, 2.0, 1.0, 1.0, (1 - like) * 4)
                    var pick = rnd.nextDouble() * weights.sum()
                    var k = 0
                    while (k < 4 && pick >= weights[k]) pick -= weights[k++]
                    p["id"] as String to mapOf("r" to RATED_AS[k], "at" to at + 3_600_000, "by" to "Anna")
                }
            mapOf(
                "id" to "mahl%06d".format(n),
                "productId" to sort,
                "servedAt" to at,
                "note" to "",
                "by" to listOf("Anna", "Jonas")[n % 2],
                "pets" to rated,
            )
        }
    return dbRaw(dbOf(pets, products, servings))
}

class PerfTest : ScreenTest() {
    private fun ms(block: () -> Unit): Double {
        val t0 = System.nanoTime()
        block()
        return (System.nanoTime() - t0) / 1e6
    }

    private fun median(xs: List<Double>) = xs.sorted()[xs.size / 2]

    @Test
    fun `rating - the redraw after a rating and opening the history page and Vorlieben stay quick with five years of data`() {
        open(now = at("2026-06-09T10:00"))
        phone.store.replaceDb(household(YEARS, Time.now()))
        phone.store.save()
        ui.update()
        idle(1000)
        val meal = db.servings[0]
        val draws =
            listOf("top", "schlecht", "gut", "mittel", "sosse", "top", "schlecht", "gut", "mittel", "sosse", "top").map { r ->
                val t =
                    ms {
                        meal["pets"] = JsonObject(meal.pets + ("petminka001" to j(mapOf("r" to r, "at" to Time.now()))))
                        phone.store.save()
                        ui.update()
                        rule.waitForIdle()
                    }
                idle(50)
                t
            }
        val draw = median(draws.drop(2))
        check(draw < LIMIT_MS, "redraw after a rating ${draw.toInt()} ms (limit $LIMIT_MS)")
        val opens =
            (0 until 5).map {
                ui.sheets.closeAll()
                phone.store.save()
                idle(50)
                val t =
                    ms {
                        ui.sheets.openSheet(
                            de.schmeckts.app.views
                                .reportState(null),
                        )
                        rule.waitForIdle()
                    }
                t to tags("d-", sheet = true).size
            }
        val shown = median(opens.drop(1).map { it.first })
        check(shown < REPORT_MS && opens[1].second > 0, "history page opens in ${shown.toInt()} ms (limit $REPORT_MS)")
        val evals =
            (0 until 5).map {
                ui.sheets.closeAll()
                phone.store.save()
                idle(50)
                val t =
                    ms {
                        ui.sheets.openSheet(
                            de.schmeckts.app.ui
                                .SheetState("evaluation"),
                        )
                        rule.waitForIdle()
                    }
                t to tags("place-", sheet = true).size
            }
        val eval = median(evals.drop(1).map { it.first })
        check(eval < REPORT_MS && evals[1].second > 0, "„Vorlieben“ opens in ${eval.toInt()} ms (limit $REPORT_MS)")
    }
}
