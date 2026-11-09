package com.sixninezerozero.freeagent.data

import android.annotation.SuppressLint
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.view.ViewGroup
import android.webkit.ConsoleMessage
import android.webkit.JavascriptInterface
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.WebViewAssetLoader
import com.sixninezerozero.freeagent.domain.VideoProgress
import com.sixninezerozero.freeagent.domain.VideoRequest
import java.io.File
import java.io.FileOutputStream
import java.lang.ref.WeakReference
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import org.json.JSONObject

private const val BRIDGE_URL = "https://appassets.androidplatform.net/assets/studio/bridge.html"
private const val READY_TIMEOUT_MS = 30_000L

/** A finished video in the app's cache, before it is saved to the gallery. */
data class MadeVideo(
    val file: File,
    val durationSeconds: Double,
    val width: Int,
    val height: Int,
    val makeSeconds: Double,
    val warnings: List<String>,
)

class VideoMakerException(message: String) : Exception(message)

/**
 * Makes MP4 videos on the phone with the Faceless Studio engine.
 *
 * The engine is a web app bundled in the APK (assets/studio). It runs in a tiny WebView that is
 * attached to the app's window while a video is being made: Chromium slows down pages that are
 * not on screen, so the WebView must be attached to render at full speed.
 */
class VideoMaker(context: Context) {
    private val appContext = context.applicationContext
    private val main = Handler(Looper.getMainLooper())
    private var host: WeakReference<ViewGroup>? = null
    private var webView: WebView? = null
    private var job: Job? = null

    /** The activity calls this so the WebView has a window to live in. */
    fun attachHost(container: ViewGroup) {
        host = WeakReference(container)
    }

    fun detachHost(container: ViewGroup) {
        if (host?.get() === container) host = null
    }

    val isBusy: Boolean
        get() = job != null

    suspend fun make(request: VideoRequest, onProgress: (VideoProgress) -> Unit): MadeVideo {
        if (job != null) throw VideoMakerException("A video is already being made.")
        val output = File(appContext.cacheDir, "videos").apply { mkdirs() }
            .resolve("video-${System.currentTimeMillis()}.mp4")
        val current = Job(output, onProgress)
        job = current
        try {
            withContext(Dispatchers.Main) { startWebView(current) }
            withTimeout(READY_TIMEOUT_MS) { current.ready.await() }
            withContext(Dispatchers.Main) {
                webView?.evaluateJavascript("window.makeVideo(${JSONObject.quote(request.toJson())})", null)
            }
            return current.result.await()
        } catch (error: Exception) {
            output.delete()
            if (error is kotlinx.coroutines.TimeoutCancellationException) {
                throw VideoMakerException("The video engine didn't start. Close the app fully and try again.")
            }
            throw error
        } finally {
            current.close()
            job = null
            withContext(Dispatchers.Main) { destroyWebView() }
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun startWebView(current: Job) {
        destroyWebView()
        val container = host?.get()
            ?: throw VideoMakerException("Open the app before making a video.")

        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(appContext))
            .build()

        val view = WebView(container.context).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            settings.mediaPlaybackRequiresUserGesture = false
            webViewClient = EngineClient(loader, current)
            webChromeClient = object : WebChromeClient() {
                override fun onConsoleMessage(message: ConsoleMessage): Boolean {
                    if (message.messageLevel() == ConsoleMessage.MessageLevel.ERROR) {
                        current.lastConsoleError = message.message()
                    }
                    return true
                }
            }
            addJavascriptInterface(Bridge(current), "AndroidVideo")
        }
        // 1x1 pixel: attached (so it renders at full speed) but effectively invisible.
        container.addView(view, ViewGroup.LayoutParams(1, 1))
        webView = view
        view.loadUrl(BRIDGE_URL)
    }

    // onRenderProcessGone IS implemented below; the androidx.webkit lint check misses it here.
    @SuppressLint("MissingOnRenderProcessGone")
    private inner class EngineClient(
        private val loader: WebViewAssetLoader,
        private val current: Job,
    ) : WebViewClient() {
        override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
            loader.shouldInterceptRequest(request.url)

        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest) = true

