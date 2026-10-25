package com.kibbisave.app

import android.graphics.*
import android.graphics.drawable.Drawable

/** Native paint equivalents of kibbisave-home.css and the site's mobile active-tab glow. */
class WebsiteSurface(private val density: Float, private val kind: Kind) : Drawable() {
    enum class Kind {
        SAVINGS,
        NAV,
        DARK_NAV,
    }

    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)

    override fun draw(canvas: Canvas) {
        val b = RectF(bounds)
        val radius = (if (kind == Kind.SAVINGS) 22 else 18) * density
        val path = Path().apply { addRoundRect(b, radius, radius, Path.Direction.CW) }
        canvas.save()
        canvas.clipPath(path)
        paint.shader = null
        paint.color =
            when (kind) {
                Kind.SAVINGS -> Color.rgb(0, 0, 139)
                Kind.NAV -> Color.argb(24, 255, 255, 255)
                Kind.DARK_NAV -> Color.argb(20, 245, 240, 232)
            }
        canvas.drawRect(b, paint)
        fun wash(x: Float, y: Float, r: Float, color: Int) {
            paint.shader =
                RadialGradient(
                    x,
                    y,
                    r.coerceAtLeast(1f),
                    color,
                    Color.TRANSPARENT,
                    Shader.TileMode.CLAMP,
                )
            canvas.drawRect(b, paint)
        }
        if (kind == Kind.SAVINGS) {
            wash(b.right, b.top, b.width() * .55f, Color.argb(20, 255, 215, 0))
            wash(b.left, b.bottom, b.width() * .5f, Color.argb(26, 72, 202, 228))
        } else {
            wash(
                b.centerX(),
                b.top + b.height() * .2f,
                b.width() * .72f,
                if (kind == Kind.DARK_NAV) Color.argb(68, 245, 240, 232)
                else Color.argb(133, 10, 10, 255),
            )
        }
        paint.shader = null
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = density
        paint.color = Color.argb(if (kind == Kind.SAVINGS) 36 else 18, 255, 255, 255)
        canvas.drawRoundRect(b, radius, radius, paint)
        paint.style = Paint.Style.FILL
        canvas.restore()
    }

    override fun setAlpha(alpha: Int) {}

    override fun setColorFilter(colorFilter: ColorFilter?) {}

    @Deprecated("Deprecated in Android") override fun getOpacity() = PixelFormat.TRANSLUCENT
}
