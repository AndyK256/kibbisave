package com.kibbisave.app

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.view.View

/** Rounded website progress track, independent of the device manufacturer's widget theme. */
class WebsiteProgress(
    context: Context,
    percent: Double,
    private val fill: Int,
    private val track: Int,
    private val dot: Boolean,
) : View(context) {
    private val fraction =
        if (percent.isFinite()) percent.coerceIn(0.0, 100.0).toFloat() / 100 else 0f
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)

    init {
        importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_YES
        contentDescription = "${(fraction * 100).toInt()}% of goal"
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val r = height / 2f
        paint.color = track
        canvas.drawRoundRect(RectF(0f, 0f, width.toFloat(), height.toFloat()), r, r, paint)
        val end = width * fraction
        paint.color = fill
        if (end > 0) canvas.drawRoundRect(RectF(0f, 0f, end, height.toFloat()), r, r, paint)
        if (dot) canvas.drawCircle(end.coerceIn(r, (width - r).coerceAtLeast(r)), r, r, paint)
    }
}
