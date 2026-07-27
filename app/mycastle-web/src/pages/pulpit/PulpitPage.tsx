import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import dayjs, { Dayjs } from 'dayjs';
import { EventNode } from '@mhersztowski/core';
import { useFilesystem } from '../../modules/filesystem';
import { useLayoutChrome } from '../../components/Layout';
import {
  Box,
  Typography,
  ToggleButton,
  ToggleButtonGroup,
  Button,
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Tooltip,
  TextField,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  Checkbox,
  FormControlLabel,
  RadioGroup,
  Radio,
  FormControl,
  FormLabel,
  Select,
  InputLabel,
  Tabs,
  Tab,
  Avatar,
  ThemeProvider,
  createTheme,
} from '@mui/material';
import { createContext, useContext } from 'react';
import {
  Dashboard as DashboardIcon,
  TuneRounded as TuneIcon,
  SettingsRounded as SettingsIcon,
  AddRounded as AddIcon,
  CloseRounded as CloseIcon,
  DragIndicatorRounded as DragIcon,
  VisibilityRounded as ShowIcon,
  VisibilityOffRounded as HideIcon,
  Home as HomeIcon,
  DriveFolderUpload as DriveIcon,
  DeveloperBoard as DeveloperBoardIcon,
  Schema as SchemaIcon,
  Memory as MemoryIcon,
  Sensors as SensorsIcon,
  Notes as NotesIcon,
  CalendarMonth as CalendarIcon,
  Checklist as ChecklistIcon,
  ShoppingCart as ShoppingIcon,
  FitnessCenter as HealthIcon,
  Psychology as PsychologyIcon,
  Person as PersonIcon,
  Folder as FolderIcon,
  SmartToy as AgentIcon,
  LocationOn as LocationIcon,
  AppsRounded as AppsIcon,
  StarRounded as StarIcon,
  InsertDriveFileOutlined as FileIcon,
  ArticleOutlined as MdIcon,
  ImageOutlined as ImgIcon,
  PhotoLibraryRounded as PhotoIcon,
  CollectionsRounded as CollectionsIcon,
  RefreshRounded as RefreshIcon,
  OpenInNewRounded as OpenIcon,
  EventNoteRounded as CalWidgetIcon,
  RssFeedRounded as RssIcon,
  AccessTimeRounded as ClockIcon,
  MenuRounded as MenuIcon,
  ChevronLeftRounded as ChevronLeftIcon,
  ChevronRightRounded as ChevronRightIcon,
  WbSunnyRounded as WeatherIcon,
  ContactsRounded as ContactsIcon,
  WidgetsRounded as ComponentIcon,
  LightModeRounded as LightIcon,
  DarkModeRounded as DarkIcon,
  DeleteOutlineRounded as DeleteIcon,
  PhoneRounded as PhoneIcon,
  EmailRounded as EmailIcon,
  CheckRounded as CheckIcon,
  FormatSizeRounded as TextSizeIcon,
  VolumeUpRounded as VolumeUpIcon,
  VolumeOffRounded as VolumeOffIcon,
  RecordVoiceOverRounded as AuraIcon,
} from '@mui/icons-material';
import { App } from '../../App';
import { setOccurrenceCancelled } from '../calendar/eventOccurrence';
import { readUserJson, readUserFileText } from '../../services/userJson';
import { runBrowserComponent, type RunHandle } from '../../modules/component-runner/runBrowserComponent';

/* ------------------------------------------------------------------ *
 *  Pulpit — widget dashboard (floating windows)
 *
 *  Bez stałego paska u góry — pasek narzędzi (tryb Normalny/Custom,
 *  Dodaj widget) pokazywany/ukrywany z menu kontekstowego (PPM).
 *
 *  Tryby: normal (tylko treść) / custom (uchwyt move, narożne resize,
 *  ikona ustawień ⚙ + usuń). Layout w VFS (`pim/pulpit.json`) z cache
 *  w localStorage.
 * ------------------------------------------------------------------ */

type WidgetKind = 'pages' | 'drive-fav' | 'immich' | 'gphotos' | 'calendar' | 'rss' | 'clock' | 'weather' | 'contacts' | 'component' | 'aura';

interface RssFeed { name?: string; url: string; }
interface Contact { name: string; detail?: string; hue?: number; }

interface WidgetConfig {
  title?: string;
  pages?: string[];               // pages: wybrane strony (klucz = text); brak ⇒ wszystkie
  shareUrl?: string;              // immich / gphotos
  mode?: 'random' | 'single';     // gphotos: pokaz losowy / jeden plik
  selected?: number[];            // gphotos: wybrane indeksy zdjęć
  rssUrl?: string;                // rss: URL kanału (legacy, jeden kanał)
  rssFeeds?: RssFeed[];           // rss: wiele kanałów (zakładki)
  rssCount?: number;              // rss: ilość elementów
  clockMode?: 'analog' | 'digital'; // clock: analogowy / cyfrowy
  clockNumbers?: boolean;         // clock: pokaż cyfry godzin (analog)
  weatherCity?: string;           // weather: miasto
  contacts?: Contact[];           // contacts: lista kontaktów
  componentId?: string;           // component: id wpisu z Programming/Components
}

/* --- motyw (jasny/ciemny) współdzielony przez widgety --------------- */
interface Pal {
  mode: 'dark' | 'light';
  bg: string;
  text: string;
  card: string;
  border: string;
  borderStrong: string;
  header: string;
  hover: string;
  subtle: string;
  faceFrom: string;
  faceTo: string;
}
function makePal(mode: 'dark' | 'light'): Pal {
  return mode === 'dark'
    ? {
        mode,
        bg: 'radial-gradient(1200px 600px at 20% -10%, rgba(80,110,255,0.12), transparent 60%), radial-gradient(1000px 500px at 100% 0%, rgba(180,90,255,0.10), transparent 55%), #0d0f18',
        text: '#e8eaf2',
        card: 'linear-gradient(160deg, rgba(32,36,52,0.86), rgba(20,22,34,0.82))',
        border: 'rgba(255,255,255,0.08)',
        borderStrong: 'rgba(120,150,255,0.35)',
        header: 'rgba(255,255,255,0.03)',
        hover: 'rgba(255,255,255,0.05)',
        subtle: 'rgba(255,255,255,0.06)',
        faceFrom: '#232840',
        faceTo: '#14161f',
      }
    : {
        mode,
        bg: 'radial-gradient(1200px 600px at 20% -10%, rgba(80,110,255,0.15), transparent 60%), radial-gradient(1000px 500px at 100% 0%, rgba(180,90,255,0.12), transparent 55%), #eef1f7',
        text: '#1a1d29',
        card: 'linear-gradient(160deg, rgba(255,255,255,0.95), rgba(244,247,252,0.9))',
        border: 'rgba(0,0,0,0.1)',
        borderStrong: 'rgba(80,110,255,0.45)',
        header: 'rgba(0,0,0,0.03)',
        hover: 'rgba(0,0,0,0.045)',
        subtle: 'rgba(0,0,0,0.07)',
        faceFrom: '#ffffff',
        faceTo: '#dfe4ef',
      };
}
const PalContext = createContext<Pal>(makePal('dark'));
const usePal = () => useContext(PalContext);

interface WidgetInstance {
  id: string;
  kind: WidgetKind;
  x: number;
  y: number;
  w: number;
  h: number;
  config?: WidgetConfig;
}

const GRID = 8;
const MIN_W = 220;
const MIN_H = 160;
const snap = (v: number) => Math.round(v / GRID) * GRID;

const WIDGET_CATALOG: { kind: WidgetKind; label: string; icon: React.ReactNode; w: number; h: number }[] = [
  { kind: 'pages', label: 'Szybkie przejście do strony', icon: <AppsIcon fontSize="small" />, w: 400, h: 340 },
  { kind: 'drive-fav', label: 'Ulubione z Drive', icon: <StarIcon fontSize="small" />, w: 340, h: 340 },
  { kind: 'immich', label: 'Galeria Immich', icon: <PhotoIcon fontSize="small" />, w: 420, h: 340 },
  { kind: 'gphotos', label: 'Galeria Google Photos', icon: <CollectionsIcon fontSize="small" />, w: 420, h: 340 },
  { kind: 'calendar', label: 'Kalendarz i eventy', icon: <CalWidgetIcon fontSize="small" />, w: 380, h: 400 },
  { kind: 'rss', label: 'Wiadomości RSS', icon: <RssIcon fontSize="small" />, w: 380, h: 360 },
  { kind: 'clock', label: 'Zegar', icon: <ClockIcon fontSize="small" />, w: 280, h: 280 },
  { kind: 'weather', label: 'Pogoda', icon: <WeatherIcon fontSize="small" />, w: 340, h: 300 },
  { kind: 'contacts', label: 'Kontakty', icon: <ContactsIcon fontSize="small" />, w: 320, h: 360 },
  { kind: 'component', label: 'Komponent (Programming/Components)', icon: <ComponentIcon fontSize="small" />, w: 420, h: 360 },
  { kind: 'aura', label: 'Aura — asystent głosowy', icon: <AuraIcon fontSize="small" />, w: 360, h: 240 },
];

const WIDGET_META: Record<WidgetKind, { title: string; icon: React.ReactNode }> = {
  'pages': { title: 'Szybkie przejście', icon: <AppsIcon sx={{ fontSize: 16 }} /> },
  'drive-fav': { title: 'Ulubione z Drive', icon: <StarIcon sx={{ fontSize: 16 }} /> },
  'immich': { title: 'Galeria Immich', icon: <PhotoIcon sx={{ fontSize: 16 }} /> },
  'gphotos': { title: 'Galeria Google Photos', icon: <CollectionsIcon sx={{ fontSize: 16 }} /> },
  'calendar': { title: 'Kalendarz', icon: <CalWidgetIcon sx={{ fontSize: 16 }} /> },
  'rss': { title: 'Wiadomości RSS', icon: <RssIcon sx={{ fontSize: 16 }} /> },
  'clock': { title: 'Zegar', icon: <ClockIcon sx={{ fontSize: 16 }} /> },
  'weather': { title: 'Pogoda', icon: <WeatherIcon sx={{ fontSize: 16 }} /> },
  'contacts': { title: 'Kontakty', icon: <ContactsIcon sx={{ fontSize: 16 }} /> },
  'component': { title: 'Komponent', icon: <ComponentIcon sx={{ fontSize: 16 }} /> },
  'aura': { title: 'Aura', icon: <AuraIcon sx={{ fontSize: 16 }} /> },
};

/* --- typ wpisu z Programming/Components (do widgetu Komponent) ------------- */
interface StoredComponent { id: string; name: string; path: string; }

async function loadStoredComponents(userName: string): Promise<StoredComponent[]> {
  const d = await readUserJson<{ components?: StoredComponent[] }>(userName, 'programming/components.json').catch(() => null);
  return Array.isArray(d?.components) ? d!.components!.filter((c) => c && c.id && c.path) : [];
}

function defaultLayout(): WidgetInstance[] {
  return [
    { id: 'w-pages', kind: 'pages', x: 24, y: 24, w: 400, h: 340 },
    { id: 'w-fav', kind: 'drive-fav', x: 448, y: 24, w: 340, h: 340 },
    { id: 'w-immich', kind: 'immich', x: 812, y: 24, w: 420, h: 340, config: { title: 'Galeria' } },
  ];
}

/* --- lista stron odzwierciedlająca menu po lewej -------------------- */
interface PageLink { text: string; path: string; icon: React.ReactNode; hue: number; }

