/**
 * GitRepoPanel — panel boczny Drive dla pliku `.repo.json`. Pokazuje stan
 * repozytorium git leżącego w katalogu pliku oraz akcje: wybór gałęzi/tagu
 * (checkout), Pull, Push, Clone (gdy katalog nie jest jeszcze clone'em).
 * Zawiera sekcję Diff: porównanie dwóch refów lub refa z working tree (filesystemem backendu).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box, Typography, Select, MenuItem, Button, Stack, Chip, Divider,
  CircularProgress, Alert, FormControl, InputLabel, Tooltip, IconButton,
  TextField, Accordion, AccordionSummary, AccordionDetails, Autocomplete,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import DownloadIcon from '@mui/icons-material/Download';
import UploadIcon from '@mui/icons-material/Upload';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import SaveIcon from '@mui/icons-material/Save';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { minisApi, type GitRepoStatusResponse } from '../../services/MinisApiService';

/** Sentinel oznaczający „working tree" — git diff <from> (bez <to>). */
const WORKING_TREE = '__working_tree__';
const WORKING_TREE_LABEL = 'Working tree (filesystem)';

interface GitRepoPanelProps {
  userName: string;
  /** Ścieżka pliku `.repo.json` względem drive (np. `myrepo/.repo.json`). */
  repoPath: string;
}

// ---------------------------------------------------------------------------
// Kolorowanie diff output
// ---------------------------------------------------------------------------
type DiffLineKind = 'add' | 'remove' | 'hunk' | 'meta' | 'normal';

function classifyDiffLine(line: string): DiffLineKind {
  if (line.startsWith('+') && !line.startsWith('+++')) return 'add';
  if (line.startsWith('-') && !line.startsWith('---')) return 'remove';
  if (line.startsWith('@@')) return 'hunk';
  if (
    line.startsWith('diff --git') ||
    line.startsWith('index ') ||
    line.startsWith('--- ') ||
    line.startsWith('+++ ') ||
    line.startsWith('Binary')
  )
    return 'meta';
  return 'normal';
}

const DIFF_COLORS: Record<DiffLineKind, string | undefined> = {
  add: '#1a3a1a',
  remove: '#3a1a1a',
  hunk: '#1a1a3a',
  meta: '#2a2a2a',
  normal: undefined,
};
const DIFF_TEXT_COLORS: Record<DiffLineKind, string> = {
  add: '#6dcf6d',
  remove: '#cf6d6d',
  hunk: '#7b7bcf',
  meta: '#888',
  normal: '#d4d4d4',
};

const DiffViewer: React.FC<{ text: string }> = ({ text }) => {
  const lines = text.split('\n');
  return (
    <Box
      sx={{
        bgcolor: '#1e1e1e', borderRadius: 1, p: 1,
        fontFamily: 'monospace', fontSize: '0.68rem',
        overflow: 'auto', maxHeight: 480,
        whiteSpace: 'pre',
      }}
    >
      {lines.map((line, i) => {
        const kind = classifyDiffLine(line);
        return (
          <Box
            key={i}
            component="span"
            sx={{
              display: 'block',
              bgcolor: DIFF_COLORS[kind],
              color: DIFF_TEXT_COLORS[kind],
              px: 0.5,
            }}
          >
            {line || ' '}
          </Box>
        );
      })}
    </Box>
  );
};

