'use client';
import { useEffect, useState } from 'react';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;
const API_BASE_URL = import.meta.env.VITE_API_URL;

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export default function NotificationManager({ userId }: { userId: string }) {
  const [, setStatus] = useState('');

  useEffect(() => {
    if (!userId || !('serviceWorker' in navigator) || !('PushManager' in window)) return;

    async function enableNotifications() {
      if (!VAPID_PUBLIC_KEY) {
        setStatus('❌ Error: VITE_VAPID_PUBLIC_KEY is missing in .env');
        return;
      }

      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        setStatus('Push notifications not supported by this browser.');
        return;
      }

      try {
        setStatus('Registering service worker...');
        const registration = await navigator.serviceWorker.register('/sw.js');
        await navigator.serviceWorker.ready;

        setStatus('Requesting permission...');
        const permission = await Notification.requestPermission();

        if (permission !== 'granted') {
          setStatus('Notification permission denied.');
          return;
        }

        // 🛑 FIX: Check if an old subscription exists with a different key, and clear it out!
        let subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          setStatus('Clearing old subscription...');
          await subscription.unsubscribe();
        }

        setStatus('Subscribing to push network...');
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
        });

        console.log("Raw subscription object being sent:", JSON.stringify(subscription));

        setStatus('Saving to server...');
        const res = await fetch(`${API_BASE_URL}/api/save-push-subscription`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: userId,
            subscription: subscription
          })
        });

        if (res.ok) {
          setStatus('✅ Notifications enabled successfully!');
        } else {
          setStatus('❌ Failed to save subscription on backend.');
        }
      } catch (err) {
        console.error('Push Subscription Error:', err);
        setStatus(`❌ Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    enableNotifications();
  }, [userId]);

  return null;
}