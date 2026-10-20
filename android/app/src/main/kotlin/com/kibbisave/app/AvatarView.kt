package com.kibbisave.app

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.TextView
import java.net.HttpURLConnection
import java.net.URL

/** Native circular profile image. Remote requests never include KibbiSave cookies. */
class AvatarView(context: Context, name: String, picture: String?, size: Int, font: Typeface) :
    FrameLayout(context) {
    init {
        background =
            GradientDrawable().apply {
                setColor(Color.rgb(0, 0, 139))
                cornerRadius = size / 2f
                setStroke(1, Color.rgb(155, 155, 224))
            }
        clipToOutline = true
        addView(
            TextView(context).apply {
                text =
                    name
                        .trim()
                        .split(Regex("\\s+"))
                        .filter { it.isNotBlank() }
                        .take(2)
                        .joinToString("") { it.first().uppercase() }
                textSize = 21f
                typeface = Typeface.create(font, Typeface.BOLD)
                gravity = Gravity.CENTER
                setTextColor(Color.WHITE)
            },
            LayoutParams(-1, -1),
        )
        if (!picture.isNullOrBlank() && picture != "null") {
            val image =
                ImageView(context).apply {
                    scaleType = ImageView.ScaleType.CENTER_CROP
                    contentDescription = "$name profile photo"
                }
            addView(image, LayoutParams(-1, -1))
            val app = context.applicationContext as NativeApplication
            app.imageExecutor.execute {
                val bitmap =
                    try {
                        readPicture(picture)
                    } catch (_: Exception) {
                        null
                    }
                if (bitmap != null)
                    image.post { if (image.isAttachedToWindow) image.setImageBitmap(bitmap) }
            }
        }
    }

    private fun readPicture(value: String): Bitmap? {
        val bytes =
            if (value.startsWith("data:image/")) {
                require(value.length <= 3 * 1024 * 1024)
                android.util.Base64.decode(value.substringAfter(','), android.util.Base64.DEFAULT)
            } else {
                val url = URL(value)
                require(url.protocol == "https")
                val connection = url.openConnection() as HttpURLConnection
                connection.connectTimeout = 5000
                connection.readTimeout = 5000
                connection.instanceFollowRedirects = false
                try {
                    if (connection.responseCode != 200) return null
                    connection.inputStream.use { stream ->
                        val out = java.io.ByteArrayOutputStream()
                        val buffer = ByteArray(8192)
                        while (true) {
                            val count = stream.read(buffer)
                            if (count < 0) break
                            require(out.size() + count <= 2 * 1024 * 1024)
                            out.write(buffer, 0, count)
                        }
                        out.toByteArray()
                    }
                } finally {
                    connection.disconnect()
                }
            }
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        var sample = 1
        while (maxOf(bounds.outWidth, bounds.outHeight) / sample > 320) sample *= 2
        return BitmapFactory.decodeByteArray(
            bytes,
            0,
            bytes.size,
            BitmapFactory.Options().apply { inSampleSize = sample },
        )
    }
}
