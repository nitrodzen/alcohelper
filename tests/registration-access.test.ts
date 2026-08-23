import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findEntry: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    registrationAllowlistEntry: {
      findUnique: mocks.findEntry,
    },
  },
}));

import { isRegistrationAllowedForSignup } from "@/lib/registration-access";

describe("database-backed registration access", () => {
  beforeEach(() => {
    mocks.findEntry.mockReset();
  });

  it("keeps environment invitations as a fallback without querying the database", async () => {
    await expect(
      isRegistrationAllowedForSignup("friend@example.com", {
        REGISTRATION_ALLOWED_EMAILS: "friend@example.com",
      }),
    ).resolves.toBe(true);
    expect(mocks.findEntry).not.toHaveBeenCalled();
  });

  it("allows a normalized email stored by the admin", async () => {
    mocks.findEntry.mockResolvedValue({ id: "invite-1" });

    await expect(isRegistrationAllowedForSignup(" Friend@Example.com ", {})).resolves.toBe(true);
    expect(mocks.findEntry).toHaveBeenCalledWith({
      where: { email: "friend@example.com" },
      select: { id: true },
    });
  });

  it("fails closed when neither source contains the email", async () => {
    mocks.findEntry.mockResolvedValue(null);
    await expect(isRegistrationAllowedForSignup("unknown@example.com", {})).resolves.toBe(false);
  });
});
