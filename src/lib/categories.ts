// Event categories, shared by the create/edit form, the feed filter, and the
// color-coded map pins. `key` is what's stored in events.category.

export interface EventCategory {
  key: string;
  label: string;
  color: string;
}

export const EVENT_CATEGORIES: EventCategory[] = [
  { key: 'music', label: 'Music', color: '#FF007F' },
  { key: 'sports', label: 'Sports', color: '#00B4FF' },
  { key: 'food', label: 'Free Food', color: '#39C55A' },
  { key: 'party', label: 'Party', color: '#FFC72C' },
  { key: 'academic', label: 'Academic', color: '#8B5CF6' },
  { key: 'career', label: 'Career', color: '#14B8A6' },
  { key: 'arts', label: 'Arts', color: '#FF6B35' },
  { key: 'social', label: 'Social', color: '#EC4899' },
  { key: 'other', label: 'Other', color: '#9CA3AF' },
];

const BY_KEY = new Map(EVENT_CATEGORIES.map((c) => [c.key, c]));

export function categoryColor(key: string | null | undefined): string {
  return (key && BY_KEY.get(key)?.color) || '#9CA3AF';
}

export function categoryLabel(key: string | null | undefined): string | null {
  if (!key) return null;
  return BY_KEY.get(key)?.label ?? null;
}

// Translation key for a category's label (see lib/i18n.ts).
export function categoryTKey(key: string): `cat_${string}` {
  return `cat_${key}`;
}
