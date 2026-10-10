import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

const MapTabVisibilityContext = createContext<{
  isMapTabHidden: boolean;
  setMapTabHidden: (hidden: boolean) => void;
} | null>(null);

/** 정류장 시트가 열릴 때 지도 탭을 숨기도록 화면과 탭 레이아웃을 연결한다. */
export function MapTabVisibilityProvider({ children }: { children: ReactNode }) {
  const [isMapTabHidden, setMapTabHidden] = useState(false);

  const value = useMemo(() => ({ isMapTabHidden, setMapTabHidden }), [isMapTabHidden]);

  return (
    <MapTabVisibilityContext.Provider value={value}>
      {children}
    </MapTabVisibilityContext.Provider>
  );
}

export function useMapTabVisibility() {
  const context = useContext(MapTabVisibilityContext);
  if (!context) throw new Error('MapTabVisibilityProvider가 필요합니다.');
  return context;
}
