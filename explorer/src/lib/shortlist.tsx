import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { serializeShortlistMarkdown } from './shortlistFormat';
import type { ShortlistedPi, ShortlistedSite } from './shortlistFormat';

export { serializeShortlistMarkdown };
export type { ShortlistedPi, ShortlistedSite };

interface ShortlistState {
  sites: ShortlistedSite[];
  pis: ShortlistedPi[];
}

const STORAGE_KEY = 'bmis1572.feasibility.shortlist.v1';

function loadInitial(): ShortlistState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { sites: [], pis: [] };
    const parsed = JSON.parse(raw) as Partial<ShortlistState>;
    return {
      sites: Array.isArray(parsed.sites) ? parsed.sites : [],
      pis: Array.isArray(parsed.pis) ? parsed.pis : [],
    };
  } catch {
    return { sites: [], pis: [] };
  }
}

interface ShortlistContextValue {
  sites: ShortlistedSite[];
  pis: ShortlistedPi[];
  totalCount: number;
  hasSite: (siteId: string) => boolean;
  hasPi: (personId: string) => boolean;
  toggleSite: (site: ShortlistedSite) => void;
  togglePi: (pi: ShortlistedPi) => void;
  removeSite: (siteId: string) => void;
  removePi: (personId: string) => void;
  clearAll: () => void;
}

const ShortlistContext = createContext<ShortlistContextValue | null>(null);

export function ShortlistProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ShortlistState>(loadInitial);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* storage quota or private mode */
    }
  }, [state]);

  const siteIds = useMemo(() => new Set(state.sites.map((s) => s.site_id)), [state.sites]);
  const piIds = useMemo(() => new Set(state.pis.map((p) => p.person_id)), [state.pis]);

  const hasSite = useCallback((siteId: string) => siteIds.has(siteId), [siteIds]);
  const hasPi = useCallback((personId: string) => piIds.has(personId), [piIds]);

  const toggleSite = useCallback((site: ShortlistedSite) => {
    setState((prev) => {
      const exists = prev.sites.some((s) => s.site_id === site.site_id);
      return {
        ...prev,
        sites: exists
          ? prev.sites.filter((s) => s.site_id !== site.site_id)
          : [site, ...prev.sites],
      };
    });
  }, []);

  const togglePi = useCallback((pi: ShortlistedPi) => {
    setState((prev) => {
      const exists = prev.pis.some((p) => p.person_id === pi.person_id);
      return {
        ...prev,
        pis: exists
          ? prev.pis.filter((p) => p.person_id !== pi.person_id)
          : [pi, ...prev.pis],
      };
    });
  }, []);

  const removeSite = useCallback((siteId: string) => {
    setState((prev) => ({
      ...prev,
      sites: prev.sites.filter((s) => s.site_id !== siteId),
    }));
  }, []);

  const removePi = useCallback((personId: string) => {
    setState((prev) => ({
      ...prev,
      pis: prev.pis.filter((p) => p.person_id !== personId),
    }));
  }, []);

  const clearAll = useCallback(() => setState({ sites: [], pis: [] }), []);

  const value = useMemo<ShortlistContextValue>(
    () => ({
      sites: state.sites,
      pis: state.pis,
      totalCount: state.sites.length + state.pis.length,
      hasSite,
      hasPi,
      toggleSite,
      togglePi,
      removeSite,
      removePi,
      clearAll,
    }),
    [state.sites, state.pis, hasSite, hasPi, toggleSite, togglePi, removeSite, removePi, clearAll],
  );

  return <ShortlistContext.Provider value={value}>{children}</ShortlistContext.Provider>;
}

export function useShortlist(): ShortlistContextValue {
  const ctx = useContext(ShortlistContext);
  if (!ctx) throw new Error('useShortlist must be used inside ShortlistProvider');
  return ctx;
}
