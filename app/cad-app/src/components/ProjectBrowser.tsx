import { IconButton, Tooltip } from '@mui/material';
import ViewInArIcon from '@mui/icons-material/ViewInAr';
import VrpanoIcon from '@mui/icons-material/Vrpano';
import type { Project } from '@mhersztowski/core-cad';
import { loadProjectFromText } from '../io/CadExporter';
import { CAD_EXT, SCENE_EXT, readFileAt, writeFileAt } from '../vfs/cadProjectApi';
import { ServerFileBrowser } from './ServerFileBrowser';

interface Props {
  open: boolean;
  /** 'open' = choose a project to load; 'save' = choose/enter name to save */
  mode: 'open' | 'save';
  project: Project;
  onClose: () => void;
  /** Called after a successful open or save with the project name */
  onDone?: (name: string) => void;
}

/**
 * CAD project open/save dialog — a thin wrapper around {@link ServerFileBrowser}
 * that adds CAD-specific behaviour: loading via {@link loadProjectFromText} and
 * per-row viewer links. Scene3D files are handled by their own menu actions so
 * each file is opened / saved independently.
 */
export function ProjectBrowser({ open, mode, project, onClose, onDone }: Props) {
  async function handleOpen(dir: string, name: string) {
    const jsonText = await readFileAt(dir, name, CAD_EXT);
    loadProjectFromText(jsonText, project);
  }

  async function handleSave(dir: string, name: string) {
    await writeFileAt(dir, name, CAD_EXT, JSON.stringify(project.toJSON()));
  }

  return (
    <ServerFileBrowser
      open={open}
      mode={mode}
      title={mode === 'open' ? 'Open Project from Server' : 'Save Project to Server'}
      extension={CAD_EXT}
      companionExtensions={[SCENE_EXT]}
      storageKey="cad.projectBrowser.dir"
      onClose={onClose}
      onOpen={handleOpen}
      onSave={handleSave}
      onDone={onDone}
      renderFileActions={(dir, name) => (
        <>
          <Tooltip title="Open in Scene Viewer">
            <IconButton
              size="small"
              onClick={e => {
                e.stopPropagation();
                window.open(
                  `/viewer/scene/${encodeURIComponent(name)}?dir=${encodeURIComponent(dir)}`,
                  '_blank',
                );
              }}
              sx={{ color: 'primary.main' }}
            >
              <ViewInArIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Open in VR Viewer">
            <IconButton
              size="small"
              onClick={e => {
                e.stopPropagation();
                window.open(
                  `/viewer/vr/${encodeURIComponent(name)}?dir=${encodeURIComponent(dir)}`,
                  '_blank',
                );
              }}
              sx={{ color: '#ce93d8' }}
            >
              <VrpanoIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        </>
      )}
    />
  );
}
