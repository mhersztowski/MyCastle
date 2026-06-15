/**
 * GitRepoPanel — panel boczny Drive dla pliku `.repo.json`. Pokazuje stan
 * repozytorium git leżącego w katalogu pliku oraz akcje: wybór gałęzi/tagu
 * (checkout), Pull, Push, Clone (gdy katalog nie jest jeszcze clone'em).
 * Zawiera sekcję Diff oraz wybór tokena z SecretsService (namespace `git`).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box, Typography, Select, MenuItem, Button, Stack, Chip, Divider,
  CircularProgress, Alert, FormControl, InputLabel, Tooltip, IconButton,
  TextField, Accordion, AccordionSummary, AccordionDetails, Autocomplete,
  Link,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import DownloadIcon from '@mui/icons-material/Download';
import UploadIcon from '@mui/icons-material/Upload';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import SaveIcon from '@mui/icons-material/Save';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import KeyIcon from '@mui/icons-material/Key';
import { minisApi, type GitRepoStatusResponse } from '../../services/MinisApiService';

/** Namespace w SecretsService zarezerwowany dla tokenów git. */
const GIT_SECRETS_NS = 'git';

/** Sentinel oznaczający „working tree" — git diff <from> (bez <to>). */
const WORKING_TREE = '__working_tree__';
const WORKING_TREE_LABEL = 'Working tree (filesystem)';

/** Opcja „brak tokena". */
const NO_TOKEN = '__none__';
/** Opcja „wpisz ręcznie" — fallback dla starych repo z jawnym tokenem. */
const MANUAL_TOKEN = '__manual__';

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

const DIFF_BG: Record<DiffLineKind, string | undefined> = {
  add: '#1a3a1a', remove: '#3a1a1a', hunk: '#1a1a3a', meta: '#2a2a2a', normal: undefined,
};
const DIFF_FG: Record<DiffLineKind, string> = {
  add: '#6dcf6d', remove: '#cf6d6d', hunk: '#7b7bcf', meta: '#888', normal: '#d4d4d4',
};

const DiffViewer: React.FC<{ text: string }> = ({ text }) => (
  <Box sx={{ bgcolor: '#1e1e1e', borderRadius: 1, p: 1, fontFamily: 'monospace', fontSize: '0.68rem', overflow: 'auto', maxHeight: 480, whiteSpace: 'pre' }}>
    {text.split('\n').map((line, i) => {
      const kind = classifyDiffLine(line);
      return (
        <Box key={i} component="span" sx={{ display: 'block', bgcolor: DIFF_BG[kind], color: DIFF_FG[kind], px: 0.5 }}>
          {line || ' '}
        </Box>
      );
    })}
  </Box>
);

