package de.schmeckts.app

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject

// The brands and words of Open Pet Food Facts (ODbL), vocab.json as scripts/vocab.py writes it. Used by Ocr.kt to put
// misread words right; BRANDS in Config.kt keeps precedence.

private val vocab by lazy { resourceJson("vocab.json") as JsonObject }
val VOCAB_BRANDS: List<String> by lazy { (vocab["brands"] as JsonArray).map { it.asString!! } }
val VOCAB_WORDS: List<String> by lazy { (vocab["words"] as JsonArray).map { it.asString!! } }
