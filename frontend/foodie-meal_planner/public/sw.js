// public/sw.js
self.addEventListener('push', function (event) {
  if (!event.data) return;

  const data = event.data.json();
  const title = data.title || "🍳 Foodie Prep Reminder!";
  const options = {
    body: data.message,
    icon: '/icon-192x192.png', // Ensure you have an icon or remove this line
    badge: '/badge.png',
    vibrate: [500, 100, 500, 100, 500], // Vibration pattern for alarms
    requireInteraction: true, // Keeps notification active until clicked
    data: {
      url: data.url || '/dashboard'
    }
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url)
  );
});