package com.mycastle.booxpen

import android.os.Bundle
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

/** Obszar rysowania w pikselach urządzenia, względem lewego górnego rogu WebView. */
class AreaOptions : Record {
    @Field var left: Int = 0
    @Field var top: Int = 0
    @Field var width: Int = 0
    @Field var height: Int = 0
    @Field var strokeWidth: Float = 3f
}

/**
 * Most między stroną w WebView a sterownikiem pióra Onyksa.
 *
 * Moduł nie ma własnej logiki — przekłada wywołania na `PenController`
 * i pilnuje jednej rzeczy, o której JavaScript nie ma pojęcia: że `TouchHelper`
 * wolno dotykać wyłącznie z wątku interfejsu.
 */
class BooxPenModule : Module() {

    private var controller: PenController? = null

    private fun requireController(): PenController =
        controller ?: PenController(
            activityProvider = { appContext.activityProvider?.currentActivity },
            emitStroke = { json -> sendEvent(EVENT_STROKE, Bundle().apply { putString("stroke", json) }) },
            emitStatus = { engaged, error -> sendStatus(engaged, error) },
        ).also { controller = it }

    private fun sendStatus(engaged: Boolean, error: String?) {
        sendEvent(EVENT_STATUS, Bundle().apply {
            putBoolean("engaged", engaged)
            putString("error", error)
        })
    }

    /**
     * Wykonuje pracę na wątku interfejsu — `TouchHelper` nie znosi innego.
     *
     * Brak aktywności i wyjątek w środku bloku **melduje się stronie**. Cichy
     * `return` w tym miejscu był najgorszym z możliwych zachowań: obietnica po
     * stronie JavaScriptu spełniała się pomyślnie, interfejs pokazywał
     * „sterownik gotowy", a nie działo się nic.
     */
    private fun onUi(block: () -> Unit) {
        val activity = appContext.activityProvider?.currentActivity ?: run {
            sendStatus(false, "brak aktywności — okno aplikacji nie jest na wierzchu")
            return
        }
        activity.runOnUiThread {
            try {
                block()
            } catch (t: Throwable) {
                sendStatus(false, t.message ?: t.javaClass.simpleName)
            }
        }
    }

    override fun definition() = ModuleDefinition {
        Name("BooxPen")
        Events(EVENT_STROKE, EVENT_STATUS)

        Function("isAvailable") { PenSupport.isAvailable(appContext.reactContext) }

        Function("describe") {
            Bundle().apply {
                putBoolean("available", PenSupport.isAvailable(appContext.reactContext))
                putString("info", PenSupport.describe(appContext.reactContext))
                putString("error", controller?.lastError)
            }
        }

        AsyncFunction("setArea") { options: AreaOptions ->
            onUi {
                requireController().setArea(
                    options.left, options.top, options.width, options.height, options.strokeWidth,
                )
            }
        }

        AsyncFunction("setEnabled") { enabled: Boolean ->
            onUi { requireController().setEnabled(enabled) }
        }

        AsyncFunction("release") {
            onUi {
                controller?.release()
                controller = null
            }
        }

        // Przejście w tło bez oddania pióra zostawia sterownik z przejętym
        // wejściem — użytkownik wraca do innej aplikacji i pióro w niej nie działa.
        OnActivityEntersBackground { onUi { controller?.setEnabled(false) } }

        OnDestroy {
            onUi {
                controller?.release()
                controller = null
            }
        }
    }

    companion object {
        const val EVENT_STROKE = "onStroke"
        const val EVENT_STATUS = "onStatus"
    }
}
