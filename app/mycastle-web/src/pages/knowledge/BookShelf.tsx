/**
 * BookShelf — książki przepisane do bazy, w drzewie takim jak na dysku.
 *
 * Osobno od ścieżki nauki, bo to inny rodzaj materiału: podręcznik ma własną
 * kolejność — tę z druku — i setki podrozdziałów, które w katalogu nauki
 * zalałyby wszystko. Tutaj są ułożone tak, jak leżą w katalogach, i **domyślnie
 * zwinięte**: rozwinięte drzewo byłoby tą samą ścianą tekstu, przed którą ten
 * podział ma bronić.
 *
 * Filtry (tagi i szukanie) działają **w obrębie jednej książki**. „Drgania"
 * u Resnicka i „drgania" u Feynmana to ten sam wyraz o innym zakresie, a lista
 * tagów ma pomagać w przeglądaniu tej książki, którą czytelnik ma otwartą.
 */
import React, { useMemo, useState } from 'react';
import {
  Box, Chip, Collapse, InputAdornment, Stack, TextField, Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import ArticleIcon from '@mui/icons-material/Article';
import SearchIcon from '@mui/icons-material/Search';
import { bookTags, buildBookTree, filterBooks, type BookNode, type LibraryFile } from './books';

export interface BookShelfProps {
  /** Dokumenty książkowe — już odsiane od materiału do nauki. */
  files: LibraryFile[];
  onOpen: (path: string) => void;
}

/** Gałąź drzewa: katalog rozwijany albo dokument do otwarcia. */
const Galaz: React.FC<{
  node: BookNode;
  poziom: number;
  onOpen: (path: string) => void;
}> = ({ node, poziom, onOpen }) => {
  const [otwarty, setOtwarty] = useState(false);

  if (node.path) {
    return (
      <Box
        component="button"
        onClick={() => onOpen(node.path!)}
        sx={{
          display: 'flex', alignItems: 'center', gap: 0.75,
          width: '100%', textAlign: 'left', border: 'none', background: 'none',
          cursor: 'pointer', py: 0.4, pl: poziom * 2.5, pr: 1, borderRadius: 1,
          color: 'text.primary', font: 'inherit', fontSize: 14,
          '&:hover': { backgroundColor: 'action.hover' },
        }}
      >
        <ArticleIcon fontSize="small" sx={{ color: 'text.disabled' }} />
        {node.title ?? node.name}
      </Box>
    );
  }

  return (
    <Box>
      <Box
        component="button"
        onClick={() => setOtwarty((v) => !v)}
        sx={{
          display: 'flex', alignItems: 'center', gap: 0.5,
          width: '100%', textAlign: 'left', border: 'none', background: 'none',
          cursor: 'pointer', py: 0.4, pl: poziom * 2.5, pr: 1, borderRadius: 1,
          color: 'text.primary', font: 'inherit', fontSize: 14, fontWeight: 500,
          '&:hover': { backgroundColor: 'action.hover' },
        }}
      >
        {otwarty ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
        {node.name}
        <Typography component="span" variant="caption" color="text.secondary" ml={0.5}>
          ({node.count})
        </Typography>
      </Box>
      <Collapse in={otwarty} unmountOnExit>
        {node.children.map((dziecko) => (
          <Galaz key={dziecko.name} node={dziecko} poziom={poziom + 1} onOpen={onOpen} />
        ))}
      </Collapse>
    </Box>
  );
};

/** Jedna książka: nagłówek, filtry i drzewo rozdziałów. */
const Ksiazka: React.FC<{
  name: string;
  files: LibraryFile[];
  count: number;
  onOpen: (path: string) => void;
}> = ({ name, files, count, onOpen }) => {
  const [otwarta, setOtwarta] = useState(false);
  const [tagi, setTagi] = useState<string[]>([]);
  const [szukane, setSzukane] = useState('');

  const dostepneTagi = useMemo(() => bookTags(files), [files]);
  const przefiltrowane = useMemo(
    () => filterBooks(files, { tags: tagi, query: szukane }),
    [files, tagi, szukane],
  );
  // Drzewo budujemy z **przefiltrowanych** dokumentów: filtr ma zawężać to, co
  // widać, a nie tylko podświetlać. Gałęzie bez trafień znikają same.
  const drzewo = useMemo(() => buildBookTree(przefiltrowane), [przefiltrowane]);

  const przelaczTag = (tag: string) => setTagi(
    (p) => (p.includes(tag) ? p.filter((t) => t !== tag) : [...p, tag]),
  );

  return (
    <Box mb={0.5}>
      <Box
        component="button"
        onClick={() => setOtwarta((v) => !v)}
        sx={{
          display: 'flex', alignItems: 'center', gap: 0.75,
          width: '100%', textAlign: 'left', border: 'none', background: 'none',
          cursor: 'pointer', py: 0.75, px: 1, borderRadius: 1,
          color: 'text.primary', font: 'inherit', fontSize: 15, fontWeight: 600,
          '&:hover': { backgroundColor: 'action.hover' },
        }}
      >
        {otwarta ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
        <MenuBookIcon fontSize="small" sx={{ color: 'text.secondary' }} />
        {name}
        <Typography component="span" variant="caption" color="text.secondary" ml={0.5}>
          ({count})
        </Typography>
      </Box>

      <Collapse in={otwarta} unmountOnExit>
        <Box pl={1} pb={1}>
          <TextField
            size="small"
            fullWidth
            label="szukaj w tej książce"
            value={szukane}
            onChange={(e) => setSzukane(e.target.value)}
            sx={{ mb: 1, mt: 0.5 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>
              ),
            }}
          />

          {dostepneTagi.length > 0 && (
            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap mb={1}>
              {dostepneTagi.map(({ tag, count: ile }) => (
                <Chip
                  key={tag}
                  label={`${tag} (${ile})`}
                  size="small"
                  color={tagi.includes(tag) ? 'primary' : 'default'}
                  variant={tagi.includes(tag) ? 'filled' : 'outlined'}
                  onClick={() => przelaczTag(tag)}
                />
              ))}
            </Stack>
          )}

          {drzewo.length === 0 ? (
            <Typography variant="body2" color="text.secondary" pl={1}>
              Nic nie pasuje do filtru.
            </Typography>
          ) : (
            // Pierwszy poziom drzewa to sama książka — pokazujemy od jej wnętrza,
            // bo nazwa stoi już w nagłówku wyżej.
            drzewo[0]?.children.map((dziecko) => (
              <Galaz key={dziecko.name} node={dziecko} poziom={0} onOpen={onOpen} />
            ))
          )}
        </Box>
      </Collapse>
    </Box>
  );
};

export const BookShelf: React.FC<BookShelfProps> = ({ files, onOpen }) => {
  const ksiazki = useMemo(() => buildBookTree(files), [files]);
  if (!ksiazki.length) return null;

  return (
    <Box mb={2}>
      <Typography variant="subtitle2" color="text.secondary" mb={0.5}>
        Książki
      </Typography>
      {ksiazki.map((ksiazka) => (
        <Ksiazka
          key={ksiazka.name}
          name={ksiazka.name}
          count={ksiazka.count}
          files={files.filter((f) => f.path.startsWith(`book/${ksiazka.name}/`))}
          onOpen={onOpen}
        />
      ))}
    </Box>
  );
};
