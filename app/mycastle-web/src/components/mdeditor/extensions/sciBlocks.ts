/**
 * sciBlocks.ts — wpięcie bloków bazy wiedzy do MdEditora.
 *
 * Całe wpięcie to jedno wywołanie: pakiet `sci-blocks` dostaje funkcję
 * rejestrującą i sam mówi, które infostringi obsługuje. Edytor nie wie, czym
 * jest wzór ani symulacja, a pakiet nie wie, że hostem jest TipTap.
 *
 * Import dla efektu ubocznego — tak samo jak widok diagramu Mermaida.
 */
import { registerSciBlocks } from '@mhersztowski/sci-blocks';
import { registerBlockRenderer } from './blockRenderers';

registerSciBlocks(registerBlockRenderer);
