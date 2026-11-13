package de.schmeckts.app

/** An error not handled where it happens ends here; nothing depends on it. */
object Report {
    var sink: (String) -> Unit = { System.err.println(it) }
}

fun report(
    where: String,
    what: Any? = null,
) {
    val text = (what as? Throwable)?.let { it.message ?: it.toString() } ?: what?.toString() ?: ""
    Report.sink("$where: $text")
}
