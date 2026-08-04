/**
 * SceneTree.tsx — drzewo sceny nad wspólnym API.
 *
 * Czyta wyłącznie `IScene`/`INode`, więc ten sam komponent pokazuje rysunek CAD
 * (warstwa → encje) i scenę 3D (grupy → siatki). Osobne drzewko dla każdego
 * rodzaju znaczyłoby, że wspólne API istnieje tylko na papierze.
 */
import { useMemo, useState } from 'react';
import { Box, IconButton, Typography } from '@mui/material';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import { isLayer, isNode3D, type INode, type IScene } from '@mhersztowski/core-cad-viewer';

export interface SceneTreeProps {
  scene: IScene;
  /** Licznik zmian — drzewo czyta model wprost, więc potrzebuje sygnału do odświeżenia. */
  version: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChanged: () => void;
}

function widocznosc(node: INode): { czyta: () => boolean; pisze: (v: boolean) => void } | null {
  if (isNode3D(node)) return { czyta: () => node.getVisible(), pisze: (v) => node.setVisible(v) };
  if (isLayer(node)) return { czyta: () => node.getVisible(), pisze: (v) => node.setVisible(v) };
  return null;
}

function Galaz({ node, poziom, selectedId, onSelect, onChanged }: {
  node: INode;
  poziom: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChanged: () => void;
}) {
  const dzieci = node.getChildren();
  // Warstwy i grupy zwykle chce się widzieć rozwinięte — one są mapą sceny.
  const [rozwiniete, setRozwiniete] = useState(poziom === 0);
  const oko = widocznosc(node);

  return (
    <>
      <Box
        onClick={() => onSelect(node.id)}
        sx={{
          display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer',
          pl: `${poziom * 12 + 4}px`, pr: 0.5, py: 0.25, borderRadius: 0.5,
          fontSize: 12,
          bgcolor: node.id === selectedId ? 'action.selected' : undefined,
          '&:hover': { bgcolor: node.id === selectedId ? 'action.selected' : 'action.hover' },
        }}
      >
        {dzieci.length > 0 ? (
          <Box
            component="span"
            onClick={(e) => { e.stopPropagation(); setRozwiniete((r) => !r); }}
            sx={{ display: 'flex', alignItems: 'center' }}
          >
            {rozwiniete
              ? <ExpandMoreIcon sx={{ fontSize: 14 }} />
              : <ChevronRightIcon sx={{ fontSize: 14 }} />}
          </Box>
        ) : (
          <Box sx={{ width: 14 }} />
        )}

        <Box sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {node.getName()}
        </Box>

        <Typography component="span" sx={{ fontSize: 9, color: 'text.disabled' }}>
          {node.getData().type}
        </Typography>

        {oko && (
          <IconButton
            size="small"
            sx={{ p: 0.1 }}
            onClick={(e) => { e.stopPropagation(); oko.pisze(!oko.czyta()); onChanged(); }}
          >
            {oko.czyta()
              ? <VisibilityIcon sx={{ fontSize: 13 }} />
              : <VisibilityOffIcon sx={{ fontSize: 13, opacity: 0.4 }} />}
          </IconButton>
        )}
      </Box>

      {rozwiniete && dzieci.map((dziecko) => (
        <Galaz
          key={dziecko.id}
          node={dziecko}
          poziom={poziom + 1}
          selectedId={selectedId}
          onSelect={onSelect}
          onChanged={onChanged}
        />
      ))}
    </>
  );
}

export function SceneTree({ scene, version, selectedId, onSelect, onChanged }: SceneTreeProps) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const korzenie = useMemo(() => scene.getRoot().getChildren(), [scene, version]);

  return (
    <Box
      onClick={() => onSelect(null)}
      sx={{ height: '100%', overflow: 'auto', py: 0.5 }}
    >
      {korzenie.length === 0 && (
        <Typography sx={{ fontSize: 11, color: 'text.disabled', px: 1 }}>
          Scena jest pusta.
        </Typography>
      )}
      {korzenie.map((node) => (
        <Galaz
          key={node.id}
          node={node}
          poziom={0}
          selectedId={selectedId}
          onSelect={onSelect}
          onChanged={onChanged}
        />
      ))}
    </Box>
  );
}
