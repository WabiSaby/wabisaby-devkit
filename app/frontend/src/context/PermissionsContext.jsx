import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { github } from '../lib/wails';

const PermissionsContext = createContext(null);

/**
 * Provides team-based permissions loaded from GitHub auth state.
 *
 * Shape of `permissions`:
 *   { connected: bool, username: string, teams: string[], views: string[], commands: string[] }
 *
 * When not connected, `connected` is false and views/commands are empty.
 */
export function PermissionsProvider({ children }) {
  const [permissions, setPermissions] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const perms = await github.getStatus();
      setPermissions(perms ?? { connected: false });
    } catch {
      setPermissions({ connected: false });
    }
    setLoading(false);
  }, []);

  // Load permissions on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const perms = await github.getStatus();
        if (!cancelled) setPermissions(perms ?? { connected: false });
      } catch {
        if (!cancelled) setPermissions({ connected: false });
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  /**
   * Check whether a given view is allowed.
   * When not connected, nothing is allowed except 'settings' and 'home'.
   */
  const canAccessView = useCallback(
    (viewId) => {
      if (!permissions || !permissions.connected) {
        return viewId === 'settings' || viewId === 'home';
      }
      return permissions.views?.includes(viewId) ?? false;
    },
    [permissions],
  );

  /**
   * Check whether a command category is allowed.
   */
  const canAccessCommandCategory = useCallback(
    (category) => {
      if (!permissions || !permissions.connected) return false;
      return permissions.commands?.includes(category) ?? false;
    },
    [permissions],
  );

  return (
    <PermissionsContext.Provider
      value={{ permissions, loading, refresh, setPermissions, canAccessView, canAccessCommandCategory }}
    >
      {children}
    </PermissionsContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePermissions() {
  const ctx = useContext(PermissionsContext);
  if (!ctx) throw new Error('usePermissions must be used inside <PermissionsProvider>');
  return ctx;
}
