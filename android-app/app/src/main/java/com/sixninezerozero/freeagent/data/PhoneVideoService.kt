package com.sixninezerozero.freeagent.data

import android.content.Context
import com.sixninezerozero.freeagent.domain.VideoOutcome
import com.sixninezerozero.freeagent.domain.VideoProgress
import com.sixninezerozero.freeagent.domain.VideoRequest
import com.sixninezerozero.freeagent.domain.VideoService

/** Makes the video with the bundled engine, then saves it to the gallery. */
class PhoneVideoService(
    private val context: Context,
    private val maker: VideoMaker = VideoMaker.get(context),
) : VideoService {
    override suspend fun makeAndSave(request: VideoRequest, onProgress: (VideoProgress) -> Unit): VideoOutcome {
        val made = maker.make(request, onProgress)
        onProgress(VideoProgress("save", null))
        val saved = VideoSaver.save(context, made.file)
        return VideoOutcome(
            uri = saved.uri.toString(),
            displayPath = saved.displayPath,
            durationSeconds = made.durationSeconds,
            makeSeconds = made.makeSeconds,
            warnings = made.warnings,
        )
    }
}