// ---------------------------------------------------------------------------
// GitRepoPanel
// ---------------------------------------------------------------------------
export const GitRepoPanel: React.FC<GitRepoPanelProps> = ({ userName, repoPath }) => {
  const [info, setInfo] = useState<GitRepoStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState<string>('');

  // URL
  const [urlDraft, setUrlDraft] = useState('');

  // Token source: NO_TOKEN | MANUAL_TOKEN | '{secretKey}'
  const [tokenSource, setTokenSource] = useState<string>(NO_TOKEN);
  const [manualToken, setManualToken] = useState('');
  const [secretKeys, setSecretKeys] = useState<string[]>([]);
  const [secretsLoading, setSecretsLoading] = useState(false);

  // Diff
  const [diffOpen, setDiffOpen] = useState(false);
  const [diffFrom, setDiffFrom] = useState('HEAD');
  const [diffTo, setDiffTo] = useState(WORKING_TREE);
  const [diffFile, setDiffFile] = useState('');
  const [diffFiles, setDiffFiles] = useState<string[]>([]);
  const [diffFilesLoading, setDiffFilesLoading] = useState(false);
  const [diffResult, setDiffResult] = useState<string | null>(null);
  const [diffBusy, setDiffBusy] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);

  const loadSecrets = useCallback(async () => {
    setSecretsLoading(true);
    try {
      const list = await minisApi.listSecrets(userName, GIT_SECRETS_NS);
      setSecretKeys(list.map((s) => s.key));
    } catch {
      setSecretKeys([]);
    } finally {
      setSecretsLoading(false);
    }
  }, [userName]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await minisApi.getGitInfo(userName, repoPath);
      setInfo(r);
      setUrlDraft(r.repo?.url ?? '');
      // Ustaw token source na podstawie zapisanego stanu
      if (r.repo?.tokenSecretKey) {
        setTokenSource(r.repo.tokenSecretKey);
      } else if (r.repo?.token) {
        setTokenSource(MANUAL_TOKEN);
      } else {
        setTokenSource(NO_TOKEN);
      }
      setManualToken('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [userName, repoPath]);

  useEffect(() => {
    void load();
    void loadSecrets();
  }, [load, loadSecrets]);

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

  const onSaveConfig = useCallback(async () => {
    setBusy('save');
    setError(null);
    setOutput('');
    try {
      const patch: Parameters<typeof minisApi.gitSaveRepo>[2] = { url: urlDraft.trim() };
      if (tokenSource === NO_TOKEN) {
        patch.token = '';
        patch.tokenSecretKey = null; // wyczyść oba
      } else if (tokenSource === MANUAL_TOKEN) {
        if (manualToken) patch.token = manualToken;
        patch.tokenSecretKey = null;
      } else {
        // tokenSource to klucz sekretu
        patch.tokenSecretKey = tokenSource;
        patch.token = '';
      }
      await minisApi.gitSaveRepo(userName, repoPath, patch);
      setOutput('Konfiguracja zapisana');
      setManualToken('');
      await load();
    } catch (e) {
      setError(`zapis: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }, [userName, repoPath, urlDraft, tokenSource, manualToken, load]);

  // Diff helpers
  const loadDiffFiles = useCallback(async (ref?: string) => {
    setDiffFilesLoading(true);
    try {
      setDiffFiles(await minisApi.gitListFiles(userName, repoPath, ref && ref !== WORKING_TREE ? ref : undefined));
    } catch {
      setDiffFiles([]);
    } finally {
      setDiffFilesLoading(false);
    }
  }, [userName, repoPath]);

  const onDiffAccordionChange = useCallback((_: React.SyntheticEvent, expanded: boolean) => {
    setDiffOpen(expanded);
    if (expanded && diffFiles.length === 0) void loadDiffFiles(diffFrom);
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
      const r = await minisApi.gitDiff(userName, repoPath, {
        from: diffFrom || 'HEAD',
        to: diffTo === WORKING_TREE ? undefined : (diffTo || undefined),
        file: diffFile || undefined,
      });
      if (!r.ok) setDiffError(r.diff);
      else setDiffResult(r.diff || '(brak różnic)');
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

  // Czy jest jakaś niezapisana zmiana w config tokena
  const savedSource = repo?.tokenSecretKey ?? (repo?.token ? MANUAL_TOKEN : NO_TOKEN);
  const tokenDirty = tokenSource !== savedSource || (tokenSource === MANUAL_TOKEN && !!manualToken);
  const configDirty = urlDirty || tokenDirty;

  const fromOptions = useMemo(() => Array.from(new Set(['HEAD', 'HEAD~1', 'HEAD~2', ...allBranches, ...(git?.tags ?? [])])), [allBranches, git?.tags]);
  const toOptions = useMemo(() => Array.from(new Set([WORKING_TREE, 'HEAD', 'HEAD~1', ...allBranches, ...(git?.tags ?? [])])), [allBranches, git?.tags]);

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

      {!loading && info && (
        <Box sx={{ mt: 1 }}>
          {/* URL */}
          <TextField
            label="URL repozytorium (git)" size="small" fullWidth
            placeholder="https://github.com/uzytkownik/repo.git"
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            disabled={anyBusy}
            sx={{ mb: 1.5 }}
          />

          {/* Token source */}
          <FormControl fullWidth size="small" sx={{ mb: 0.5 }}>
            <InputLabel id="token-source-label">
              <Stack direction="row" spacing={0.5} alignItems="center" component="span">
                <KeyIcon sx={{ fontSize: 14 }} />
                <span>Token (z Secrets)</span>
              </Stack>
            </InputLabel>
            <Select
              labelId="token-source-label"
              label="Token (z Secrets)"
              value={tokenSource}
              onChange={(e) => setTokenSource(e.target.value)}
              disabled={anyBusy || secretsLoading}
            >
              <MenuItem value={NO_TOKEN}><em>— brak tokena —</em></MenuItem>
              {secretKeys.map((k) => (
                <MenuItem key={k} value={k}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <KeyIcon sx={{ fontSize: 14, color: 'success.main' }} />
                    <span>{k}</span>
                  </Stack>
                </MenuItem>
              ))}
              <MenuItem value={MANUAL_TOKEN}>
                <em>Wpisz ręcznie…</em>
              </MenuItem>
            </Select>
          </FormControl>

          {secretKeys.length === 0 && !secretsLoading && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1, pl: 0.5 }}>
              Brak sekretów w namespace <code>git</code>.{' '}
              <Link href="#" underline="hover" onClick={(e) => { e.preventDefault(); window.location.hash = 'settings'; }}>
                Dodaj w Settings → Secrets
              </Link>
            </Typography>
          )}

          {tokenSource === MANUAL_TOKEN && (
            <TextField
              label="Token (PAT)" size="small" fullWidth type="password"
              placeholder={repo?.token === '***' ? 'token zapisany — wpisz nowy aby zmienić' : 'ghp_…'}
              value={manualToken}
              onChange={(e) => setManualToken(e.target.value)}
              disabled={anyBusy}
              sx={{ mt: 1, mb: 1 }}
            />
          )}

          {tokenSource !== NO_TOKEN && tokenSource !== MANUAL_TOKEN && (
            <Chip
              size="small" color="success" variant="outlined"
              icon={<KeyIcon sx={{ fontSize: 14 }} />}
              label={`Sekret: ${tokenSource}`}
              sx={{ mt: 0.5, mb: 1 }}
            />
          )}

          <Button
            variant={configDirty ? 'contained' : 'outlined'}
            color={configDirty ? 'warning' : 'primary'}
            startIcon={<SaveIcon />} size="small"
            onClick={onSaveConfig}
            disabled={anyBusy || !urlDraft.trim() || !configDirty}
            sx={{ mt: 0.5 }}
          >
            {busy === 'save' ? 'Zapisywanie…' : 'Zapisz konfigurację'}
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
              <Button variant="contained" startIcon={<CloudDownloadIcon />} onClick={onClone} disabled={anyBusy || !repo?.url}>
                {busy === 'clone' ? 'Klonowanie…' : 'Clone'}
              </Button>
            </Box>
          ) : (
            <>
              <Divider sx={{ my: 1.5 }} />

              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
                {currentBranch && <Chip size="small" color="primary" label={`branch: ${currentBranch}`} />}
                {currentTag && <Chip size="small" color="secondary" label={`tag: ${currentTag}`} />}
                {git?.status && (git.status.ahead > 0 || git.status.behind > 0) && (
                  <Chip size="small" variant="outlined" label={`↑${git.status.ahead} ↓${git.status.behind}`} />
                )}
                {git?.status?.dirty && <Chip size="small" color="warning" label="zmiany lokalne" />}
                {git?.status?.commit && <Chip size="small" variant="outlined" label={git.status.commit} />}
              </Stack>

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

              <FormControl fullWidth size="small" sx={{ mb: 1.5 }} disabled={!(git?.tags?.length)}>
                <InputLabel id="git-tag-label">Tag</InputLabel>
                <Select
                  labelId="git-tag-label" label="Tag"
                  value={currentTag && git?.tags?.includes(currentTag) ? currentTag : ''}
                  onChange={(e) => e.target.value && onCheckoutTag(String(e.target.value))}
                  disabled={anyBusy || !(git?.tags?.length)}
                >
                  {(git?.tags ?? []).map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                </Select>
              </FormControl>

              <Stack direction="row" spacing={1} sx={{ mb: 1.5 }}>
                <Button variant="outlined" startIcon={<DownloadIcon />} onClick={onPull} disabled={anyBusy} fullWidth>
                  {busy === 'pull' ? 'Pull…' : 'Pull'}
                </Button>
                <Button variant="contained" startIcon={<UploadIcon />} onClick={onPush} disabled={anyBusy} fullWidth>
                  {busy === 'push' ? 'Push…' : 'Push'}
                </Button>
              </Stack>

              {/* ---- Sekcja Diff ---- */}
              <Accordion
                expanded={diffOpen} onChange={onDiffAccordionChange} disableGutters
                sx={{ bgcolor: 'transparent', border: '1px solid', borderColor: 'divider', borderRadius: 1, '&:before': { display: 'none' }, mt: 0.5 }}
              >
                <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 40, '& .MuiAccordionSummary-content': { my: 0.5 } }}>
                  <Stack direction="row" alignItems="center" spacing={0.75}>
                    <CompareArrowsIcon fontSize="small" color="action" />
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>Diff</Typography>
                  </Stack>
                </AccordionSummary>
                <AccordionDetails sx={{ pt: 1, pb: 1.5, px: 1.5 }}>
                  <Autocomplete
                    freeSolo options={fromOptions} value={diffFrom}
                    onInputChange={onDiffFromChange} size="small"
                    renderInput={(params) => <TextField {...params} label="From (ref / commit / branch)" placeholder="HEAD" sx={{ mb: 1 }} />}
                  />
                  <Autocomplete
                    freeSolo options={toOptions} value={diffTo}
                    getOptionLabel={(opt) => opt === WORKING_TREE ? WORKING_TREE_LABEL : opt}
                    onInputChange={(_e, value) => setDiffTo(value ?? WORKING_TREE)}
                    onChange={(_e, value) => setDiffTo(typeof value === 'string' ? value : WORKING_TREE)}
                    size="small"
                    renderOption={(props, opt) => (
                      <li {...props} key={opt}>
                        {opt === WORKING_TREE ? <Box component="span" sx={{ color: 'warning.main' }}>{WORKING_TREE_LABEL}</Box> : opt}
                      </li>
                    )}
                    renderInput={(params) => <TextField {...params} label="To (ref / branch / Working tree)" placeholder={WORKING_TREE_LABEL} sx={{ mb: 1 }} />}
                  />
                  <Autocomplete
                    freeSolo options={diffFiles} value={diffFile}
                    onInputChange={(_e, value) => setDiffFile(value ?? '')}
                    loading={diffFilesLoading} size="small"
                    renderInput={(params) => (
                      <TextField
                        {...params} label="Plik (opcjonalnie)" placeholder="src/index.ts"
                        InputProps={{ ...params.InputProps, endAdornment: <>{diffFilesLoading && <CircularProgress size={14} />}{params.InputProps.endAdornment}</> }}
                        sx={{ mb: 1.5 }}
                      />
                    )}
                  />
                  <Button
                    variant="contained" size="small" fullWidth onClick={onRunDiff} disabled={diffBusy || !diffFrom}
                    startIcon={diffBusy ? <CircularProgress size={14} color="inherit" /> : <CompareArrowsIcon />}
                  >
                    {diffBusy ? 'Porównuję…' : 'Run diff'}
                  </Button>
                  {diffError && <Alert severity="error" sx={{ mt: 1 }} onClose={() => setDiffError(null)}>{diffError}</Alert>}
                  {diffResult !== null && (
                    <Box sx={{ mt: 1 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                        {diffFrom} → {diffTo === WORKING_TREE ? WORKING_TREE_LABEL : diffTo}{diffFile ? ` · ${diffFile}` : ''}
                      </Typography>
                      <DiffViewer text={diffResult} />
                    </Box>
                  )}
                </AccordionDetails>
              </Accordion>
            </>
          )}

          {output && (
            <Box sx={{ mt: 1, p: 1, bgcolor: '#1e1e1e', color: '#d4d4d4', borderRadius: 1, fontFamily: 'monospace', fontSize: '0.72rem', whiteSpace: 'pre-wrap', maxHeight: 240, overflow: 'auto' }}>
              {output}
            </Box>
          )}
        </>
      )}
    </Box>
  );
};

export default GitRepoPanel;
