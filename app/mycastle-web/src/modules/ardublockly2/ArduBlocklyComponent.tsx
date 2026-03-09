import { useEffect, useRef } from 'react';
import { ArduBlocklyService } from './ArduBlocklyService';

interface ArduBlocklyComponentProps {
  onServiceReady?: (service: ArduBlocklyService) => void;
  initialBoard?: string;
  readFile?: (path: string) => Promise<{ content: string }>;
  /** Set to true when readFile is ready (e.g. MQTT connected) */
  ready?: boolean;
}

function ArduBlocklyComponent({
  onServiceReady,
  initialBoard = 'esp8266_wemos_d1',
  readFile,
  ready = true,
}: ArduBlocklyComponentProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const serviceRef = useRef<ArduBlocklyService | null>(null);

  useEffect(() => {
    if (!containerRef.current || !ready) return;

    const service = new ArduBlocklyService(initialBoard);
    serviceRef.current = service;
    let disposed = false;

    service.init(containerRef.current, readFile).then(() => {
      if (disposed) return;
      onServiceReady?.(service);
    });

    // Resize when container size changes
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

export default ArduBlocklyComponent;
