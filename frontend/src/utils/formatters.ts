/**
 * Formats an ISO date string or timestamp into a human-readable relative time
 * (e.g., "just now", "5 minutes ago", "yesterday", "3 days ago")
 * without using external date libraries.
 */
export function formatRelativeTime(dateInput: string | null | undefined): string {
  if (!dateInput) return 'Never';

  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return 'Invalid date';

  const now = Date.now();
  const diffInSeconds = Math.floor((now - date.getTime()) / 1000);

  if (diffInSeconds < 0) {
    return 'in the future';
  }

  if (diffInSeconds < 30) {
    return 'just now';
  }

  if (diffInSeconds < 60) {
    return `${diffInSeconds}s ago`;
  }

  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes === 1) {
    return '1 minute ago';
  }
  if (diffInMinutes < 60) {
    return `${diffInMinutes} minutes ago`;
  }

  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours === 1) {
    return '1 hour ago';
  }
  if (diffInHours < 24) {
    return `${diffInHours} hours ago`;
  }

  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays === 1) {
    return 'yesterday';
  }
  if (diffInDays < 30) {
    return `${diffInDays} days ago`;
  }

  const diffInMonths = Math.floor(diffInDays / 30);
  if (diffInMonths === 1) {
    return '1 month ago';
  }
  if (diffInMonths < 12) {
    return `${diffInMonths} months ago`;
  }

  const diffInYears = Math.floor(diffInDays / 365);
  if (diffInYears === 1) {
    return '1 year ago';
  }
  return `${diffInYears} years ago`;
}

/**
 * Formats an ISO date string into absolute medium date + short time
 * e.g., "Nov 4, 2026, 1:45 PM"
 */
export function formatDateTime(dateInput: string | null | undefined): string {
  if (!dateInput) return 'N/A';

  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return 'Invalid date';

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

/**
 * Formats a number with comma separators
 */
export function formatNumber(val: number): string {
  return new Intl.NumberFormat('en-US').format(val);
}
