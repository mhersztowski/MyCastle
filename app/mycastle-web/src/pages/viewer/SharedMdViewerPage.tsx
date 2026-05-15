import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Box, Typography, Button, CircularProgress, Alert } from '@mui/material';
import { ArrowBack as ArrowBackIcon } from '@mui/icons-material';
import { useMinimalTopBarSlot } from '../../components/MinimalTopBarContext';
import { useAuth } from '../../modules/auth';
import { SecretsOwnerScope, loadPlugins } from '../../modules/web-plugins';
import { MdEditor } from '../../components/mdeditor';

/**
 * Read-only viewer for another user's Markdown page (`/viewer/md/u/:userName/*`).
 *
 * Uses the full TipTap MdEditor (not the static renderer) so embedded Plugin
 * Script blocks still execute. Before rendering it:
 *  - loads the page owner's web plugins, so their Plugin Script namespaces
 *    (e.g. `immich`) are registered for the viewer;
 *  - wraps the editor in <SecretsOwnerScope> so `api.secrets.get()` inside those
 *    blocks resolves to the page owner's shared secrets.
 *
 * Result: a viewer sees the owner's gallery without re-logging into Immich.
 */
const SharedMdViewerPage: React.FC = () => {
  const { userName = '', '*': filePath = '' } = useParams();
  const navigate = useNavigate();
  const { token, isAdmin } = useAuth();

  const [content, setContent] = useState<string>('');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!userName || !filePath) {
        setError('Brak użytkownika lub ścieżki pliku');
        setReady(true);
        return;
      }
      try {
        setReady(false);
        setError(null);
        // Fetch the page content and load the owner's plugins in parallel.
        const [resp] = await Promise.all([
          fetch(
            `/api/users/${encodeURIComponent(userName)}/md/${filePath.split('/').map(encodeURIComponent).join('/')}`,
            { headers: token ? { Authorization: `Bearer ${token}` } : {} },
          ),
          loadPlugins(userName, token, isAdmin),
        ]);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = (await resp.json()) as { content: string };
        if (!cancelled) setContent(data.content);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Nie udało się wczytać pliku');
      } finally {
        if (!cancelled) setReady(true);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [userName, filePath, token, isAdmin]);

  useMinimalTopBarSlot(
    <>
      <Button size="small" startIcon={<ArrowBackIcon />} onClick={() => navigate(-1)} color="inherit" sx={{ mr: 1 }}>
        Wstecz
      </Button>
      <Typography variant="body2" noWrap sx={{ flexGrow: 1, fontFamily: 'monospace', color: 'inherit' }}>
        {userName}/{filePath}
      </Typography>
    </>,
    [userName, filePath, navigate],
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
      <Box sx={{ flexGrow: 1, overflow: 'auto', bgcolor: 'grey.50', minHeight: 0 }}>
        {!ready ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <CircularProgress />
          </Box>
        ) : error ? null : (
          <SecretsOwnerScope owner={userName}>
            <Box sx={{ maxWidth: 900, mx: 'auto', my: 2 }}>
              <MdEditor initialContent={content} editable={false} autoSaveDelay={0} />
            </Box>
          </SecretsOwnerScope>
        )}
      </Box>
    </Box>
  );
};

export default SharedMdViewerPage;
