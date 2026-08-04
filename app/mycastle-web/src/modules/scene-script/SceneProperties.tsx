/**
 * SceneProperties.tsx — właściwości zaznaczonego obiektu i całej sceny.
 *
 * Pola biorą się z `getData()`, więc panel nie zna żadnego konkretnego modelu:
 * rysunek pokaże `start`/`end` linii, scena 3D — parametry siatki. Tam, gdzie
 * obiekt stoi w przestrzeni (`INode3D`), dochodzi położenie, obrót i skala.
 *
 * Wartości nieliczbowe i niebędące tekstem (zagnieżdżone obiekty, tablice)
 * pokazujemy **tylko do odczytu**. Edytor pola dla dowolnego kształtu danych
 * byłby edytorem JSON-a udającym formularz, a błąd wpisany w takie pole psuje
 * scenę po cichu.
 */
import { Box, Divider, TextField, Typography } from '@mui/material';
import { isLayer, isNode3D, type INode, type IScene } from '@mhersztowski/core-cad-viewer';

export interface ScenePropertiesProps {
  scene: IScene;
  node: INode | null;
  version: number;
  onChanged: () => void;
}

const POLE_SX = {
  '& .MuiInputBase-root': { height: 24, fontSize: '0.72rem' },
  '& .MuiInputBase-input': { py: 0.25, px: 0.5 },
};

function Wiersz({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
      <Typography sx={{ fontSize: 11, color: 'text.secondary', minWidth: 64, flexShrink: 0 }}>
        {label}
      </Typography>
      {children}
    </Box>
  );
}

/** Trzy liczby w jednym wierszu — położenie, obrót, skala. */
function Trojka({ label, wartosc, onChange }: {
  label: string;
  wartosc: [number, number, number];
  onChange: (v: [number, number, number]) => void;
}) {
  return (
    <Wiersz label={label}>
      {[0, 1, 2].map((i) => (
        <TextField
          key={i}
          size="small"
          type="number"
          value={Math.round(wartosc[i] * 1000) / 1000}
          sx={{ ...POLE_SX, flex: 1 }}
          onChange={(e) => {
            const nowa = [...wartosc] as [number, number, number];
            nowa[i] = Number(e.target.value) || 0;
            onChange(nowa);
          }}
        />
      ))}
    </Wiersz>
  );
}

export function SceneProperties({ scene, node, version, onChanged }: ScenePropertiesProps) {
  if (!node) {
    return (
      <Box sx={{ p: 1 }}>
        <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>
          Scena: <strong>{scene.kind}</strong>
        </Typography>
        <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>
          Obiektów: <strong>{scene.getAllNodes().length}</strong>
          {scene.getLayers().length > 0 && <> · warstw: <strong>{scene.getLayers().length}</strong></>}
        </Typography>
        <Typography sx={{ fontSize: 11, color: 'text.disabled', mt: 1 }}>
          Zaznacz obiekt w drzewie albo w widoku, żeby zobaczyć jego właściwości.
        </Typography>
      </Box>
    );
  }

  const dane = node.getData();
  const transform = isNode3D(node) ? node.getTransform() : null;

  return (
    <Box sx={{ p: 1, overflow: 'auto', height: '100%' }} key={version}>
      <Wiersz label="nazwa">
        <TextField
          size="small"
          defaultValue={node.getName()}
          sx={{ ...POLE_SX, flex: 1 }}
          onBlur={(e) => { node.setName(e.target.value); onChanged(); }}
        />
      </Wiersz>
      <Wiersz label="rodzaj">
        <Typography sx={{ fontSize: 11 }}>{dane.type}</Typography>
      </Wiersz>
      <Wiersz label="ścieżka">
        <Typography sx={{ fontSize: 10, color: 'text.disabled', wordBreak: 'break-all' }}>
          {node.getPath()}
        </Typography>
      </Wiersz>

      {transform && (
        <>
          <Divider sx={{ my: 1 }} />
          <Trojka
            label="pozycja"
            wartosc={transform.position}
            onChange={(v) => { (node as never as { setTransform: (t: unknown) => void }).setTransform({ position: v }); onChanged(); }}
          />
          <Trojka
            label="obrót"
            wartosc={transform.rotation}
            onChange={(v) => { (node as never as { setTransform: (t: unknown) => void }).setTransform({ rotation: v }); onChanged(); }}
          />
          <Trojka
            label="skala"
            wartosc={transform.scale}
            onChange={(v) => { (node as never as { setTransform: (t: unknown) => void }).setTransform({ scale: v }); onChanged(); }}
          />
        </>
      )}

      {isLayer(node) && (
        <>
          <Divider sx={{ my: 1 }} />
          <Wiersz label="zablokowana">
            <input
              type="checkbox"
              checked={node.isLocked()}
              onChange={(e) => { node.setLocked(e.target.checked); onChanged(); }}
            />
          </Wiersz>
        </>
      )}

      <Divider sx={{ my: 1 }} />
      <Typography sx={{ fontSize: 10, color: 'text.disabled', mb: 0.5 }}>dane obiektu</Typography>

      {Object.entries(dane)
        .filter(([pole]) => pole !== 'type')
        .map(([pole, wartosc]) => {
          const proste = typeof wartosc === 'number' || typeof wartosc === 'string';
          return (
            <Wiersz key={pole} label={pole}>
              {proste ? (
                <TextField
                  size="small"
                  defaultValue={String(wartosc)}
                  sx={{ ...POLE_SX, flex: 1 }}
                  onBlur={(e) => {
                    const tekst = e.target.value;
                    const liczba = Number(tekst);
                    node.update({ [pole]: typeof wartosc === 'number' && Number.isFinite(liczba) ? liczba : tekst });
                    onChanged();
                  }}
                />
              ) : (
                <Typography sx={{ fontSize: 10, color: 'text.disabled', wordBreak: 'break-all' }}>
                  {JSON.stringify(wartosc)}
                </Typography>
              )}
            </Wiersz>
          );
        })}
    </Box>
  );
}