function buildPages(userName: string): PageLink[] {
  return [
    { text: 'Main', path: `/user/${userName}/main`, icon: <HomeIcon />, hue: 210 },
    { text: 'Drive', path: `/user/${userName}/pim/drive`, icon: <DriveIcon />, hue: 24 },
    { text: 'Electronics', path: `/user/${userName}/electronics/devices`, icon: <DeveloperBoardIcon />, hue: 150 },
    { text: 'UML', path: `/user/${userName}/programming/uml`, icon: <SchemaIcon />, hue: 270 },
    { text: 'MinisC', path: `/user/${userName}/programming/minisc`, icon: <MemoryIcon />, hue: 285 },
    { text: 'IoT', path: `/user/${userName}/iot/dashboard`, icon: <SensorsIcon />, hue: 190 },
    { text: 'Notes', path: `/workspace/md`, icon: <NotesIcon />, hue: 45 },
    { text: 'Calendar', path: `/user/${userName}/pim/calendar`, icon: <CalendarIcon />, hue: 0 },
    { text: 'To-Do', path: `/user/${userName}/pim/todolist`, icon: <ChecklistIcon />, hue: 130 },
    { text: 'Shopping', path: `/user/${userName}/pim/shopping`, icon: <ShoppingIcon />, hue: 330 },
    { text: 'Health', path: `/user/${userName}/pim/health`, icon: <HealthIcon />, hue: 350 },
    { text: 'Memory', path: `/user/${userName}/pim/memory`, icon: <PsychologyIcon />, hue: 255 },
    { text: 'Persons', path: `/user/${userName}/pim/person`, icon: <PersonIcon />, hue: 205 },
    { text: 'Projects', path: `/user/${userName}/pim/project`, icon: <FolderIcon />, hue: 40 },
    { text: 'Agent', path: `/user/${userName}/pim/agent`, icon: <AgentIcon />, hue: 175 },
    { text: 'Localization', path: `/user/${userName}/localization`, icon: <LocationIcon />, hue: 100 },
  ];
}

/* ================================================================== *
 *  Widget: Szybkie przejście do strony
 * ================================================================== */
