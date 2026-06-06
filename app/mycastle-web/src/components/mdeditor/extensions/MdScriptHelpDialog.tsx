/**
 * Help dialog for the Plugin Script block. Thin wrapper around `MdDocsDialog`
 * with the contents of `docs/MDScript.md` (repo-root) bundled via Vite's `?raw`.
 *
 * Lazy-loaded by PluginScriptExtension so the docs only enter the chunk graph
 * when the user actually clicks the (?) icon.
 */

import React from 'react';
import MdDocsDialog from './MdDocsDialog';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — Vite handles the `?raw` suffix, but TS sees an unresolved module
import docsMarkdown from '../../../../../../docs/MDScript.md?raw';

export interface MdScriptHelpDialogProps {
  open: boolean;
  onClose: () => void;
}

const MdScriptHelpDialog: React.FC<MdScriptHelpDialogProps> = ({ open, onClose }) => (
  <MdDocsDialog
    open={open}
    onClose={onClose}
    title="Plugin Script — dokumentacja"
    accent="#7c4dff"
    markdown={docsMarkdown as string}
  />
);

export default MdScriptHelpDialog;
