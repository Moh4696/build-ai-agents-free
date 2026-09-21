package com.sixninezerozero.freeagent.ui.screens

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import com.sixninezerozero.freeagent.R
import com.sixninezerozero.freeagent.domain.AppSettings

@Composable
fun SettingsScreen(
    initialSettings: AppSettings,
    errorMessage: String?,
    onBack: () -> Unit,
    onSave: (AppSettings) -> Unit,
    onEraseEverything: () -> Unit,
    onDismissError: () -> Unit,
) {
    var showEraseDialog by remember { mutableStateOf(false) }

    SetupScreen(
        initialSettings = initialSettings,
        errorMessage = errorMessage,
        isOnboarding = false,
        onSave = onSave,
        onDismissError = onDismissError,
        onBack = onBack,
        footer = {
            Text(
                text = stringResource(R.string.data_controls),
                style = MaterialTheme.typography.titleMedium,
            )
            Text(
                text = stringResource(R.string.security_summary),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            OutlinedButton(
                onClick = { showEraseDialog = true },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(stringResource(R.string.erase_everything))
            }
        },
    )

    if (showEraseDialog) {
        AlertDialog(
            onDismissRequest = { showEraseDialog = false },
            title = { Text(stringResource(R.string.erase_title)) },
            text = { Text(stringResource(R.string.erase_body)) },
            confirmButton = {
                TextButton(
                    onClick = {
                        showEraseDialog = false
                        onEraseEverything()
                    },
                ) {
                    Text(stringResource(R.string.erase))
                }
            },
            dismissButton = {
                TextButton(onClick = { showEraseDialog = false }) {
                    Text(stringResource(R.string.cancel))
                }
            },
        )
    }
}
