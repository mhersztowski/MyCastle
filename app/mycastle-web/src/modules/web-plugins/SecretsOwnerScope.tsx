import React, { useEffect, useRef } from 'react';
import { getSecretsOwner, setSecretsOwner } from './secretsOwner';

/**
 * Overrides the plugin-secrets owner for its subtree — used by pages that
 * display another user's content (e.g. the cross-user Markdown viewer), so that
 * `api.secrets.get()` inside Plugin Script blocks resolves to that user's
 * shared secrets.
 *
 * The owner is set *synchronously during render* (not in an effect): child
 * effects run bottom-up, so a Plugin Script block's auto-run effect would
 * otherwise fire before this scope's effect and read the wrong owner. The
 * previous owner is restored on unmount.
 */
export function SecretsOwnerScope({
  owner,
  children,
}: {
  owner: string;
  children: React.ReactNode;
}): React.ReactElement {
  // Capture the owner active before this scope, once.
  const previous = useRef<string | null | undefined>(undefined);
  if (previous.current === undefined) {
    previous.current = getSecretsOwner();
  }
  // Set synchronously so children's mount-time effects observe the right owner.
  if (getSecretsOwner() !== owner) {
    setSecretsOwner(owner);
  }

  useEffect(() => {
    setSecretsOwner(owner);
    return () => setSecretsOwner(previous.current ?? null);
  }, [owner]);

  return <>{children}</>;
}
