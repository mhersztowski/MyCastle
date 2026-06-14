/**
 * GitRepoPanel — panel boczny Drive dla pliku `.repo.json`. Pokazuje stan
 * repozytorium git leżącego w katalogu pliku oraz akcje: wybór gałęzi/tagu
 * (checkout), Pull, Push, Clone (gdy katalog nie jest jeszcze clone'em).
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Box, Typography, Select, MenuItem, Button, Stack, Chip, Divider,
  CircularProgress, Alert, FormControl, InputLabel, Tooltip, IconButton, TextField,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import DownloadIcon from '@mui/icons-material/Download';
import UploadIcon from '@mui/icons-material/Upload';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import SaveIcon from '@mui/icons-material/Save';
import { minisApi, type GitRepoStatusResponse } from '../../services/MinisApiService';

interface GitRepoPanelProps {
  userName: string;
  /** Ścieżka pliku `.repo.json` względem drive (np. `myrepo/.repo.json`). */
  repoPath: string;
}

export const GitRepoPanel: React.FC<GitRepoPanelProps> = ({ userName, repoPath }) => {
  const [info, setInfo] = useState<GitRepoStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState<string>('');
  // Edytowalna konfiguracja repo (URL + opcjonalny token HTTPS).
  const [urlDraft, setUrlDraft] = useState('');
  const [tokenDraft, setTokenDraft] = useState('');

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

  const git = info?.git;
  const repo = info?.repo;
  const isRepo = !!git?.isRepo;
  const urlDirty = !!info && urlDraft.trim() !== (repo?.url ?? '');
  // Lista gałęzi do wyboru: lokalne + zdalne (bez duplikatów).
  const allBranches = Array.from(new Set([...(git?.branches ?? []), ...(git?.remoteBranches ?? [])]));
  const currentBranch = git?.status?.branch ?? '';
  const currentTag = git?.status?.tag ?? '';
  const anyBusy = !!busy;

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
