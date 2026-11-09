package com.sixninezerozero.freeagent.data

import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import androidx.core.content.FileProvider
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

private const val FOLDER = "Free AI Agent"

/** Where a saved video ended up, and how to open or share it. */
data class SavedVideo(val uri: Uri, val displayPath: String)

object VideoSaver {
    /**
     * Android 10+: copies the video into Movies/Free AI Agent, where the gallery and other apps
     * can find it (no permission needed). Android 8–9: keeps it in the app's own Movies folder
     * and shares it through a FileProvider.
     */
    suspend fun save(context: Context, video: File): SavedVideo = withContext(Dispatchers.IO) {
        val name = "video-" + SimpleDateFormat("yyyyMMdd-HHmmss", Locale.UK).format(Date()) + ".mp4"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val resolver = context.contentResolver
            val values = ContentValues().apply {
                put(MediaStore.Video.Media.DISPLAY_NAME, name)
                put(MediaStore.Video.Media.MIME_TYPE, "video/mp4")
                put(MediaStore.Video.Media.RELATIVE_PATH, "${Environment.DIRECTORY_MOVIES}/$FOLDER")
                put(MediaStore.Video.Media.IS_PENDING, 1)
            }
            val uri = resolver.insert(MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY), values)
                ?: error("The gallery refused the video.")
            try {
                resolver.openOutputStream(uri)?.use { out -> video.inputStream().use { it.copyTo(out) } }
                    ?: error("The gallery file could not be opened.")
                values.clear()
                values.put(MediaStore.Video.Media.IS_PENDING, 0)
                resolver.update(uri, values, null, null)
            } catch (error: Exception) {
                resolver.delete(uri, null, null)
                throw error
            }
            video.delete()
            SavedVideo(uri, "Movies/$FOLDER/$name")
        } else {
            val dir = File(context.getExternalFilesDir(Environment.DIRECTORY_MOVIES), FOLDER).apply { mkdirs() }
            val target = File(dir, name)
            video.copyTo(target, overwrite = true)
            video.delete()
            val uri = FileProvider.getUriForFile(context, "${context.packageName}.files", target)
            SavedVideo(uri, "Free AI Agent app folder/$name")
        }
    }
}
