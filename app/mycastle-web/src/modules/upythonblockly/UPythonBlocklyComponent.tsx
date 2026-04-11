import { useEffect, useRef } from 'react';
import { UPythonBlocklyService } from './UPythonBlocklyService';

interface UPythonBlocklyComponentProps {
  onServiceReady?: (service: UPythonBlocklyService) => void;
  initialBoard?: string;
  ready?: boolean;
  projectScript?: string;
}

function UPythonBlocklyComponent({
  onServiceReady,
  initialBoard = 'esp32_generic',
  ready = true,
  projectScript,
}: UPythonBlocklyComponentProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const serviceRef = useRef<UPythonBlocklyService | null>(null);

  useEffect(() => {
    if (!containerRef.current || !ready) return;

    const service = new UPythonBlocklyService(initialBoard);
    serviceRef.current = service;
    let disposed = false;

    service.init(containerRef.current, projectScript).then(() => {
      if (disposed) return;
      onServiceReady?.(service);
      // Re-render after init to fix block layout in WebView (getBBox/text measurement timing).
      setTimeout(() => { if (!disposed) service.rerenderBlocks(); }, 200);
      setTimeout(() => { if (!disposed) service.rerenderBlocks(); }, 800);
      setTimeout(() => { if (!disposed) service.rerenderBlocks(); }, 1500);
    }).catch((err) => {
      console.error('[UPythonBlockly] Initialization error:', err);
    });

    const observer = new ResizeObserver(() => {
      service.resize();
    });
    observer.observe(containerRef.current);

    // Re-render blocks on every window resize — catches injected resize events
    // fired by the React Native WebView after native layout settles.
    const onWindowResize = () => { if (!disposed) service.rerenderBlocks(); };
    window.addEventListener('resize', onWindowResize);

    return () => {
      disposed = true;
      observer.disconnect();
      window.removeEventListener('resize', onWindowResize);
      service.dispose();
      serviceRef.current = null;
    };
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={containerRef} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />;
}

export default UPythonBlocklyComponent;