// ---------------------------------------------------------------------------
// GitRepoPanel
// ---------------------------------------------------------------------------
export const GitRepoPanel: React.FC<GitRepoPanelProps> = ({ userName, repoPath }) => {
  const [info, setInfo] = useState<GitRepoStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState<string>('');
  // Edytowalna konfiguracja repo (URL + opcjonalny token HTTPS).
  const [urlDraft, setUrlDraft] = useState('');
  const [tokenDraft, setTokenDraft] = useState('');

  // --- Diff state ---
  const [diffOpen, setDiffOpen] = useState(false);
  const [diffFrom, setDiffFrom] = useState<string>('HEAD');
  const [diffTo, setDiffTo] = useState<string>(WORKING_TREE);
  const [diffFile, setDiffFile] = useState<string>('');
  const [diffFiles, setDiffFiles] = useState<string[]>([]);
  const [diffFilesLoading, setDiffFilesLoading] = useState(false);
  const [diffResult, setDiffResult] = useState<string | null>(null);
  const [diffBusy, setDiffBusy] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await minisApi.getGitInfo(userName, repoPath);
      setInfo(r);
      setUrlDraft(r.repo?.url ?? '');
      setTokenDraft('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [userName, repoPath]);

  useEffect(() => { void load(); }, [load]);

  /** Wykonuje operację git, pokazuje output i odświeża status. */
  const run = useCallback(async (label: string, fn: () => Promise<{ ok: boolean; output: string }>) => {
    setBusy(label);
    setError(null);
    setOutput('');
    try {
      const r = await fn();
      setOutput(r.output || (r.ok ? 'OK' : 'błąd'));
      if (!r.ok) setError(`${label}: ${r.output || 'błąd'}`);
      await load();
    } catch (e) {
      setError(`${label}: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }, [load]);

  const onCheckoutBranch = (ref: string) => run(`checkout ${ref}`, () => minisApi.gitCheckout(userName, repoPath, ref, 'branch'));
  const onCheckoutTag = (ref: string) => run(`checkout ${ref}`, () => minisApi.gitCheckout(userName, repoPath, ref, 'tag'));
  const onPull = () => run('pull', () => minisApi.gitPull(userName, repoPath));
  const onPush = () => run('push', () => minisApi.gitPush(userName, repoPath));
  const onClone = () => run('clone', () => minisApi.gitClone(userName, repoPath));

  /** Zapisuje URL (+ token) do `.repo.json`. */
  const onSaveConfig = useCallback(async () => {
    setBusy('save');
    setError(null);
    setOutput('');
    try {
      const patch: { url: string; token?: string } = { url: urlDraft.trim() };
      if (tokenDraft) patch.token = tokenDraft;
      await minisApi.gitSaveRepo(userName, repoPath, patch);
      setOutput('Zapisano konfigurację repo');
      setTokenDraft('');
      await load();
    } catch (e) {
      setError(`zapis: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }, [userName, repoPath, urlDraft, tokenDraft, load]);

  // --- Diff: ładowanie listy plików gdy sekcja jest otwarta ---
  const loadDiffFiles = useCallback(async (ref?: string) => {
    setDiffFilesLoading(true);
    try {
      const files = await minisApi.gitListFiles(userName, repoPath, ref && ref !== WORKING_TREE ? ref : undefined);
      setDiffFiles(files);
    } catch {
      setDiffFiles([]);
    } finally {
      setDiffFilesLoading(false);
    }
  }, [userName, repoPath]);

  const onDiffAccordionChange = useCallback((_: React.SyntheticEvent, expanded: boolean) => {
    setDiffOpen(expanded);
    if (expanded && diffFiles.length === 0) {
      void loadDiffFiles(diffFrom);
    }
  }, [diffFiles.length, diffFrom, loadDiffFiles]);

  const onDiffFromChange = useCallback((_: React.SyntheticEvent, value: string | null) => {
    const v = value ?? 'HEAD';
    setDiffFrom(v);
    setDiffFiles([]);
    setDiffFile('');
    void loadDiffFiles(v);
  }, [loadDiffFiles]);

  const onRunDiff = useCallback(async () => {
    setDiffBusy(true);
    setDiffError(null);
    setDiffResult(null);
    try {
      const opts: { from?: string; to?: string; file?: string } = {
        from: diffFrom || 'HEAD',
        to: diffTo === WORKING_TREE ? undefined : (diffTo || undefined),
        file: diffFile || undefined,
      };
      const r = await minisApi.gitDiff(userName, repoPath, opts);
      if (!r.ok) {
        setDiffError(r.diff);
      } else {
        setDiffResult(r.diff || '(brak różnic)');
      }
    } catch (e) {
      setDiffError((e as Error).message);
    } finally {
      setDiffBusy(false);
    }
  }, [userName, repoPath, diffFrom, diffTo, diffFile]);

  const git = info?.git;
  const repo = info?.repo;
  const isRepo = !!git?.isRepo;
  const urlDirty = !!info && urlDraft.trim() !== (repo?.url ?? '');
  const allBranches = Array.from(new Set([...(git?.branches ?? []), ...(git?.remoteBranches ?? [])]));
  const currentBranch = git?.status?.branch ?? '';
  const currentTag = git?.status?.tag ?? '';
  const anyBusy = !!busy;

  // Opcje "From" — HEAD + HEAD~N + gałęzie + tagi
  const fromOptions = useMemo(() => {
    const opts = ['HEAD', 'HEAD~1', 'HEAD~2', ...allBranches, ...(git?.tags ?? [])];
    return Array.from(new Set(opts));
  }, [allBranches, git?.tags]);

  // Opcje "To" — working tree (sentinel) + to samo co From
  const toOptions = useMemo(() => {
    const opts = [WORKING_TREE, 'HEAD', 'HEAD~1', ...allBranches, ...(git?.tags ?? [])];
    return Array.from(new Set(opts));
  }, [allBranches, git?.tags]);

  return (
    <Box sx={{ p: 2, height: '100%', overflow: 'auto' }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Repozytorium git</Typography>
        <Tooltip title="Odśwież">
          <span>
            <IconButton size="small" onClick={() => void load()} disabled={loading || anyBusy}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', wordBreak: 'break-all' }}>
        {repoPath}
      </Typography>

      {/* Konfiguracja: edytowalny URL repo + opcjonalny token (HTTPS). */}
      {!loading && info && (
        <Box sx={{ mt: 1 }}>
          <TextField
            label="URL repozytorium (git)" size="small" fullWidth
            placeholder="https://github.com/uzytkownik/repo.git"
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            disabled={anyBusy}
            sx={{ mb: 1 }}
          />
          <TextField
            label="Token (opcjonalnie, dla HTTPS push/pull)" size="small" fullWidth type="password"
            placeholder={repo?.token === '***' ? 'token zapisany — wpisz aby zmienić' : 'np. ghp_…'}
            value={tokenDraft}
            onChange={(e) => setTokenDraft(e.target.value)}
            disabled={anyBusy}
            sx={{ mb: 1 }}
          />
          <Button
            variant={urlDirty || tokenDraft ? 'contained' : 'outlined'}
            color={urlDirty || tokenDraft ? 'warning' : 'primary'}
            startIcon={<SaveIcon />} size="small"
            onClick={onSaveConfig}
            disabled={anyBusy || !urlDraft.trim() || (!urlDirty && !tokenDraft)}
          >
            {busy === 'save' ? 'Zapisywanie…' : 'Zapisz URL'}
          </Button>
        </Box>
      )}

      {loading && <Box sx={{ display: 'flex', justifyContent: 'center', my: 3 }}><CircularProgress size={24} /></Box>}

      {error && <Alert severity="error" sx={{ my: 1 }} onClose={() => setError(null)}>{error}</Alert>}

      {!loading && info && (
        <>
          {!isRepo ? (
            <Box sx={{ my: 2 }}>
              <Alert severity="info" sx={{ mb: 1 }}>
                Katalog nie jest jeszcze sklonowany. Kliknij „Clone", aby pobrać repozytorium z URL.
              </Alert>
              <Button
                variant="contained" startIcon={<CloudDownloadIcon />} onClick={onClone}
                disabled={anyBusy || !repo?.url}
              >
                {busy === 'clone' ? 'Klonowanie…' : 'Clone'}
              </Button>
            </Box>
          ) : (
            <>
              <Divider sx={{ my: 1.5 }} />

              {/* Stan bieżący */}
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
                {currentBranch && <Chip size="small" color="primary" label={`branch: ${currentBranch}`} />}
                {currentTag && <Chip size="small" color="secondary" label={`tag: ${currentTag}`} />}
                {git?.status && (git.status.ahead > 0 || git.status.behind > 0) && (
                  <Chip size="small" variant="outlined" label={`↑${git.status.ahead} ↓${git.status.behind}`} />
                )}
                {git?.status?.dirty && <Chip size="small" color="warning" label="zmiany lokalne" />}
                {git?.status?.commit && <Chip size="small" variant="outlined" label={git.status.commit} />}
              </Stack>

              {/* Wybór gałęzi */}
              <FormControl fullWidth size="small" sx={{ mb: 1.5 }}>
                <InputLabel id="git-branch-label">Gałąź (branch)</InputLabel>
                <Select
                  labelId="git-branch-label" label="Gałąź (branch)"
                  value={allBranches.includes(currentBranch) ? currentBranch : ''}
                  onChange={(e) => e.target.value && onCheckoutBranch(String(e.target.value))}
                  disabled={anyBusy}
                >
                  {allBranches.map((b) => (
                    <MenuItem key={b} value={b}>{b}{(git?.branches ?? []).includes(b) ? '' : '  (zdalna)'}</MenuItem>
                  ))}
                </Select>
              </FormControl>

              {/* Wybór tagu */}
              <FormControl fullWidth size="small" sx={{ mb: 1.5 }} disabled={!(git?.tags?.length)}>
                <InputLabel id="git-tag-label">Tag</InputLabel>
                <Select
                  labelId="git-tag-label" label="Tag"
                  value={currentTag && git?.tags?.includes(currentTag) ? currentTag : ''}
                  onChange={(e) => e.target.value && onCheckoutTag(String(e.target.value))}
                  disabled={anyBusy || !(git?.tags?.length)}
                >
                  {(git?.tags ?? []).map((t) => (
                    <MenuItem key={t} value={t}>{t}</MenuItem>
                  ))}
                </Select>
              </FormControl>

              {/* Akcje */}
              <Stack direction="row" spacing={1} sx={{ mb: 1.5 }}>
                <Button
                  variant="outlined" startIcon={<DownloadIcon />} onClick={onPull}
                  disabled={anyBusy} fullWidth
                >
                  {busy === 'pull' ? 'Pull…' : 'Pull'}
                </Button>
                <Button
                  variant="contained" startIcon={<UploadIcon />} onClick={onPush}
                  disabled={anyBusy} fullWidth
                >
                  {busy === 'push' ? 'Push…' : 'Push'}
                </Button>
              </Stack>

              {/* ---- Sekcja Diff ---- */}
              <Accordion
                expanded={diffOpen}
                onChange={onDiffAccordionChange}
                disableGutters
                sx={{
                  bgcolor: 'transparent',
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1,
                  '&:before': { display: 'none' },
                  mt: 0.5,
                }}
              >
                <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 40, '& .MuiAccordionSummary-content': { my: 0.5 } }}>
                  <Stack direction="row" alignItems="center" spacing={0.75}>
                    <CompareArrowsIcon fontSize="small" color="action" />
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>Diff</Typography>
                  </Stack>
                </AccordionSummary>

                <AccordionDetails sx={{ pt: 1, pb: 1.5, px: 1.5 }}>
                  {/* From */}
                  <Autocomplete
                    freeSolo
                    options={fromOptions}
                    value={diffFrom}
                    onInputChange={onDiffFromChange}
                    size="small"
                    renderInput={(params) => (
                      <TextField {...params} label="From (ref / commit / branch)" placeholder="HEAD" sx={{ mb: 1 }} />
                    )}
                  />

                  {/* To */}
                  <Autocomplete
                    freeSolo
                    options={toOptions}
                    value={diffTo}
                    getOptionLabel={(opt) => opt === WORKING_TREE ? WORKING_TREE_LABEL : opt}
                    onInputChange={(_e, value) => setDiffTo(value ?? WORKING_TREE)}
                    onChange={(_e, value) => setDiffTo(typeof value === 'string' ? value : WORKING_TREE)}
                    size="small"
                    renderOption={(props, opt) => (
                      <li {...props} key={opt}>
                        {opt === WORKING_TREE
                          ? <Box component="span" sx={{ color: 'warning.main' }}>{WORKING_TREE_LABEL}</Box>
                          : opt}
                      </li>
                    )}
                    renderInput={(params) => (
                      <TextField {...params} label="To (ref / branch / Working tree)" placeholder={WORKING_TREE_LABEL} sx={{ mb: 1 }} />
                    )}
                  />

                  {/* File filter */}
                  <Autocomplete
                    freeSolo
                    options={diffFiles}
                    value={diffFile}
                    onInputChange={(_e, value) => setDiffFile(value ?? '')}
                    loading={diffFilesLoading}
                    size="small"
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Plik (opcjonalnie)"
                        placeholder="src/index.ts"
                        InputProps={{
                          ...params.InputProps,
                          endAdornment: (
                            <>
                              {diffFilesLoading && <CircularProgress size={14} />}
                              {params.InputProps.endAdornment}
                            </>
                          ),
                        }}
                        sx={{ mb: 1.5 }}
                      />
                    )}
                  />

                  <Button
                    variant="contained"
                    startIcon={diffBusy ? <CircularProgress size={14} color="inherit" /> : <CompareArrowsIcon />}
                    size="small"
                    fullWidth
                    onClick={onRunDiff}
                    disabled={diffBusy || !diffFrom}
                  >
                    {diffBusy ? 'Porównuję…' : 'Run diff'}
                  </Button>

                  {diffError && (
                    <Alert severity="error" sx={{ mt: 1 }} onClose={() => setDiffError(null)}>
                      {diffError}
                    </Alert>
                  )}

                  {diffResult !== null && (
                    <Box sx={{ mt: 1 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                        {diffFrom} → {diffTo === WORKING_TREE ? WORKING_TREE_LABEL : diffTo}
                        {diffFile ? ` · ${diffFile}` : ''}
                      </Typography>
                      <DiffViewer text={diffResult} />
                    </Box>
                  )}
                </AccordionDetails>
              </Accordion>
            </>
          )}

          {output && (
            <Box
              sx={{
                mt: 1, p: 1, bgcolor: '#1e1e1e', color: '#d4d4d4', borderRadius: 1,
                fontFamily: 'monospace', fontSize: '0.72rem', whiteSpace: 'pre-wrap',
                maxHeight: 240, overflow: 'auto',
              }}
            >
              {output}
            </Box>
          )}
        </>
      )}
    </Box>
  );
};

export default GitRepoPanel;