function PagesWidget({ userName, config }: { userName: string; config?: WidgetConfig }) {
  const navigate = useNavigate();
  const pal = usePal();
  const pages = useMemo(() => buildPages(userName), [userName]);
  const sel = config?.pages;
  const list = sel ? pages.filter((p) => sel.includes(p.text)) : pages;
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))',
        gap: 1.25,
        p: 1.5,
        overflowY: 'auto',
        height: '100%',
        alignContent: 'start',
      }}
    >
      {list.length === 0 && (
        <Typography variant="body2" sx={{ opacity: 0.55, gridColumn: '1 / -1', textAlign: 'center', mt: 2 }}>
          Wybierz strony w ustawieniach ⚙
        </Typography>
      )}
      {list.map((p) => (
        <Box
          key={p.text}
          onClick={() => navigate(p.path)}
          sx={{
            cursor: 'pointer',
            borderRadius: 2.5,
            p: 1.25,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 0.75,
            textAlign: 'center',
            border: '1px solid',
            borderColor: pal.subtle,
            background: pal.mode === 'dark'
              ? 'linear-gradient(160deg, rgba(255,255,255,0.05), rgba(255,255,255,0.01))'
              : 'linear-gradient(160deg, rgba(255,255,255,0.9), rgba(240,243,250,0.7))',
            transition: 'transform .15s ease, box-shadow .15s ease, border-color .15s ease',
            '&:hover': {
              transform: 'translateY(-3px)',
              borderColor: `hsla(${p.hue},80%,60%,0.5)`,
              boxShadow: `0 8px 22px -8px hsla(${p.hue},80%,50%,0.55)`,
            },
          }}
        >
          <Box
            sx={{
              width: 46,
              height: 46,
              borderRadius: '14px',
              display: 'grid',
              placeItems: 'center',
              color: '#fff',
              background: `linear-gradient(145deg, hsl(${p.hue},75%,58%), hsl(${(p.hue + 40) % 360},70%,45%))`,
              boxShadow: `0 6px 16px -6px hsla(${p.hue},80%,50%,0.7)`,
              '& svg': { fontSize: 24 },
            }}
          >
            {p.icon}
          </Box>
          <Typography variant="caption" sx={{ fontWeight: 600, lineHeight: 1.1, opacity: 0.9 }}>
            {p.text}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

/* ================================================================== *
 *  Widget: Ulubione z Drive
 * ================================================================== */
function fileIconFor(rel: string): React.ReactNode {
  const ext = rel.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'md') return <MdIcon />;
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return <ImgIcon />;
  return <FileIcon />;
}

function DriveFavWidget({ userName }: { userName: string }) {
  const navigate = useNavigate();
  const pal = usePal();
  const [favs, setFavs] = useState<string[] | null>(null);

  const reload = useCallback(() => {
    setFavs(null);
    readUserJson<{ favorites?: string[] }>(userName, 'drive/.favorites.json')
      .then((data) => {
        const list = Array.isArray(data?.favorites) ? data!.favorites!.filter((p) => typeof p === 'string') : [];
        setFavs(list.sort());
      })
      .catch(() => setFavs([]));
  }, [userName]);

  useEffect(() => { reload(); }, [reload]);

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', px: 1.5, pt: 1, pb: 0.5 }}>
        <StarIcon sx={{ fontSize: 18, color: '#f5b301', mr: 0.75 }} />
        <Typography variant="caption" sx={{ fontWeight: 700, letterSpacing: 0.4, opacity: 0.8, flex: 1 }}>
          ULUBIONE {favs ? `(${favs.length})` : ''}
        </Typography>
        <Tooltip title="Odśwież">
          <IconButton size="small" onClick={reload} sx={{ color: 'text.secondary' }}>
            <RefreshIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      </Box>
      <Box sx={{ flex: 1, overflowY: 'auto', px: 1, pb: 1 }}>
        {favs === null && (
          <Box sx={{ display: 'grid', placeItems: 'center', height: '100%' }}>
            <CircularProgress size={22} />
          </Box>
        )}
        {favs?.length === 0 && (
          <Box sx={{ display: 'grid', placeItems: 'center', height: '100%', textAlign: 'center', px: 2 }}>
            <Typography variant="body2" sx={{ opacity: 0.6 }}>
              Brak ulubionych. Oznacz pliki gwiazdką w Drive.
            </Typography>
          </Box>
        )}
        {favs?.map((rel) => {
          const name = rel.split('/').pop() ?? rel;
          const dir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
          // Heurystyka: brak rozszerzenia w nazwie → katalog (wchodzimy do niego, nie otwieramy jako plik).
          const isDir = !name.includes('.');
          return (
            <Box
              key={rel}
              onClick={() => navigate(isDir
                ? `/user/${userName}/pim/drive?cwd=${encodeURIComponent(rel)}`
                : `/user/${userName}/pim/drive?open=${encodeURIComponent(rel)}&fullscreen=1`)}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.25,
                px: 1.25,
                py: 1,
                mb: 0.5,
                borderRadius: 2,
                cursor: 'pointer',
                border: '1px solid transparent',
                transition: 'background .15s ease, border-color .15s ease',
                '&:hover': {
                  background: pal.hover,
                  borderColor: 'rgba(245,179,1,0.35)',
                },
                '&:hover .fav-open': { opacity: 1 },
              }}
            >
              <Box
                sx={{
                  width: 34,
                  height: 34,
                  borderRadius: '10px',
                  display: 'grid',
                  placeItems: 'center',
                  flexShrink: 0,
                  color: '#fff',
                  background: 'linear-gradient(145deg, #f7b733, #fc4a1a)',
                  '& svg': { fontSize: 18 },
                }}
              >
                {isDir ? <FolderIcon /> : fileIconFor(rel)}
              </Box>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>{name}</Typography>
                {dir && (
                  <Typography variant="caption" noWrap sx={{ display: 'block', opacity: 0.5 }}>{dir}</Typography>
                )}
              </Box>
              <OpenIcon className="fav-open" sx={{ fontSize: 16, opacity: 0, color: 'text.secondary' }} />
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

/* ================================================================== *
 *  Widget: Galeria Immich (link publiczny)
 * ================================================================== */
interface ImmichAsset { id: string; description: string; }

function ImmichWidget({ config }: { config?: WidgetConfig }) {
  const shareUrl = config?.shareUrl ?? '';
  const [assets, setAssets] = useState<ImmichAsset[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    if (!shareUrl) { setAssets([]); return; }
    setAssets(null);
    setError(null);
    fetch(`/api/immich/album-assets?shareUrl=${encodeURIComponent(shareUrl)}`)
      .then((r) => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((d: { assets?: ImmichAsset[] }) => setAssets(Array.isArray(d.assets) ? d.assets : []))
      .catch((e) => { setError(e instanceof Error ? e.message : 'Błąd'); setAssets([]); });
  }, [shareUrl]);

  useEffect(() => { reload(); }, [reload]);

  if (!shareUrl) return <EmptyGalleryHint icon={<PhotoIcon />} text="Skonfiguruj link do albumu Immich w ustawieniach ⚙" />;

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', px: 1.5, pt: 1, pb: 0.5 }}>
        <PhotoIcon sx={{ fontSize: 18, color: '#8e7dff', mr: 0.75 }} />
        <Typography variant="caption" sx={{ fontWeight: 700, letterSpacing: 0.4, opacity: 0.8, flex: 1 }} noWrap>
          {config?.title?.toUpperCase() || 'GALERIA'} {assets ? `(${assets.length})` : ''}
        </Typography>
        <Tooltip title="Odśwież">
          <IconButton size="small" onClick={reload} sx={{ color: 'text.secondary' }}>
            <RefreshIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      </Box>
      <Box sx={{ flex: 1, overflowY: 'auto', px: 1, pb: 1 }}>
        {assets === null && <CenterSpin />}
        {error && <CenterMsg color="error">{error}</CenterMsg>}
        {assets && assets.length === 0 && !error && <CenterMsg>Album jest pusty.</CenterMsg>}
        {assets && assets.length > 0 && (
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(78px, 1fr))', gap: 0.75 }}>
            {assets.map((a) => (
              <Box
                key={a.id}
                component="img"
                loading="lazy"
                src={`/api/immich/shared-thumbnail?shareUrl=${encodeURIComponent(shareUrl)}&assetId=${encodeURIComponent(a.id)}&size=thumbnail`}
                alt={a.description || ''}
                title={a.description || ''}
                sx={imgTileSx('rgba(142,125,255,0.8)')}
              />
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
}

/* ================================================================== *
 *  Widget: Galeria Google Photos (link publiczny)
 *   mode 'random' → losowy pokaz z wybranych; 'single' → jeden plik.
 * ================================================================== */
function gphotoSrc(base: string, size: string) {
  return `/api/gphotos/image?url=${encodeURIComponent(base)}&size=${size}`;
}

function GPhotosWidget({ config }: { config?: WidgetConfig }) {
  const shareUrl = config?.shareUrl ?? '';
  const mode = config?.mode ?? 'random';
  const [images, setImages] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cur, setCur] = useState(0);
  const [fade, setFade] = useState(true);

  const reload = useCallback(() => {
    if (!shareUrl) { setImages([]); return; }
    setImages(null);
    setError(null);
    fetch(`/api/gphotos/album?shareUrl=${encodeURIComponent(shareUrl)}`)
      .then((r) => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((d: { images?: string[] }) => setImages(Array.isArray(d.images) ? d.images : []))
      .catch((e) => { setError(e instanceof Error ? e.message : 'Błąd'); setImages([]); });
  }, [shareUrl]);

  useEffect(() => { reload(); }, [reload]);

  // Pula indeksów do pokazania (wybrane, a jeśli brak — wszystkie).
  const pool = useMemo(() => {
    if (!images) return [] as number[];
    const all = images.map((_, i) => i);
    const sel = config?.selected?.filter((i) => i >= 0 && i < images.length) ?? [];
    return sel.length ? sel : all;
  }, [images, config?.selected]);

  // Reset gdy zmienia się pula/tryb.
  useEffect(() => { setCur(0); }, [pool.length, mode]);

  // Slideshow tylko w trybie random z >1 zdjęciem.
  useEffect(() => {
    if (mode !== 'random' || pool.length <= 1) return;
    const t = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setCur((c) => {
          if (pool.length <= 1) return c;
          let n = c;
          while (n === c) n = Math.floor(Math.random() * pool.length);
          return n;
        });
        setFade(true);
      }, 260);
    }, 7000);
    return () => clearInterval(t);
  }, [mode, pool.length]);

  if (!shareUrl) return <EmptyGalleryHint icon={<CollectionsIcon />} text="Wklej publiczny link Google Photos w ustawieniach ⚙" />;
  if (images === null) return <CenterSpin />;
  if (error) return <CenterMsg color="error">{error}</CenterMsg>;
  if (images.length === 0) return <CenterMsg>Album jest pusty lub link nieprawidłowy.</CenterMsg>;

  const shownIdx = pool.length ? pool[Math.min(cur, pool.length - 1)] : 0;
  const base = images[shownIdx];

  return (
    <Box sx={{ height: '100%', position: 'relative', overflow: 'hidden', borderRadius: 'inherit' }}>
      <Box
        component="img"
        key={base}
        src={gphotoSrc(base, 'w1024-h1024')}
        alt=""
        onLoad={() => setFade(true)}
        sx={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          opacity: fade ? 1 : 0,
          transition: 'opacity .5s ease',
        }}
      />
      {/* delikatny gradient + etykieta trybu */}
      <Box sx={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.45), transparent 30%)', pointerEvents: 'none' }} />
      <Box sx={{ position: 'absolute', left: 10, bottom: 8, display: 'flex', alignItems: 'center', gap: 0.75 }}>
        <CollectionsIcon sx={{ fontSize: 16, color: '#fff', opacity: 0.9 }} />
        <Typography variant="caption" sx={{ color: '#fff', fontWeight: 700, textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>
          {(config?.title || 'Google Photos')}{mode === 'random' && pool.length > 1 ? ` · ${cur + 1}/${pool.length}` : ''}
        </Typography>
      </Box>
    </Box>
  );
}

/* --- małe współdzielone kawałki UI --------------------------------- */
function CenterSpin() {
  return <Box sx={{ display: 'grid', placeItems: 'center', height: '100%' }}><CircularProgress size={22} /></Box>;
}
function CenterMsg({ children, color }: { children: React.ReactNode; color?: 'error' }) {
  return (
    <Box sx={{ display: 'grid', placeItems: 'center', height: '100%', textAlign: 'center', px: 2 }}>
      <Typography variant="body2" color={color} sx={{ opacity: 0.7 }}>{children}</Typography>
    </Box>
  );
}
function EmptyGalleryHint({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <Box sx={{ height: '100%', display: 'grid', placeItems: 'center', p: 2, textAlign: 'center' }}>
      <Box sx={{ opacity: 0.6 }}>
        <Box sx={{ fontSize: 42, mb: 1, '& svg': { fontSize: 42 } }}>{icon}</Box>
        <Typography variant="body2">{text}</Typography>
      </Box>
    </Box>
  );
}
const imgTileSx = (glow: string) => ({
  width: '100%',
  aspectRatio: '1 / 1',
  objectFit: 'cover' as const,
  borderRadius: 1.5,
  cursor: 'zoom-in',
  background: 'rgba(255,255,255,0.04)',
  transition: 'transform .18s ease, box-shadow .18s ease',
  '&:hover': { transform: 'scale(1.06)', boxShadow: `0 10px 24px -10px ${glow}`, zIndex: 1 },
});

/* ================================================================== *
 *  Widget: Kalendarz + zbliżające się eventy
 * ================================================================== */
function CalendarWidget({ userName, config, custom }: { userName: string; config?: WidgetConfig; custom?: boolean }) {
  const navigate = useNavigate();
  const pal = usePal();
  const { dataSource, writeFile } = useFilesystem();
  // Menu kontekstowe wystąpienia (aktywne tylko poza trybem Custom).
  const [evtMenu, setEvtMenu] = useState<{ x: number; y: number; event: EventNode; date: Dayjs } | null>(null);
  const cancelOcc = async (cancel: boolean) => {
    if (!evtMenu) return;
    const { event, date } = evtMenu; setEvtMenu(null);
    try { await setOccurrenceCancelled(writeFile, dataSource.events, event, date, cancel); } catch { /* ignore */ }
  };
  const [month, setMonth] = useState<Dayjs>(() => dayjs().startOf('month'));
  // Tik co minutę — odświeża listę „zbliżających się", by eventy z minioną godziną same znikały.
  const [nowTick, setNowTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setNowTick((t) => t + 1), 60000);
    return () => clearInterval(id);
  }, []);
  const today = dayjs();

  // eventy z bieżącego miesiąca → kropki na dniach (uwzględnia powtórzenia)
  const eventsByDay = useMemo(() => {
    const map = new Map<string, number>();
    const first = month.startOf('month');
    for (let d = 0; d < month.daysInMonth(); d++) {
      const day = first.date(d + 1);
      const count = dataSource.events.reduce((acc, e) => acc + (e.occursOn(day) ? 1 : 0), 0);
      if (count) map.set(day.format('YYYY-MM-DD'), count);
    }
    return map;
  }, [dataSource.events, month]);

  // zbliżające się eventy (od dziś), z rozwinięciem powtórzeń na najbliższe 60 dni.
  // Eventy z konkretną godziną, która już minęła, są pomijane (całodniowe dzisiejsze zostają).
  const upcoming = useMemo(() => {
    const now = dayjs();
    const startOfToday = now.startOf('day');
    const out: { event: EventNode; date: Dayjs }[] = [];
    for (let i = 0; i < 60 && out.length < 30; i++) {
      const day = startOfToday.add(i, 'day');
      for (const e of dataSource.events) {
        if (!e.occursOn(day)) continue;
        const start = e.getStartOn(day);
        // Usuwaj tylko eventy, które JUŻ SIĘ ZAKOŃCZYŁY (koniec przed teraz) — trwający event
        // (start w przeszłości, ale jeszcze się nie skończył) MA być widoczny.
        const end = e.getEndOn(day) ?? (start ? start.add(1, 'hour') : null);
        if (end && end.isBefore(now)) continue;
        out.push({ event: e, date: start ?? day });
      }
    }
    out.sort((a, b) => a.date.diff(b.date));
    return out.slice(0, 6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataSource.events, nowTick]);

  // siatka dni miesiąca (pon–niedz)
  const days = useMemo(() => {
    const first = month.startOf('month');
    const startCol = (first.day() + 6) % 7; // pon=0
    const total = month.daysInMonth();
    const cells: (Dayjs | null)[] = [];
    for (let i = 0; i < startCol; i++) cells.push(null);
    for (let d = 1; d <= total; d++) cells.push(first.date(d));
    return cells;
  }, [month]);

  // ── Zapowiedzi głosowe (TTS) ──────────────────────────────────────────────
  // Używa TEGO SAMEGO serwisu co Iot/Aura (App.instance.speechService → wspólna konfiguracja:
  // provider/model TTS, głos, a pośrednio STT/AI). Mówi 5 minut przed startem eventu oraz w momencie
  // startu: nazwę eventu (lub opis, jeśli nazwa pusta).
  const TTS_KEY = `pulpit.calendarTts.${userName}`;
  const [ttsOn, setTtsOn] = useState<boolean>(() => { try { return localStorage.getItem(TTS_KEY) !== '0'; } catch { return true; } });
  const toggleTts = () => {
    const nv = !ttsOn;
    setTtsOn(nv);
    try { localStorage.setItem(TTS_KEY, nv ? '1' : '0'); } catch { /* ignore */ }
    // Kliknięcie = gest użytkownika → odblokowuje audio (autoplay) i potwierdza, że TTS działa.
    if (nv) App.instance.speechService.speak({ text: 'Zapowiedzi kalendarza włączone' }).catch(() => {});
  };
  const announcedRef = useRef<Set<string>>(new Set());
  const eventsRef = useRef(dataSource.events); eventsRef.current = dataSource.events;
  // Kolejka TTS: zapowiedzi odtwarzane SEKWENCYJNIE (łańcuch obietnic, jak w Iot/Aura), żeby dwa
  // eventy w tym samym czasie nie przerywały się nawzajem (co powodowało ciszę).
  const ttsChainRef = useRef<Promise<void>>(Promise.resolve());
  const enqueueTts = useCallback((text: string) => {
    ttsChainRef.current = ttsChainRef.current
      .then(() => App.instance.speechService.speak({ text }))
      .catch(() => { /* provider niedostępny/niekonfigurowany */ });
  }, []);
  useEffect(() => {
    if (!ttsOn) return;
    App.instance.speechService.loadConfig().catch(() => {}); // upewnij się, że konfiguracja TTS jest wczytana
    const check = () => {
      const now = dayjs();
      // dziś i jutro (obejmuje okno tuż przed północą)
      for (const day of [now.startOf('day'), now.add(1, 'day').startOf('day')]) {
        for (const e of eventsRef.current) {
          if (!e.occursOn(day)) continue;
          if (e.isCancelledOn(day)) continue; // anulowane wystąpienie — nie zapowiadamy
          const start = e.getStartOn(day);
          if (!start) continue; // event całodniowy (bez godziny) — pomijamy
          const content = (e.name?.trim() || e.description?.trim() || 'Wydarzenie').slice(0, 200);
          const key = `${e.name}|${start.format('YYYY-MM-DDTHH:mm')}`;
          const diffMin = start.diff(now, 'minute', true);
          // 5 minut przed (okno ~1 min; interwał 30 s → zawsze trafi)
          if (diffMin <= 5 && diffMin > 4 && !announcedRef.current.has(`${key}:5`)) {
            announcedRef.current.add(`${key}:5`);
            enqueueTts(`Za 5 min zaczynasz Event: ${content}`);
          }
          // start eventu
          if (diffMin <= 0 && diffMin > -1 && !announcedRef.current.has(`${key}:0`)) {
            announcedRef.current.add(`${key}:0`);
            enqueueTts(`Zaczyna się Event: ${content}`);
          }
        }
      }
    };
    check();
    const id = setInterval(check, 30000);
    return () => clearInterval(id);
  }, [ttsOn, enqueueTts]);

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', p: 1.5, gap: 1 }}>
      {/* nagłówek miesiąca */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <CalWidgetIcon sx={{ fontSize: 18, color: '#7fd1ff' }} />
        <Typography variant="subtitle2" sx={{ fontWeight: 700, flex: 1, textTransform: 'capitalize' }}>
          {month.format('MMMM YYYY')}
        </Typography>
        <IconButton size="small" onClick={() => setMonth((m) => m.subtract(1, 'month'))} sx={{ color: 'text.secondary' }}><ChevronLeftIcon sx={{ fontSize: 18 }} /></IconButton>
        <IconButton size="small" onClick={() => setMonth(dayjs().startOf('month'))} sx={{ color: 'text.secondary', fontSize: 11 }}>•</IconButton>
        <IconButton size="small" onClick={() => setMonth((m) => m.add(1, 'month'))} sx={{ color: 'text.secondary' }}><ChevronRightIcon sx={{ fontSize: 18 }} /></IconButton>
      </Box>

      {/* mini-kalendarz */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0.25 }}>
        {['P', 'W', 'Ś', 'C', 'P', 'S', 'N'].map((d, i) => (
          <Typography key={i} variant="caption" sx={{ textAlign: 'center', opacity: 0.45, fontWeight: 700, fontSize: 10 }}>{d}</Typography>
        ))}
        {days.map((d, i) => {
          if (!d) return <Box key={i} />;
          const isToday = d.isSame(today, 'day');
          const has = eventsByDay.has(d.format('YYYY-MM-DD'));
          return (
            <Box
              key={i}
              onClick={() => navigate(`/user/${userName}/pim/calendar?date=${d.format('YYYY-MM-DD')}`)}
              sx={{
                aspectRatio: '1 / 1',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: isToday ? 800 : 500,
                color: isToday ? '#fff' : 'inherit',
                background: isToday ? 'linear-gradient(145deg, #4a7bff, #7a5cff)' : 'transparent',
                position: 'relative',
                transition: 'background .15s',
                '&:hover': { background: isToday ? undefined : pal.hover },
              }}
            >
              {d.date()}
              {has && (
                <Box sx={{ position: 'absolute', bottom: 3, width: 4, height: 4, borderRadius: '50%', background: isToday ? '#fff' : '#7fd1ff' }} />
              )}
            </Box>
          );
        })}
      </Box>

      <Divider sx={{ borderColor: pal.subtle }} />

      {/* zbliżające się eventy */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Typography variant="caption" sx={{ fontWeight: 700, opacity: 0.55, letterSpacing: 0.4, flex: 1 }}>
          {config?.title?.toUpperCase() || 'ZBLIŻAJĄCE SIĘ'}
        </Typography>
        <Tooltip title={ttsOn ? 'Zapowiedzi głosowe: wł. (5 min przed i o starcie)' : 'Zapowiedzi głosowe: wył.'}>
          <IconButton size="small" onClick={toggleTts} sx={{ color: ttsOn ? '#7fd1ff' : 'text.disabled', p: 0.25 }}>
            {ttsOn ? <VolumeUpIcon sx={{ fontSize: 16 }} /> : <VolumeOffIcon sx={{ fontSize: 16 }} />}
          </IconButton>
        </Tooltip>
      </Box>
      <Box sx={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {upcoming.length === 0 && (
          <Typography variant="body2" sx={{ opacity: 0.5, mt: 1 }}>Brak nadchodzących wydarzeń.</Typography>
        )}
        {upcoming.map(({ event: e, date: d }, i) => {
          const cancelled = e.isCancelledOn(d);
          return (
            <Box
              key={i}
              onClick={() => navigate(`/user/${userName}/pim/calendar`)}
              onContextMenu={custom ? undefined : (ev) => { ev.preventDefault(); ev.stopPropagation(); setEvtMenu({ x: ev.clientX, y: ev.clientY, event: e, date: d }); }}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                p: 0.75,
                borderRadius: 2,
                cursor: 'pointer',
                border: `1px solid ${pal.subtle}`,
                opacity: cancelled ? 0.4 : 1, // anulowane wystąpienie — wyszarzone (kanał alfa)
                textDecoration: cancelled ? 'line-through' : 'none',
                '&:hover': { background: pal.hover },
              }}
            >
              <Box
                sx={{
                  width: 40,
                  flexShrink: 0,
                  textAlign: 'center',
                  borderRadius: '10px',
                  py: 0.25,
                  background: 'linear-gradient(145deg, rgba(74,123,255,0.25), rgba(122,92,255,0.2))',
                }}
              >
                <Typography variant="caption" sx={{ display: 'block', fontSize: 9, opacity: 0.7, textTransform: 'uppercase' }}>{d.format('MMM')}</Typography>
                <Typography variant="body2" sx={{ fontWeight: 800, lineHeight: 1 }}>{d.format('D')}</Typography>
              </Box>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                  {e.name || '(bez nazwy)'}{e.getRecurrenceLabel() ? ' 🔁' : ''}
                </Typography>
                <Typography variant="caption" sx={{ opacity: 0.55 }}>
                  {d.isSame(today, 'day') ? 'Dziś' : d.format('ddd')} · {d.format('HH:mm')}
                </Typography>
              </Box>
            </Box>
          );
        })}
      </Box>

      {/* Menu kontekstowe wystąpienia (poza trybem Custom): anuluj/przywróć dany dzień. */}
      <Menu
        open={!!evtMenu}
        onClose={() => setEvtMenu(null)}
        anchorReference="anchorPosition"
        anchorPosition={evtMenu ? { top: evtMenu.y, left: evtMenu.x } : undefined}
      >
        {evtMenu && (evtMenu.event.isCancelledOn(evtMenu.date)
          ? <MenuItem onClick={() => void cancelOcc(false)}><ListItemIcon><CheckIcon fontSize="small" /></ListItemIcon><ListItemText>Przywróć wystąpienie</ListItemText></MenuItem>
          : <MenuItem onClick={() => void cancelOcc(true)}><ListItemIcon><DeleteIcon fontSize="small" /></ListItemIcon><ListItemText>Usuń wystąpienie</ListItemText></MenuItem>)}
      </Menu>
    </Box>
  );
}

/* ================================================================== *
 *  Widget: Wiadomości RSS
 * ================================================================== */
interface RssItem { title: string; link: string; date: string; description: string; }

function RssWidget({ config }: { config?: WidgetConfig }) {
  const pal = usePal();
  const count = Math.max(1, Math.min(50, config?.rssCount ?? 10));
  // Kanały: nowe `rssFeeds`, ze wsteczną zgodnością ze starym `rssUrl`.
  const feeds: RssFeed[] = useMemo(() => {
    if (config?.rssFeeds?.length) return config.rssFeeds.filter((f) => f.url);
    if (config?.rssUrl) return [{ url: config.rssUrl }];
    return [];
  }, [config?.rssFeeds, config?.rssUrl]);

  const [tab, setTab] = useState(0);
  const [data, setData] = useState<{ title: string; items: RssItem[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const active = feeds[Math.min(tab, feeds.length - 1)];

  const reload = useCallback(() => {
    if (!active?.url) { setData({ title: '', items: [] }); return; }
    setData(null);
    setError(null);
    fetch(`/api/rss?url=${encodeURIComponent(active.url)}&limit=${count}`)
      .then((r) => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((d: { title: string; items: RssItem[] }) => setData(d))
      .catch((e) => { setError(e instanceof Error ? e.message : 'Błąd'); setData({ title: '', items: [] }); });
  }, [active?.url, count]);

  useEffect(() => { reload(); }, [reload]);

  if (feeds.length === 0) return <EmptyGalleryHint icon={<RssIcon />} text="Dodaj kanał(y) RSS w ustawieniach ⚙" />;

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', px: 1.5, pt: 1, pb: 0.5 }}>
        <RssIcon sx={{ fontSize: 18, color: '#ff9642', mr: 0.75 }} />
        <Typography variant="caption" sx={{ fontWeight: 700, letterSpacing: 0.4, opacity: 0.8, flex: 1 }} noWrap>
          {(config?.title || 'WIADOMOŚCI').toUpperCase()}
        </Typography>
        <Tooltip title="Odśwież">
          <IconButton size="small" onClick={reload} sx={{ color: 'text.secondary' }}><RefreshIcon sx={{ fontSize: 16 }} /></IconButton>
        </Tooltip>
      </Box>
      {feeds.length > 1 && (
        <Tabs
          value={Math.min(tab, feeds.length - 1)}
          onChange={(_, v) => setTab(v)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            minHeight: 34,
            px: 1,
            borderBottom: `1px solid ${pal.subtle}`,
            '& .MuiTab-root': { minHeight: 34, py: 0.5, textTransform: 'none', fontSize: 12, minWidth: 'auto', color: 'text.secondary' },
            '& .Mui-selected': { color: '#ff9642 !important' },
            '& .MuiTabs-indicator': { background: '#ff9642' },
          }}
        >
          {feeds.map((f, i) => (
            <Tab key={i} label={f.name || (() => { try { return new URL(f.url).hostname.replace(/^www\./, ''); } catch { return `Kanał ${i + 1}`; } })()} />
          ))}
        </Tabs>
      )}
      <Box sx={{ flex: 1, overflowY: 'auto', px: 1, py: 1 }}>
        {data === null && <CenterSpin />}
        {error && <CenterMsg color="error">{error}</CenterMsg>}
        {data && data.items.length === 0 && !error && <CenterMsg>Brak elementów.</CenterMsg>}
        {data?.items.map((it, i) => (
          <Box
            key={i}
            component="a"
            href={it.link || '#'}
            target="_blank"
            rel="noopener noreferrer"
            sx={{
              display: 'block',
              textDecoration: 'none',
              color: 'inherit',
              px: 1.25,
              py: 1,
              mb: 0.5,
              borderRadius: 2,
              borderLeft: '3px solid rgba(255,150,66,0.5)',
              background: pal.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
              transition: 'background .15s, border-color .15s',
              '&:hover': { background: 'rgba(255,150,66,0.10)', borderColor: '#ff9642' },
            }}
          >
            <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.25, mb: 0.25, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {it.title || '(bez tytułu)'}
            </Typography>
            {it.description && (
              <Typography variant="caption" sx={{ opacity: 0.6, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {it.description}
              </Typography>
            )}
            {it.date && <Typography variant="caption" sx={{ display: 'block', opacity: 0.4, mt: 0.25 }}>{it.date}</Typography>}
          </Box>
        ))}
      </Box>
    </Box>
  );
}

/* ================================================================== *
 *  Widget: Zegar (analogowy / cyfrowy)
 * ================================================================== */
function ClockWidget({ config }: { config?: WidgetConfig }) {
  const pal = usePal();
  const mode = config?.clockMode ?? 'analog';
  const showNumbers = config?.clockNumbers ?? false;
  const [now, setNow] = useState<Dayjs>(() => dayjs());
  useEffect(() => {
    const t = setInterval(() => setNow(dayjs()), 1000);
    return () => clearInterval(t);
  }, []);

  if (mode === 'digital') {
    return (
      <Box sx={{ height: '100%', display: 'grid', placeItems: 'center', textAlign: 'center' }}>
        <Box>
          <Typography sx={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums', fontSize: 'clamp(32px, 22cqmin, 120px)', letterSpacing: 1, lineHeight: 1, background: 'linear-gradient(145deg,#7fd1ff,#a06bff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {now.format('HH:mm')}
            <Box component="span" sx={{ fontSize: '0.5em', opacity: 0.7, ml: 0.5, WebkitTextFillColor: '#8ea2ff' }}>{now.format('ss')}</Box>
          </Typography>
          <Typography variant="body2" sx={{ opacity: 0.6, mt: 1, textTransform: 'capitalize' }}>
            {now.format('dddd, D MMMM YYYY')}
          </Typography>
          {config?.title && <Typography variant="caption" sx={{ opacity: 0.4 }}>{config.title}</Typography>}
        </Box>
      </Box>
    );
  }

  // analogowy — SVG, skaluje się z rozmiarem komponentu (bez limitu max)
  const sec = now.second();
  const min = now.minute();
  const hr = now.hour() % 12;
  const secA = sec * 6;
  const minA = min * 6 + sec * 0.1;
  const hrA = hr * 30 + min * 0.5;
  const tickColor = pal.mode === 'dark' ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)';
  const numColor = pal.mode === 'dark' ? '#e8eaf2' : '#1a1d29';
  const hourHand = pal.mode === 'dark' ? '#e8eaf2' : '#1a1d29';
  return (
    <Box sx={{ height: '100%', width: '100%', display: 'grid', placeItems: 'center', p: 1.5, boxSizing: 'border-box' }}>
      <Box
        component="svg"
        viewBox="0 0 200 200"
        preserveAspectRatio="xMidYMid meet"
        sx={{ width: '100%', height: '100%' }}
      >
        <defs>
          <radialGradient id="clockFace" cx="50%" cy="45%" r="60%">
            <stop offset="0%" stopColor={pal.faceFrom} />
            <stop offset="100%" stopColor={pal.faceTo} />
          </radialGradient>
        </defs>
        <circle cx="100" cy="100" r="94" fill="url(#clockFace)" stroke="rgba(120,150,255,0.35)" strokeWidth="2" />
        {Array.from({ length: 12 }).map((_, i) => {
          const a = (i * 30 * Math.PI) / 180;
          const outer = showNumbers ? 88 : 82;
          const inner = showNumbers ? 80 : 72;
          const x1 = 100 + Math.sin(a) * outer;
          const y1 = 100 - Math.cos(a) * outer;
          const x2 = 100 + Math.sin(a) * inner;
          const y2 = 100 - Math.cos(a) * inner;
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={tickColor} strokeWidth={i % 3 === 0 ? 3 : 1.5} strokeLinecap="round" />;
        })}
        {showNumbers && Array.from({ length: 12 }).map((_, i) => {
          const n = i === 0 ? 12 : i;
          const a = (i * 30 * Math.PI) / 180;
          const x = 100 + Math.sin(a) * 66;
          const y = 100 - Math.cos(a) * 66;
          return (
            <text key={i} x={x} y={y} fill={numColor} fontSize="15" fontWeight="700" textAnchor="middle" dominantBaseline="central" fontFamily="system-ui, sans-serif">{n}</text>
          );
        })}
        {/* godzinowa */}
        <line x1="100" y1="100" x2={100 + Math.sin((hrA * Math.PI) / 180) * (showNumbers ? 40 : 45)} y2={100 - Math.cos((hrA * Math.PI) / 180) * (showNumbers ? 40 : 45)} stroke={hourHand} strokeWidth="5" strokeLinecap="round" />
        {/* minutowa */}
        <line x1="100" y1="100" x2={100 + Math.sin((minA * Math.PI) / 180) * (showNumbers ? 56 : 65)} y2={100 - Math.cos((minA * Math.PI) / 180) * (showNumbers ? 56 : 65)} stroke="#6f8cff" strokeWidth="3.5" strokeLinecap="round" />
        {/* sekundowa */}
        <line x1="100" y1="100" x2={100 + Math.sin((secA * Math.PI) / 180) * (showNumbers ? 60 : 72)} y2={100 - Math.cos((secA * Math.PI) / 180) * (showNumbers ? 60 : 72)} stroke="#ff6b6b" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="100" cy="100" r="5" fill="#ff6b6b" />
      </Box>
    </Box>
  );
}

/* ================================================================== *
 *  Widget: Pogoda (Open-Meteo — bez klucza API)
 * ================================================================== */
const WMO: Record<number, { label: string; emoji: string }> = {
  0: { label: 'Bezchmurnie', emoji: '☀️' },
  1: { label: 'Głównie słonecznie', emoji: '🌤️' },
  2: { label: 'Częściowe zachmurzenie', emoji: '⛅' },
  3: { label: 'Zachmurzenie', emoji: '☁️' },
  45: { label: 'Mgła', emoji: '🌫️' },
  48: { label: 'Szadź', emoji: '🌫️' },
  51: { label: 'Mżawka', emoji: '🌦️' },
  53: { label: 'Mżawka', emoji: '🌦️' },
  55: { label: 'Mżawka', emoji: '🌦️' },
  61: { label: 'Deszcz', emoji: '🌧️' },
  63: { label: 'Deszcz', emoji: '🌧️' },
  65: { label: 'Ulewa', emoji: '🌧️' },
  71: { label: 'Śnieg', emoji: '🌨️' },
  73: { label: 'Śnieg', emoji: '🌨️' },
  75: { label: 'Śnieżyca', emoji: '❄️' },
  80: { label: 'Przelotny deszcz', emoji: '🌦️' },
  81: { label: 'Przelotny deszcz', emoji: '🌧️' },
  82: { label: 'Nawałnica', emoji: '⛈️' },
  95: { label: 'Burza', emoji: '⛈️' },
  96: { label: 'Burza z gradem', emoji: '⛈️' },
  99: { label: 'Burza z gradem', emoji: '⛈️' },
};

interface WeatherData {
  place: string;
  temp: number;
  feels: number;
  humidity: number;
  wind: number;
  code: number;
  tMax: number;
  tMin: number;
}

function WeatherWidget({ config }: { config?: WidgetConfig }) {
  const city = config?.weatherCity ?? '';
  const [wx, setWx] = useState<WeatherData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    if (!city.trim()) { setWx(null); return; }
    setWx(null);
    setError(null);
    (async () => {
      try {
        const geo = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=pl`).then((r) => r.json());
        const loc = geo?.results?.[0];
        if (!loc) throw new Error('Nie znaleziono miasta');
        const f = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min&timezone=auto`).then((r) => r.json());
        const c = f?.current;
        if (!c) throw new Error('Brak danych pogodowych');
        setWx({
          place: [loc.name, loc.country_code].filter(Boolean).join(', '),
          temp: Math.round(c.temperature_2m),
          feels: Math.round(c.apparent_temperature),
          humidity: c.relative_humidity_2m,
          wind: Math.round(c.wind_speed_10m),
          code: c.weather_code,
          tMax: Math.round(f.daily?.temperature_2m_max?.[0] ?? c.temperature_2m),
          tMin: Math.round(f.daily?.temperature_2m_min?.[0] ?? c.temperature_2m),
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Błąd');
      }
    })();
  }, [city]);

  useEffect(() => { reload(); }, [reload]);

  if (!city.trim()) return <EmptyGalleryHint icon={<WeatherIcon />} text="Podaj miasto w ustawieniach ⚙" />;
  if (error) return <CenterMsg color="error">{error}</CenterMsg>;
  if (!wx) return <CenterSpin />;

  const wmo = WMO[wx.code] ?? { label: '—', emoji: '🌡️' };
  // gradient tła zależny od warunków
  const grad = wx.code === 0 ? 'linear-gradient(160deg,#2b5876,#4e93c8)'
    : wx.code <= 3 ? 'linear-gradient(160deg,#3a4a63,#5b7aa8)'
    : wx.code >= 71 && wx.code <= 77 ? 'linear-gradient(160deg,#516395,#8aa0c8)'
    : wx.code >= 95 ? 'linear-gradient(160deg,#232526,#414345)'
    : 'linear-gradient(160deg,#3a4a63,#5f6d8a)';

  return (
    <Box sx={{ height: '100%', position: 'relative', borderRadius: 'inherit', overflow: 'hidden', background: grad, color: '#fff', p: 2, display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
        <WeatherIcon sx={{ fontSize: 16, opacity: 0.9 }} />
        <Typography variant="subtitle2" sx={{ fontWeight: 700, flex: 1 }} noWrap>{config?.title || wx.place}</Typography>
        <Tooltip title="Odśwież"><IconButton size="small" onClick={reload} sx={{ color: '#fff', opacity: 0.8 }}><RefreshIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>
      </Box>
      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Typography sx={{ fontSize: 'clamp(40px, 18cqmin, 96px)', lineHeight: 1 }}>{wmo.emoji}</Typography>
        <Box>
          <Typography sx={{ fontSize: 'clamp(40px, 16cqmin, 84px)', fontWeight: 800, lineHeight: 1 }}>{wx.temp}°</Typography>
          <Typography variant="body2" sx={{ opacity: 0.9 }}>{wmo.label}</Typography>
        </Box>
      </Box>
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', fontSize: 13, opacity: 0.92 }}>
        <span>Odczuwalna {wx.feels}°</span>
        <span>↑{wx.tMax}° ↓{wx.tMin}°</span>
        <span>💧 {wx.humidity}%</span>
        <span>💨 {wx.wind} km/h</span>
      </Box>
    </Box>
  );
}

/* ================================================================== *
 *  Widget: Kontakty
 * ================================================================== */
function ContactsWidget({ config }: { config?: WidgetConfig }) {
  const pal = usePal();
  const contacts = config?.contacts ?? [];
  const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
  const hrefFor = (detail?: string) => {
    if (!detail) return undefined;
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(detail)) return `mailto:${detail}`;
    if (/^[+\d][\d\s()-]{4,}$/.test(detail)) return `tel:${detail.replace(/\s/g, '')}`;
    return undefined;
  };
  const isEmail = (d?: string) => !!d && /@/.test(d);

  if (contacts.length === 0) return <EmptyGalleryHint icon={<ContactsIcon />} text="Dodaj kontakty w ustawieniach ⚙" />;

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', px: 1.5, pt: 1, pb: 0.5 }}>
        <ContactsIcon sx={{ fontSize: 18, color: '#4dd0a0', mr: 0.75 }} />
        <Typography variant="caption" sx={{ fontWeight: 700, letterSpacing: 0.4, opacity: 0.8, flex: 1 }} noWrap>
          {(config?.title || 'KONTAKTY').toUpperCase()} ({contacts.length})
        </Typography>
      </Box>
      <Box sx={{ flex: 1, overflowY: 'auto', px: 1, pb: 1 }}>
        {contacts.map((c, i) => {
          const href = hrefFor(c.detail);
          const hue = c.hue ?? (i * 47) % 360;
          return (
            <Box
              key={i}
              component={href ? 'a' : 'div'}
              href={href}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.25,
                px: 1.25,
                py: 1,
                mb: 0.5,
                borderRadius: 2,
                textDecoration: 'none',
                color: 'inherit',
                cursor: href ? 'pointer' : 'default',
                border: '1px solid transparent',
                transition: 'background .15s, border-color .15s',
                '&:hover': { background: pal.hover, borderColor: `hsla(${hue},70%,55%,0.4)` },
              }}
            >
              <Avatar sx={{ width: 40, height: 40, fontSize: 15, fontWeight: 700, background: `linear-gradient(145deg, hsl(${hue},65%,55%), hsl(${(hue + 40) % 360},60%,45%))` }}>
                {initials(c.name) || '?'}
              </Avatar>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>{c.name}</Typography>
                {c.detail && (
                  <Typography variant="caption" noWrap sx={{ display: 'flex', alignItems: 'center', gap: 0.5, opacity: 0.6 }}>
                    {c.detail && (isEmail(c.detail) ? <EmailIcon sx={{ fontSize: 13 }} /> : <PhoneIcon sx={{ fontSize: 13 }} />)}
                    {c.detail}
                  </Typography>
                )}
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

/* ================================================================== *
 *  Widget: Komponent (uruchamia komponent Lit/Qt z Programming/Components)
 * ================================================================== */
function ComponentWidget({ userName, config }: { userName: string; config?: WidgetConfig }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<RunHandle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const componentId = config?.componentId;

  useEffect(() => {
    let alive = true;
    handleRef.current?.stop();
    handleRef.current = null;
    setError(null);
    if (!componentId) { setStatus(''); return; }
    (async () => {
      try {
        setStatus('Ładowanie…');
        const list = await loadStoredComponents(userName);
        const entry = list.find((c) => c.id === componentId);
        if (!entry) throw new Error('Komponent nie istnieje na liście (Programming/Components)');
        const code = await readUserFileText(userName, entry.path);
        if (code == null) throw new Error(`Brak pliku: ${entry.path}`);
        await new Promise((r) => requestAnimationFrame(r));
        if (!alive || !hostRef.current) return;
        handleRef.current = await runBrowserComponent(code, {
          host: hostRef.current, userName, fileName: entry.path,
          log: (lvl, txt) => { if (lvl === 'error') setError(txt); },
        });
        if (alive) setStatus('');
      } catch (e) {
        if (alive) { setError(e instanceof Error ? e.message : String(e)); setStatus(''); }
      }
    })();
    return () => { alive = false; handleRef.current?.stop(); };
  }, [userName, componentId]);

  if (!componentId) return <EmptyGalleryHint icon={<ComponentIcon />} text="Wybierz komponent w ustawieniach ⚙" />;

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box ref={hostRef} sx={{ flex: 1, minHeight: 0, overflow: 'auto', p: 0.5, display: 'flex', flexDirection: 'column' }} />
      {status && <Typography variant="caption" sx={{ px: 1, opacity: 0.6 }}>{status}</Typography>}
      {error && (
        <Typography variant="caption" color="error" sx={{ px: 1, py: 0.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {error}
        </Typography>
      )}
    </Box>
  );
}

/* --- aura: asystent głosowy ------------------------------------------------
   Strona Aury jest ciężka (mikrofon, MQTT, AI), więc ładujemy ją leniwie —
   pulpit bez tego widgetu nie płaci za jej bundle. Instancja pozostaje ta sama
   przy przełączaniu na pełny ekran: konwersacja żyje tylko w pamięci, więc
   remount skasowałby rozmowę i przerwał nasłuch. */
const IotAuraPage = lazy(() => import('../minis-user/iot/IotAuraPage'));

function AuraWidget({ userName, fullscreen, onToggleFullscreen }: {
  userName: string;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
}) {
  return (
    <Suspense fallback={<Box sx={{ height: '100%', display: 'grid', placeItems: 'center' }}><CircularProgress size={22} /></Box>}>
      <IotAuraPage userName={userName} embedded fullscreen={fullscreen} onToggleFullscreen={onToggleFullscreen} />
    </Suspense>
  );
}

/* ================================================================== *
 *  Dialog ustawień widgetu
 * ================================================================== */
function WidgetSettingsDialog({
  widget,
  userName,
  onClose,
  onSave,
}: {
  widget: WidgetInstance;
  userName: string;
  onClose: () => void;
  onSave: (cfg: WidgetConfig) => void;
}) {
  const [cfg, setCfg] = useState<WidgetConfig>(widget.config ?? {});
  const patch = (p: Partial<WidgetConfig>) => setCfg((c) => ({ ...c, ...p }));

  const pages = useMemo(() => buildPages(userName), [userName]);
  // pages: bez konfiguracji ⇒ wszystkie zaznaczone
  const selectedPages = cfg.pages ?? pages.map((p) => p.text);
  const togglePage = (text: string) => {
    const set = new Set(selectedPages);
    if (set.has(text)) set.delete(text); else set.add(text);
    patch({ pages: pages.filter((p) => set.has(p.text)).map((p) => p.text) });
  };

  // gphotos: pobierz zdjęcia do wyboru
  const isGallery = widget.kind === 'gphotos' || widget.kind === 'immich';
  const [gimgs, setGimgs] = useState<string[] | null>(null);
  useEffect(() => {
    if (widget.kind !== 'gphotos' || !cfg.shareUrl) { setGimgs(null); return; }
    let alive = true;
    setGimgs(null);
    fetch(`/api/gphotos/album?shareUrl=${encodeURIComponent(cfg.shareUrl)}`)
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((d: { images?: string[] }) => { if (alive) setGimgs(Array.isArray(d.images) ? d.images : []); })
      .catch(() => { if (alive) setGimgs([]); });
    return () => { alive = false; };
  }, [widget.kind, cfg.shareUrl]);

  // component: lista komponentów z Programming/Components
  const [compList, setCompList] = useState<StoredComponent[] | null>(null);
  useEffect(() => {
    if (widget.kind !== 'component') { setCompList(null); return; }
    let alive = true;
    loadStoredComponents(userName).then((l) => { if (alive) setCompList(l); });
    return () => { alive = false; };
  }, [widget.kind, userName]);

  const gMode = cfg.mode ?? 'random';
  const gSelected = cfg.selected ?? [];
  const toggleImg = (i: number) => {
    if (gMode === 'single') { patch({ selected: [i] }); return; }
    const set = new Set(gSelected);
    if (set.has(i)) set.delete(i); else set.add(i);
    patch({ selected: [...set].sort((a, b) => a - b) });
  };

  // rss: wiele kanałów (z migracją legacy rssUrl)
  const rssFeeds: RssFeed[] = cfg.rssFeeds ?? (cfg.rssUrl ? [{ url: cfg.rssUrl }] : []);
  const updateFeed = (i: number, p: Partial<RssFeed>) => patch({ rssFeeds: rssFeeds.map((f, j) => (j === i ? { ...f, ...p } : f)), rssUrl: undefined });
  const removeFeed = (i: number) => patch({ rssFeeds: rssFeeds.filter((_, j) => j !== i), rssUrl: undefined });

  // contacts: edytowalna lista
  const contacts: Contact[] = cfg.contacts ?? [];
  const updateContact = (i: number, p: Partial<Contact>) => patch({ contacts: contacts.map((c, j) => (j === i ? { ...c, ...p } : c)) });
  const removeContact = (i: number) => patch({ contacts: contacts.filter((_, j) => j !== i) });

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <SettingsIcon fontSize="small" /> Ustawienia — {WIDGET_META[widget.kind].title}
      </DialogTitle>
      <DialogContent dividers>
        <TextField
          label="Tytuł (opcjonalnie)"
          size="small"
          fullWidth
          value={cfg.title ?? ''}
          onChange={(e) => patch({ title: e.target.value })}
          sx={{ mb: 2 }}
        />

        {/* --- pages: wybór stron --- */}
        {widget.kind === 'pages' && (
          <>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>Widoczne strony</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 0 }}>
              {pages.map((p) => (
                <FormControlLabel
                  key={p.text}
                  control={<Checkbox size="small" checked={selectedPages.includes(p.text)} onChange={() => togglePage(p.text)} />}
                  label={<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>{p.icon}<span>{p.text}</span></Box>}
                />
              ))}
            </Box>
            <Box sx={{ mt: 1, display: 'flex', gap: 1 }}>
              <Button size="small" onClick={() => patch({ pages: pages.map((p) => p.text) })}>Zaznacz wszystkie</Button>
              <Button size="small" onClick={() => patch({ pages: [] })}>Odznacz wszystkie</Button>
            </Box>
          </>
        )}

        {/* --- immich / gphotos: link --- */}
        {isGallery && (
          <TextField
            label={widget.kind === 'gphotos' ? 'Publiczny link Google Photos' : 'Publiczny link do albumu Immich'}
            size="small"
            fullWidth
            placeholder={widget.kind === 'gphotos' ? 'https://photos.app.goo.gl/...' : 'https://immich.../share/...'}
            value={cfg.shareUrl ?? ''}
            onChange={(e) => patch({ shareUrl: e.target.value.trim() })}
            sx={{ mb: 2 }}
          />
        )}

        {/* --- gphotos: tryb + wybór zdjęć --- */}
        {widget.kind === 'gphotos' && (
          <>
            <FormControl sx={{ mb: 1.5 }}>
              <FormLabel sx={{ fontSize: 13 }}>Sposób wyświetlania</FormLabel>
              <RadioGroup
                row
                value={gMode}
                onChange={(e) => patch({ mode: e.target.value as 'random' | 'single' })}
              >
                <FormControlLabel value="random" control={<Radio size="small" />} label="Losowo z wybranych" />
                <FormControlLabel value="single" control={<Radio size="small" />} label="Tylko jeden plik" />
              </RadioGroup>
            </FormControl>

            {cfg.shareUrl ? (
              <>
                <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                  {gMode === 'single' ? 'Wybierz jeden plik' : 'Wybierz pliki (puste = wszystkie)'}
                </Typography>
                {gimgs === null && <CenterSpin />}
                {gimgs && gimgs.length === 0 && <Typography variant="body2" sx={{ opacity: 0.6 }}>Brak zdjęć / błędny link.</Typography>}
                {gimgs && gimgs.length > 0 && (
                  <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))', gap: 0.75, maxHeight: 260, overflowY: 'auto', p: 0.5 }}>
                    {gimgs.map((base, i) => {
                      const on = gMode === 'single' ? gSelected[0] === i : gSelected.length === 0 || gSelected.includes(i);
                      return (
                        <Box
                          key={base}
                          onClick={() => toggleImg(i)}
                          sx={{
                            position: 'relative',
                            aspectRatio: '1 / 1',
                            borderRadius: 1.5,
                            overflow: 'hidden',
                            cursor: 'pointer',
                            outline: on ? '3px solid #6f8cff' : '3px solid transparent',
                            outlineOffset: -3,
                            opacity: on ? 1 : 0.5,
                            transition: 'opacity .15s, outline-color .15s',
                          }}
                        >
                          <Box component="img" loading="lazy" src={gphotoSrc(base, 'w160-h160')} sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          {on && (
                            <Box sx={{ position: 'absolute', top: 2, right: 2, width: 18, height: 18, borderRadius: '50%', background: '#6f8cff', display: 'grid', placeItems: 'center' }}>
                              <Box sx={{ width: 8, height: 8, borderRadius: '50%', background: '#fff' }} />
                            </Box>
                          )}
                        </Box>
                      );
                    })}
                  </Box>
                )}
              </>
            ) : (
              <Typography variant="body2" sx={{ opacity: 0.6 }}>Podaj link, aby wybrać zdjęcia.</Typography>
            )}
          </>
        )}

        {/* --- rss: wiele kanałów + ilość --- */}
        {widget.kind === 'rss' && (
          <>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>Kanały (zakładki)</Typography>
            {rssFeeds.map((feed, i) => (
              <Box key={i} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'flex-start' }}>
                <TextField
                  label="Nazwa"
                  size="small"
                  sx={{ width: 130 }}
                  value={feed.name ?? ''}
                  onChange={(e) => updateFeed(i, { name: e.target.value })}
                />
                <TextField
                  label="URL kanału RSS / Atom"
                  size="small"
                  fullWidth
                  placeholder="https://example.com/feed.xml"
                  value={feed.url}
                  onChange={(e) => updateFeed(i, { url: e.target.value.trim() })}
                />
                <IconButton size="small" onClick={() => removeFeed(i)} sx={{ mt: 0.5, color: '#ff6b6b' }}><DeleteIcon fontSize="small" /></IconButton>
              </Box>
            ))}
            <Button size="small" startIcon={<AddIcon />} onClick={() => patch({ rssFeeds: [...rssFeeds, { url: '' }] })} sx={{ mb: 2 }}>
              Dodaj kanał
            </Button>
            <TextField
              label="Ilość elementów na kanał"
              size="small"
              type="number"
              fullWidth
              inputProps={{ min: 1, max: 50 }}
              value={cfg.rssCount ?? 10}
              onChange={(e) => patch({ rssCount: Math.max(1, Math.min(50, parseInt(e.target.value, 10) || 10)) })}
            />
          </>
        )}

        {/* --- clock: analog / cyfrowy + cyfry --- */}
        {widget.kind === 'clock' && (
          <>
            <FormControl sx={{ mb: 1 }}>
              <FormLabel sx={{ fontSize: 13 }}>Rodzaj zegara</FormLabel>
              <RadioGroup
                row
                value={cfg.clockMode ?? 'analog'}
                onChange={(e) => patch({ clockMode: e.target.value as 'analog' | 'digital' })}
              >
                <FormControlLabel value="analog" control={<Radio size="small" />} label="Analogowy" />
                <FormControlLabel value="digital" control={<Radio size="small" />} label="Cyfrowy" />
              </RadioGroup>
            </FormControl>
            {(cfg.clockMode ?? 'analog') === 'analog' && (
              <FormControlLabel
                control={<Checkbox size="small" checked={cfg.clockNumbers ?? false} onChange={(e) => patch({ clockNumbers: e.target.checked })} />}
                label="Pokaż cyfry godzin"
              />
            )}
          </>
        )}

        {/* --- weather: miasto --- */}
        {widget.kind === 'weather' && (
          <TextField
            label="Miasto"
            size="small"
            fullWidth
            placeholder="np. Warszawa"
            value={cfg.weatherCity ?? ''}
            onChange={(e) => patch({ weatherCity: e.target.value })}
            helperText="Dane z Open-Meteo (bez klucza API)."
          />
        )}

        {/* --- contacts: lista --- */}
        {widget.kind === 'contacts' && (
          <>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>Kontakty</Typography>
            {contacts.map((c, i) => (
              <Box key={i} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'flex-start' }}>
                <TextField
                  label="Imię i nazwisko"
                  size="small"
                  sx={{ flex: 1 }}
                  value={c.name}
                  onChange={(e) => updateContact(i, { name: e.target.value })}
                />
                <TextField
                  label="Telefon / e-mail"
                  size="small"
                  sx={{ flex: 1 }}
                  value={c.detail ?? ''}
                  onChange={(e) => updateContact(i, { detail: e.target.value })}
                />
                <IconButton size="small" onClick={() => removeContact(i)} sx={{ mt: 0.5, color: '#ff6b6b' }}><DeleteIcon fontSize="small" /></IconButton>
              </Box>
            ))}
            <Button size="small" startIcon={<AddIcon />} onClick={() => patch({ contacts: [...contacts, { name: '', detail: '' }] })}>
              Dodaj kontakt
            </Button>
          </>
        )}

        {widget.kind === 'drive-fav' && (
          <Typography variant="body2" sx={{ opacity: 0.6 }}>
            Ten widget pokazuje pliki oznaczone gwiazdką w Drive. Dodatkowa konfiguracja nie jest potrzebna.
          </Typography>
        )}

        {/* --- component: wybór komponentu po nazwie z Programming/Components --- */}
        {widget.kind === 'component' && (
          <>
            <FormControl fullWidth size="small">
              <InputLabel id="pulpit-component-label">Komponent</InputLabel>
              <Select
                labelId="pulpit-component-label"
                label="Komponent"
                value={compList && compList.some((c) => c.id === cfg.componentId) ? (cfg.componentId ?? '') : ''}
                onChange={(e) => patch({ componentId: e.target.value || undefined })}
              >
                {(compList ?? []).map((c) => (
                  <MenuItem key={c.id} value={c.id}>{c.name} <Box component="span" sx={{ opacity: 0.5, ml: 1, fontSize: 12 }}>({c.path})</Box></MenuItem>
                ))}
              </Select>
            </FormControl>
            {compList !== null && compList.length === 0 && (
              <Typography variant="body2" sx={{ opacity: 0.6, mt: 1 }}>
                Brak komponentów. Dodaj je w Programming → Components.
              </Typography>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Anuluj</Button>
        <Button variant="contained" onClick={() => { onSave(cfg); onClose(); }}>Zapisz</Button>
      </DialogActions>
    </Dialog>
  );
}

/* ================================================================== *
 *  Widget frame (chrome: uchwyt, ⚙, usuń, resize)
 * ================================================================== */
function WidgetFrame({
  widget,
  custom,
  userName,
  onDragStart,
  onDelete,
  onSettings,
}: {
  widget: WidgetInstance;
  custom: boolean;
  userName: string;
  onDragStart: (
    e: React.PointerEvent,
    spec: { mode: 'move'; id: string } | { mode: 'resize'; id: string; corner: 'nw' | 'ne' | 'sw' | 'se' },
  ) => void;
  onDelete: () => void;
  onSettings: () => void;
}) {
  const pal = usePal();
  const meta = WIDGET_META[widget.kind];
  // Pełny ekran realizujemy stylami tej samej ramki (fixed inset 0), a nie
  // przeniesieniem treści do dialogu — dzięki temu widget nie jest odmontowywany
  // i zachowuje swój stan (np. trwającą rozmowę z Aurą).
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullscreen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen]);
  const CORNERS: ('nw' | 'ne' | 'sw' | 'se')[] = ['nw', 'ne', 'sw', 'se'];
  const cornerPos: Record<string, object> = {
    nw: { top: -5, left: -5, cursor: 'nwse-resize' },
    ne: { top: -5, right: -5, cursor: 'nesw-resize' },
    sw: { bottom: -5, left: -5, cursor: 'nesw-resize' },
    se: { bottom: -5, right: -5, cursor: 'nwse-resize' },
  };

  return (
    <Box
      sx={{
        ...(fullscreen
          ? { position: 'fixed', inset: 0, width: 'auto', height: 'auto', zIndex: (t: { zIndex: { modal: number } }) => t.zIndex.modal }
          : { position: 'absolute', left: widget.x, top: widget.y, width: widget.w, height: widget.h }),
        display: 'flex',
        flexDirection: 'column',
        borderRadius: fullscreen ? 0 : '18px',
        border: fullscreen ? 'none' : '1px solid',
        borderColor: custom ? pal.borderStrong : pal.border,
        background: pal.card,
        // backdrop-filter tworzy containing block — na pełnym ekranie zbędny,
        // a tło i tak zasłania cały ekran.
        backdropFilter: fullscreen ? 'none' : 'blur(14px)',
        boxShadow: custom
          ? '0 18px 48px -18px rgba(80,110,255,0.55)'
          : pal.mode === 'dark' ? '0 16px 40px -20px rgba(0,0,0,0.7)' : '0 16px 40px -22px rgba(30,50,120,0.35)',
        transition: 'border-color .2s ease, box-shadow .2s ease',
      }}
    >
      {custom && !fullscreen && (
        <Box
          onPointerDown={(e) => onDragStart(e, { mode: 'move', id: widget.id })}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
            px: 1.25,
            py: 0.75,
            cursor: 'grab',
            userSelect: 'none',
            // touchAction: 'none' — kluczowe na mobile: bez tego przeglądarka
            // przechwytuje gest jako scroll/pinch i pointermove eventy przestają
            // przychodzić po ~5px ruchu palcem.
            touchAction: 'none',
            borderTopLeftRadius: '18px',
            borderTopRightRadius: '18px',
            borderBottom: `1px solid ${pal.subtle}`,
            background: pal.header,
            '&:active': { cursor: 'grabbing' },
          }}
        >
          <DragIcon sx={{ fontSize: 16, opacity: 0.5 }} />
          {meta.icon}
          <Typography variant="caption" sx={{ fontWeight: 700, flex: 1, opacity: 0.85 }} noWrap>
            {widget.config?.title || meta.title}
          </Typography>
          <Tooltip title="Ustawienia">
            <IconButton
              size="small"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={onSettings}
              sx={{ color: '#9db2ff', '&:hover': { background: 'rgba(120,150,255,0.15)' } }}
            >
              <SettingsIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Usuń widget">
            <IconButton
              size="small"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={onDelete}
              sx={{ color: '#ff6b6b', '&:hover': { background: 'rgba(255,107,107,0.12)' } }}
            >
              <CloseIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        </Box>
      )}

      <Box sx={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden', containerType: fullscreen ? 'normal' : 'size', borderRadius: fullscreen ? 0 : (custom ? '0 0 18px 18px' : '18px') }}>
        {widget.kind === 'pages' && <PagesWidget userName={userName} config={widget.config} />}
        {widget.kind === 'drive-fav' && <DriveFavWidget userName={userName} />}
        {widget.kind === 'immich' && <ImmichWidget config={widget.config} />}
        {widget.kind === 'gphotos' && <GPhotosWidget config={widget.config} />}
        {widget.kind === 'calendar' && <CalendarWidget userName={userName} config={widget.config} custom={custom} />}
        {widget.kind === 'rss' && <RssWidget config={widget.config} />}
        {widget.kind === 'clock' && <ClockWidget config={widget.config} />}
        {widget.kind === 'weather' && <WeatherWidget config={widget.config} />}
        {widget.kind === 'contacts' && <ContactsWidget config={widget.config} />}
        {widget.kind === 'component' && <ComponentWidget userName={userName} config={widget.config} />}
        {widget.kind === 'aura' && (
          <AuraWidget userName={userName} fullscreen={fullscreen} onToggleFullscreen={() => setFullscreen((f) => !f)} />
        )}
      </Box>

      {/* Resize handles — visible 12px marker w środku, niewidoczny 32x32 hitbox
          na zewnątrz żeby palec trafiał bez pixel-perfect precision. Bez tego
          na mobile praktycznie nie da się złapać narożnika (target ~44px). */}
      {custom && !fullscreen && CORNERS.map((c) => {
        const pos = cornerPos[c] as Record<string, number | string>;
        // Hitbox offset — rozciągnij hitbox 10px poza widget, ale wycentruj tak
        // żeby wizualny marker (12px) pozostał w tej samej pozycji.
        const hitboxOffset = -15; // -5 (marker offset) - 10 (hitbox padding)
        const hit: Record<string, number | string> = {};
        for (const [k, v] of Object.entries(pos)) {
          if (typeof v === 'number') hit[k] = hitboxOffset;
          else hit[k] = v;
        }
        return (
          <Box
            key={c}
            onPointerDown={(e) => { e.stopPropagation(); onDragStart(e, { mode: 'resize', id: widget.id, corner: c }); }}
            sx={{
              position: 'absolute',
              width: 32,
              height: 32,
              // touchAction: 'none' — jak wyżej, konieczne dla touch drag na mobile.
              touchAction: 'none',
              zIndex: 3,
              // Wizualny marker 12x12 wycentrowany w hitboxie 32x32.
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              ...hit,
              '&::after': {
                content: '""',
                width: 12,
                height: 12,
                borderRadius: '4px',
                background: '#6f8cff',
                border: '2px solid #fff',
                boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
              },
              cursor: pos.cursor,
            }}
          />
        );
      })}
    </Box>
  );
}

/* ================================================================== *
 *  Strona Pulpit
 * ================================================================== */
type DragState =
  | { mode: 'move'; id: string; startX: number; startY: number; ox: number; oy: number }
  | { mode: 'resize'; id: string; corner: 'nw' | 'ne' | 'sw' | 'se'; startX: number; startY: number; ox: number; oy: number; ow: number; oh: number };

export default function PulpitPage() {
  const params = useParams<{ userName: string }>();
  const userName = params.userName
    || (() => { try { return (JSON.parse(localStorage.getItem('minis_current_user') || '{}') as { name?: string }).name || ''; } catch { return ''; } })();

  const LS_KEY = `pulpit_layout_${userName}`;

  const [custom, setCustom] = useState(false);
  const [themeMode, setThemeMode] = useState<'dark' | 'light'>(() => {
    try { return localStorage.getItem(`pulpit_theme_${userName}`) === 'light' ? 'light' : 'dark'; } catch { return 'dark'; }
  });
  const [textScale, setTextScale] = useState<'small' | 'medium' | 'large'>(() => {
    try {
      const v = localStorage.getItem(`pulpit_textscale_${userName}`);
      return v === 'small' || v === 'large' ? v : 'medium';
    } catch { return 'medium'; }
  });
  const pal = useMemo(() => makePal(themeMode), [themeMode]);
  const muiTheme = useMemo(
    () => createTheme({
      palette: { mode: themeMode },
      // skalowanie tekstu (MUI przelicza wszystkie warianty względem base fontSize)
      typography: { fontSize: textScale === 'small' ? 12 : textScale === 'large' ? 16.5 : 14 },
    }),
    [themeMode, textScale],
  );
  const [barVisible, setBarVisible] = useState<boolean>(() => {
    try { return localStorage.getItem(`pulpit_bar_${userName}`) === '1'; } catch { return false; }
  });
  const [widgets, setWidgets] = useState<WidgetInstance[]>(() => {
    try {
      const raw = localStorage.getItem(`pulpit_layout_${userName}`);
      if (raw) {
        const parsed = JSON.parse(raw) as WidgetInstance[];
        if (Array.isArray(parsed) && parsed.length) return parsed;
      }
    } catch { /* ignore */ }
    return defaultLayout();
  });
  const [addAnchor, setAddAnchor] = useState<null | HTMLElement>(null);
  const [addPos, setAddPos] = useState<{ top: number; left: number } | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ mouseX: number; mouseY: number } | null>(null);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const { openNav } = useLayoutChrome();

  // Persystencja wyłącznie w localStorage (bez backendu).
  useEffect(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(widgets)); } catch { /* private */ }
  }, [widgets, LS_KEY]);

  useEffect(() => {
    try { localStorage.setItem(`pulpit_bar_${userName}`, barVisible ? '1' : '0'); } catch { /* private */ }
  }, [barVisible, userName]);

  useEffect(() => {
    try { localStorage.setItem(`pulpit_theme_${userName}`, themeMode); } catch { /* private */ }
  }, [themeMode, userName]);

  useEffect(() => {
    try { localStorage.setItem(`pulpit_textscale_${userName}`, textScale); } catch { /* private */ }
  }, [textScale, userName]);

  const patch = useCallback((id: string, next: Partial<WidgetInstance>) => {
    setWidgets((ws) => ws.map((w) => (w.id === id ? { ...w, ...next } : w)));
  }, []);

  const handleDragStart = useCallback(
    (e: React.PointerEvent, spec: { mode: 'move'; id: string } | { mode: 'resize'; id: string; corner: 'nw' | 'ne' | 'sw' | 'se' }) => {
      e.preventDefault();
      const w = widgets.find((x) => x.id === spec.id);
      if (!w) return;
      // setPointerCapture — kluczowe dla touch: kieruje wszystkie następne
      // pointer events do targetu nawet gdy palec wyjdzie poza jego bounding rect.
      // Bez tego szybki ruch palcem gubi pointermove eventy (browser odpina).
      try { (e.currentTarget as Element).setPointerCapture(e.pointerId); } catch { /* iOS pre-16 może nie wspierać na wszystkich elementach */ }
      if (spec.mode === 'move') {
        dragRef.current = { mode: 'move', id: spec.id, startX: e.clientX, startY: e.clientY, ox: w.x, oy: w.y };
      } else {
        dragRef.current = { mode: 'resize', id: spec.id, corner: spec.corner, startX: e.clientX, startY: e.clientY, ox: w.x, oy: w.y, ow: w.w, oh: w.h };
      }
    },
    [widgets],
  );

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const ds = dragRef.current;
      if (!ds) return;
      const dx = e.clientX - ds.startX;
      const dy = e.clientY - ds.startY;
      if (ds.mode === 'move') {
        patch(ds.id, { x: Math.max(0, snap(ds.ox + dx)), y: Math.max(0, snap(ds.oy + dy)) });
      } else {
        let { ox, oy, ow, oh } = ds;
        const east = ds.corner === 'ne' || ds.corner === 'se';
        const south = ds.corner === 'se' || ds.corner === 'sw';
        if (east) ow = Math.max(MIN_W, ds.ow + dx);
        else { ow = Math.max(MIN_W, ds.ow - dx); ox = ds.ox + (ds.ow - ow); }
        if (south) oh = Math.max(MIN_H, ds.oh + dy);
        else { oh = Math.max(MIN_H, ds.oh - dy); oy = ds.oy + (ds.oh - oh); }
        patch(ds.id, { x: Math.max(0, snap(ox)), y: Math.max(0, snap(oy)), w: snap(ow), h: snap(oh) });
      }
    };
    const onUp = () => { dragRef.current = null; };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [patch]);

  const addWidget = (kind: WidgetKind) => {
    const cat = WIDGET_CATALOG.find((c) => c.kind === kind)!;
    const offset = (widgets.length * 24) % 200;
    setWidgets((ws) => [
      ...ws,
      { id: `w-${kind}-${Date.now().toString(36)}`, kind, x: 40 + offset, y: 40 + offset, w: cat.w, h: cat.h },
    ]);
    setAddAnchor(null);
    setAddPos(null);
  };

  const settingsWidget = widgets.find((w) => w.id === settingsId) ?? null;

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setCtxMenu({ mouseX: e.clientX, mouseY: e.clientY });
  };

  return (
   <PalContext.Provider value={pal}>
   <ThemeProvider theme={muiTheme}>
    <Box
      onContextMenu={onContextMenu}
      sx={{
        height: '100%',
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        background: pal.bg,
        color: pal.text,
        userSelect: dragRef.current ? 'none' : 'auto',
      }}
    >
      {/* Pływający przycisk menu nawigacji (AppBar ukryty w hideChrome) */}
      {!barVisible && (
        <Tooltip title="Menu nawigacji">
          <IconButton
            onClick={openNav}
            sx={{
              position: 'absolute',
              top: 12,
              left: 12,
              zIndex: 6,
              color: pal.text,
              background: pal.mode === 'dark' ? 'rgba(30,34,50,0.7)' : 'rgba(255,255,255,0.75)',
              border: `1px solid ${pal.border}`,
              backdropFilter: 'blur(8px)',
              '&:hover': { background: pal.mode === 'dark' ? 'rgba(50,56,80,0.85)' : 'rgba(255,255,255,0.95)' },
            }}
          >
            <MenuIcon />
          </IconButton>
        </Tooltip>
      )}

      {/* Pasek narzędzi — domyślnie ukryty, przełączany z menu kontekstowego */}
      {barVisible && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            px: 2.5,
            py: 1.5,
            borderBottom: `1px solid ${pal.subtle}`,
            backdropFilter: 'blur(8px)',
          }}
        >
          <Tooltip title="Menu nawigacji">
            <IconButton size="small" onClick={openNav} sx={{ color: '#e8eaf2' }}><MenuIcon /></IconButton>
          </Tooltip>
          <DashboardIcon sx={{ color: '#8ea2ff' }} />
          <Typography variant="h6" sx={{ fontWeight: 800, letterSpacing: 0.3, mr: 1 }}>Pulpit</Typography>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={custom ? 'custom' : 'normal'}
            onChange={(_, v) => v && setCustom(v === 'custom')}
            sx={{
              '& .MuiToggleButton-root': { color: 'rgba(255,255,255,0.6)', borderColor: 'rgba(255,255,255,0.12)', textTransform: 'none', px: 1.75 },
              '& .Mui-selected': { color: '#fff !important', background: 'rgba(110,140,255,0.25) !important' },
            }}
          >
            <ToggleButton value="normal">Normalny</ToggleButton>
            <ToggleButton value="custom"><TuneIcon sx={{ fontSize: 16, mr: 0.5 }} /> Custom</ToggleButton>
          </ToggleButtonGroup>

          <Box sx={{ flex: 1 }} />

          {custom && (
            <Button
              variant="contained"
              size="small"
              startIcon={<AddIcon />}
              onClick={(e) => setAddAnchor(e.currentTarget)}
              sx={{
                textTransform: 'none',
                fontWeight: 700,
                background: 'linear-gradient(135deg, #6f8cff, #a06bff)',
                boxShadow: '0 8px 20px -8px rgba(120,110,255,0.8)',
                '&:hover': { background: 'linear-gradient(135deg, #5f7cff, #9057ff)' },
              }}
            >
              Dodaj widget
            </Button>
          )}
          <Tooltip title="Ukryj pasek">
            <IconButton size="small" onClick={() => setBarVisible(false)} sx={{ color: 'text.secondary' }}>
              <HideIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      )}

      {/* Kanwa z widgetami */}
      <Box
        sx={{
          flex: 1,
          position: 'relative',
          overflow: 'auto',
          ...(custom && {
            backgroundImage: `radial-gradient(${pal.subtle} 1px, transparent 1px)`,
            backgroundSize: `${GRID * 3}px ${GRID * 3}px`,
          }),
        }}
      >
        {widgets.length === 0 && (
          <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
            <Box>
              <DashboardIcon sx={{ fontSize: 56, opacity: 0.25, mb: 1 }} />
              <Typography sx={{ opacity: 0.6 }}>Pusty pulpit. Kliknij prawym przyciskiem → <b>Dodaj widget</b>.</Typography>
            </Box>
          </Box>
        )}
        {widgets.map((w) => (
          <WidgetFrame
            key={w.id}
            widget={w}
            custom={custom}
            userName={userName}
            onDragStart={handleDragStart}
            onDelete={() => setWidgets((ws) => ws.filter((x) => x.id !== w.id))}
            onSettings={() => setSettingsId(w.id)}
          />
        ))}
      </Box>

      {/* Menu „Dodaj widget" — anchor z paska (element) lub z PPM (pozycja) */}
      <Menu
        open={!!addAnchor || !!addPos}
        onClose={() => { setAddAnchor(null); setAddPos(null); }}
        {...(addPos
          ? { anchorReference: 'anchorPosition' as const, anchorPosition: addPos }
          : { anchorEl: addAnchor })}
      >
        {WIDGET_CATALOG.map((c) => (
          <MenuItem key={c.kind} onClick={() => addWidget(c.kind)}>
            <ListItemIcon>{c.icon}</ListItemIcon>
            <ListItemText>{c.label}</ListItemText>
          </MenuItem>
        ))}
      </Menu>

      {/* Menu kontekstowe (PPM) */}
      <Menu
        open={!!ctxMenu}
        onClose={() => setCtxMenu(null)}
        anchorReference="anchorPosition"
        anchorPosition={ctxMenu ? { top: ctxMenu.mouseY, left: ctxMenu.mouseX } : undefined}
      >
        <MenuItem onClick={() => { openNav(); setCtxMenu(null); }}>
          <ListItemIcon><MenuIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Menu nawigacji</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { setThemeMode((m) => (m === 'dark' ? 'light' : 'dark')); setCtxMenu(null); }}>
          <ListItemIcon>{themeMode === 'dark' ? <LightIcon fontSize="small" /> : <DarkIcon fontSize="small" />}</ListItemIcon>
          <ListItemText>{themeMode === 'dark' ? 'Motyw: jasny' : 'Motyw: ciemny'}</ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem disabled sx={{ opacity: '0.6 !important' }}>
          <ListItemIcon><TextSizeIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Rozmiar tekstu</ListItemText>
        </MenuItem>
        {([['small', 'Mały'], ['medium', 'Średni'], ['large', 'Duży']] as const).map(([val, label]) => (
          <MenuItem key={val} onClick={() => { setTextScale(val); setCtxMenu(null); }} sx={{ pl: 3 }}>
            <ListItemIcon>{textScale === val ? <CheckIcon fontSize="small" /> : null}</ListItemIcon>
            <ListItemText>{label}</ListItemText>
          </MenuItem>
        ))}
        <MenuItem onClick={() => { setBarVisible((v) => !v); setCtxMenu(null); }}>
          <ListItemIcon>{barVisible ? <HideIcon fontSize="small" /> : <ShowIcon fontSize="small" />}</ListItemIcon>
          <ListItemText>{barVisible ? 'Ukryj pasek narzędzi' : 'Pokaż pasek narzędzi'}</ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => { setCustom((v) => !v); setCtxMenu(null); }}>
          <ListItemIcon><TuneIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{custom ? 'Tryb: Custom (wyłącz)' : 'Tryb: Custom (włącz)'}</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => { setCustom(true); if (ctxMenu) setAddPos({ top: ctxMenu.mouseY, left: ctxMenu.mouseX }); setCtxMenu(null); }}
        >
          <ListItemIcon><AddIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Dodaj widget…</ListItemText>
        </MenuItem>
      </Menu>

      {/* Dialog ustawień widgetu */}
      {settingsWidget && (
        <WidgetSettingsDialog
          widget={settingsWidget}
          userName={userName}
          onClose={() => setSettingsId(null)}
          onSave={(cfg) => patch(settingsWidget.id, { config: cfg })}
        />
      )}
    </Box>
   </ThemeProvider>
   </PalContext.Provider>
  );
}
