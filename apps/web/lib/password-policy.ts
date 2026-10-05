export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export type PasswordRequirement = 'length' | 'lowercase' | 'uppercase' | 'number' | 'symbol';

export function passwordRequirements(password: string): Record<PasswordRequirement, boolean> {
  return {
    length: password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH,
    lowercase: /[a-z]/.test(password),
    uppercase: /[A-Z]/.test(password),
    number: /\d/.test(password),
    symbol: /[^A-Za-z0-9]/.test(password),
  };
}

export function passwordValidationMessage(password: string): string | null {
  const requirements = passwordRequirements(password);
  if (!password) return 'יש להזין סיסמה.';
  if (!requirements.length) return `הסיסמה חייבת להכיל בין ${PASSWORD_MIN_LENGTH} ל-${PASSWORD_MAX_LENGTH} תווים.`;
  if (!requirements.lowercase) return 'הסיסמה חייבת להכיל אות אנגלית קטנה.';
  if (!requirements.uppercase) return 'הסיסמה חייבת להכיל אות אנגלית גדולה.';
  if (!requirements.number) return 'הסיסמה חייבת להכיל מספר.';
  if (!requirements.symbol) return 'הסיסמה חייבת להכיל סימן מיוחד.';
  return null;
}
