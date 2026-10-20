/**
 * UsernamePolicy — single source of truth for @username rules across the app
 * (registration, change-username, search, display).
 */
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 20;

// Only a-z, 0-9, underscore. No spaces, no Unicode — this also eliminates the
// entire class of Unicode-confusable impersonation attacks (Cyrillic а vs Latin a, etc.)
// by construction, since only ASCII a-z0-9_ is ever accepted.
const USERNAME_PATTERN = /^[a-z0-9_]+$/;

export class UsernamePolicy {
  /** Throws a descriptive error on the first rule violated; returns the normalized (lowercase) form otherwise. */
  static validateFormat(raw: string): string {
    if (typeof raw !== 'string') {
      throw new Error('USERNAME_INVALID');
    }
    const trimmed = raw.trim();
    if (trimmed.length < USERNAME_MIN_LENGTH || trimmed.length > USERNAME_MAX_LENGTH) {
      throw new Error('USERNAME_LENGTH');
    }
    const lower = trimmed.toLowerCase();
    if (!USERNAME_PATTERN.test(lower)) {
      throw new Error('USERNAME_CHARSET');
    }
    if (/^[0-9_]/.test(lower)) {
      // must start with a letter to stay unambiguous and readable
      throw new Error('USERNAME_MUST_START_WITH_LETTER');
    }
    if (lower.includes('__')) {
      throw new Error('USERNAME_CONSECUTIVE_UNDERSCORE');
    }
    return lower;
  }

  static normalizeForLookup(raw: string): string {
    return raw.trim().toLowerCase();
  }
}

/** Default seed list — kept editable at runtime via the `reserved_usernames` table, this is only the initial seed. */
export const DEFAULT_RESERVED_USERNAMES = [
  'admin',
  'administrator',
  'support',
  'official',
  'vayro',
  'security',
  'api',
  'system',
  'root',
  'moderator',
  'help',
  'billing',
  'staff',
  'null',
  'undefined',
];
