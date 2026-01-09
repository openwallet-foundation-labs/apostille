'use client';

import React, { createContext, useContext } from 'react';
import { DEFAULT_CARD_WIDTH, DEFAULT_CARD_HEIGHT } from '@/lib/credential-designer/types';

interface DesignerContextValue {
  zoom: number;
  cardBounds: { width: number; height: number };
}

const DesignerContext = createContext<DesignerContextValue>({
  zoom: 1,
  cardBounds: { width: DEFAULT_CARD_WIDTH, height: DEFAULT_CARD_HEIGHT },
});

export function DesignerProvider({
  children,
  zoom,
}: {
  children: React.ReactNode;
  zoom: number;
}) {
  return (
    <DesignerContext.Provider
      value={{
        zoom,
        cardBounds: { width: DEFAULT_CARD_WIDTH, height: DEFAULT_CARD_HEIGHT },
      }}
    >
      {children}
    </DesignerContext.Provider>
  );
}

export function useDesignerContext() {
  return useContext(DesignerContext);
}
