import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUser: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getSessionUserId: (session: { user?: { id?: string } } | null) => session?.user?.id ?? null,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: mocks.findUser,
    },
  },
}));

import { getPortalAdminUser } from "@/lib/admin";
import { isPortalAdminEmail, PORTAL_ADMIN_EMAIL } from "@/lib/admin-config";

describe("portal admin access", () => {
  beforeEach(() => {
    mocks.findUser.mockReset();
  });

  it("matches only the configured admin email case-insensitively", () => {
    expect(isPortalAdminEmail(" NITRODZEN@gmail.com ")).toBe(true);
    expect(isPortalAdminEmail(`admin+${PORTAL_ADMIN_EMAIL}`)).toBe(false);
    expect(isPortalAdminEmail("nitrodzen@gmail.com.evil.example")).toBe(false);
    expect(isPortalAdminEmail(null)).toBe(false);
  });

  it("rechecks the authenticated user against the database", async () => {
    mocks.findUser.mockResolvedValue({ id: "admin-1", email: PORTAL_ADMIN_EMAIL });

    await expect(getPortalAdminUser({ user: { id: "admin-1" } } as never)).resolves.toEqual({
      id: "admin-1",
      email: PORTAL_ADMIN_EMAIL,
    });
    expect(mocks.findUser).toHaveBeenCalledWith({
      where: { id: "admin-1" },
      select: { id: true, email: true },
    });
  });

  it("rejects an authenticated non-admin account", async () => {
    mocks.findUser.mockResolvedValue({ id: "user-1", email: "friend@example.com" });

    await expect(getPortalAdminUser({ user: { id: "user-1" } } as never)).resolves.toBeNull();
  });
});
