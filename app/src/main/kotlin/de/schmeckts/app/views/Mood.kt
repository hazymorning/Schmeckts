package de.schmeckts.app.views

import android.os.Build
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.statusBars
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.ColorMatrix
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import de.schmeckts.app.imageOf
import de.schmeckts.app.ui.LocalUi
import de.schmeckts.app.ui.colors
import de.schmeckts.app.ui.watch

// Mood picture behind the header: the cat's photo out of focus, so it reads as a mood rather than a faded picture

@Composable
fun Mood() {
    watch()
    val ph = LocalUi.current.phone
    val pet = if (ph.db.pets.size == 1) ph.db.pets[0] else ph.db.pets.find { it.id == ph.prefs.activePet }
    val img = imageOf(pet?.str("photo")) ?: return
    val top = with(LocalDensity.current) { WindowInsets.statusBars.getTop(this).toDp() }
    val p = colors
    Box(
        Modifier
            .fillMaxWidth()
            .height(260.dp + top)
            .graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen }
            .drawWithContent {
                drawContent()
                drawRect(
                    Brush.verticalGradient(0.35f to Color.Black, 1f to Color.Transparent),
                    blendMode = BlendMode.DstIn,
                )
            },
    ) {
        Image(
            img,
            null,
            Modifier
                .fillMaxSize()
                .graphicsLayer { alpha = p.mood }
                .then(if (Build.VERSION.SDK_INT >= 31) Modifier.blur(24.dp) else Modifier),
            contentScale = ContentScale.Crop,
            colorFilter = ColorFilter.colorMatrix(ColorMatrix().apply { setToSaturation(0.85f) }),
        )
    }
}
