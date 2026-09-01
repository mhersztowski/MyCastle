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
 * Cykl życia `TouchHelper`-a nad oknem aplikacji.
 *
 * Warstwa jest celowo głupia: nie wie nic o kanwie ani o dokumencie. Dostaje
 * prostokąt w pikselach urządzenia **względem lewego górnego rogu WebView**
 * i oddaje pociągnięcia w tym samym układzie. Cała arytmetyka powiększenia,
 * przesunięcia i nacisku siedzi po stronie JavaScriptu, gdzie da się ją
 * sprawdzić testem — tutaj zostaje jedno przeliczenie, którego strona wykonać
 * nie może: położenie WebView na ekranie.
 *
 * ## Dlaczego gospodarzem jest przezroczysta nakładka, a nie WebView
 *
 * Pierwsza wersja podawała `TouchHelper`-owi wprost widok WebView. Efekt był
 * najgorszy z możliwych do zdiagnozowania: sterownik **melduje, że przejął
 * pióro**, a nie oddaje ani jednego pociągnięcia, więc rysowanie zachowuje się
 * dokładnie tak, jakby całej tej warstwy nie było.
 *
 * `TouchHelper.create` zakłada widok, którym może swobodnie rozporządzać —
 * podpina do niego nasłuch dotyku i obserwatora układu. WebView jednego i
 * drugiego używa do własnych celów (przewijanie, zaznaczanie, powiększanie
 * gestem), a wszystkie znane działające przykłady użycia tego SDK podają widok
 * dodany wyłącznie w tym celu.
 *
 * Nakładka to zwykły `View` bez tła, rozciągnięty na całe okno i **nieklikalny**
 * — domyślny `onTouchEvent` zwraca `false`, więc dotyk przechodzi do WebView
 * pod spodem i palec dalej przewija stronę. Sterownik nie rysuje po niej ani po
 * niczym innym w Androidzie: maluje wprost na panelu, a widok jest mu potrzebny
 * tylko jako punkt zaczepienia.
 *
 * Współrzędne dalej liczymy względem **WebView**, bo to jego układ opisuje
 * strona — nakładka i WebView mogą leżeć w innych miejscach.
 */
