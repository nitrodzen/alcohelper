export type RegistrationEnvironment = {
  REGISTRATION_ALLOWED_EMAILS?: string;
  REGISTRATION_ALLOWED_DOMAINS?: string;
};

function parseList(value: string | undefined): Set<string> {
  return new Set(
    (value ?? "")
      .split(/[\s,;]+/)
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  );
}

function currentEnvironment(): RegistrationEnvironment {
  return {
    REGISTRATION_ALLOWED_EMAILS: process.env.REGISTRATION_ALLOWED_EMAILS,
    REGISTRATION_ALLOWED_DOMAINS: process.env.REGISTRATION_ALLOWED_DOMAINS,
  };
}

export function getRegistrationAllowlist(environment: RegistrationEnvironment = currentEnvironment()) {
  return {
    emails: parseList(environment.REGISTRATION_ALLOWED_EMAILS),
    domains: parseList(environment.REGISTRATION_ALLOWED_DOMAINS),
  };
}

export function normalizeRegistrationEmail(email: string): string | null {
  const normalizedEmail = email.trim().toLowerCase();
  const separatorIndex = normalizedEmail.lastIndexOf("@");
  if (separatorIndex <= 0 || separatorIndex === normalizedEmail.length - 1) {
    return null;
  }
  return normalizedEmail;
}

export function isRegistrationAllowed(email: string, environment: RegistrationEnvironment = currentEnvironment()): boolean {
  const normalizedEmail = normalizeRegistrationEmail(email);
  if (!normalizedEmail) {
    return false;
  }

  const { emails, domains } = getRegistrationAllowlist(environment);
  const separatorIndex = normalizedEmail.lastIndexOf("@");
  const domain = normalizedEmail.slice(separatorIndex + 1);
  return emails.has(normalizedEmail) || domains.has(domain);
}
