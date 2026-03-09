import { useEffect, useRef } from 'react';
import { UPythonBlocklyService } from './UPythonBlocklyService';

interface UPythonBlocklyComponentProps {
  onServiceReady?: (service: UPythonBlocklyService) => void;
  initialBoard?: string;
  ready?: boolean;
}

function UPythonBlocklyComponent({
  onServiceReady,
  initialBoard = 'esp32_generic',
  ready = true,
}: UPythonBlocklyComponentProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const serviceRef = useRef<UPythonBlocklyService | null>(null);

  useEffect(() => {
    if (!containerRef.current || !ready) return;

    const service = new UPythonBlocklyService(initialBoard);
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

export default UPythonBlocklyComponent;
