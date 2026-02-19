/**
 * Model konfiguracji hooków stron
 * Pozwala podpiąć flow automatyzacji do konkretnych stron
 */

export interface PageHookModel {
  id: string;
  route: string;        // np. "/agent", "/calendar"
  flowId: string;       // ID flow z automations.json
  enabled: boolean;
  description?: string;
}

export interface PageHooksConfigModel {
  hooks: PageHookModel[];
}

export const DEFAULT_PAGE_HOOKS_CONFIG: PageHooksConfigModel = {
  hooks: [],
};
