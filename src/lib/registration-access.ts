import { prisma } from "@/lib/prisma";
import {
  isRegistrationAllowed,
  normalizeRegistrationEmail,
  type RegistrationEnvironment,
} from "@/lib/registration";

export async function isRegistrationAllowedForSignup(
  email: string,
  environment?: RegistrationEnvironment,
): Promise<boolean> {
  if (isRegistrationAllowed(email, environment)) {
    return true;
  }

  const normalizedEmail = normalizeRegistrationEmail(email);
  if (!normalizedEmail) {
    return false;
  }

  const entry = await prisma.registrationAllowlistEntry.findUnique({
    where: { email: normalizedEmail },
    select: { id: true },
  });

  return Boolean(entry);
}
