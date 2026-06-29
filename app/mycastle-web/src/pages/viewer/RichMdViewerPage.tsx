import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Box, Typography, Button, CircularProgress, Alert } from '@mui/material';
import { ArrowBack as ArrowBackIcon, Edit as EditIcon } from '@mui/icons-material';
import { useMinimalTopBarSlot } from '../../components/MinimalTopBarContext';
import { useMqtt } from '../../modules/mqttclient/MqttContext';
import { useAuth } from '../../modules/auth';
import MdEditor from '../../components/mdeditor/MdEditor';

/**
 * RichMdViewerPage — read-only Markdown viewer using the real MdEditor
 * (editable=false), so documents render with all custom block extensions
 * (columns, info marks, event/plugin/automate blocks).
 *
 * Route: /viewer/md-rich/u/:userName/* — NOT behind RequireAuth. The `*` is a
 * drive-root-relative path (e.g. `public/foo.md`).
 *
 *   • Files under `public/` are fetched via the no-auth public Drive endpoint,
 *     so anonymous and other users can open them.
 *   • Other (private) files are owner-only and read over the authenticated MQTT
 *     filesystem.
 *
 * Editing is offered only to the owner (and admins); everyone else gets a pure,
 * non-editable view.
 */
const RichMdViewerPage: React.FC = () => {
  const { userName: ownerParam, '*': relParam } = useParams();
  const navigate = useNavigate();
  const { readFile, isConnected } = useMqtt();
  const { currentUser, isAdmin } = useAuth();

  const owner = ownerParam || '';
  const rel = relParam || '';
  const isPublic = rel.startsWith('public/');
  const isOwner = !!currentUser && (currentUser.name === owner || isAdmin);

  const [content, setContent] = useState<string>('');
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoaded(false);
      setError(null);
      try {
        if (isPublic) {
          // No-auth public endpoint — anonymous and other users can read it.
          const rest = rel.slice('public/'.length).split('/').map(encodeURIComponent).join('/');
          const url = `/public/drive/users/${encodeURIComponent(owner)}/${rest}`;
          const res = await fetch(url);
          if (!res.ok) throw new Error(res.status === 404 ? 'File not found' : `Failed to load (${res.status})`);
          const text = await res.text();
          if (!cancelled) { setContent(text); setLoaded(true); }
          return;
        }
        // Private file — owner only, over authenticated MQTT.
        if (!isOwner) throw new Error('This file is private.');
        if (!isConnected) return; // wait for the connection, effect re-runs
        const file = await readFile(`drive/${rel}`);
        if (!cancelled) { setContent(file.content); setLoaded(true); }
      } catch (err) {
        if (!cancelled) { setError(err instanceof Error ? err.message : 'Failed to load file'); setLoaded(true); }
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [owner, rel, isPublic, isOwner, isConnected, readFile]);

  const handleBack = () => navigate(-1);
  const handleEdit = () => navigate(`/editor/simple/drive/${rel}`);

  useMinimalTopBarSlot(
    <>
      <Button size="small" startIcon={<ArrowBackIcon />} onClick={handleBack} color="inherit" sx={{ mr: 1 }}>Back</Button>
      <Typography variant="body2" noWrap sx={{ flexGrow: 1, fontFamily: 'monospace', color: 'inherit' }}>
        {rel || 'No file selected'}
      </Typography>
      {isOwner && (
        <Button size="small" variant="outlined" startIcon={<EditIcon />} onClick={handleEdit} color="inherit">Edit</Button>
      )}
    </>,
    [rel, isOwner, handleBack, handleEdit],
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', paddingTop: 'env(safe-area-inset-top)' }}>
      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
      <Box sx={{ flexGrow: 1, overflow: 'auto', minHeight: 0, paddingBottom: 'env(safe-area-inset-bottom)', WebkitOverflowScrolling: 'touch' }}>
        {!loaded ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <CircularProgress />
          </Box>
        ) : (
          // key forces a fresh editor (initialContent is captured on mount).
          <MdEditor key={rel} initialContent={content} editable={false} filePath={rel} />
        )}
      </Box>
    </Box>
  );
};

export default RichMdViewerPage;
