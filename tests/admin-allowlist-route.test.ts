import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  sessionUserId: "admin-1" as string | null,
  admin: { id: "admin-1", email: "nitrodzen@gmail.com" } as { id: string; email: string } | null,
}));

const mocks = vi.hoisted(() => ({
  getPortalAdminUser: vi.fn(),
  findEntries: vi.fn(),
  findEntry: vi.fn(),
  upsertEntry: vi.fn(),
  deleteEntry: vi.fn(),
  findUsers: vi.fn(),
  findUser: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(async () => (state.sessionUserId ? { user: { id: state.sessionUserId } } : null)),
}));

vi.mock("@/lib/auth", () => ({
  authOptions: {},
  getSessionUserId: () => state.sessionUserId,
}));

vi.mock("@/lib/admin", () => ({
  getPortalAdminUser: mocks.getPortalAdminUser,
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: () => true,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    registrationAllowlistEntry: {
      findMany: mocks.findEntries,
      findUnique: mocks.findEntry,
      upsert: mocks.upsertEntry,
      delete: mocks.deleteEntry,
    },
    user: {
      findMany: mocks.findUsers,
      findUnique: mocks.findUser,
    },
  },
}));

import { GET, POST } from "@/app/api/admin/allowlist/route";
import { DELETE } from "@/app/api/admin/allowlist/[id]/route";

const createdAt = new Date("2026-08-23T16:00:00.000Z");
const entry = {
  id: "invite-1",
  email: "friend@example.com",
  createdByUserId: "admin-1",
  createdByEmail: "nitrodzen@gmail.com",
  createdAt,
};

describe("admin allowlist API", () => {
  beforeEach(() => {
    state.sessionUserId = "admin-1";
    state.admin = { id: "admin-1", email: "nitrodzen@gmail.com" };
    mocks.getPortalAdminUser.mockReset().mockImplementation(async () => state.admin);
    mocks.findEntries.mockReset().mockResolvedValue([]);
    mocks.findEntry.mockReset().mockResolvedValue(null);
    mocks.upsertEntry.mockReset().mockResolvedValue(entry);
    mocks.deleteEntry.mockReset().mockResolvedValue(entry);
    mocks.findUsers.mockReset().mockResolvedValue([]);
    mocks.findUser.mockReset().mockResolvedValue(null);
  });

  it("requires authentication", async () => {
    state.sessionUserId = null;
    const response = await GET();

    expect(response.status).toBe(401);
    expect(mocks.getPortalAdminUser).not.toHaveBeenCalled();
  });

  it("rejects an authenticated non-admin", async () => {
    state.admin = null;
    const response = await GET();

    expect(response.status).toBe(403);
  });

  it("lists invitations and marks registered accounts", async () => {
    mocks.findEntries.mockResolvedValue([entry]);
    mocks.findUsers.mockResolvedValue([{ email: entry.email }]);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.entries).toEqual([
      expect.objectContaining({
        id: "invite-1",
        email: "friend@example.com",
        registered: true,
        createdAt: createdAt.toISOString(),
      }),
    ]);
  });

  it("normalizes and stores a new email with audit data", async () => {
    mocks.upsertEntry.mockImplementation(async ({ create }: { create: typeof entry }) => ({ ...entry, ...create }));

    const response = await POST(
      new Request("http://localhost/api/admin/allowlist", {
        method: "POST",
        body: JSON.stringify({ email: " Friend@Example.com " }),
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.entry.email).toBe("friend@example.com");
    expect(data.alreadyAllowed).toBe(false);
    expect(mocks.upsertEntry).toHaveBeenCalledWith({
      where: { email: "friend@example.com" },
      create: {
        email: "friend@example.com",
        createdByUserId: "admin-1",
        createdByEmail: "nitrodzen@gmail.com",
      },
      update: {},
    });
  });

  it("is idempotent for an existing invitation", async () => {
    mocks.findEntry.mockResolvedValue(entry);

    const response = await POST(
      new Request("http://localhost/api/admin/allowlist", {
        method: "POST",
        body: JSON.stringify({ email: entry.email }),
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.alreadyAllowed).toBe(true);
  });

  it("rejects invalid emails", async () => {
    const response = await POST(
      new Request("http://localhost/api/admin/allowlist", {
        method: "POST",
        body: JSON.stringify({ email: "not-an-email" }),
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.upsertEntry).not.toHaveBeenCalled();
  });

  it("deletes an existing invitation", async () => {
    mocks.findEntry.mockResolvedValue({ id: entry.id });

    const response = await DELETE(new Request(`http://localhost/api/admin/allowlist/${entry.id}`, { method: "DELETE" }), {
      params: Promise.resolve({ id: entry.id }),
    });

    expect(response.status).toBe(200);
    expect(mocks.deleteEntry).toHaveBeenCalledWith({ where: { id: entry.id } });
  });
});
