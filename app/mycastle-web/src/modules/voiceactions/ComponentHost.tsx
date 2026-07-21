/**
 * Renderuje komponent wskazany przez bloczek „Wyświetl komponent" wewnątrz czatu Aury.
 * - kind 'builtin' → React (np. kalendarzowe Add Event / Start New Event)
 * - kind 'code'    → komponent Lit/Qt z Programming/Components (runBrowserComponent)
 * - mode 'inline'  → osadzony bezpośrednio
 * - mode 'popup'   → przycisk otwierający okno dialogowe
 */
import React, { useEffect, useRef, useState } from 'react';
import { Button, Dialog, DialogContent, DialogTitle, IconButton, Box } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import WidgetsIcon from '@mui/icons-material/Widgets';
import { readUserFileText } from '../../services/userJson';
import { runBrowserComponent, type RunHandle } from '../component-runner/runBrowserComponent';
import { BuiltinComponentView } from './builtinComponents';
import type { ShowComponentConfig } from './showComponentPicker';

/** Osadza komponent kodowy (Lit/Qt) w DOM hoście. */
const CodeComponentInline: React.FC<{ config: ShowComponentConfig; userName: string }> = ({ config, userName }) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<RunHandle | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const path = config.path || config.id;
    (async () => {
      try {
        const code = await readUserFileText(userName, path);
        if (cancelled || !hostRef.current) return;
        handleRef.current = await runBrowserComponent(code ?? '', {
          host: hostRef.current,
          userName,
          fileName: path,
          log: () => { /* wyciszone w czacie */ },
        });
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
      handleRef.current?.stop();
      handleRef.current = null;
    };
  }, [config.id, config.path, userName]);

  return (
    <Box sx={{ my: 0.5 }}>
      <div ref={hostRef} />
      {err && <span style={{ fontSize: 12, color: '#f44336' }}>Błąd komponentu: {err}</span>}
    </Box>
  );
};

/** Przycisk + okno dialogowe z komponentem w środku. */
const PopupComponent: React.FC<{ config: ShowComponentConfig; userName: string; children: React.ReactNode }> = ({
  config, children,
}) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outlined" size="small" startIcon={<WidgetsIcon />} onClick={() => setOpen(true)}>
        {config.name}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="md">
        <DialogTitle sx={{ pr: 6 }}>
          {config.name}
          <IconButton onClick={() => setOpen(false)} sx={{ position: 'absolute', right: 8, top: 8 }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>{open && children}</DialogContent>
      </Dialog>
    </>
  );
};

export const ComponentHost: React.FC<{ config: ShowComponentConfig; userName: string }> = ({ config, userName }) => {
  // Komponenty wbudowane same są modalami (przycisk → okno), więc renderujemy je wprost.
  if (config.kind === 'builtin') {
    return <BuiltinComponentView id={config.id} autoOpen={config.mode === 'inline'} />;
  }

  const inline = <CodeComponentInline config={config} userName={userName} />;
  if (config.mode === 'popup') {
    return <PopupComponent config={config} userName={userName}>{inline}</PopupComponent>;
  }
  return inline;
};
