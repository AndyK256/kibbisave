package com.kibbisave.app

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.view.View

/** Small native outline icons matching the website navigation. */
class BrandIcon(context: Context, private val kind: String, private val ink: Int) : View(context) {
    private val websiteDrawable =
        when (kind) {
            "profile" -> R.drawable.website_profile
            "groups" -> R.drawable.website_groups
            "leaderboard" -> R.drawable.website_leaderboard
            "analytics" -> R.drawable.website_analytics
            "communities" -> R.drawable.website_communities
            else -> null
        }?.let { context.getDrawable(it)?.mutate()?.apply { setTint(ink) } }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val availableWidth = width - paddingLeft - paddingRight
        val availableHeight = height - paddingTop - paddingBottom
        val scale = minOf(availableWidth, availableHeight) / 24f
        websiteDrawable?.let {
            val size = minOf(availableWidth, availableHeight)
            val x = paddingLeft + (availableWidth - size) / 2
            val y = paddingTop + (availableHeight - size) / 2
            it.setBounds(x, y, x + size, y + size)
            it.draw(canvas)
            return
        }
        canvas.save()
        canvas.translate(
            paddingLeft + (availableWidth - 24 * scale) / 2,
            paddingTop + (availableHeight - 24 * scale) / 2,
        )
        canvas.scale(scale, scale)
        val p =
            Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = ink
                style = Paint.Style.STROKE
                strokeWidth = 1.6f
                strokeCap = Paint.Cap.ROUND
                strokeJoin = Paint.Join.ROUND
            }
        fun line(x: Float, y: Float, a: Float, b: Float) = canvas.drawLine(x, y, a, b, p)
        fun path(vararg xy: Float) {
            val shape = Path()
            shape.moveTo(xy[0], xy[1])
            for (i in 2 until xy.size step 2) shape.lineTo(xy[i], xy[i + 1])
            canvas.drawPath(shape, p)
        }
        when (kind) {
            "profile" -> {
                canvas.drawCircle(12f, 7f, 3.4f, p)
                canvas.drawArc(5f, 13f, 19f, 25f, 180f, 180f, false, p)
            }
            "groups" -> {
                canvas.drawCircle(9f, 7f, 3f, p)
                canvas.drawCircle(17f, 9f, 2.5f, p)
                canvas.drawArc(2f, 12f, 16f, 25f, 180f, 180f, false, p)
                canvas.drawArc(12f, 14f, 23f, 24f, 230f, 130f, false, p)
            }
            "analytics" -> {
                line(5f, 18f, 5f, 10f)
                line(10f, 18f, 10f, 6f)
                line(15f, 18f, 15f, 9f)
                line(20f, 18f, 20f, 3f)
            }
            "leaderboard" -> {
                path(7f, 3f, 17f, 3f, 17f, 9f, 15f, 13f, 9f, 13f, 7f, 9f, 7f, 3f)
                path(7f, 5f, 3f, 5f, 3f, 9f, 7f, 11f)
                path(17f, 5f, 21f, 5f, 21f, 9f, 17f, 11f)
                line(12f, 13f, 12f, 19f)
                line(7f, 20f, 17f, 20f)
            }
            "communities" -> {
                canvas.drawCircle(12f, 12f, 9f, p)
                canvas.drawOval(7f, 3f, 17f, 21f, p)
                line(3f, 12f, 21f, 12f)
                canvas.drawArc(3f, 6f, 21f, 15f, 0f, 180f, false, p)
            }
            "search" -> {
                canvas.drawCircle(10f, 10f, 6.5f, p)
                line(15f, 15f, 21f, 21f)
            }
            "sun" -> {
                canvas.drawCircle(12f, 12f, 4f, p)
                for (i in 0..7) {
                    val angle = i * Math.PI / 4
                    line(
                        (12 + 7 * kotlin.math.cos(angle)).toFloat(),
                        (12 + 7 * kotlin.math.sin(angle)).toFloat(),
                        (12 + 10 * kotlin.math.cos(angle)).toFloat(),
                        (12 + 10 * kotlin.math.sin(angle)).toFloat(),
                    )
                }
            }
            "help" -> {
                canvas.drawCircle(12f, 12f, 9f, p)
                canvas.drawArc(9f, 6f, 15f, 12f, 190f, 250f, false, p)
                line(12f, 12f, 12f, 14f)
                line(12f, 17f, 12f, 17.2f)
            }
            "down" -> path(6f, 9f, 12f, 15f, 18f, 9f)
            "back" -> path(15f, 4f, 7f, 12f, 15f, 20f)
            "arrow" -> path(9f, 5f, 16f, 12f, 9f, 19f)
            "plus" -> {
                line(12f, 4f, 12f, 20f)
                line(4f, 12f, 20f, 12f)
            }
            "filter" -> path(3f, 4f, 21f, 4f, 14f, 12f, 14f, 20f, 10f, 18f, 10f, 12f, 3f, 4f)
            "eye" -> {
                canvas.drawOval(2f, 6f, 22f, 18f, p)
                canvas.drawCircle(12f, 12f, 3f, p)
            }
            "home" -> {
                path(3f, 11f, 12f, 3f, 21f, 11f)
                path(6f, 9f, 6f, 21f, 18f, 21f, 18f, 9f)
                path(10f, 21f, 10f, 15f, 14f, 15f, 14f, 21f)
            }
            "check" -> path(4f, 12f, 10f, 18f, 20f, 5f)
            "bell" -> {
                canvas.drawArc(6f, 3f, 18f, 19f, 180f, 180f, false, p)
                path(6f, 10f, 6f, 16f, 3f, 19f, 21f, 19f, 18f, 16f, 18f, 10f)
                line(10f, 22f, 14f, 22f)
            }
            "lock" -> {
                canvas.drawRoundRect(5f, 10f, 19f, 21f, 2f, 2f, p)
                canvas.drawArc(8f, 2f, 16f, 16f, 180f, 180f, false, p)
            }
            else -> {
                canvas.drawCircle(12f, 12f, 9f, p)
                line(12f, 8f, 12f, 16f)
            }
        }
        canvas.restore()
    }
}
