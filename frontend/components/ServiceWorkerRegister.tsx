"use client";

import { useEffect } from "react";

/**
 * Registers the service worker in production builds only (a dev-mode service
 * worker would cache HMR assets and cause stale builds).  Run
 * `npm run build && npm start` to exercise offline mode.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    let cancelled = false;
    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });
        if (cancelled) return;
        // Keep the offline shell fresh without prompting the user.
        await registration.update().catch(() => undefined);
      } catch {
        // Offline support is an enhancement; the app still works online.
      }
    };

    void register();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
