package de.schmeckts.app.ui

// The icons of the old app's icons.js, drawn the same: on a 24 grid (sketches on 64), stroked round in the current
// colour, some parts filled. Made from icons.js by a script, not by hand.

/** One part of an icon: its path, filled and/or stroked; part names what animates (the bowl's fill) */
class Stroke(
    val d: String,
    val fill: Boolean = false,
    val fillAlpha: Float = 1f,
    val stroke: Boolean = true,
    val dash: String = "",
    val part: String = "",
    val dx: Float = 0f,
    val dy: Float = 0f,
)

val ICONS: Map<String, List<Stroke>> =
    mapOf(
        "r_top" to
            listOf(
                Stroke("M3.5 11h17l-1.5 6.3a2.3 2.3 0 0 1-2.24 1.77H7.24A2.3 2.3 0 0 1 5 17.3z"),
                Stroke("M12 8.7c-1.4-.9-2.8-2-2.8-3.4a1.45 1.45 0 0 1 2.8-.6 1.45 1.45 0 0 1 2.8.6c0 1.4-1.4 2.5-2.8 3.4z"),
            ),
        "r_gut" to
            listOf(
                Stroke(
                    "M5.86 16.6h12.28l-.19.8a1.4 1.4 0 0 1-1.36 1.07H7.41A1.4 1.4 0 0 1 6.05 17.4z",
                    fill = true,
                    fillAlpha = 0.4f,
                    stroke = false,
                ),
                Stroke("M3.5 11h17l-1.5 6.3a2.3 2.3 0 0 1-2.24 1.77H7.24A2.3 2.3 0 0 1 5 17.3z"),
            ),
        "r_mittel" to
            listOf(
                Stroke(
                    "M5.47 15h13.05l-.58 2.4a1.4 1.4 0 0 1-1.36 1.07H7.41A1.4 1.4 0 0 1 6.05 17.4z",
                    fill = true,
                    fillAlpha = 0.4f,
                    stroke = false,
                ),
                Stroke("M3.5 11h17l-1.5 6.3a2.3 2.3 0 0 1-2.24 1.77H7.24A2.3 2.3 0 0 1 5 17.3z"),
            ),
        "r_eager" to
            listOf(
                Stroke(
                    "M5.4 11c.8-2.7 3.5-4.4 6.6-4.4.62 0 1.22.07 1.8.2a3.6 3.6 0 0 0 4.32 3.06c.2.36.36.74.48 1.15z",
                    fill = true,
                    fillAlpha = 0.3f,
                ),
                Stroke("M3.5 11h17l-1.5 6.3a2.3 2.3 0 0 1-2.24 1.77H7.24A2.3 2.3 0 0 1 5 17.3z"),
            ),
        "r_sosse" to
            listOf(
                Stroke("M3.5 11h17l-1.5 6.3a2.3 2.3 0 0 1-2.24 1.77H7.24A2.3 2.3 0 0 1 5 17.3z"),
                Stroke("M7.85 15.4a1.15 1.15 0 1 0 2.3 0a1.15 1.15 0 1 0 -2.3 0z", fill = true, stroke = false),
                Stroke("M11.05 16.2a1.15 1.15 0 1 0 2.3 0a1.15 1.15 0 1 0 -2.3 0z", fill = true, stroke = false),
                Stroke("M13.95 15.2a1.15 1.15 0 1 0 2.3 0a1.15 1.15 0 1 0 -2.3 0z", fill = true, stroke = false),
                Stroke("M12 2.8c1.2 1.5 2.1 2.7 2.1 3.8a2.1 2.1 0 0 1-4.2 0c0-1.1.9-2.3 2.1-3.8z"),
            ),
        "r_schlecht" to
            listOf(
                Stroke("M5.4 11c.8-2.7 3.5-4.4 6.6-4.4s5.8 1.7 6.6 4.4z", fill = true, fillAlpha = 0.3f),
                Stroke("M3.5 11h17l-1.5 6.3a2.3 2.3 0 0 1-2.24 1.77H7.24A2.3 2.3 0 0 1 5 17.3z"),
                Stroke("M9.3 4.6c-.6-.7-.6-1.5 0-2.2M14.7 4.6c-.6-.7-.6-1.5 0-2.2"),
            ),
        "r_gern" to
            listOf(
                Stroke("M3.5 11h17l-1.5 6.3a2.3 2.3 0 0 1-2.24 1.77H7.24A2.3 2.3 0 0 1 5 17.3z"),
                Stroke("M12 8.7c-1.4-.9-2.8-2-2.8-3.4a1.45 1.45 0 0 1 2.8-.6 1.45 1.45 0 0 1 2.8.6c0 1.4-1.4 2.5-2.8 3.4z"),
            ),
        "r_normal" to
            listOf(
                Stroke(
                    "M5.86 16.6h12.28l-.19.8a1.4 1.4 0 0 1-1.36 1.07H7.41A1.4 1.4 0 0 1 6.05 17.4z",
                    fill = true,
                    fillAlpha = 0.4f,
                    stroke = false,
                ),
                Stroke("M3.5 11h17l-1.5 6.3a2.3 2.3 0 0 1-2.24 1.77H7.24A2.3 2.3 0 0 1 5 17.3z"),
            ),
        "r_wenig" to
            listOf(
                Stroke(
                    "M5.4 11c.8-2.7 3.5-4.4 6.6-4.4.62 0 1.22.07 1.8.2a3.6 3.6 0 0 0 4.32 3.06c.2.36.36.74.48 1.15z",
                    fill = true,
                    fillAlpha = 0.3f,
                ),
                Stroke("M3.5 11h17l-1.5 6.3a2.3 2.3 0 0 1-2.24 1.77H7.24A2.3 2.3 0 0 1 5 17.3z"),
            ),
        "r_liegen" to
            listOf(
                Stroke("M5.4 11c.8-2.7 3.5-4.4 6.6-4.4s5.8 1.7 6.6 4.4z", fill = true, fillAlpha = 0.3f),
                Stroke("M3.5 11h17l-1.5 6.3a2.3 2.3 0 0 1-2.24 1.77H7.24A2.3 2.3 0 0 1 5 17.3z"),
                Stroke("M9.3 4.6c-.6-.7-.6-1.5 0-2.2M14.7 4.6c-.6-.7-.6-1.5 0-2.2"),
            ),
        "r_verputzt" to
            listOf(
                Stroke("M3.6 14.4a6 6 0 1 0 12 0a6 6 0 1 0 -12 0z"),
                Stroke("M6.55 13.1a1.15 1.15 0 1 0 2.3 0a1.15 1.15 0 1 0 -2.3 0z", fill = true, stroke = false),
                Stroke("M10.15 16a1.15 1.15 0 1 0 2.3 0a1.15 1.15 0 1 0 -2.3 0z", fill = true, stroke = false),
                Stroke("M6.45 17a1.15 1.15 0 1 0 2.3 0a1.15 1.15 0 1 0 -2.3 0z", fill = true, stroke = false),
                Stroke(
                    "M12 8.7c-1.4-.9-2.8-2-2.8-3.4a1.45 1.45 0 0 1 2.8-.6 1.45 1.45 0 0 1 2.8.6c0 1.4-1.4 2.5-2.8 3.4z",
                    dx = 6.6f,
                    dy = 0.2f,
                ),
            ),
        "r_spaeter" to
            listOf(
                Stroke("M3.6 14.4a6 6 0 1 0 12 0a6 6 0 1 0 -12 0z"),
                Stroke("M6.55 13.1a1.15 1.15 0 1 0 2.3 0a1.15 1.15 0 1 0 -2.3 0z", fill = true, stroke = false),
                Stroke("M10.15 16a1.15 1.15 0 1 0 2.3 0a1.15 1.15 0 1 0 -2.3 0z", fill = true, stroke = false),
                Stroke("M6.45 17a1.15 1.15 0 1 0 2.3 0a1.15 1.15 0 1 0 -2.3 0z", fill = true, stroke = false),
                Stroke("M8.7 5.6a3.3 3.3 0 1 0 6.6 0a3.3 3.3 0 1 0 -6.6 0z", dx = 6.6f, dy = 0.2f),
                Stroke("M12 3.9v1.9l1.2.8", dx = 6.6f, dy = 0.2f),
            ),
        "r_angeknabbert" to
            listOf(
                Stroke("M11.55 8.73A6 6 0 1 0 15.27 12.45 2.7 2.7 0 0 1 11.55 8.73z"),
                Stroke("M6.55 13.1a1.15 1.15 0 1 0 2.3 0a1.15 1.15 0 1 0 -2.3 0z", fill = true, stroke = false),
                Stroke("M10.15 16a1.15 1.15 0 1 0 2.3 0a1.15 1.15 0 1 0 -2.3 0z", fill = true, stroke = false),
                Stroke("M6.45 17a1.15 1.15 0 1 0 2.3 0a1.15 1.15 0 1 0 -2.3 0z", fill = true, stroke = false),
                Stroke("M16.65 8.2a1.15 1.15 0 1 0 2.3 0a1.15 1.15 0 1 0 -2.3 0z", fill = true, stroke = false),
                Stroke("M18.45 11.4a1.15 1.15 0 1 0 2.3 0a1.15 1.15 0 1 0 -2.3 0z", fill = true, stroke = false),
            ),
        "r_unberuehrt" to
            listOf(
                Stroke("M3.6 14.4a6 6 0 1 0 12 0a6 6 0 1 0 -12 0z"),
                Stroke("M6.55 13.1a1.15 1.15 0 1 0 2.3 0a1.15 1.15 0 1 0 -2.3 0z", fill = true, stroke = false),
                Stroke("M10.15 16a1.15 1.15 0 1 0 2.3 0a1.15 1.15 0 1 0 -2.3 0z", fill = true, stroke = false),
                Stroke("M6.45 17a1.15 1.15 0 1 0 2.3 0a1.15 1.15 0 1 0 -2.3 0z", fill = true, stroke = false),
                Stroke("M16.3 5.8h4.6"),
            ),
        "unrated" to
            listOf(
                Stroke("M3.5 11h17l-1.5 6.3a2.3 2.3 0 0 1-2.24 1.77H7.24A2.3 2.3 0 0 1 5 17.3z"),
                Stroke("M10.1 3.4a1.9 1.9 0 1 1 2.85 1.65c-.6.35-.95.75-.95 1.45"),
                Stroke("M11.1 8.4a0.9 0.9 0 1 0 1.8 0a0.9 0.9 0 1 0 -1.8 0z", fill = true, stroke = false),
            ),
        "bowl" to
            listOf(
                Stroke(
                    "M3.5 11h17l-1.5 6.3a2.3 2.3 0 0 1-2.24 1.77H7.24A2.3 2.3 0 0 1 5 17.3z",
                    fill = true,
                    stroke = false,
                    part = "fill",
                ),
                Stroke("M3.5 11h17l-1.5 6.3a2.3 2.3 0 0 1-2.24 1.77H7.24A2.3 2.3 0 0 1 5 17.3z"),
                Stroke("M12 5.2v3.6M10.2 7h3.6"),
            ),
        "wait" to
            listOf(
                Stroke(
                    "M3.5 11h17l-1.5 6.3a2.3 2.3 0 0 1-2.24 1.77H7.24A2.3 2.3 0 0 1 5 17.3z",
                    fill = true,
                    stroke = false,
                    part = "fill",
                    dx = 0f,
                    dy = -3f,
                ),
                Stroke("M3.5 11h17l-1.5 6.3a2.3 2.3 0 0 1-2.24 1.77H7.24A2.3 2.3 0 0 1 5 17.3z", dx = 0f, dy = -3f),
            ),
        "feed" to
            listOf(
                Stroke("M3.5 11h17l-1.5 6.3a2.3 2.3 0 0 1-2.24 1.77H7.24A2.3 2.3 0 0 1 5 17.3z"),
                Stroke("M12 5.2v3.6M10.2 7h3.6"),
            ),
        "barcode" to
            listOf(
                Stroke(
                    "M4 8.5V6.3A2.3 2.3 0 0 1 6.3 4h2.2M15.5 4h2.2A2.3 2.3 0 0 1 20 6.3v2.2M20 15.5v2.2a2.3 2.3 0 0 1-2.3 2.3h-2.2M8.5 20H6.3A2.3 2.3 0 0 1 4 17.7v-2.2",
                ),
                Stroke("M8 8.5v7M10.6 8.5v7M13.4 8.5v7M16 8.5v7"),
            ),
        "camera" to
            listOf(
                Stroke(
                    "M3.5 8.8a2.3 2.3 0 0 1 2.3-2.3h1.7l1.3-1.9a1.4 1.4 0 0 1 1.16-.6h4.08a1.4 1.4 0 0 1 1.16.6l1.3 1.9h1.7a2.3 2.3 0 0 1 2.3 2.3v8.4a2.3 2.3 0 0 1-2.3 2.3H5.8a2.3 2.3 0 0 1-2.3-2.3z",
                ),
                Stroke("M8.6 12.9a3.4 3.4 0 1 0 6.8 0a3.4 3.4 0 1 0 -6.8 0z"),
            ),
        "sliders" to
            listOf(
                Stroke("M4 7.5h8.5M16.5 7.5H20M4 16.5h3.5M11.5 16.5H20"),
                Stroke("M12.5 7.5a2 2 0 1 0 4 0a2 2 0 1 0 -4 0z"),
                Stroke("M7.5 16.5a2 2 0 1 0 4 0a2 2 0 1 0 -4 0z"),
            ),
        "close" to
            listOf(
                Stroke("M6.5 6.5l11 11M17.5 6.5l-11 11"),
            ),
        "plus" to
            listOf(
                Stroke("M12 5.5v13M5.5 12h13"),
            ),
        "undo" to
            listOf(
                Stroke("M8.5 13.5l-4-4 4-4"),
                Stroke("M4.5 9.5H14a5.5 5.5 0 0 1 0 11h-3"),
            ),
        "trash" to
            listOf(
                Stroke(
                    "M4.5 7h15M9.5 7V5.2c0-.7.5-1.2 1.2-1.2h2.6c.7 0 1.2.5 1.2 1.2V7M6.5 7l.8 11.3a2 2 0 0 0 2 1.7h5.4a2 2 0 0 0 2-1.7L17.5 7M10.2 11v5M13.8 11v5",
                ),
            ),
        "search" to
            listOf(
                Stroke("M4.8 11a6.2 6.2 0 1 0 12.4 0a6.2 6.2 0 1 0 -12.4 0z"),
                Stroke("M19.5 19.5l-3.9-3.9"),
            ),
        "pencil" to
            listOf(
                Stroke("M4.5 19.5h4l10-10a2.83 2.83 0 0 0-4-4l-10 10z"),
                Stroke("M13.5 7l3.5 3.5"),
            ),
        "check" to
            listOf(
                Stroke("M5 12.5l4.3 4.3L19 7.5"),
            ),
        "note" to
            listOf(
                Stroke("M6 3.5h9l3.5 3.5v13.5H6z"),
                Stroke("M9 11h6.5M9 14.5h6.5M9 18h4"),
            ),
        "clock" to
            listOf(
                Stroke("M4 12a8 8 0 1 0 16 0a8 8 0 1 0 -16 0z"),
                Stroke("M12 8v4.3l2.8 1.7"),
            ),
        "phone" to
            listOf(
                Stroke(
                    "M9.4 3.5h5.2a2.4 2.4 0 0 1 2.4 2.4v12.2a2.4 2.4 0 0 1 -2.4 2.4h-5.2a2.4 2.4 0 0 1 -2.4 -2.4v-12.2a2.4 2.4 0 0 1 2.4 -2.4z",
                ),
                Stroke("M10.8 17.4h2.4"),
            ),
        "house" to
            listOf(
                Stroke("M4.5 10.6L12 4.5l7.5 6.1v8a1.4 1.4 0 0 1-1.4 1.4h-3.6v-5.4h-5v5.4H5.9a1.4 1.4 0 0 1-1.4-1.4z"),
            ),
        "alert" to
            listOf(
                Stroke("M10.6 5.2a1.6 1.6 0 0 1 2.8 0l6.6 11.9a1.6 1.6 0 0 1-1.4 2.4H5.4A1.6 1.6 0 0 1 4 17.1z"),
                Stroke("M12 9.8v3.7M12 16.4v.2"),
            ),
        "repeat" to
            listOf(
                Stroke("M16.5 4.5l2.5 2.5-2.5 2.5"),
                Stroke("M4.5 11.5V10a3 3 0 0 1 3-3H19"),
                Stroke("M7.5 19.5L5 17l2.5-2.5"),
                Stroke("M19.5 12.5V14a3 3 0 0 1-3 3H5"),
            ),
        "refresh" to
            listOf(
                Stroke("M19 12.5a7 7 0 0 1-12.4 4.1M5 11.5a7 7 0 0 1 12.4-4.1"),
                Stroke("M17.8 3.9v3.8H14M6.2 20.1v-3.8H10"),
            ),
        "unplug" to
            listOf(
                Stroke("M8.5 7.5l-2 2a3.5 3.5 0 0 0 5 5l2-2M15.5 16.5l2-2a3.5 3.5 0 0 0-5-5l-2 2M4.5 4.5l15 15"),
            ),
        "chevron" to
            listOf(
                Stroke("M9.5 6l6 6-6 6"),
            ),
        "back" to
            listOf(
                Stroke("M19.5 12H5M11.5 5.5L5 12l6.5 6.5"),
            ),
        "down" to
            listOf(
                Stroke("M12 4.5V19M5.5 12.5L12 19l6.5-6.5"),
            ),
        "person" to
            listOf(
                Stroke("M8.4 8a3.6 3.6 0 1 0 7.2 0a3.6 3.6 0 1 0 -7.2 0z"),
                Stroke("M5.6 19.8c0-3.3 2.9-5.4 6.4-5.4s6.4 2.1 6.4 5.4"),
            ),
        "paw" to
            listOf(
                Stroke("M4.9 10.4a1.7 1.7 0 1 0 3.4 0a1.7 1.7 0 1 0 -3.4 0z"),
                Stroke("M8.3 6.6a1.7 1.7 0 1 0 3.4 0a1.7 1.7 0 1 0 -3.4 0z"),
                Stroke("M12.3 6.6a1.7 1.7 0 1 0 3.4 0a1.7 1.7 0 1 0 -3.4 0z"),
                Stroke("M15.7 10.4a1.7 1.7 0 1 0 3.4 0a1.7 1.7 0 1 0 -3.4 0z"),
                Stroke(
                    "M12 12.2c-2.5 0-4.8 2.4-4.8 4.8 0 1.5 1.1 2.5 2.4 2.5.9 0 1.6-.5 2.4-.5s1.5.5 2.4.5c1.3 0 2.4-1 2.4-2.5 0-2.4-2.3-4.8-4.8-4.8z",
                ),
            ),
        "shield" to
            listOf(
                Stroke("M12 3.5l7 2.5v5.3c0 4.4-2.9 7.8-7 9.2-4.1-1.4-7-4.8-7-9.2V6z"),
                Stroke("M9.2 12l2 2 3.6-3.8"),
            ),
        "pin" to
            listOf(
                Stroke("M9.2 3.5h5.6l-.9 5.6 3.1 3.3v1.4H7v-1.4l3.1-3.3z"),
                Stroke("M12 13.8v6.7"),
            ),
        "layers" to
            listOf(
                Stroke("M12 4.5l8 4-8 4-8-4z"),
                Stroke("M4 12.3l8 4 8-4"),
                Stroke("M4 16.1l8 4 8-4"),
            ),
        "fish" to
            listOf(
                Stroke("M21 12c-1.7 3-4.5 5-7.8 5-3.4 0-6.1-2-7.7-5 1.6-3 4.3-5 7.7-5 3.3 0 6.1 2 7.8 5z"),
                Stroke("M5.5 12L2.5 8.8v6.4z"),
                Stroke("M16.6 10.9v.2"),
            ),
        "o_stink" to
            listOf(
                Stroke("M6.8 20h10a3 3 0 0 0 .3-6 4.3 4.3 0 0 0-8.3-1A3.5 3.5 0 0 0 6.8 20z"),
                Stroke("M9.5 9.5c-.9-.9-.9-1.9 0-2.8s.9-1.9 0-2.8M14.5 9.5c-.9-.9-.9-1.9 0-2.8s.9-1.9 0-2.8"),
            ),
        "o_hungry" to
            listOf(
                Stroke("M3.5 12a8.5 8.5 0 1 0 17 0a8.5 8.5 0 1 0 -17 0z"),
                Stroke("M8.3 10.3c.6-.8 1.6-.8 2.2 0M13.5 10.3c.6-.8 1.6-.8 2.2 0"),
                Stroke("M8.5 14c2 1.6 5 1.6 7 0"),
                Stroke("M13.2 14.9v1.3a1.4 1.4 0 0 0 2.8 0V14"),
            ),
        "o_happy" to
            listOf(
                Stroke("M11 19.3s-6.5-4-6.5-8.6A3.5 3.5 0 0 1 11 8.6a3.5 3.5 0 0 1 6.5 2.1c0 4.6-6.5 8.6-6.5 8.6z"),
                Stroke("M18.5 3.5v3M17 5h3"),
            ),
        "o_tired" to
            listOf(
                Stroke("M3.8 12.5c2.2 2.6 5 3.9 8.2 3.9s6-1.3 8.2-3.9"),
                Stroke("M6.6 15.3l-1.1 1.9M12 16.4v2.2M17.4 15.3l1.1 1.9"),
                Stroke("M14.5 3.5h4l-4 4.5h4"),
            ),
        "o_vomit" to
            listOf(
                Stroke("M15.6 8.9A6.6 6.6 0 1 0 12 15.3"),
                Stroke("M7.2 7.6l1.6 1.2-1.6 1.2M12.4 7.6l-1.6 1.2 1.6 1.2"),
                Stroke("M10.7 12.6c1.4.2 2.6.7 3.6 1.6 1.4 1.3 2 3.1 2.4 4.6"),
                Stroke("M14 20.3h6.5"),
            ),
        "champ" to
            listOf(
                Stroke("M3.5 12.5h17l-1.5 6a2.3 2.3 0 0 1-2.24 1.75H7.24A2.3 2.3 0 0 1 5 18.5z"),
                Stroke("M7.8 9.5h8.4l.9-5.2-2.9 2.3L12 3.5l-2.2 3.1-2.9-2.3z"),
                Stroke("M20 6.5v2M19 7.5h2"),
            ),
        "flop" to
            listOf(
                Stroke("M5.2 10.5c.9-3 3.6-4.8 6.8-4.8s5.9 1.8 6.8 4.8z", fill = true, fillAlpha = 0.3f),
                Stroke("M3.5 10.5h17l-1.5 7.4a2.3 2.3 0 0 1-2.24 1.8H7.24A2.3 2.3 0 0 1 5 17.9z"),
                Stroke("M8.25 13.5a1.15 1.15 0 1 0 2.3 0a1.15 1.15 0 1 0 -2.3 0z", fill = true, stroke = false),
                Stroke("M13.45 13.5a1.15 1.15 0 1 0 2.3 0a1.15 1.15 0 1 0 -2.3 0z", fill = true, stroke = false),
                Stroke("M9.8 17.3c1.3-1.2 3.1-1.2 4.4 0"),
            ),
        "heart" to
            listOf(
                Stroke("M12 19.3s-7.2-4.4-7.2-9.4A4 4 0 0 1 12 7.6a4 4 0 0 1 7.2 2.3c0 5-7.2 9.4-7.2 9.4z"),
            ),
        "tag" to
            listOf(
                Stroke("M3.8 11.9V5.3c0-.8.7-1.5 1.5-1.5h6.6l8.4 8.4a1.5 1.5 0 0 1 0 2.1l-6.3 6.3a1.5 1.5 0 0 1-2.1 0z"),
                Stroke("M6.8 8.3a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0z"),
            ),
        "rise" to
            listOf(
                Stroke("M4 16.5l5-5 3.5 3.5L19.5 8"),
                Stroke("M14.5 8h5v5"),
            ),
        "fall" to
            listOf(
                Stroke("M4 7.5l5 5 3.5-3.5 7 7"),
                Stroke("M19.5 11v5h-5"),
            ),
        "drop" to
            listOf(
                Stroke("M12 3.8c3.1 3.7 5.6 6.8 5.6 9.9a5.6 5.6 0 0 1-11.2 0c0-3.1 2.5-6.2 5.6-9.9z"),
            ),
        "sun" to
            listOf(
                Stroke("M8.2 12a3.8 3.8 0 1 0 7.6 0a3.8 3.8 0 1 0 -7.6 0z"),
                Stroke("M12 3v1.8M12 19.2V21M3 12h1.8M19.2 12H21M5.6 5.6l1.3 1.3M17.1 17.1l1.3 1.3M5.6 18.4l1.3-1.3M17.1 6.9l1.3-1.3"),
            ),
        "moon" to
            listOf(
                Stroke("M19.5 14.6A7.6 7.6 0 0 1 9.4 4.5a7.6 7.6 0 1 0 10.1 10.1z"),
            ),
        "auto" to
            listOf(
                Stroke("M4.2 12a7.8 7.8 0 1 0 15.6 0a7.8 7.8 0 1 0 -15.6 0z"),
                Stroke("M12 4.2v15.6a7.8 7.8 0 0 0 0-15.6z", fill = true),
            ),
        "download" to
            listOf(
                Stroke("M12 4.5V15M7.5 10.5l4.5 4.5 4.5-4.5M5 19.5h14"),
            ),
        "share" to
            listOf(
                Stroke("M15 6a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0z"),
                Stroke("M4 12a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0z"),
                Stroke("M15 18a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0z"),
                Stroke("M8.7 10.8l6.6-3.6M8.7 13.2l6.6 3.6"),
            ),
        "upload" to
            listOf(
                Stroke("M12 15V4.5M7.5 9L12 4.5 16.5 9M5 19.5h14"),
            ),
        "cart" to
            listOf(
                Stroke("M3.5 4.5h1.6a1 1 0 0 1 1 .8l1.8 9.4a1.6 1.6 0 0 0 1.6 1.3h7.6a1.6 1.6 0 0 0 1.55-1.2l1.5-6.2a.8.8 0 0 0-.8-1H6.4"),
                Stroke("M8.35 19.5a1.25 1.25 0 1 0 2.5 0a1.25 1.25 0 1 0 -2.5 0z"),
                Stroke("M15.35 19.5a1.25 1.25 0 1 0 2.5 0a1.25 1.25 0 1 0 -2.5 0z"),
            ),
        "sparkle" to
            listOf(
                Stroke("M12 4l1.7 4.6 4.6 1.4-4.6 1.7L12 16.3l-1.7-4.6L5.7 10l4.6-1.4z"),
                Stroke("M18.5 16v3M17 17.5h3"),
            ),
        "cat" to
            listOf(
                Stroke(
                    "M5.2 10.2V4.6l4.1 3.1h5.4l4.1-3.1v5.6c.7 1.1 1.1 2.4 1.1 3.8 0 3.9-3.6 6.4-7.9 6.4s-7.9-2.5-7.9-6.4c0-1.4.4-2.7 1.1-3.8z",
                ),
                Stroke("M9.3 13.2v.4M14.7 13.2v.4"),
                Stroke("M11.1 16.1l.9.7.9-.7"),
            ),
        "calendar" to
            listOf(
                Stroke("M5 8l2.5-3.5L10 8h4l2.5-3.5L19 8v12H5z"),
                Stroke("M5 12h14"),
            ),
    )

// empty-state drawings on a 64 grid
val SKETCHES: Map<String, List<Stroke>> =
    mapOf(
        "empty" to
            listOf(
                Stroke("M34 8A22 22 0 1 1 20.5 47.2L12 57l3.4-15.4A22 22 0 0 1 34 8z"),
                Stroke("M22 30a12 12 0 1 0 24 0a12 12 0 1 0 -24 0z"),
                Stroke("M26.5 33.5a8 8 0 0 0 15 0", dash = "1.5 3.2"),
            ),
        "camera" to
            listOf(
                Stroke("M34 8A22 22 0 1 1 20.5 47.2L12 57l3.4-15.4A22 22 0 0 1 34 8z"),
                Stroke("M25 26.5a2 2 0 0 1 2-2h2.4l1.4-2h5.4l1.4 2H40a2 2 0 0 1 2 2v9.5a2 2 0 0 1-2 2H27a2 2 0 0 1-2-2z"),
                Stroke("M30.2 31.2a3.3 3.3 0 1 0 6.6 0a3.3 3.3 0 1 0 -6.6 0z"),
            ),
    )