        // Rendering video is memory-hungry. If Android stops the WebView, fail this video
        // cleanly instead of crashing the whole app.
        override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
            current.ready.complete(Unit)
            current.result.completeExceptionally(
                VideoMakerException(
                    if (detail.didCrash()) "The video engine crashed. Try a shorter script."
                    else "The phone ran out of memory. Close other apps and try again.",
                ),
            )
            if (webView === view) webView = null
            (view.parent as? ViewGroup)?.removeView(view)
            view.destroy()
            return true
        }
    }

    private fun destroyWebView() {
        webView?.let { view ->
            (view.parent as? ViewGroup)?.removeView(view)
            view.stopLoading()
            view.removeJavascriptInterface("AndroidVideo")
            view.destroy()
        }
        webView = null
    }

    private class Job(val output: File, val onProgress: (VideoProgress) -> Unit) {
        val ready = CompletableDeferred<Unit>()
        val result = CompletableDeferred<MadeVideo>()
        val warnings = mutableListOf<String>()
        var lastConsoleError: String? = null
        var stream: FileOutputStream? = null
        var expectedBytes = 0L
        var writtenBytes = 0L
        var meta: JSONObject? = null

        fun close() {
            runCatching { stream?.close() }
            stream = null
        }
    }

    /** Methods the bridge page calls. They run on a WebView background thread. */
    private inner class Bridge(private val job: Job) {
        @JavascriptInterface
        fun onProgress(stage: String, done: Double, total: Double) {
            if (stage == "ready") {
                job.ready.complete(Unit)
                return
            }
            val fraction = if (done >= 0 && total > 0) (done / total).coerceIn(0.0, 1.0) else null
            main.post { job.onProgress(VideoProgress(stage, fraction)) }
        }

        @JavascriptInterface
        fun onWarning(text: String) {
            job.warnings += text
        }

        @JavascriptInterface
        fun onStart(size: Double, ext: String, meta: String) {
            if (ext != "mp4") {
                job.result.completeExceptionally(VideoMakerException("The video came out as $ext instead of MP4."))
                return
            }
            job.expectedBytes = size.toLong()
            job.meta = runCatching { JSONObject(meta) }.getOrNull()
            job.stream = FileOutputStream(job.output)
        }

        @JavascriptInterface
        fun onChunk(base64: String) {
            val bytes = Base64.decode(base64, Base64.NO_WRAP)
            job.stream?.write(bytes) ?: return
            job.writtenBytes += bytes.size
        }

        @JavascriptInterface
        fun onDone() {
            job.close()
            if (job.writtenBytes != job.expectedBytes || job.writtenBytes == 0L) {
                job.result.completeExceptionally(
                    VideoMakerException("The video file was incomplete (${job.writtenBytes} of ${job.expectedBytes} bytes)."),
                )
                return
            }
            val meta = job.meta
            job.result.complete(
                MadeVideo(
                    file = job.output,
                    durationSeconds = meta?.optDouble("duration") ?: 0.0,
                    width = meta?.optInt("width") ?: 0,
                    height = meta?.optInt("height") ?: 0,
                    makeSeconds = meta?.optDouble("seconds") ?: 0.0,
                    warnings = job.warnings.toList(),
                ),
            )
        }

        @JavascriptInterface
        fun onError(text: String) {
            job.ready.complete(Unit)
            job.result.completeExceptionally(VideoMakerException(text.ifBlank { job.lastConsoleError ?: "Unknown error" }))
        }
    }

    companion object {
        // One shared maker for the app. It only holds a WebView while a video is being made and
        // destroys it straight after; the window it borrows is held weakly.
        @SuppressLint("StaticFieldLeak")
        @Volatile
        private var instance: VideoMaker? = null

        fun get(context: Context): VideoMaker =
            instance ?: synchronized(this) {
                instance ?: VideoMaker(context).also { instance = it }
            }
    }
}
