package com.sixninezerozero.freeagent.ui.theme

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext

private val LightColors = lightColorScheme(
    primary = Color(0xFF146B3A),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFA8F5BE),
    onPrimaryContainer = Color(0xFF00210D),
    secondary = Color(0xFF4E6353),
    background = Color(0xFFF8FBF6),
    surface = Color(0xFFF8FBF6),
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFF8DD9A4),
    onPrimary = Color(0xFF00391A),
    primaryContainer = Color(0xFF005227),
    onPrimaryContainer = Color(0xFFA8F5BE),
    secondary = Color(0xFFB5CCB9),
    background = Color(0xFF101511),
    surface = Color(0xFF101511),
)

@Composable
fun FreeAgentTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val context = LocalContext.current
    val colours = when {
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && darkTheme -> dynamicDarkColorScheme(context)
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> dynamicLightColorScheme(context)
        darkTheme -> DarkColors
        else -> LightColors
    }

    MaterialTheme(
        colorScheme = colours,
        typography = MaterialTheme.typography,
        content = content,
    )
}
