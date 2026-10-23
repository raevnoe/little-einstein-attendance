// Pure helpers for the notification bell (no React, so they can be tested without a browser).
// Items come from GET /api/notifications: { id, kind, title, body, link, studentId, notifiedAt }.
// Times are ISO strings in one format (cut to the millisecond), so they compare as text.
import { NOTIFICATION_FEED_LIMIT } from '@led/shared';

const newestFirst = (a, b) => (b.notifiedAt ?? '').localeCompare(a.notifiedAt ?? '') || b.id.localeCompare(a.id);

/** Current items + newer ones from the server. An item with the same id is replaced (it was updated). */
export function mergeFeed(current, incoming, limit = NOTIFICATION_FEED_LIMIT) {
  const byId = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) byId.set(item.id, item);
  return [...byId.values()].sort(newestFirst).slice(0, limit);
}

/** notifiedAt of the newest item, or null. Used as `after` for the next check and as the seen marker. */
export function newestTime(items) {
  return items.reduce((newest, item) => (item.notifiedAt && (!newest || item.notifiedAt > newest) ? item.notifiedAt : newest), null);
}

/** The later of two ISO times (either may be null): the seen marker only moves forward. */
export function laterTime(a, b) {
  if (!a) return b ?? null;
  if (!b) return a;
  return a > b ? a : b;
}

export function isUnread(item, seenAt) {
  return !seenAt || (item.notifiedAt ?? '') > seenAt;
}

export function unreadCount(items, seenAt) {
  return items.filter((item) => isUnread(item, seenAt)).length;
}

/** Items that are new to this screen (or were updated since it last saw them) and not yet seen. */
export function freshUnread(current, incoming, seenAt) {
  const known = new Map(current.map((item) => [item.id, item.notifiedAt]));
  return incoming.filter((item) => known.get(item.id) !== item.notifiedAt && isUnread(item, seenAt));
}

/**
 * The YYYY-MM-DD an item is about, or null. Performance items saved before `date` existed carry it
 * only in their ID ("performance_<studentId>_<date>").
 */
export function itemDate(item) {
  if (item.date) return item.date;
  const match = /_(\d{4}-\d{2}-\d{2})$/.exec(item.kind === 'performance' ? item.id : '');
  return match ? match[1] : null;
}

/** Badge text: "1".."9", then "9+". */
export function badgeText(count) {
  return count > 9 ? '9+' : String(count);
}
