/**
 * ScenePanel.tsx — scena wczytana ze skryptu, do obejrzenia i poprawienia.
 *
 * Pojawia się tam, gdzie wynik skryptu, i zajmuje pełną wysokość widoku:
 * scena bez miejsca jest nie do obejrzenia, a wynik skryptu z natury stoi pod
 * blokiem, nie w osobnym oknie.
 *
 * Widok zależy od rodzaju sceny i **nie udaje**, że oba są tym samym:
 *
 *  • scena 3D dostaje `SimpleViewer` z gizmem — ten sam, którym pracuje cad-app;
 *  • rysunek CAD dostaje płaski podgląd SVG, bez gizma. Przesuwanie strzałkami
 *    w przestrzeni nie ma sensu na rysunku technicznym, a wstawienie tam gizma
 *    3D obiecywałoby operację, której rysunek nie zna.
 *
 * Drzewo i właściwości są wspólne, bo czytają wyłącznie `IScene`.
 */
import { useCallback, useMemo, useState } from 'react';
import { Box, Divider, IconButton, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material';
import NearMeIcon from '@mui/icons-material/NearMe';
import OpenWithIcon from '@mui/icons-material/OpenWith';
import RotateRightIcon from '@mui/icons-material/RotateRight';
import AspectRatioIcon from '@mui/icons-material/AspectRatio';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import TuneIcon from '@mui/icons-material/Tune';
import { SimpleViewer } from '@mhersztowski/core-scene3d';
import { Scene3dScene, type IScene } from '@mhersztowski/core-cad-viewer';
import { SceneTree } from './SceneTree';
import { SceneProperties } from './SceneProperties';
import { CadPreview } from './CadPreview';

export type TrybNarzedzia = 'select' | 'translate' | 'rotate' | 'scale';

export interface ScenePanelProps {
  scene: IScene;
  /** Skąd wczytano — pokazywane w nagłówku, żeby dało się poznać, co się ogląda. */
  path?: string;
  height?: number | string;
}

const NARZEDZIA: Array<{ tryb: TrybNarzedzia; ikona: React.ReactNode; opis: string }> = [
  { tryb: 'select', ikona: <NearMeIcon sx={{ fontSize: 16 }} />, opis: 'Zaznaczanie (Shift — wiele obiektów)' },
  { tryb: 'translate', ikona: <OpenWithIcon sx={{ fontSize: 16 }} />, opis: 'Przesuwanie' },
  { tryb: 'rotate', ikona: <RotateRightIcon sx={{ fontSize: 16 }} />, opis: 'Obracanie' },
  { tryb: 'scale', ikona: <AspectRatioIcon sx={{ fontSize: 16 }} />, opis: 'Skalowanie' },
];

export function ScenePanel({ scene, path, height = '70vh' }: ScenePanelProps) {
  const [tryb, setTryb] = useState<TrybNarzedzia>('select');
  const [zaznaczone, setZaznaczone] = useState<string[]>([]);
  const [drzewoWidoczne, setDrzewoWidoczne] = useState(true);
  const [wlasciwosciWidoczne, setWlasciwosciWidoczne] = useState(true);

  /**
   * Licznik zmian.
   *
   * Panel czyta model wprost przez `IScene`, więc React nie ma po czym poznać,
   * że coś się zmieniło — model nie jest stanem komponentu. Licznik jest
   * jedynym sygnałem i dlatego przechodzi do wszystkich trzech paneli.
   */
  const [wersja, setWersja] = useState(0);
  const odswiez = useCallback(() => setWersja((w) => w + 1), []);

  const wybrany = useMemo(
    // eslint-disable-next-line react-hooks/exhaustive-deps
    () => (zaznaczone.length === 1 ? scene.getNodeById(zaznaczone[0]) : null),
    [scene, zaznaczone, wersja],
  );

  const zaznacz = useCallback((id: string | null, dolacz = false) => {
    setZaznaczone((poprzednie) => {
      if (!id) return [];
      if (!dolacz) return [id];
      return poprzednie.includes(id) ? poprzednie.filter((x) => x !== id) : [...poprzednie, id];
    });
  }, []);

  // Zaznaczenie idzie też do sceny: skrypt uruchomiony później ma widzieć to,
  // co użytkownik zaznaczył myszą.
  useMemo(() => {
    const wezly = zaznaczone.map((id) => scene.getNodeById(id)).filter((n) => n !== null);
    scene.setSelection(wezly as never);
  }, [scene, zaznaczone]);

  const graf3d = scene.kind === 'scene3d' ? (scene as Scene3dScene).graph : null;

  return (
    <Box sx={{
      height, display: 'flex', flexDirection: 'column',
      border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden',
    }}>
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 1, px: 1, py: 0.5,
        borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'action.hover', flexWrap: 'wrap',
      }}>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={tryb}
          onChange={(_: unknown, v: TrybNarzedzia | null) => v && setTryb(v)}
        >
          {NARZEDZIA.map((n) => (
            <Tooltip key={n.tryb} title={n.opis}>
              {/* Gizmo działa tylko w scenie 3D — w rysunku zostaje samo zaznaczanie. */}
              <span>
                <ToggleButton value={n.tryb} sx={{ p: 0.5 }} disabled={!graf3d && n.tryb !== 'select'}>
                  {n.ikona}
                </ToggleButton>
              </span>
            </Tooltip>
          ))}
        </ToggleButtonGroup>

        <Divider orientation="vertical" flexItem />

        <Tooltip title="Drzewo sceny">
          <IconButton size="small" onClick={() => setDrzewoWidoczne((v) => !v)}
            color={drzewoWidoczne ? 'primary' : 'default'}>
            <AccountTreeIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Właściwości">
          <IconButton size="small" onClick={() => setWlasciwosciWidoczne((v) => !v)}
            color={wlasciwosciWidoczne ? 'primary' : 'default'}>
            <TuneIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>

        <Box sx={{ flex: 1 }} />
        <Typography sx={{ fontSize: 10, color: 'text.disabled' }}>
          {path ?? scene.kind}
          {zaznaczone.length > 1 && ` · zaznaczono ${zaznaczone.length}`}
        </Typography>
      </Box>

      <Box sx={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {drzewoWidoczne && (
          <Box sx={{ width: 200, flexShrink: 0, borderRight: '1px solid', borderColor: 'divider' }}>
            <SceneTree
              scene={scene}
              version={wersja}
              selectedId={zaznaczone[0] ?? null}
              onSelect={(id) => zaznacz(id)}
              onChanged={odswiez}
            />
          </Box>
        )}

        <Box sx={{ flex: 1, minWidth: 0, position: 'relative' }}>
          {graf3d ? (
            <SimpleViewer
              sceneGraph={graf3d}
              version={wersja}
              showGrid
              selectedNodeId={tryb === 'select' ? null : zaznaczone[0] ?? null}
              selectedNodeIds={zaznaczone}
              transformMode={tryb === 'select' ? 'translate' : tryb}
              onNodeSelect={(id) => zaznacz(id)}
              onGizmoTransformEnd={odswiez}
              width="100%"
              height="100%"
              autoFit
            />
          ) : (
            <CadPreview
              scene={scene}
              version={wersja}
              selectedIds={zaznaczone}
              onSelect={(id) => zaznacz(id)}
            />
          )}
        </Box>

        {wlasciwosciWidoczne && (
          <Box sx={{ width: 240, flexShrink: 0, borderLeft: '1px solid', borderColor: 'divider' }}>
            <SceneProperties scene={scene} node={wybrany} version={wersja} onChanged={odswiez} />
          </Box>
        )}
      </Box>
    </Box>
  );
}
