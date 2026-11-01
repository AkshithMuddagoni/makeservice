/** Shared validation for India-specific identifiers used by client and server. */
export function isValidIndiaPincode(value: string): boolean {
  return /^\d{6}$/.test(value);
}

export function isValidIndiaMobileNumber(value: string): boolean {
  return /^[6-9]\d{9}$/.test(value);
}

export function isValidIndiaE164Phone(value: string): boolean {
  return /^\+91[6-9]\d{9}$/.test(value);
}
