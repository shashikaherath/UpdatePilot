/**
 * Browser and in-app notification manager with permission handling and de-duplication
 */

const seenNotifications = new Map<string, number>();
const DEDUPLICATION_WINDOW_MS = 60 * 1000; // 1 minute window

export async function requestBrowserNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }
  return Notification.requestPermission();
}

export function getBrowserNotificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

export function sendBrowserNotification(
  title: string,
  options?: NotificationOptions & { deduplicationKey?: string }
): boolean {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }

  if (Notification.permission !== 'granted') {
    return false;
  }

  // De-duplication check
  const key = options?.deduplicationKey || `${title}:${options?.body || ''}`;
  const now = Date.now();
  const lastSeen = seenNotifications.get(key);
  if (lastSeen && now - lastSeen < DEDUPLICATION_WINDOW_MS) {
    return false; // Skip duplicate notification
  }
  seenNotifications.set(key, now);

  try {
    const notification = new Notification(title, {
      icon: '/favicon.ico',
      ...options,
    });

    notification.onclick = () => {
      window.focus();
      notification.close();
    };

    return true;
  } catch (err) {
    console.warn('Could not display browser notification:', err);
    return false;
  }
}

