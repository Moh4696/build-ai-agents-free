package com.sixninezerozero.freeagent.ui.screens

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.core.net.toUri
import com.sixninezerozero.freeagent.R
import com.sixninezerozero.freeagent.domain.VideoMood
import com.sixninezerozero.freeagent.domain.VideoScript
import com.sixninezerozero.freeagent.domain.VideoUiState
import com.sixninezerozero.freeagent.domain.VideoVoice
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun VideoScreen(
    state: VideoUiState,
    onBack: () -> Unit,
    onScriptChange: (String) -> Unit,
    onVoice: (VideoVoice) -> Unit,
    onMood: (VideoMood) -> Unit,
    onMake: () -> Unit,
    onMakeAnother: () -> Unit,
) {
    BackHandler(onBack = onBack)

    // Keep the screen on while the video is being made, so the phone doesn't sleep mid-render.
    val view = LocalView.current
    DisposableEffect(state.isMaking) {
        view.keepScreenOn = state.isMaking
        onDispose { view.keepScreenOn = false }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.video_title)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Outlined.ArrowBack,
                            contentDescription = stringResource(R.string.back),
                        )
                    }
                },
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            state.result?.let { result ->
                VideoReady(result.displayPath, result.durationSeconds, result.makeSeconds, result.uri.toUri(), onMakeAnother)
                return@Column
            }

            Text(
                text = stringResource(R.string.video_intro),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            OutlinedTextField(
                value = state.script,
                onValueChange = onScriptChange,
                label = { Text(stringResource(R.string.video_script_label)) },
                supportingText = {
                    val words = VideoScript.wordCount(state.script)
                    Text(pluralStringResource(R.plurals.video_word_count, words, words))
                },
                enabled = !state.isMaking,
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("videoScript"),
                minLines = 5,
                maxLines = 12,
            )

            Text(stringResource(R.string.video_voice_label), style = MaterialTheme.typography.titleSmall)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                VideoVoice.entries.forEach { voice ->
                    FilterChip(
                        selected = state.voice == voice,
                        onClick = { onVoice(voice) },
                        enabled = !state.isMaking,
                        label = { Text(voice.label) },
                    )
                }
            }

            Text(stringResource(R.string.video_music_label), style = MaterialTheme.typography.titleSmall)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                VideoMood.entries.forEach { mood ->
                    FilterChip(
                        selected = state.mood == mood,
                        onClick = { onMood(mood) },
                        enabled = !state.isMaking,
                        label = { Text(mood.label) },
                    )
                }
            }

            state.error?.let {
                Text(text = it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium)
            }

            if (state.isMaking) {
                val progress = state.progress
                Text(progress?.label ?: stringResource(R.string.video_starting))
                val fraction = progress?.fraction
                if (fraction != null) {
                    LinearProgressIndicator(progress = { fraction.toFloat() }, modifier = Modifier.fillMaxWidth())
                } else {
                    LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
                }
                Text(
                    text = stringResource(R.string.video_keep_open),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else {
                Button(
                    onClick = onMake,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(52.dp)
                        .testTag("createMp4"),
                ) {
                    Text(stringResource(R.string.video_create))
                }
                if (state.voice != VideoVoice.NONE) {
                    Text(
                        text = stringResource(R.string.video_first_time_note),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

@Composable
private fun VideoReady(
    displayPath: String,
    durationSeconds: Double,
    makeSeconds: Double,
    uri: Uri,
    onMakeAnother: () -> Unit,
) {
    val context = LocalContext.current
    fun launch(intent: Intent) {
        try {
            context.startActivity(intent)
        } catch (_: ActivityNotFoundException) {
            // No video player or sharing app installed; the file is still saved.
        }
    }

    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(stringResource(R.string.video_ready), style = MaterialTheme.typography.titleMedium)
            Text(
                stringResource(
                    R.string.video_ready_detail,
                    String.format(Locale.UK, "%.0f", durationSeconds),
                    displayPath,
                    String.format(Locale.UK, "%.0f", makeSeconds),
                ),
                style = MaterialTheme.typography.bodyMedium,
            )
        }
    }
    Button(
        onClick = {
            launch(
                Intent(Intent.ACTION_VIEW).setDataAndType(uri, "video/mp4")
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION),
            )
        },
        modifier = Modifier.fillMaxWidth().height(52.dp),
    ) { Text(stringResource(R.string.video_play)) }
    OutlinedButton(
        onClick = {
            launch(
                Intent.createChooser(
                    Intent(Intent.ACTION_SEND).setType("video/mp4").putExtra(Intent.EXTRA_STREAM, uri)
                        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION),
                    null,
                ),
            )
        },
        modifier = Modifier.fillMaxWidth(),
    ) { Text(stringResource(R.string.video_share)) }
    OutlinedButton(onClick = onMakeAnother, modifier = Modifier.fillMaxWidth()) {
        Text(stringResource(R.string.video_make_another))
    }
}
