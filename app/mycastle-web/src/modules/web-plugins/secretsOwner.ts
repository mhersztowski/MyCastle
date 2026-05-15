/**
 * Module-level "current page owner" for plugin secrets.
 *
 * `api.secrets` is built once when a plugin loads, but the owner whose secrets
 * should be read/written changes as the user navigates (their own page vs.
 * another user's shared page). So `api.secrets` resolves the owner at call time
 * from this store instead of baking it in at load time.
 *
 * Writers:
 *  - PluginProvider — sets it to the logged-in user (the default).
 *  - SecretsOwnerScope — overrides it for a subtree that shows another user's
 *    content (e.g. the cross-user MD viewer), restoring the previous value on
 *    unmount.
 */
let currentOwner: string | null = null;

export function getSecretsOwner(): string | null {
  return currentOwner;
}

export function setSecretsOwner(owner: string | null): void {
  currentOwner = owner;
}
