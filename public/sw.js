// RestroConnect Push Notification Service Worker
// Handles incoming push events and shows native OS notifications.

self.addEventListener("push", function (event) {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "New Order!", body: event.data.text() };
  }

  const title = payload.title || "New Order!";
  const options = {
    body: payload.body || "A new order has arrived.",
    icon: payload.icon || "/favicon.ico",
    badge: payload.badge || "/favicon.ico",
    tag: payload.tag || "new-order",
    renotify: true,
    requireInteraction: payload.requireInteraction !== false,
    data: {
      url: payload.url || "/orders",
      orderId: payload.orderId || null,
    },
    actions: [
      { action: "view", title: "View Order" },
      { action: "dismiss", title: "Dismiss" },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();

  if (event.action === "dismiss") return;

  const targetUrl = event.notification.data?.url || "/orders";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(function (clientList) {
        for (const client of clientList) {
          if (client.url.includes(targetUrl) && "focus" in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      })
  );
});
