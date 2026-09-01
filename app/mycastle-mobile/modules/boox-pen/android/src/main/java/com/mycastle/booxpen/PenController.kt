package com.mycastle.booxpen

import android.app.Activity
import android.graphics.Rect
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import com.onyx.android.sdk.data.note.TouchPoint
import com.onyx.android.sdk.pen.RawInputCallback
import com.onyx.android.sdk.pen.TouchHelper
import com.onyx.android.sdk.pen.data.TouchPointList
import org.json.JSONArray
import org.json.JSONObject

/**
 * Cykl życia `TouchHelper`-a nad widokiem WebView.
 *
 * Warstwa jest celowo głupia: nie wie nic o kanwie ani o dokumencie. Dostaje
 * prostokąt w pikselach urządzenia **względem lewego górnego rogu WebView**
 * i oddaje pociągnięcia w tym samym układzie. Cała arytmetyka powiększenia,
 * przesunięcia i nacisku siedzi po stronie JavaScriptu, gdzie da się ją
 * sprawdzić testem — tutaj zostaje jedno przeliczenie, którego strona wykonać
 * nie może: położenie samego WebView na ekranie.
 *
 * ## Dlaczego akurat WebView jest widokiem gospodarza
 *
 * `TouchHelper` potrzebuje widoku, żeby śledzić przewijanie i zmiany układu.
 * Widok gospodarza **nie jest** powierzchnią rysowania — sterownik maluje
 * wprost na panelu, w obszarze podanym przez `setLimitRect`. WebView jest
 * naturalnym wyborem, bo to jego układ współrzędnych opisuje strona.
 */
