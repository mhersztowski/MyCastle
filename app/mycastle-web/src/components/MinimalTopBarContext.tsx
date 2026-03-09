import { createContext, useContext, useState, useEffect, DependencyList } from 'react';

interface MinimalTopBarContextValue {
  slot: React.ReactNode;
  setSlot: (content: React.ReactNode) => void;
}

export const MinimalTopBarContext = createContext<MinimalTopBarContextValue>({
  slot: null,
  setSlot: () => {},
});

export function useMinimalTopBarSlot(content: React.ReactNode, deps: DependencyList) {
  const { setSlot } = useContext(MinimalTopBarContext);
  useEffect(() => {
    setSlot(content);
    return () => setSlot(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export function useMinimalTopBarContext() {
  return useContext(MinimalTopBarContext);
}

export function MinimalTopBarProvider({ children }: { children: React.ReactNode }) {
  const [slot, setSlot] = useState<React.ReactNode>(null);
  return (
    <MinimalTopBarContext.Provider value={{ slot, setSlot }}>
      {children}
    </MinimalTopBarContext.Provider>
  );
}
