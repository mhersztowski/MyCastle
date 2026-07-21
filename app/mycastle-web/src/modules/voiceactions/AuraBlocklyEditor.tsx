/**
 * AuraBlocklyEditor - reactowy wrapper workspace Blockly dla Edytora Konwersacji.
 * Serializacja do/z XML (pole VoiceActionVariant.blocklyXml).
 *
 * Montaż raz (per `key` ustawiony przez rodzica przy zmianie wariantu).
 * onChange(xml, code) wołane przy każdej edycji użytkownika.
 */
import { useEffect, useRef } from 'react';
import * as Blockly from 'blockly';
import {
  defineAuraConversationBlocks,
  registerAuraGenerators,
  AURA_TOOLBOX,
  generateConversationCode,
} from './blocks';

export interface AuraBlocklyEditorProps {
  initialXml?: string;
  onChange: (xml: string, code: string) => void;
}

// Podnieś z-index nakładek pól Blockly (raz, globalnie).
function ensureZFix() {
  if (document.getElementById('aura-blockly-zfix')) return;
  const style = document.createElement('style');
  style.id = 'aura-blockly-zfix';
  style.textContent =
    '.blocklyWidgetDiv,.blocklyDropDownDiv,.blocklyTooltipDiv{z-index:21000 !important;}';
  document.head.appendChild(style);
}

export default function AuraBlocklyEditor({ initialXml, onChange }: AuraBlocklyEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<Blockly.WorkspaceSvg | null>(null);
  const cbRef = useRef(onChange);
  cbRef.current = onChange;
  const initialRef = useRef(initialXml);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    ensureZFix();
    defineAuraConversationBlocks();
    registerAuraGenerators();

    const ws = Blockly.inject(container, {
      toolbox: AURA_TOOLBOX,
      grid: { spacing: 22, length: 3, colour: '#e0e0e0', snap: true },
      zoom: { controls: true, wheel: true, startScale: 0.9, maxScale: 3, minScale: 0.3 },
      trashcan: true,
      move: { scrollbars: true, drag: true, wheel: true },
    }) as Blockly.WorkspaceSvg;
    wsRef.current = ws;

    // Wczytaj zapisany XML bez wywoływania zdarzeń zmiany.
    if (initialRef.current && initialRef.current.trim()) {
      try {
        Blockly.Events.disable();
        const dom = Blockly.utils.xml.textToDom(initialRef.current);
        Blockly.Xml.domToWorkspace(dom, ws);
      } catch { /* uszkodzony XML — ignoruj */ }
      finally { Blockly.Events.enable(); }
    }

    const handleChange = (e: Blockly.Events.Abstract) => {
      if (e.isUiEvent) return;
      if (ws.isDragging()) return;
      try {
        const xml = Blockly.Xml.domToText(Blockly.Xml.workspaceToDom(ws));
        const code = generateConversationCode(ws);
        cbRef.current(xml, code);
      } catch { /* pominięcie tej zmiany */ }
    };
    ws.addChangeListener(handleChange);

    const ro = new ResizeObserver(() => Blockly.svgResize(ws));
    ro.observe(container);
    const t = window.setTimeout(() => Blockly.svgResize(ws), 0);

    return () => {
      window.clearTimeout(t);
      ro.disconnect();
      ws.removeChangeListener(handleChange);
      ws.dispose();
      wsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}
