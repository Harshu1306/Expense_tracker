/*
 * SpendWise service worker.
 *
 * Strategy:
 *  - App shell routes are precached at install time so a cold offline launch
 *    still renders every page.
 *  - Navigations are network-first with a cached page fallback and finally
 *    /offline.
 *  - Hashed Next.js build assets are cache-first (they are immutable).
 *  - RSC payloads are network-first and cached by exact URL so client-side
 *    navigation can work offline.
 *  - API requests are NEVER cached; sync must always talk to the server.
 *
 * Bump CACHE_VERSION whenever the caching strategy or shell changes.
 */
const CACHE_VERSION = "spendwise-v2";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const PAGE_CACHE = `${CACHE_VERSION}-pages`;
const ASSET_CACHE = `${CACHE_VERSION}-assets`;
const RSC_CACHE = `${CACHE_VERSION}-rsc`;

const SHELL_ROUTES = [
  "/",
  "/transactions",
  "/transactions/new",
  "/transactions/edit",
  "/analytics",
  "/budgets",
  "/settings",
  "/offline",
];

const SHELL_ASSETS = ["/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL_CACHE);
      const assets = await caches.open(ASSET_CACHE);

      // Cache each shell route *and* the hashed JS/CSS files its HTML
      // references. Caching only the HTML is not enough: a cold offline load
      // would render the server markup but fail to hydrate when a chunk is
      // missing.
      await Promise.allSettled(
        SHELL_ROUTES.map(async (url) => {
          const response = await fetch(url, { cache: "reload" });
          if (!response.ok) return;
          const html = await response.clone().text();
          await shell.put(new Request(url), response);

          const assetUrls = new Set(
            Array.from(html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g)).map(
              (match) => match[1],
            ),
          );
          await Promise.allSettled(
            Array.from(assetUrls).map(async (assetUrl) => {
              if (await assets.match(assetUrl)) return;
              const assetResponse = await fetch(assetUrl, { cache: "reload" });
              if (assetResponse.ok) {
                await assets.put(new Request(assetUrl), assetResponse);
              }
            }),
          );
        }),
      );

      // Non-JS shell assets (manifest, icon) are fetched separately because
      // they are not referenced from the route HTML.
      await Promise.allSettled(
        SHELL_ASSETS.map(async (url) => {
          const response = await fetch(url, { cache: "reload" });
          if (response.ok) await shell.put(new Request(url), response);
        }),
      );

      // Cache React Server Component payloads too, so client-side navigation
      // keeps working when a route's HTML is cached but the network is gone.
      const rsc = await caches.open(RSC_CACHE);
      await Promise.allSettled(
        SHELL_ROUTES.map(async (url) => {
          const response = await fetch(url, {
            cache: "reload",
            headers: { RSC: "1" },
          });
          const contentType = response.headers.get("content-type") || "";
          if (response.ok && contentType.includes("text/x-component")) {
            await rsc.put(new Request(url), response.clone());
          }
        }),
      );

      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => !key.startsWith(CACHE_VERSION))
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstPage(request));
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
    return;
  }

  if (url.searchParams.has("_rsc") || request.headers.get("RSC") === "1") {
    event.respondWith(networkFirstRsc(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request, ASSET_CACHE));
});

function isStaticAsset(pathname) {
  return /\.(?:css|js|mjs|svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf|otf|webmanifest)$/i.test(
    pathname,
  );
}

async function networkFirstPage(request) {
  const pageCache = await caches.open(PAGE_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      pageCache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await pageCache.match(request, { ignoreSearch: true });
    if (cached) return cached;

    const shell = await caches.open(SHELL_CACHE);
    const pathname = new URL(request.url).pathname;
    const route = await shell.match(pathname);
    if (route) return route;

    const offline = await shell.match("/offline");
    if (offline) return offline;

    return new Response("You are offline and this page is not cached yet.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

async function networkFirstRsc(request) {
  const cache = await caches.open(RSC_CACHE);
  try {
    const response = await fetch(request);
    const contentType = response.headers.get("content-type") || "";
    if (response.ok && contentType.includes("text/x-component")) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const pathname = new URL(request.url).pathname;
    const cached = await cache.match(pathname, { ignoreSearch: true });
    if (cached) return cached;
    return new Response("", { status: 503 });
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) {
    cache.put(request, response.clone());
  }
  return response;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => cached);
  return cached || network;
}
