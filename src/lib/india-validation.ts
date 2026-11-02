/** Shared validation for India-specific identifiers used by client and server. */
export function isValidIndiaPincode(value: string): boolean {
  return value.length === 6 && /^\d{6}$/.test(value);
}

export function isValidIndiaMobileNumber(value: string): boolean {
  return value.length === 10 && /^[6-9]\d{9}$/.test(value);
}

export function isValidIndiaE164Phone(value: string): boolean {
  return value.length === 13 && /^\+91[6-9]\d{9}$/.test(value);
}
