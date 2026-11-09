package com.sixninezerozero.freeagent.ui

import android.content.Context
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.sixninezerozero.freeagent.data.AppRepository
import com.sixninezerozero.freeagent.data.SecureStore
import com.sixninezerozero.freeagent.domain.AiClient
import com.sixninezerozero.freeagent.domain.AiCoordinator
import com.sixninezerozero.freeagent.domain.AiProvider
import com.sixninezerozero.freeagent.domain.AppScreen
import com.sixninezerozero.freeagent.domain.AppSettings
import com.sixninezerozero.freeagent.domain.ChatMessage
import com.sixninezerozero.freeagent.domain.KeyCheck
import com.sixninezerozero.freeagent.domain.KeyChecker
import com.sixninezerozero.freeagent.domain.KeySetup
import com.sixninezerozero.freeagent.domain.VideoOutcome
import com.sixninezerozero.freeagent.domain.VideoProgress
import com.sixninezerozero.freeagent.domain.VideoRequest
import com.sixninezerozero.freeagent.domain.VideoService
import com.sixninezerozero.freeagent.ui.theme.FreeAgentTheme
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/** Chat → "Make video" → Video screen, with a fake AI and a fake video maker. */
@RunWith(AndroidJUnit4::class)
class ChatToVideoTest {
    @get:Rule
    val compose = createComposeRule()

    private val context: Context = ApplicationProvider.getApplicationContext()
    private var systemPromptSeen = ""
    private val made = mutableListOf<VideoRequest>()

    @Before
    fun wipe() {
        context.getSharedPreferences("free_ai_agent_secure_store", Context.MODE_PRIVATE).edit().clear().commit()
    }

    @Test
    fun replyTurnsIntoAVideo() {
        val groq = object : AiClient {
            override val provider = AiProvider.GROQ
            override suspend fun generate(apiKey: String, systemPrompt: String, messages: List<ChatMessage>): String {
                systemPromptSeen = systemPrompt
                return "Here's your script:\n\nBlocked gutters are cheap to fix and expensive to ignore. " +
                    "Clear them after autumn.\n\nTap Make video below this message to create the MP4."
            }
        }
        val gemini = object : AiClient {
            override val provider = AiProvider.GEMINI
            override suspend fun generate(apiKey: String, systemPrompt: String, messages: List<ChatMessage>) = "unused"
        }
        val video = object : VideoService {
            override suspend fun makeAndSave(request: VideoRequest, onProgress: (VideoProgress) -> Unit): VideoOutcome {
                made += request
                return VideoOutcome("content://test/video", "Movies/Free AI Agent/test.mp4", 12.0, 3.0, emptyList())
            }
        }
        val keyChecker = object : KeyChecker {
            override suspend fun check(provider: AiProvider, apiKey: String) = KeyCheck.Works
        }
        val viewModel = FreeAgentViewModel(
            repository = AppRepository(SecureStore(context)),
            coordinator = AiCoordinator(groq, gemini),
            keySetup = KeySetup(keyChecker),
            videoService = video,
        )
        compose.setContent { FreeAgentTheme { FreeAgentApp(viewModel) } }

        compose.waitUntil(10_000) { !viewModel.state.value.isInitialising }
        compose.runOnIdle {
            viewModel.saveSettings(AppSettings(groqApiKey = "gsk_" + "A1b2C3d4".repeat(6) + "Z9y8"))
        }
        compose.waitUntil(10_000) { viewModel.state.value.screen == AppScreen.Chat }
        compose.runOnIdle { viewModel.sendMessage("Make me a video about gutters") }
        compose.waitUntil(10_000) { compose.onAllNodes(hasTestTag("makeVideo")).fetchSemanticsNodes().isNotEmpty() }

        compose.onAllNodesWithTag("makeVideo").onFirst().performClick()
        compose.onNodeWithTag("videoScript")
            .assertTextContains("Blocked gutters are cheap to fix", substring = true)
        compose.onNodeWithTag("createMp4").performClick()
        compose.waitUntil(10_000) { made.isNotEmpty() }

        assertEquals(
            "Blocked gutters are cheap to fix and expensive to ignore. Clear them after autumn.",
            made.single().script,
        )
        assertTrue("Agent wasn't told it can make videos", systemPromptSeen.contains("MP4"))
    }
}