class PenController(
    private val activityProvider: () -> Activity?,
    private val emitStroke: (String) -> Unit,
    /**
     * Meldunek o **faktycznym** stanie sterownika.
     *
     * Bez niego strona wie tylko tyle, że wysłała prośbę o przejęcie pióra —
     * a nie, czy została spełniona. Wszystkie drogi niepowodzenia w tej klasie
     * kończą się cichym `return` wewnątrz `runOnUiThread`, więc obietnica po
     * stronie JavaScriptu i tak spełnia się pomyślnie.
     */
    private val emitStatus: (engaged: Boolean, error: String?, debug: String) -> Unit = { _, _, _ -> },
) {
    private var touchHelper: TouchHelper? = null

    /** Przezroczysta nakładka, którą dostaje `TouchHelper` — patrz nagłówek klasy. */
    private var hostView: View? = null

    /** WebView — wyłącznie po to, by wiedzieć, gdzie na ekranie zaczyna się strona. */
    private var webView: View? = null

    /** Obszar rysowania względem WebView; `null` dopóki strona go nie poda. */
    private var area: Rect? = null
    private var strokeWidth = 3f
    private var enabled = false
    private var limitRect: Rect? = null

    // Liczniki wywołań zwrotnych sterownika.
    //
    // Rozróżniają trzy przypadki, które z zewnątrz wyglądają identycznie:
    // sterownik nie widzi pióra (`begin` zostaje na zerze), widzi je, ale nie
    // oddaje punktów (`begin` rośnie, `list` nie), albo wszystko działa.
    private var beginCount = 0
    private var listCount = 0
    private var eraseCount = 0

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
            // pióro przestaje działać wszędzie.
            if (area == null) {
                fail("brak obszaru rysowania")
                return
            }
            val helper = ensureHelper() ?: run {
                fail(lastError ?: "nie udało się utworzyć TouchHelpera")
                return
            }
            try {
                helper.setRawDrawingEnabled(true)
                enabled = true
                lastError = null
                emitStatus(true, null, debugInfo())
            } catch (t: Throwable) {
                Log.w(TAG, "setRawDrawingEnabled(true) nie powiodło się", t)
                fail(t.message ?: t.javaClass.simpleName)
            }
        } else {
            enabled = false
            try {
                touchHelper?.setRawDrawingEnabled(false)
            } catch (t: Throwable) {
                Log.w(TAG, "setRawDrawingEnabled(false) nie powiodło się", t)
            }
            emitStatus(false, null, debugInfo())
        }
    }

    /** Zapisuje powód i melduje stronie, że pióra jednak nie przejęliśmy. */
    private fun fail(reason: String) {
        enabled = false
        lastError = reason
        emitStatus(false, reason, debugInfo())
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
        (hostView?.parent as? ViewGroup)?.removeView(hostView)
        hostView = null
        webView = null
        emitStatus(false, null, debugInfo())
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
        val host = createHost(activity) ?: run {
            lastError = "nie udało się dodać nakładki do okna"
            return null
        }
        return try {
            webView = web
            hostView = host
            val helper = TouchHelper.create(host, callback)
            helper.setStrokeStyle(TouchHelper.STROKE_STYLE_PENCIL)
            helper.setStrokeWidth(strokeWidth)
            // Palec ma dalej przewijać stronę i naciskać przyciski — przejmujemy
            // wyłącznie pióro.
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
            (host.parent as? ViewGroup)?.removeView(host)
            hostView = null
            null
        }
    }

    /** Dodaje do okna przezroczystą, nieklikalną nakładkę — patrz nagłówek klasy. */
    private fun createHost(activity: Activity): View? {
        hostView?.let { return it }
        val content = activity.findViewById<ViewGroup>(android.R.id.content) ?: return null
        val view = View(activity).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
            // Bez tego nakładka połykałaby dotyk i przestałby działać cały
            // interfejs strony — a wyglądałoby to na zawieszenie aplikacji.
            isClickable = false
            isFocusable = false
        }
        content.addView(view)
        return view
    }

    private fun applyLimitRect(helper: TouchHelper) {
        val web = webView ?: return
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
        limitRect = limit
        helper.setLimitRect(limit, ArrayList<Rect>())
    }

    private val callback = object : RawInputCallback() {
        override fun onBeginRawDrawing(shortcut: Boolean, point: TouchPoint?) {
            beginCount++
            // Meldunek tylko przy pierwszym dotknięciu: dzięki niemu widać, czy
            // sterownik w ogóle **widzi** pióro, nawet gdy gotowe pociągnięcia
            // nigdy nie przychodzą.
            if (beginCount == 1) emitStatus(enabled, lastError, debugInfo())
        }

        override fun onEndRawDrawing(shortcut: Boolean, point: TouchPoint?) = Unit
        override fun onRawDrawingTouchPointMoveReceived(point: TouchPoint?) = Unit

        override fun onRawDrawingTouchPointListReceived(list: TouchPointList?) {
            listCount++
            emit(list, erase = false)
        }

        override fun onBeginRawErasing(shortcut: Boolean, point: TouchPoint?) = Unit
        override fun onEndRawErasing(shortcut: Boolean, point: TouchPoint?) = Unit
        override fun onRawErasingTouchPointMoveReceived(point: TouchPoint?) = Unit

        override fun onRawErasingTouchPointListReceived(list: TouchPointList?) {
            eraseCount++
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
        val web = webView ?: return
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

    /**
     * Jednowierszowy opis geometrii i liczników.
     *
     * Trafia do okienka diagnostycznego w interfejsie, bo na czytniku nie ma
     * jak zajrzeć do logów, a bez tych liczb „nie działa" znaczy pięć różnych
     * rzeczy naraz.
     */
    private fun debugInfo(): String {
        val web = webView
        val host = hostView
        val webLoc = web?.let { locationOnScreen(it) }
        return buildString {
            append("web=")
            if (web == null) append("brak") else
                append("${web.width}x${web.height}@${webLoc?.get(0)},${webLoc?.get(1)}")
            append(" host=")
            if (host == null) append("brak") else append("${host.width}x${host.height}")
            append(" area=").append(area?.toShortString() ?: "brak")
            append(" limit=").append(limitRect?.toShortString() ?: "brak")
            append(" begin=").append(beginCount)
            append(" list=").append(listCount)
            append(" erase=").append(eraseCount)
        }
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
         * strony współistnieją zauważalnie długo.
         */
        private const val PEN_UP_REFRESH_MS = 500
    }
}
