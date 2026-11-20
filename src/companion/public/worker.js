const CACHE = "sabri-companion-shell-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      const page = await fetch("/");
      if (!page.ok) return;
      const html = await page.clone().text();
      await cache.put("/", page);
      const assets = Array.from(
        html.matchAll(/["'](\/assets\/[^"'\s]+)["']/g),
        (match) => match[1],
      );
      await Promise.allSettled(
        [...new Set(["/icon.png", "/manifest.webmanifest", ...assets])].map(
          (path) => cache.add(path),
        ),
      );
      await self.skipWaiting();
    }),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== "GET")
    return;
  if (url.pathname.startsWith("/api/") || url.pathname === "/worker.js") return;
  if (
    event.request.mode === "navigate" &&
    (url.pathname === "/" || url.pathname === "/pair")
  ) {
    event.respondWith(
      fetch(event.request)
        .then(async (response) => {
          if (response.ok)
            await (await caches.open(CACHE)).put("/", response.clone());
          return response;
        })
        .catch(async () => (await caches.match("/")) ?? Response.error()),
    );
  } else if (
    url.pathname.startsWith("/assets/") ||
    url.pathname === "/icon.png" ||
    url.pathname === "/manifest.webmanifest"
  ) {
    event.respondWith(
      caches.match(event.request).then(async (cached) => {
        if (cached) return cached;
        const response = await fetch(event.request);
        if (response.ok)
          await (await caches.open(CACHE)).put(event.request, response.clone());
        return response;
      }),
    );
  }
});

self.addEventListener("push", (event) => {
  let alert;
  try {
    alert = event.data?.json();
  } catch {
    alert = null;
  }
  if (typeof alert?.title !== "string" || typeof alert?.id !== "string") return;
  event.waitUntil(
    self.registration.showNotification(alert.title.slice(0, 160), {
      body: typeof alert.body === "string" ? alert.body.slice(0, 420) : "",
      tag: "sabri-" + alert.id,
      icon: "/icon.png",
      data: { url: "/?open=alerts" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const url = new URL("/?open=alerts", self.location.origin).href;
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of clients) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        await client.navigate(url);
        await client.focus();
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