class PenController(
    private val activityProvider: () -> Activity?,
    private val emitStroke: (String) -> Unit,
) {
    private var touchHelper: TouchHelper? = null
    private var hostView: View? = null

    /** Obszar rysowania względem WebView; `null` dopóki strona go nie poda. */
    private var area: Rect? = null
    private var strokeWidth = 3f
    private var enabled = false

    /** Ostatni powód niepowodzenia — czytany przez moduł do diagnostyki. */
    var lastError: String? = null
        private set

    // ── Wejścia z JS ────────────────────────────────────────────────────────

    fun setArea(left: Int, top: Int, width: Int, height: Int, strokeWidth: Float) {
        this.area = Rect(left, top, left + width, top + height)
        this.strokeWidth = strokeWidth
        val helper = touchHelper ?: return
        // Zmiana obszaru w trakcie rysowania wymaga zdjęcia trybu surowego.
        // `setLimitRect` na włączonym sterowniku bywa przyjmowane bez skutku,
        // a objawem jest pióro rysujące dalej w starym miejscu.
        val wasEnabled = enabled
        if (wasEnabled) helper.setRawDrawingEnabled(false)
        helper.setStrokeWidth(strokeWidth)
        applyLimitRect(helper)
        if (wasEnabled) helper.setRawDrawingEnabled(true)
    }

    fun setEnabled(on: Boolean) {
        if (on) {
            // Drugi bezpiecznik obok tego w `useBooxPen`. Tryb surowy bez
            // ograniczenia obszaru przejmuje pióro na **całym ekranie**, więc
            // skutkiem pomyłki nie jest brak rysowania, tylko czytnik, w którym
            // pióro przestaje działać wszędzie. Za taką awarię warto zapłacić
            // sprawdzeniem w dwóch miejscach.
            if (area == null) {
                lastError = "brak obszaru rysowania"
                return
            }
            val helper = ensureHelper() ?: return
            helper.setRawDrawingEnabled(true)
            enabled = true
        } else {
            enabled = false
            touchHelper?.setRawDrawingEnabled(false)
        }
    }

    /**
     * Oddaje pióro systemowi i zwalnia zasoby sterownika.
     *
     * Pominięcie tego kroku zostawia czytnik w stanie, w którym pióro nie
     * działa **nigdzie** — także po wyjściu z aplikacji, aż do jej ubicia.
     */
    fun release() {
        enabled = false
        try {
            touchHelper?.setRawDrawingEnabled(false)
            touchHelper?.closeRawDrawing()
        } catch (t: Throwable) {
            Log.w(TAG, "zwalnianie sterownika nie powiodło się", t)
        }
        touchHelper = null
        hostView = null
    }

    // ── Środek ──────────────────────────────────────────────────────────────

    private fun ensureHelper(): TouchHelper? {
        touchHelper?.let { return it }
        val activity = activityProvider() ?: run {
            lastError = "brak aktywności"
            return null
        }
        val web = findWebView(activity.window.decorView) ?: run {
            lastError = "nie znaleziono WebView w drzewie widoków"
            return null
        }
        return try {
            val helper = TouchHelper.create(web, callback)
            helper.setStrokeStyle(TouchHelper.STROKE_STYLE_PENCIL)
            helper.setStrokeWidth(strokeWidth)
            // Palec ma dalej przewijać stronę i naciskać przyciski — przejmujemy
            // wyłącznie pióro. Bez tego cały interfejs przestaje reagować na dotyk
            // w obszarze rysowania.
            helper.enableFingerTouch(false)
            // Boczny przycisk pióra jako gumka; ślad wraca osobnym zdarzeniem.
            helper.enableSideBtnErase(true)
            helper.setSingleRegionMode()
            // Po oderwaniu pióra sterownik odświeża panel, żeby surowy ślad
            // ustąpił kresce narysowanej przez stronę. Zwłoka jest po to, by
            // strona zdążyła ją narysować — odświeżenie natychmiastowe pokazuje
            // przez moment pustą kanwę i kreska „mruga".
            helper.setPenUpRefreshEnabled(true)
            helper.setPenUpRefreshTimeMs(PEN_UP_REFRESH_MS)
            // Przed `applyLimitRect`, bo ta funkcja czyta `hostView`.
            hostView = web
            applyLimitRect(helper)
            helper.openRawDrawing()
            touchHelper = helper
            lastError = null
            helper
        } catch (t: Throwable) {
            // Wyjątek z wnętrza SDK znaczy najczęściej, że to jednak nie jest
            // czytnik Onyksa albo firmware nie zna tej wersji pakietu.
            lastError = t.message ?: t.javaClass.simpleName
            Log.w(TAG, "nie udało się uruchomić rysowania sterownikiem", t)
            null
        }
    }

    private fun applyLimitRect(helper: TouchHelper) {
        val web = hostView ?: findWebView(activityProvider()?.window?.decorView ?: return) ?: return
        val rect = area ?: return
        val origin = locationOnScreen(web)
        // `setLimitRect` przyjmuje współrzędne **ekranu**, a strona liczy je
        // względem siebie — stąd doliczenie położenia WebView.
        val limit = Rect(
            origin[0] + rect.left,
            origin[1] + rect.top,
            origin[0] + rect.right,
            origin[1] + rect.bottom,
        )
        helper.setLimitRect(limit, ArrayList<Rect>())
    }

    private val callback = object : RawInputCallback() {
        override fun onBeginRawDrawing(shortcut: Boolean, point: TouchPoint?) = Unit
        override fun onEndRawDrawing(shortcut: Boolean, point: TouchPoint?) = Unit
        override fun onRawDrawingTouchPointMoveReceived(point: TouchPoint?) = Unit

        override fun onRawDrawingTouchPointListReceived(list: TouchPointList?) {
            emit(list, erase = false)
        }

        override fun onBeginRawErasing(shortcut: Boolean, point: TouchPoint?) = Unit
        override fun onEndRawErasing(shortcut: Boolean, point: TouchPoint?) = Unit
        override fun onRawErasingTouchPointMoveReceived(point: TouchPoint?) = Unit

        override fun onRawErasingTouchPointListReceived(list: TouchPointList?) {
            emit(list, erase = true)
        }
    }

    /**
     * Zamienia pociągnięcie na JSON w układzie WebView.
     *
     * Gotowy tekst zamiast struktury, bo powłoka React Native i tak musi
     * wstrzyknąć go do strony jako literał — pośrednia mapa oznaczałaby
     * rozpakowanie i spakowanie tych samych liczb drugi raz.
     */
    private fun emit(list: TouchPointList?, erase: Boolean) {
        val points = list?.getPoints() ?: return
        if (points.isEmpty()) return
        val web = hostView ?: return
        // Położenie odczytywane przy każdym pociągnięciu, a nie zapamiętane:
        // WebView przesuwa się przy wyjściu klawiatury i przy obrocie ekranu.
        val origin = locationOnScreen(web)

        val array = JSONArray()
        for (p in points) {
            array.put(
                JSONObject()
                    .put("x", (p.x - origin[0]).toDouble())
                    .put("y", (p.y - origin[1]).toDouble())
                    .put("pressure", p.pressure.toDouble())
                    .put("ts", p.timestamp.toDouble()),
            )
        }
        emitStroke(JSONObject().put("erase", erase).put("points", array).toString())
    }

    private fun locationOnScreen(view: View): IntArray {
        val loc = IntArray(2)
        view.getLocationOnScreen(loc)
        return loc
    }

    private fun findWebView(root: View): WebView? {
        if (root is WebView) return root
        if (root is ViewGroup) {
            for (i in 0 until root.childCount) {
                findWebView(root.getChildAt(i))?.let { return it }
            }
        }
        return null
    }

    companion object {
        private const val TAG = "BooxPen"

        /**
         * Zwłoka odświeżenia po oderwaniu pióra.
         *
         * Krócej — panel zdąży pokazać kanwę, zanim strona narysuje na niej
         * kreskę, więc ślad na moment znika. Dłużej — surowy ślad i kreska
         * strony współistnieją zauważalnie długo. Pół sekundy mieści przebieg
         * mostka z zapasem.
         */
        private const val PEN_UP_REFRESH_MS = 500
    }
}
