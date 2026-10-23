// Philippine mobile numbers, shared by client and server (the server is the authority).
// Stored in one canonical form, +639XXXXXXXXX. Accepted input forms include
// 09171234567, 9171234567, 639171234567 and +63 917 123 4567 (spaces, dashes, dots, parentheses).

export const PH_MOBILE_PATTERN = /^\+639\d{9}$/;

/** Returns "+639XXXXXXXXX", or null if the value is not a Philippine mobile number. */
export function normalizePhMobileNumber(value) {
  if (typeof value !== 'string') return null;
  const compact = value.trim().replace(/[\s().-]/g, '');
  const digits = compact.replace(/^\+/, '');
  if (!/^\d+$/.test(digits) || (compact.startsWith('+') && !digits.startsWith('63'))) return null;
  let national;
  if (digits.length === 12 && digits.startsWith('63')) national = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) national = digits.slice(1);
  else if (digits.length === 10) national = digits;
  else return null;
  const number = `+63${national}`;
  return PH_MOBILE_PATTERN.test(number) ? number : null;
}
