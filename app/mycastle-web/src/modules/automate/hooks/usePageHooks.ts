/**
 * Hook do uruchamiania flow przy zmianie strony
 */

import { useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { pageHooksService } from './PageHooksService';
import { automateService } from '../services/AutomateService';
import { AutomateEngine } from '../engine/AutomateEngine';
import { useFilesystem } from '../../filesystem/FilesystemContext';
import { useNotification } from '../../notification';
import { mqttClient } from '../../mqttclient';

export const usePageHooks = () => {
  const location = useLocation();
  const { dataSource } = useFilesystem();
  const { notify } = useNotification();
  const lastRouteRef = useRef<string>('');
  const initializedRef = useRef(false);

  const executeHooksForRoute = useCallback(async (route: string) => {
    // Load config if not loaded
    if (!pageHooksService.isLoaded()) {
      await pageHooksService.loadConfig();
    }

    const hooks = pageHooksService.getHooksForRoute(route);
    if (hooks.length === 0) return;

    // Load flows
    const flows = await automateService.loadFlows();

    for (const hook of hooks) {
      const flow = flows.find(f => f.id === hook.flowId);
      if (!flow) {
        console.warn(`[PageHooks] Flow not found: ${hook.flowId}`);
        continue;
      }

      console.log(`[PageHooks] Running flow "${flow.name}" for route ${route}`);

      try {
        // Check runtime - backend/universal flows go via MQTT
        if (flow.runtime === 'backend' || flow.runtime === 'universal') {
          await mqttClient.runAutomateFlow(flow.id);
        } else {
          // Client-side execution
          const engine = new AutomateEngine();
          const result = await engine.executeFlow(flow.toModel(), dataSource);

          // Process notifications
          for (const n of result.notifications) {
            notify(n.message, n.severity || 'info');
          }
        }
      } catch (err) {
        console.error(`[PageHooks] Error running flow ${hook.flowId}:`, err);
        notify(`Page hook error: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
      }
    }
  }, [dataSource, notify]);

  useEffect(() => {
    const currentRoute = location.pathname;

    // Skip if same route or initial render
    if (currentRoute === lastRouteRef.current) return;

    // Update last route
    lastRouteRef.current = currentRoute;

    // Skip first render to avoid running on app load
    if (!initializedRef.current) {
      initializedRef.current = true;
      // Still run hooks on initial page if user navigated directly
      executeHooksForRoute(currentRoute);
      return;
    }

    executeHooksForRoute(currentRoute);
  }, [location.pathname, executeHooksForRoute]);
};

export default usePageHooks;
