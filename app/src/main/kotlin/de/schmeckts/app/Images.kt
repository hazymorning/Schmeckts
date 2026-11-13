package de.schmeckts.app

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RectF
import android.util.LruCache
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.exifinterface.media.ExifInterface
import okio.ByteString.Companion.decodeBase64
import okio.ByteString.Companion.toByteString
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

// Photos decoded, turned as taken, scaled and cut on the phone's own image code, as the old canvas did.

class AndroidPicture(
    val bitmap: Bitmap,
) : Picture {
    override val width get() = bitmap.width
    override val height get() = bitmap.height
}

private val smooth = Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG)

private fun jpeg(
    b: Bitmap,
    quality: Double,
): String {
    val out = ByteArrayOutputStream()
    b.compress(Bitmap.CompressFormat.JPEG, (quality * 100).roundToInt(), out)
    return out.toByteArray().toByteString().base64()
}

private fun drawn(
    w: Int,
    h: Int,
    draw: (Canvas) -> Unit,
): Bitmap {
    val b = Bitmap.createBitmap(max(1, w), max(1, h), Bitmap.Config.ARGB_8888)
    b.eraseColor(android.graphics.Color.BLACK) // JPEG has no transparency; the canvas filled with black too
    draw(Canvas(b))
    return b
}

/** a photo as JPEG bytes, turned the way it was taken; at most about limit px on the long side, never less */
fun decodePhoto(
    bytes: ByteArray,
    limit: Int = READ_MAX,
): Bitmap? {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
    var sample = 1
    while (max(bounds.outWidth, bounds.outHeight) / (sample * 2) >= limit) sample *= 2
    val raw =
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample }) ?: return null
    val turn =
        try {
            ExifInterface(ByteArrayInputStream(bytes)).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
        } catch (e: Exception) {
            ExifInterface.ORIENTATION_NORMAL
        }
    val m = Matrix()
    when (turn) {
        ExifInterface.ORIENTATION_ROTATE_90 -> m.postRotate(90f)
        ExifInterface.ORIENTATION_ROTATE_180 -> m.postRotate(180f)
        ExifInterface.ORIENTATION_ROTATE_270 -> m.postRotate(270f)
        ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> m.postScale(-1f, 1f)
        ExifInterface.ORIENTATION_FLIP_VERTICAL -> m.postScale(1f, -1f)
        ExifInterface.ORIENTATION_TRANSPOSE -> {
            m.postRotate(90f)
            m.postScale(-1f, 1f)
        }
        ExifInterface.ORIENTATION_TRANSVERSE -> {
            m.postRotate(270f)
            m.postScale(-1f, 1f)
        }
        else -> return raw
    }
    return Bitmap.createBitmap(raw, 0, 0, raw.width, raw.height, m, true)
}

class AndroidPictures : Pictures {
    override fun decode(b64: String): Picture? =
        b64
            .substringAfter(",")
            .decodeBase64()
            ?.toByteArray()
            ?.let { decodePhoto(it) }
            ?.let(::AndroidPicture)

    override fun resize(
        p: Picture,
        max: Int,
        quality: Double,
    ): String {
        val b = (p as AndroidPicture).bitmap
        val s = min(1.0, max.toDouble() / max(b.width, b.height))
        val w = (b.width * s).roundToInt()
        val h = (b.height * s).roundToInt()
        val out = drawn(w, h) { it.drawBitmap(b, Rect(0, 0, b.width, b.height), Rect(0, 0, w, h), smooth) }
        return "data:image/jpeg;base64," + jpeg(out, quality)
    }

    override fun square(
        p: Picture,
        size: Int,
        quality: Double,
        rect: Square?,
    ): String {
        val b = (p as AndroidPicture).bitmap
        val m = min(b.width, b.height)
        val r = rect ?: Square((b.width - m) / 2, (b.height - m) / 2, m)
        val out =
            drawn(size, size) {
                it.drawBitmap(b, Rect(r.x, r.y, r.x + r.side, r.y + r.side), Rect(0, 0, size, size), smooth)
            }
        return "data:image/jpeg;base64," + jpeg(out, quality)
    }

    override fun crop(
        p: Picture,
        rect: Box,
        width: Int,
        maxHeight: Int,
        quality: Double,
    ): Pair<String, Double> {
        val b = (p as AndroidPicture).bitmap
        val w = rect.right - rect.left
        val h = rect.bottom - rect.top
        val cw = (w * max(1.0, min(width / w, maxHeight / h))).roundToInt()
        val ch = (h * cw / w).roundToInt()
        val out =
            drawn(cw, ch) {
                val k = cw / w
                it.save()
                it.scale(k.toFloat(), k.toFloat())
                it.translate(-rect.left.toFloat(), -rect.top.toFloat())
                it.clipRect(RectF(rect.left.toFloat(), rect.top.toFloat(), rect.right.toFloat(), rect.bottom.toFloat()))
                it.drawBitmap(b, 0f, 0f, smooth)
                it.restore()
            }
        return jpeg(out, quality) to cw / w
    }
}

private val shown = LruCache<String, ImageBitmap>(48)

/** a data URL as the views show it, decoded once; null when it is no picture */
fun imageOf(src: String?): ImageBitmap? {
    if (src.isNullOrEmpty()) return null
    shown.get(src)?.let { return it }
    val bytes = src.substringAfter(",").decodeBase64()?.toByteArray() ?: return null
    val b = decodePhoto(bytes) ?: return null
    return b.asImageBitmap().also { shown.put(src, it) }
}
