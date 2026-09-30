const MAX_FIREBASE_UID_LENGTH = 128;
const MAX_ALLOWED_FIREBASE_UIDS = 100;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;

export function validateFirebaseUidAllowlist(values: readonly string[]): readonly string[] {
  if (values.length < 1 || values.length > MAX_ALLOWED_FIREBASE_UIDS) {
    throw new Error("Firebase UID allowlist must contain between 1 and 100 entries");
  }
  const unique = new Set<string>();
  for (const value of values) {
    if (
      value.length < 1
      || value.length > MAX_FIREBASE_UID_LENGTH
      || value !== value.trim()
      || value.includes(",")
      || CONTROL_CHARACTER.test(value)
    ) {
      throw new Error("Firebase UID allowlist contains an invalid entry");
    }
    if (unique.has(value)) throw new Error("Firebase UID allowlist contains a duplicate entry");
    unique.add(value);
  }
  return Object.freeze([...unique]);
}

export function parseFirebaseUidAllowlist(value: string | undefined): readonly string[] {
  if (value === undefined) throw new Error("ACCOUNT_ALLOWED_FIREBASE_UIDS is required");
  return validateFirebaseUidAllowlist(value.split(",").map(entry => entry.trim()));
}
