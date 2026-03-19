import { useEffect, useRef } from 'react';
import { PygameBlocklyService } from './PygameBlocklyService';
import type { PygameMode } from './generator';

interface PygameBlocklyComponentProps {
  onServiceReady?: (service: PygameBlocklyService) => void;
  mode?: PygameMode;
  ready?: boolean;
}

function PygameBlocklyComponent({
  onServiceReady,
  mode = 'native',
  ready = true,
}: PygameBlocklyComponentProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const serviceRef = useRef<PygameBlocklyService | null>(null);

  useEffect(() => {
    if (!containerRef.current || !ready) return;

    const service = new PygameBlocklyService();
    service.setMode(mode);
    serviceRef.current = service;
    let disposed = false;

    service.init(containerRef.current).then(() => {
      if (disposed) return;
      onServiceReady?.(service);
    });

    const observer = new ResizeObserver(() => {
      service.resize();
    });
    observer.observe(containerRef.current);

    return () => {
      disposed = true;
      observer.disconnect();
      service.dispose();
      serviceRef.current = null;
    };
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}

export default PygameBlocklyComponent;
