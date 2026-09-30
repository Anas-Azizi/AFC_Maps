package com.repguide.app

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Point
import android.graphics.RectF
import android.graphics.Typeface
import android.view.MotionEvent
import androidx.core.content.ContextCompat
import com.repguide.app.data.StoreEntity
import org.osmdroid.util.GeoPoint
import org.osmdroid.views.MapView
import org.osmdroid.views.Projection
import org.osmdroid.views.overlay.Overlay
import kotlin.math.hypot

/**
 * طبقة ترسم دبابيس المحلات مع اسم المحل ورقم الكود تحت الدبوس.
 * الرسم مباشرة على الـ Canvas (بدون Bitmap لكل محل) لتفادي استهلاك الذاكرة مع آلاف المحلات.
 */
class StoresOverlay(
    mapView: MapView,
    private val onStoreClick: (StoreEntity) -> Unit
) : Overlay() {

    var stores: List<StoreEntity> = emptyList()

    /** معرف المحل المختار حالياً — يُرسم حول دبوسه حلقة مميزة */
    var highlightedId: Int? = null

    /** الحد الأدنى لمستوى التكبير لإظهار النصوص (الدبابيس تظهر دائماً) */
    var minLabelZoom = 13.5

    private val density = mapView.context.resources.displayMetrics.density
    private val pinSize = (30 * density).toInt()
    private val pin: Bitmap = run {
        val drawable = ContextCompat.getDrawable(mapView.context, R.drawable.ic_pin)!!
        val bmp = Bitmap.createBitmap(pinSize, pinSize, Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        drawable.setBounds(0, 0, pinSize, pinSize)
        drawable.draw(c)
        bmp
    }

    private val namePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.BLACK
        textSize = 12f * density
        textAlign = Paint.Align.CENTER
        typeface = Typeface.DEFAULT_BOLD
    }
    private val codePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#555555")
        textSize = 11f * density
        textAlign = Paint.Align.CENTER
    }
    private val bgPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.argb(190, 255, 255, 255)
        style = Paint.Style.FILL
    }
    private val highlightPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#1E88E5")
        style = Paint.Style.STROKE
        strokeWidth = 3f * mapView.context.resources.displayMetrics.density
    }

    private val tmpPoint = Point()
    private val tmpRect = RectF()
    private val labelCache = HashMap<Int, Label>()

    private data class Label(val name: String, val code: String?)

    private fun labelOf(store: StoreEntity): Label =
        labelCache.getOrPut(store.id) {
            val match = Regex("\\d{3,}").find(store.name)
                ?: return@getOrPut Label(store.name, null)
            val clean = store.name.replace(match.value, "").trim()
            Label(if (clean.isEmpty()) store.name else clean, match.value)
        }

    private fun ellipsize(name: String): String =
        if (name.length <= 28) name else name.take(27) + "…"

    override fun draw(canvas: Canvas, pj: Projection) {
        val clip = canvas.clipBounds
        val margin = (160 * density).toInt()
        clip.inset(-margin, -margin)
        val showLabels = pj.zoomLevel >= minLabelZoom
        val lineH = namePaint.fontSpacing
        val padH = 6 * density
        val padV = 3 * density

        for (store in stores) {
            pj.toPixels(GeoPoint(store.lat, store.lng), tmpPoint)
            if (!clip.contains(tmpPoint.x, tmpPoint.y)) continue

            canvas.drawBitmap(
                pin,
                tmpPoint.x - pinSize / 2f,
                tmpPoint.y - pinSize.toFloat(),
                null
            )
            if (store.id == highlightedId) {
                canvas.drawCircle(
                    tmpPoint.x.toFloat(),
                    tmpPoint.y - pinSize / 2f,
                    pinSize * 0.75f,
                    highlightPaint
                )
            }
            if (!showLabels) continue

            val label = labelOf(store)
            val name = ellipsize(label.name)
            val nameW = namePaint.measureText(name)
            val codeW = label.code?.let { codePaint.measureText(it) } ?: 0f
            val lines = if (label.code != null) 2 else 1
            val w = maxOf(nameW, codeW)

            tmpRect.set(
                tmpPoint.x - w / 2 - padH,
                tmpPoint.y + 2 * density,
                tmpPoint.x + w / 2 + padH,
                tmpPoint.y + 2 * density + lineH * lines + padV * 2
            )
            canvas.drawRoundRect(tmpRect, 4 * density, 4 * density, bgPaint)

            val baseline = tmpRect.top + padV - namePaint.ascent()
            canvas.drawText(name, tmpPoint.x.toFloat(), baseline, namePaint)
            label.code?.let {
                canvas.drawText(it, tmpPoint.x.toFloat(), baseline + lineH, codePaint)
            }
        }
    }

    override fun onSingleTapConfirmed(e: MotionEvent, mapView: MapView): Boolean {
        val pj = mapView.projection
        val hitRadius = 30.0 * density
        var best: StoreEntity? = null
        var bestDist = Double.MAX_VALUE
        for (store in stores) {
            pj.toPixels(GeoPoint(store.lat, store.lng), tmpPoint)
            // مركز الضربة: منتصف الدبوس
            val d = hypot(
                (e.x - tmpPoint.x).toDouble(),
                (e.y - (tmpPoint.y - pinSize / 2f)).toDouble()
            )
            if (d < hitRadius && d < bestDist) {
                bestDist = d
                best = store
            }
        }
        best ?: return false
        onStoreClick(best)
        return true
    }
}
