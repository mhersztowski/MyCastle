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
 * Sprawdzamy dwie rzeczy, bo żadna sama nie wystarcza: producenta (bywa
 * zapisany jako `ONYX`, `Onyx` albo nazwą modelu) oraz obecność systemowej
 * aplikacji notatek, która jest na każdym czytniku Onyksa i której nie ma na
 * niczym innym.
 */
object PenSupport {

    private const val ONYX_NOTE_PACKAGE = "com.onyx.android.note"

    private val brandLooksOnyx: Boolean
        get() = listOf(Build.MANUFACTURER, Build.BRAND, Build.DEVICE)
            .any { it?.contains("onyx", ignoreCase = true) == true }

    private fun hasOnyxSystemApp(context: Context?): Boolean = try {
        context?.packageManager?.getPackageInfo(ONYX_NOTE_PACKAGE, 0) != null
    } catch (t: Throwable) {
        false
    }

    fun isAvailable(context: Context?): Boolean = brandLooksOnyx || hasOnyxSystemApp(context)

    /**
     * Krótki opis do pokazania użytkownikowi w interfejsie.
     *
     * Gdy rysowania natywnego nie ma, ważniejsze od samego „nie" jest,
     * **dlaczego** — inaczej jedyny sygnał to brak zmiany w zachowaniu.
     */
    fun describe(context: Context?): String =
        if (isAvailable(context)) "${Build.MANUFACTURER} ${Build.MODEL}"
        else "to nie jest czytnik Onyx Boox (${Build.MANUFACTURER} ${Build.MODEL})"
}
