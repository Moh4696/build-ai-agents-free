package com.sixninezerozero.freeagent.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import com.sixninezerozero.freeagent.R
import com.sixninezerozero.freeagent.domain.ApiKeyValidator
import com.sixninezerozero.freeagent.domain.AppSettings
import com.sixninezerozero.freeagent.domain.ConversationPolicy

private const val GROQ_KEYS_URL = "https://console.groq.com/keys"
private const val GEMINI_KEYS_URL = "https://aistudio.google.com/app/apikey"

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SetupScreen(
    initialSettings: AppSettings,
    errorMessage: String?,
    isOnboarding: Boolean,
    onSave: (AppSettings) -> Unit,
    onDismissError: () -> Unit,
    onBack: (() -> Unit)? = null,
    footer: @Composable ColumnScope.() -> Unit = {},
) {
    val snackbarHostState = remember { SnackbarHostState() }
    LaunchedEffect(errorMessage) {
        if (errorMessage != null) {
            snackbarHostState.showSnackbar(errorMessage)
            onDismissError()
        }
    }

    if (!isOnboarding && onBack != null) BackHandler(onBack = onBack)

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        if (isOnboarding) stringResource(R.string.setup_title)
                        else stringResource(R.string.settings),
                    )
                },
                navigationIcon = {
                    if (!isOnboarding && onBack != null) {
                        IconButton(onClick = onBack) {
                            Icon(
                                imageVector = Icons.AutoMirrored.Outlined.ArrowBack,
                                contentDescription = stringResource(R.string.back),
                            )
                        }
                    }
                },
            )
        },
    ) { padding ->
        SettingsForm(
            initialSettings = initialSettings,
            isOnboarding = isOnboarding,
            onSave = onSave,
            footer = footer,
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
        )
    }
}

@Composable
private fun SettingsForm(
    initialSettings: AppSettings,
    isOnboarding: Boolean,
    onSave: (AppSettings) -> Unit,
    footer: @Composable ColumnScope.() -> Unit,
    modifier: Modifier = Modifier,
) {
    var groqKey by remember(initialSettings.groqApiKey) { mutableStateOf(initialSettings.groqApiKey) }
    var geminiKey by remember(initialSettings.geminiApiKey) { mutableStateOf(initialSettings.geminiApiKey) }
    var systemPrompt by remember(initialSettings.systemPrompt) { mutableStateOf(initialSettings.systemPrompt) }
    var fallbackEnabled by remember(initialSettings.fallbackEnabled) {
        mutableStateOf(initialSettings.fallbackEnabled)
    }
    var showGroqKey by remember { mutableStateOf(false) }
    var showGeminiKey by remember { mutableStateOf(false) }
    val uriHandler = LocalUriHandler.current

    Column(
        modifier = modifier
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp, vertical = 16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Text(
            text = stringResource(R.string.setup_intro),
            style = MaterialTheme.typography.bodyLarge,
        )

        SecretField(
            value = groqKey,
            onValueChange = {
                if (it.length <= ApiKeyValidator.MAXIMUM_KEY_LENGTH) groqKey = it
            },
            label = stringResource(R.string.groq_key_label),
            visible = showGroqKey,
            onToggleVisibility = { showGroqKey = !showGroqKey },
        )
        OutlinedButton(
            onClick = { uriHandler.openUri(GROQ_KEYS_URL) },
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(stringResource(R.string.get_groq_key))
        }

        SecretField(
            value = geminiKey,
            onValueChange = {
                if (it.length <= ApiKeyValidator.MAXIMUM_KEY_LENGTH) geminiKey = it
            },
            label = stringResource(R.string.gemini_key_label),
            visible = showGeminiKey,
            onToggleVisibility = { showGeminiKey = !showGeminiKey },
        )
        OutlinedButton(
            onClick = { uriHandler.openUri(GEMINI_KEYS_URL) },
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(stringResource(R.string.get_gemini_key))
        }

        Row(modifier = Modifier.fillMaxWidth()) {
            Checkbox(
                checked = fallbackEnabled,
                onCheckedChange = { fallbackEnabled = it },
            )
            Column(modifier = Modifier.padding(top = 10.dp)) {
                Text(stringResource(R.string.fallback_label))
                Text(
                    text = stringResource(R.string.fallback_explanation),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        OutlinedTextField(
            value = systemPrompt,
            onValueChange = {
                if (it.length <= ConversationPolicy.MAX_SYSTEM_PROMPT_CHARACTERS) systemPrompt = it
            },
            label = { Text(stringResource(R.string.system_prompt_label)) },
            modifier = Modifier.fillMaxWidth(),
            minLines = 3,
            maxLines = 7,
        )

        Text(
            text = stringResource(R.string.privacy_note),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        Spacer(Modifier.height(4.dp))
        Button(
            onClick = {
                onSave(
                    AppSettings(
                        groqApiKey = groqKey,
                        geminiApiKey = geminiKey,
                        fallbackEnabled = fallbackEnabled,
                        systemPrompt = systemPrompt,
                    ),
                )
            },
            modifier = Modifier
                .fillMaxWidth()
                .height(52.dp),
        ) {
            Text(
                if (isOnboarding) stringResource(R.string.save_and_continue)
                else stringResource(R.string.save_settings),
            )
        }

        footer()
    }
}

@Composable
private fun SecretField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    visible: Boolean,
    onToggleVisibility: () -> Unit,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        modifier = Modifier.fillMaxWidth(),
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
        visualTransformation = if (visible) VisualTransformation.None else PasswordVisualTransformation(),
        trailingIcon = {
            IconButton(onClick = onToggleVisibility) {
                Icon(
                    painter = painterResource(
                        if (visible) R.drawable.ic_visibility_off else R.drawable.ic_visibility,
                    ),
                    contentDescription = stringResource(
                        if (visible) R.string.hide_key else R.string.show_key,
                    ),
                )
            }
        },
    )
}
