package com.sixninezerozero.freeagent.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.sixninezerozero.freeagent.domain.AppScreen
import com.sixninezerozero.freeagent.ui.screens.ChatScreen
import com.sixninezerozero.freeagent.ui.screens.SettingsScreen
import com.sixninezerozero.freeagent.ui.screens.SetupScreen

@Composable
fun FreeAgentApp(viewModel: FreeAgentViewModel) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    Surface(modifier = Modifier.fillMaxSize()) {
        when {
            state.isInitialising -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }

            state.screen == AppScreen.Onboarding -> {
                SetupScreen(
                    initialSettings = state.settings,
                    errorMessage = state.errorMessage,
                    isOnboarding = true,
                    onSave = viewModel::saveSettings,
                    onDismissError = viewModel::dismissError,
                )
            }

            state.screen == AppScreen.Settings -> {
                SettingsScreen(
                    initialSettings = state.settings,
                    errorMessage = state.errorMessage,
                    onBack = viewModel::closeSettings,
                    onSave = viewModel::saveSettings,
                    onEraseEverything = viewModel::eraseEverything,
                    onDismissError = viewModel::dismissError,
                )
            }

            else -> {
                ChatScreen(
                    state = state,
                    onSend = viewModel::sendMessage,
                    onRetry = viewModel::retryLastMessage,
                    onOpenSettings = viewModel::openSettings,
                    onClearChat = viewModel::clearChat,
                    onDismissError = viewModel::dismissError,
                    onDismissFallbackNotice = viewModel::dismissFallbackNotice,
                )
            }
        }
    }
}
