import { describe, expect, it } from "vitest";
import { getClientIp } from "@/lib/rate-limit";

describe("client IP detection", () => {
  it("prefers the proxy-provided real IP over a spoofed forwarded chain", () => {
    const request = new Request("https://alco-helper.ru", {
      headers: {
        "x-real-ip": "203.0.113.10",
        "x-forwarded-for": "127.0.0.1, 203.0.113.10",
      },
    });

    expect(getClientIp(request)).toBe("203.0.113.10");
  });

  it("uses the last forwarded address when x-real-ip is unavailable", () => {
    const request = new Request("https://alco-helper.ru", {
      headers: { "x-forwarded-for": "127.0.0.1, 198.51.100.7" },
    });

    expect(getClientIp(request)).toBe("198.51.100.7");
  });
});
