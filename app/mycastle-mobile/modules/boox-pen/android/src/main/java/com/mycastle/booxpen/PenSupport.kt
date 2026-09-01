package com.mycastle.booxpen

import android.content.Context
import android.os.Build

/**
 * Czy na tym urządzeniu rysowanie sterownikiem w ogóle ma sens.
 *
 * SDK Onyksa jest wkompilowane w APK, więc klasy są obecne zawsze — także na
 * telefonie. Rozstrzyga urządzenie: `TouchHelper` rozmawia z usługą systemową
 * Onyksa, której nigdzie indziej nie ma, a próba użycia go bez niej kończy się
 * wyjątkiem w środku SDK, już po przejęciu pióra.
 *
 * ## Dlaczego rozpoznanie jest hojne, a opis szczegółowy
 *
 * Onyx nie ma jednego, pewnego znacznika. Producenta zapisuje raz jako `ONYX`,
 * raz nazwą modelu, a systemowa aplikacja notatek nazywa się różnie w kolejnych
 * wydaniach firmware'u. Zbyt wąskie rozpoznanie kończy się najgorszym możliwym
 * objawem: wszystko jest zainstalowane, nic nie działa i **nie ma po czym
 * poznać dlaczego** — bo urządzenie po prostu milczy.
 *
 * Dlatego sprawdzamy siedem pól `Build` naraz, a `describe()` zwraca ich
 * surową treść. Gdy rozpoznanie zawiedzie na nieznanym modelu, wystarczy
 * spojrzeć na podpowiedź w interfejsie, żeby wiedzieć, co dopisać — zamiast
 * zgadywać przy dwudziestominutowej budowie APK-a na próbę.
 */
object PenSupport {

    /** Nazwy, po których poznajemy sprzęt Onyksa w polach `Build`. */
    private val MARKERS = listOf("onyx", "boox")

    /**
     * Systemowe aplikacje Onyksa. Sprawdzane pomocniczo — na Androidzie 11+
     * widoczność pakietów jest ograniczona, więc brak odpowiedzi **nie** znaczy,
     * że aplikacji nie ma. Stąd te nazwy w `<queries>` manifestu modułu.
     */
    private val ONYX_PACKAGES = listOf(
        "com.onyx.android.note",
        "com.onyx",
        "com.onyx.kreader",
        "com.onyx.android.launcher",
    )

    private fun buildFields(): Map<String, String> = mapOf(
        "manufacturer" to (Build.MANUFACTURER ?: ""),
        "brand" to (Build.BRAND ?: ""),
        "device" to (Build.DEVICE ?: ""),
        "model" to (Build.MODEL ?: ""),
        "product" to (Build.PRODUCT ?: ""),
        "hardware" to (Build.HARDWARE ?: ""),
        "display" to (Build.DISPLAY ?: ""),
    )

    private fun looksLikeOnyx(): Boolean =
        buildFields().values.any { v -> MARKERS.any { v.contains(it, ignoreCase = true) } }

    private fun hasOnyxSystemApp(context: Context?): Boolean {
        val pm = context?.packageManager ?: return false
        return ONYX_PACKAGES.any { name ->
            try {
                pm.getPackageInfo(name, 0) != null
            } catch (t: Throwable) {
                false
            }
        }
    }

    fun isAvailable(context: Context?): Boolean = looksLikeOnyx() || hasOnyxSystemApp(context)

    /**
     * Opis do pokazania w interfejsie.
     *
     * Przy powodzeniu krótki — nazwa urządzenia. Przy niepowodzeniu **pełny
     * zrzut pól `Build`**, bo to jedyna informacja, która pozwala poprawić
     * rozpoznanie bez zgadywania.
     */
    fun describe(context: Context?): String {
        if (isAvailable(context)) return "${Build.MANUFACTURER} ${Build.MODEL}"
        val fields = buildFields().entries.joinToString(", ") { "${it.key}=${it.value}" }
        return "nie rozpoznano czytnika Onyx — $fields"
    }
}
