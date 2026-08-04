/**
 * sciBlocks.ts — wpięcie bloków bazy wiedzy do MdEditora.
 *
 * Całe wpięcie to jedno wywołanie: pakiet `sci-blocks` dostaje funkcję
 * rejestrującą i sam mówi, które infostringi obsługuje. Edytor nie wie, czym
 * jest wzór ani symulacja, a pakiet nie wie, że hostem jest TipTap.
 *
 * Drugie wpięcie to **rozpoznawanie pisma rysikiem**. Pakiet zna tylko port
 * `(obraz, tryb) => zapis`; że po drugiej stronie stoi model wizyjny Claude'a,
 * wie wyłącznie ta aplikacja — bo to ona ma konfigurację AI i klucz.
 *
 * Import dla efektu ubocznego — tak samo jak widok diagramu Mermaida.
 */
import { registerSciBlocks, setInkRecognizer } from '@mhersztowski/sci-blocks';
import { registerBlockRenderer } from './blockRenderers';
import { App } from '../../../App';
import { HandwritingRecognizer } from '../../../modules/ai/services/HandwritingRecognizer';

registerSciBlocks(registerBlockRenderer);

/**
 * Rozpoznawacz powstaje **przy pierwszym użyciu**, nie przy imporcie.
 *
 * `App.instance` nie istnieje jeszcze w chwili ładowania modułu (`App.create()`
 * biegnie w `main.tsx` przed renderem, ale po imporcie efektów ubocznych),
 * a poza tym czytelnik, który nigdy nie sięgnie po pióro, nie ma powodu
 * dotykać warstwy AI.
 */
setInkRecognizer(async (image, mode) => {
  const recognizer = new HandwritingRecognizer(
    (request) => App.instance.aiService.chat(request),
  );
  return (await recognizer.recognize(image, mode)).value;
});
