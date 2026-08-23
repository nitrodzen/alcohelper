export const PORTAL_ADMIN_EMAIL = "nitrodzen@gmail.com";

export function isPortalAdminEmail(email: string | null | undefined): boolean {
  return email?.trim().toLowerCase() === PORTAL_ADMIN_EMAIL;
}
