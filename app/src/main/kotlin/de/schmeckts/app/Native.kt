package de.schmeckts.app

// What the phone itself does, behind small interfaces: the app has Android's, tests their own.

/** A decoded photo, turned the way it was taken */
interface Picture {
    val width: Int
    val height: Int
}

/** Photos in and out: JPEG only, as base64 without a data URL prefix unless said */
interface Pictures {
    fun decode(b64: String): Picture?

    /** at most max px on the long side, never enlarged; a data URL */
    fun resize(
        p: Picture,
        max: Int,
        quality: Double,
    ): String

    /** the square x, y, side in pixels (the centre square without one) at size × size; a data URL */
    fun square(
        p: Picture,
        size: Int,
        quality: Double,
        rect: Square? = null,
    ): String

    /** enlarged to at least width px but no taller than READ_MAX, never shrunk; the scale it came out at */
    fun crop(
        p: Picture,
        rect: Box,
        width: Int,
        maxHeight: Int,
        quality: Double,
    ): Pair<String, Double>
}

/** A rating reminder: „Wie war’s?“ for one meal; rate: the buttons, when one pet is left to rate */
class Note(
    val id: Int,
    val title: String,
    val body: String,
    val at: Long,
    val serving: String,
    val pet: String?,
    val rate: List<String>,
)

/** A feeding reminder: sure is the text once the server confirmed nothing was served since `since` */
class FeedNote(
    val id: Int,
    val key: String,
    val at: Long,
    val since: Long,
    val title: String,
    val body: String,
    val sure: String,
)

interface Notifications {
    /** granted, denied or prompt */
    fun permission(): String

    suspend fun request(): String

    /** every rating reminder that should be there: armed, changed or taken back, shown ones dismissed */
    fun plan(notes: List<Note>)

    /** replaces the feeding reminders; dismiss: ids of shown ones whose meal has been served */
    fun feed(
        reminders: List<FeedNote>,
        dismiss: List<Int>,
        server: String,
        code: String,
    )
}

interface Platform {
    /** the app's version, as the release names it */
    val version: String
    val pictures: Pictures
    val notifications: Notifications

    /** select, success or strong */
    fun haptic(level: String = "select")

    /** shared or copied; cancelling is not an error */
    suspend fun shareText(
        title: String,
        text: String,
    ): String

    /** a JSON file through the share menu; false when cancelled */
    suspend fun shareFile(
        name: String,
        text: String,
        title: String,
        dialogTitle: String,
    ): Boolean

    /** a shared file stays in the cache until the receiving app has read it, then goes on the next start */
    fun clearExports()

    /** the system camera app, for when the app's own camera cannot run; the photo as JPEG, null when cancelled */
    suspend fun takePhoto(hint: String?): ByteArray?

    /** on-device text recognition; a failure reads as nothing */
    suspend fun readPhoto(b64: String): Reading

    /** Google's scanner in Play services, its module installed first if missing; null when cancelled */
    suspend fun scanBarcode(onInstall: () -> Unit): String?

    fun canUpdate(): Boolean

    /** loads the APK and hands it to Android's installer, which asks before it replaces the app */
    suspend fun install(
        url: String,
        share: (Double) -> Unit,
    )
}

val UNREAD = Reading("", 0, 0, emptyList())
