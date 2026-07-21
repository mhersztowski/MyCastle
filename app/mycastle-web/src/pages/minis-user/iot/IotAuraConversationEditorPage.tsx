/**
 * IotAuraConversationEditorPage - Edytor Konwersacji (podstrona Aury).
 *
 * Graficzne tworzenie rodzajów konwersacji (Voice Actions) za pomocą Blockly.
 * Lewy panel: lista Voice Actions + edycja pól (name, tag, language,
 * activatorStrings, activatorsSimilarStringsArray) + warianty językowe.
 * Prawy panel: workspace Blockly wybranego wariantu (blocklyXml) + podgląd kodu.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Paper,
  IconButton,
  Button,
  TextField,
  List,
  ListItemButton,
  ListItemText,
  Chip,
  Divider,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Alert,
  Tooltip,
  CircularProgress,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import RecordVoiceOverIcon from '@mui/icons-material/RecordVoiceOver';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import { App } from '../../../App';
import {
  AuraBlocklyEditor,
  VfsFileDialog, VfsJsonQueryDialog,
  setVfsFilePicker, setVfsJsonPicker,
  setGlobalFunctionNames, extractGlobalFunctionNames,
  ShowComponentDialog, setShowComponentPicker,
} from '../../../modules/voiceactions';
import type { VoiceAction, VoiceActionVariant, WakeWord, VfsJsonQueryConfig, ShowComponentConfig } from '../../../modules/voiceactions';

const LANGUAGES = [
  { code: 'pl', label: 'Polski (pl)' },
  { code: 'en', label: 'English (en)' },
  { code: 'de', label: 'Deutsch (de)' },
  { code: 'es', label: 'Español (es)' },
];

const linesToArray = (s: string): string[] =>
  s.split('\n').map(x => x.trim()).filter(Boolean);
const arrayToLines = (a: string[]): string => (a || []).join('\n');

const IotAuraConversationEditorPage: React.FC = () => {
  const { userName } = useParams<{ userName: string }>();
  const navigate = useNavigate();
  const { voiceActionService } = App.instance;

  const [actions, setActions] = useState<VoiceAction[]>([]);
  const [variants, setVariants] = useState<VoiceActionVariant[]>([]);
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [codePreview, setCodePreview] = useState('');
  const [wakeWords, setWakeWords] = useState<WakeWord[]>([]);
  const [globalXml, setGlobalXml] = useState('');
  const [googleSearch, setGoogleSearch] = useState<{ apiKey?: string; cx?: string; serperKey?: string }>({ apiKey: '', cx: '' });
  const [fullscreen, setFullscreen] = useState(false);
  const GLOBAL_ID = '__global__';

  // Dialogi VFS (rejestrowane dla pól Blockly)
  const [fileDialog, setFileDialog] = useState<{ current: string; resolve: (p: string | null) => void } | null>(null);
  const [jsonDialog, setJsonDialog] = useState<{ current: VfsJsonQueryConfig | null; resolve: (c: VfsJsonQueryConfig | null) => void } | null>(null);
  const [componentDialog, setComponentDialog] = useState<{ current: ShowComponentConfig | null; resolve: (c: ShowComponentConfig | null) => void } | null>(null);

  const currentXmlRef = useRef('');

  // ---- Ładowanie ----
  useEffect(() => {
    if (!userName) return;
    setLoading(true);
    voiceActionService.loadConfig(userName).then(data => {
      setActions([...data.actions]);
      setVariants([...data.variants]);
      setWakeWords([...(data.wakeWords ?? [])]);
      setGlobalXml(data.globalXml ?? '');
      setGoogleSearch(data.googleSearch ?? { apiKey: '', cx: '' });
      setGlobalFunctionNames(extractGlobalFunctionNames(data.globalXml ?? ''));
      if (data.actions.length) {
        setSelectedActionId(data.actions[0].id);
        const firstVar = data.variants.find(v => v.voiceActionId === data.actions[0].id);
        setSelectedVariantId(firstVar?.id ?? null);
        currentXmlRef.current = firstVar?.blocklyXml ?? '';
      }
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userName]);

  const selectedAction = actions.find(a => a.id === selectedActionId) || null;
  const actionVariants = variants.filter(v => v.voiceActionId === selectedActionId);
  const selectedVariant = variants.find(v => v.id === selectedVariantId) || null;

  // ---- Wybór akcji ----
  const selectAction = useCallback((id: string) => {
    setSelectedActionId(id);
    const firstVar = variants.find(v => v.voiceActionId === id);
    setSelectedVariantId(firstVar?.id ?? null);
    currentXmlRef.current = firstVar?.blocklyXml ?? '';
  }, [variants]);

  const selectVariant = useCallback((id: string) => {
    // zapisz bieżący XML do poprzedniego wariantu przed przełączeniem
    setVariants(prev => prev.map(v => v.id === selectedVariantId ? { ...v, blocklyXml: currentXmlRef.current } : v));
    setSelectedVariantId(id);
    const v = variants.find(x => x.id === id);
    currentXmlRef.current = v?.blocklyXml ?? '';
  }, [selectedVariantId, variants]);

  // ---- CRUD akcji ----
  const addAction = useCallback(() => {
    const action = voiceActionService.addAction();
    const data = voiceActionService.getData();
    setActions([...data.actions]);
    setVariants([...data.variants]);
    setSelectedActionId(action.id);
    const v = data.variants.find(x => x.voiceActionId === action.id);
    setSelectedVariantId(v?.id ?? null);
    currentXmlRef.current = v?.blocklyXml ?? '';
    setDirty(true);
  }, [voiceActionService]);

  const patchAction = useCallback((patch: Partial<VoiceAction>) => {
    if (!selectedActionId) return;
    setActions(prev => prev.map(a => a.id === selectedActionId ? { ...a, ...patch, id: a.id } : a));
    setDirty(true);
  }, [selectedActionId]);

  const removeAction = useCallback(() => {
    if (!selectedActionId) return;
    setActions(prev => prev.filter(a => a.id !== selectedActionId));
    setVariants(prev => prev.filter(v => v.voiceActionId !== selectedActionId));
    setSelectedActionId(null);
    setSelectedVariantId(null);
    setDirty(true);
  }, [selectedActionId]);

  // ---- CRUD wariantów ----
  const addVariant = useCallback((language: string) => {
    if (!selectedActionId) return;
    const variant: VoiceActionVariant = {
      id: `vav-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      voiceActionId: selectedActionId,
      language,
      blocklyXml: '',
    };
    setVariants(prev => [...prev, variant]);
    setSelectedVariantId(variant.id);
    currentXmlRef.current = '';
    setDirty(true);
  }, [selectedActionId]);

  const removeVariant = useCallback((id: string) => {
    setVariants(prev => prev.filter(v => v.id !== id));
    if (selectedVariantId === id) {
      const next = actionVariants.find(v => v.id !== id);
      setSelectedVariantId(next?.id ?? null);
      currentXmlRef.current = next?.blocklyXml ?? '';
    }
    setDirty(true);
  }, [selectedVariantId, actionVariants]);

  // ---- Zmiana w Blockly ----
  const handleBlocklyChange = useCallback((xml: string, code: string) => {
    currentXmlRef.current = xml;
    setCodePreview(code);
    setDirty(true);
  }, []);

  // ---- Zapis całości ----
  const saveAll = useCallback(async () => {
    setSaving(true);
    setMessage(null);
    // zapisz bieżący XML do aktywnego wariantu
    const finalVariants = variants.map(v =>
      v.id === selectedVariantId ? { ...v, blocklyXml: currentXmlRef.current } : v,
    );
    try {
      const ok = await voiceActionService.saveConfig(userName, { type: 'voice_actions', actions, variants: finalVariants, wakeWords, globalXml, googleSearch });
      setVariants(finalVariants);
      setDirty(false);
      setMessage({ ok, text: ok ? 'Zapisano konwersacje.' : 'Błąd zapisu.' });
    } catch (err) {
      setMessage({ ok: false, text: `Błąd zapisu: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      setSaving(false);
    }
  }, [actions, variants, selectedVariantId, voiceActionService, userName, wakeWords, globalXml, googleSearch]);

  const globalMode = selectedActionId === GLOBAL_ID;
  const selectGlobal = useCallback(() => {
    setSelectedActionId(GLOBAL_ID);
    setSelectedVariantId(null);
  }, []);
  const handleGlobalChange = useCallback((xml: string) => {
    setGlobalXml(xml);
    setGlobalFunctionNames(extractGlobalFunctionNames(xml));
    setDirty(true);
  }, []);

  // Rejestracja dialogów VFS dla pól Blockly
  useEffect(() => {
    setVfsFilePicker((current) => new Promise<string | null>((resolve) => setFileDialog({ current, resolve })));
    setVfsJsonPicker((current) => new Promise<VfsJsonQueryConfig | null>((resolve) => setJsonDialog({ current, resolve })));
    setShowComponentPicker((current) => new Promise<ShowComponentConfig | null>((resolve) => setComponentDialog({ current, resolve })));
    return () => { setVfsFilePicker(null); setVfsJsonPicker(null); setShowComponentPicker(null); };
  }, []);

  // ---- Wake words (per język) ----
  const addWakeWord = useCallback(() => {
    setWakeWords(prev => [...prev, { language: 'pl', phrase: '' }]);
    setDirty(true);
  }, []);
  const updateWakeWord = useCallback((i: number, patch: Partial<WakeWord>) => {
    setWakeWords(prev => prev.map((w, idx) => (idx === i ? { ...w, ...patch } : w)));
    setDirty(true);
  }, []);
  const removeWakeWord = useCallback((i: number) => {
    setWakeWords(prev => prev.filter((_, idx) => idx !== i));
    setDirty(true);
  }, []);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 96px)' }}>
      {/* Nagłówek */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
        <Tooltip title="Wróć do Aury">
          <IconButton size="small" onClick={() => navigate(`/user/${userName}/iot/aura`)}><ArrowBackIcon /></IconButton>
        </Tooltip>
        <RecordVoiceOverIcon sx={{ color: '#7e57c2', fontSize: 30 }} />
        <Typography variant="h5" fontWeight={600} sx={{ flex: 1 }}>Edytor Konwersacji</Typography>
        {dirty && <Chip label="Niezapisane" size="small" color="warning" />}
        <Button variant="contained" size="small" startIcon={saving ? <CircularProgress size={16} /> : <SaveIcon />} onClick={saveAll} disabled={saving}>
          Zapisz
        </Button>
      </Box>

      {message && (
        <Alert severity={message.ok ? 'success' : 'error'} sx={{ mb: 1 }} onClose={() => setMessage(null)}>{message.text}</Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}><CircularProgress /></Box>
      ) : (
        <Box sx={{ display: 'flex', gap: 1.5, flex: 1, minHeight: 0 }}>
          {/* Lewy panel: lista + edycja akcji */}
          <Paper variant="outlined" sx={{ width: 340, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {/* Słowa aktywacyjne (wake word) per język */}
            <Box sx={{ p: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <Typography variant="subtitle2" fontWeight={600} sx={{ flex: 1 }}>Słowa aktywacyjne (Wake word)</Typography>
                <Tooltip title="Dodaj słowo aktywacyjne">
                  <IconButton size="small" onClick={addWakeWord}><AddIcon /></IconButton>
                </Tooltip>
              </Box>
              {wakeWords.length === 0 && (
                <Typography variant="caption" color="text.secondary">Brak — dodaj np. pl „hej aura", en „hey aura".</Typography>
              )}
              {wakeWords.map((w, i) => (
                <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 0.75 }}>
                  <FormControl size="small" sx={{ minWidth: 84 }}>
                    <Select value={w.language} onChange={e => updateWakeWord(i, { language: e.target.value })}>
                      {LANGUAGES.map(l => <MenuItem key={l.code} value={l.code}>{l.code}</MenuItem>)}
                    </Select>
                  </FormControl>
                  <TextField size="small" placeholder="słowo/fraza" value={w.phrase} onChange={e => updateWakeWord(i, { phrase: e.target.value })} sx={{ flex: 1 }} />
                  <IconButton size="small" onClick={() => removeWakeWord(i)}><DeleteIcon fontSize="small" /></IconButton>
                </Box>
              ))}
            </Box>
            <Divider />

            {/* Wyszukiwanie internetowe (bloczek „Wygoogluj") — Serper.dev (wyniki Google) */}
            <Box sx={{ p: 1 }}>
              <Typography variant="subtitle2" fontWeight={600} gutterBottom>Wygoogluj (Serper.dev)</Typography>
              <TextField
                size="small" fullWidth type="password" label="Serper.dev API key"
                value={googleSearch.serperKey || ''}
                onChange={e => { setGoogleSearch(g => ({ ...g, serperKey: e.target.value })); setDirty(true); }}
                autoComplete="off"
                helperText="Klucz z serper.dev (2500 zapytań za darmo, bez karty, wyniki Google)"
              />
            </Box>
            <Divider />

            <Box sx={{ display: 'flex', alignItems: 'center', p: 1, gap: 1 }}>
              <Typography variant="subtitle2" fontWeight={600} sx={{ flex: 1 }}>Voice Actions</Typography>
              <Tooltip title="Dodaj akcję">
                <IconButton size="small" onClick={addAction}><AddIcon /></IconButton>
              </Tooltip>
            </Box>
            <Divider />
            <List dense sx={{ maxHeight: 220, overflow: 'auto', flexShrink: 0 }}>
              <ListItemButton selected={globalMode} onClick={selectGlobal}>
                <ListItemText
                  primary="🌐 Global — funkcje globalne"
                  secondary="Definicje wspólne dla wszystkich akcji"
                  primaryTypographyProps={{ fontWeight: 600 }}
                />
              </ListItemButton>
              <Divider />
              {actions.length === 0 && (
                <Typography variant="caption" color="text.secondary" sx={{ p: 1.5, display: 'block' }}>
                  Brak akcji. Kliknij „+", aby utworzyć pierwszy typ konwersacji.
                </Typography>
              )}
              {actions.map(a => (
                <ListItemButton key={a.id} selected={a.id === selectedActionId} onClick={() => selectAction(a.id)}>
                  <ListItemText
                    primary={a.name}
                    secondaryTypographyProps={{ component: 'div' }}
                    secondary={
                      <>
                        {a.tag && <Chip label={a.tag} size="small" sx={{ mr: 0.5, height: 18 }} />}
                        <Typography component="span" variant="caption" color="text.secondary">{a.language}</Typography>
                      </>
                    }
                  />
                </ListItemButton>
              ))}
            </List>
            <Divider />

            {/* Edycja wybranej akcji / info o Global */}
            {globalMode ? (
              <Box sx={{ p: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  Definiuj tu <b>funkcje globalne</b> bloczkiem „🌐 Funkcja globalna" (kategoria „Definicje globalne").
                  Wywołasz je w dowolnej akcji bloczkiem „🌐 Wywołaj funkcję" / „🌐 Wynik funkcji".
                </Typography>
              </Box>
            ) : selectedAction ? (
              <Box sx={{ p: 1.5, overflow: 'auto', flex: 1, minHeight: 0 }}>
                <TextField
                  label="Nazwa" size="small" fullWidth sx={{ mb: 1.5 }}
                  value={selectedAction.name}
                  onChange={e => patchAction({ name: e.target.value })}
                />
                <TextField
                  label="Tag" size="small" fullWidth sx={{ mb: 1.5 }}
                  value={selectedAction.tag}
                  onChange={e => patchAction({ tag: e.target.value })}
                />
                <FormControl size="small" fullWidth sx={{ mb: 1.5 }}>
                  <InputLabel>Język</InputLabel>
                  <Select label="Język" value={selectedAction.language} onChange={e => patchAction({ language: e.target.value })}>
                    {LANGUAGES.map(l => <MenuItem key={l.code} value={l.code}>{l.label}</MenuItem>)}
                  </Select>
                </FormControl>
                <TextField
                  label="Aktywatory (dokładne — jedna sekwencja na linię)" size="small" fullWidth multiline minRows={2} sx={{ mb: 1.5 }}
                  value={arrayToLines(selectedAction.activatorStrings)}
                  onChange={e => patchAction({ activatorStrings: linesToArray(e.target.value) })}
                  helperText="Sekwencja słów, nie pojedyncze słowo, np. „włącz światło w salonie"
                />
                <TextField
                  label="Aktywatory podobne (rozmyte — po linii)" size="small" fullWidth multiline minRows={2} sx={{ mb: 1.5 }}
                  value={arrayToLines(selectedAction.activatorsSimilarStringsArray)}
                  onChange={e => patchAction({ activatorsSimilarStringsArray: linesToArray(e.target.value) })}
                />

                <Divider sx={{ my: 1 }} />
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <Typography variant="subtitle2" fontWeight={600} sx={{ flex: 1 }}>Warianty językowe</Typography>
                  <FormControl size="small" sx={{ minWidth: 90 }}>
                    <Select
                      displayEmpty value="" onChange={e => e.target.value && addVariant(e.target.value)}
                      renderValue={() => '+ dodaj'}
                    >
                      {LANGUAGES.map(l => <MenuItem key={l.code} value={l.code}>{l.label}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Box>
                <List dense>
                  {actionVariants.map(v => (
                    <ListItemButton key={v.id} selected={v.id === selectedVariantId} onClick={() => selectVariant(v.id)}>
                      <ListItemText primary={`Wariant: ${v.language}`} secondary={v.blocklyXml ? 'ma logikę' : 'pusty'} />
                      <IconButton size="small" edge="end" onClick={e => { e.stopPropagation(); removeVariant(v.id); }}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </ListItemButton>
                  ))}
                  {actionVariants.length === 0 && (
                    <Typography variant="caption" color="text.secondary" sx={{ px: 1 }}>Brak wariantów — dodaj wariant językowy.</Typography>
                  )}
                </List>

                <Divider sx={{ my: 1 }} />
                <Button color="error" size="small" startIcon={<DeleteIcon />} onClick={removeAction}>Usuń akcję</Button>
              </Box>
            ) : (
              <Box sx={{ p: 2, flex: 1 }}>
                <Typography variant="body2" color="text.secondary">Wybierz lub dodaj akcję głosową.</Typography>
              </Box>
            )}
          </Paper>

          {/* Prawy panel: Blockly + podgląd kodu */}
          <Box sx={fullscreen
            ? { position: 'fixed', inset: 0, zIndex: 1300, bgcolor: 'background.default', p: 1, display: 'flex', flexDirection: 'column', gap: 1 }
            : { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, gap: 1, position: 'relative' }}
          >
            <Tooltip title={fullscreen ? 'Zmniejsz edytor' : 'Rozciągnij edytor na cały ekran'}>
              <IconButton
                size="small"
                onClick={() => setFullscreen(f => !f)}
                sx={{ position: 'absolute', top: fullscreen ? 12 : 6, right: fullscreen ? 12 : 6, zIndex: 5, bgcolor: 'background.paper', boxShadow: 1, '&:hover': { bgcolor: 'background.paper' } }}
              >
                {fullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
              </IconButton>
            </Tooltip>
            {globalMode ? (
              <Paper variant="outlined" sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                <AuraBlocklyEditor
                  key="__global__"
                  global
                  initialXml={globalXml}
                  onChange={(xml) => handleGlobalChange(xml)}
                />
              </Paper>
            ) : selectedVariant ? (
              <>
                <Paper variant="outlined" sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                  <AuraBlocklyEditor
                    key={selectedVariant.id}
                    initialXml={selectedVariant.blocklyXml}
                    onChange={handleBlocklyChange}
                  />
                </Paper>
                <Paper variant="outlined" sx={{ height: 140, overflow: 'auto', p: 1, bgcolor: 'grey.900' }}>
                  <Typography variant="caption" sx={{ color: 'grey.400' }}>Podgląd logiki (kod):</Typography>
                  <Box component="pre" sx={{ m: 0, color: 'grey.100', fontFamily: 'monospace', fontSize: 12, whiteSpace: 'pre-wrap' }}>
                    {codePreview || '// Przeciągnij bloczki, aby zbudować konwersację...'}
                  </Box>
                </Paper>
              </>
            ) : (
              <Paper variant="outlined" sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Typography variant="body1" color="text.secondary">
                  {selectedAction ? 'Dodaj lub wybierz wariant językowy, aby edytować konwersację w Blockly.' : 'Wybierz akcję po lewej.'}
                </Typography>
              </Paper>
            )}
          </Box>
        </Box>
      )}

      {/* Dialogi VFS wołane z pól Blockly */}
      <VfsFileDialog
        open={!!fileDialog}
        current={fileDialog?.current || ''}
        onClose={(p) => { fileDialog?.resolve(p); setFileDialog(null); }}
      />
      <VfsJsonQueryDialog
        open={!!jsonDialog}
        current={jsonDialog?.current || null}
        onClose={(c) => { jsonDialog?.resolve(c); setJsonDialog(null); }}
      />
      <ShowComponentDialog
        open={!!componentDialog}
        userName={userName || ''}
        initial={componentDialog?.current || null}
        onCancel={() => { componentDialog?.resolve(null); setComponentDialog(null); }}
        onConfirm={(cfg) => { componentDialog?.resolve(cfg); setComponentDialog(null); }}
      />
    </Box>
  );
};

export default IotAuraConversationEditorPage;
