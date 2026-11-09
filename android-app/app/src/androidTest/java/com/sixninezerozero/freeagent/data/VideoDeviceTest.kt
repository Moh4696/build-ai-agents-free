package com.sixninezerozero.freeagent.data

import android.content.Context
import android.media.MediaExtractor
import android.media.MediaFormat
import android.util.Log
import androidx.core.net.toUri
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.rules.ActivityScenarioRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.sixninezerozero.freeagent.MainActivity
import com.sixninezerozero.freeagent.domain.VideoMood
import com.sixninezerozero.freeagent.domain.VideoRequest
import com.sixninezerozero.freeagent.domain.VideoVoice
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Makes real MP4s on the device with the bundled video engine, saves them to the gallery and
 * checks the files. CI pulls the saved videos (Movies/Free AI Agent) for a human to watch.
 */
@RunWith(AndroidJUnit4::class)
class VideoDeviceTest {
    // The activity gives the engine's WebView a window to render in, as in the real app.
    @get:Rule
    val activity = ActivityScenarioRule(MainActivity::class.java)

    private val context: Context = ApplicationProvider.getApplicationContext()

    @Test
    fun makesCaptionOnlyMp4() = makeAndCheck(VideoVoice.NONE, timeoutMinutes = 8)

    @Test
    fun makesMp4WithFreeVoice() = makeAndCheck(VideoVoice.UK_MALE, timeoutMinutes = 25)

    private fun makeAndCheck(voice: VideoVoice, timeoutMinutes: Long) = runBlocking {
        val request = VideoRequest(script = SCRIPT, voice = voice, mood = VideoMood.CALM, quality = "720")
        val outcome = withTimeout(timeoutMinutes * 60_000) {
            PhoneVideoService(context).makeAndSave(request) { Log.i(TAG, "${voice.id}: ${it.stage} ${it.fraction}") }
        }

        val extractor = MediaExtractor()
        extractor.setDataSource(context, outcome.uri.toUri(), null)
        val formats = (0 until extractor.trackCount).map { extractor.getTrackFormat(it) }
        extractor.release()
        val mimes = formats.map { it.getString(MediaFormat.KEY_MIME).orEmpty() }
        val videoSeconds = formats.first { it.getString(MediaFormat.KEY_MIME) == "video/avc" }
            .getLong(MediaFormat.KEY_DURATION) / 1_000_000.0

        Log.i(
            TAG,
            "RESULT voice=${voice.id} path=${outcome.displayPath} tracks=$mimes " +
                "duration=${"%.1f".format(videoSeconds)}s made_in=${outcome.makeSeconds}s warnings=${outcome.warnings}",
        )
        assertTrue("No H.264 video track: $mimes", "video/avc" in mimes)
        assertTrue("No AAC audio track: $mimes", mimes.any { it == "audio/mp4a-latm" })
        assertTrue("Video is only $videoSeconds s long", videoSeconds in 6.0..30.0)
    }

    private companion object {
        const val TAG = "VideoTest"
        const val SCRIPT =
            "Radiators cold at the top but warm at the bottom? That usually means trapped air. " +
                "Bleeding them takes a few minutes and can make your whole home feel warmer."
    }
}
