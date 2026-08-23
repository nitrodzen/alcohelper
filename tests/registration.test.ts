import { describe, expect, it } from "vitest";
import { getRegistrationAllowlist, isRegistrationAllowed, normalizeRegistrationEmail } from "@/lib/registration";

describe("registration allowlist", () => {
  it("allows exact invited emails case-insensitively", () => {
    const environment = { REGISTRATION_ALLOWED_EMAILS: "owner@example.com, Friend@Example.org" };

    expect(isRegistrationAllowed(" friend@example.org ", environment)).toBe(true);
    expect(isRegistrationAllowed("stranger@example.org", environment)).toBe(false);
  });

  it("allows exact configured domains but not lookalikes or subdomains", () => {
    const environment = { REGISTRATION_ALLOWED_DOMAINS: "example.com; team.example.org" };

    expect(isRegistrationAllowed("person@example.com", environment)).toBe(true);
    expect(isRegistrationAllowed("person@team.example.org", environment)).toBe(true);
    expect(isRegistrationAllowed("person@evil-example.com", environment)).toBe(false);
    expect(isRegistrationAllowed("person@sub.example.com", environment)).toBe(false);
  });

  it("fails closed when no invitations are configured", () => {
    expect(isRegistrationAllowed("person@example.com", {})).toBe(false);
    expect(getRegistrationAllowlist({})).toEqual({ emails: new Set(), domains: new Set() });
  });

  it("normalizes valid addresses and rejects malformed values", () => {
    expect(normalizeRegistrationEmail(" Friend@Example.com ")).toBe("friend@example.com");
    expect(normalizeRegistrationEmail("not-an-email")).toBeNull();
  });
});
