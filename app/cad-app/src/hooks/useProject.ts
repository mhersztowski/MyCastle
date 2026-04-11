import { useCallback, useEffect, useState } from 'react';
import type { Project } from '@mhersztowski/core-cad';

// Returns a version counter that increments whenever the project changes.
// Components can use this as a React key or dependency to trigger re-renders.
export function useProject(project: Project) {
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion(v => v + 1), []);

  useEffect(() => {
    const unsubs = [
      project.eventBus.on('entity:added', bump),
      project.eventBus.on('entity:updated', bump),
      project.eventBus.on('entity:removed', bump),
      project.eventBus.on('layer:added', bump),
      project.eventBus.on('layer:updated', bump),
      project.eventBus.on('layer:removed', bump),
      project.eventBus.on('selection:changed', bump),
      project.eventBus.on('history:changed', bump),
      project.eventBus.on('project:loaded', bump),
    ];
    return () => unsubs.forEach(u => u());
  }, [project, bump]);

  return { version };
}
