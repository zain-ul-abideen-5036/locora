/**
 * @vitest-environment node
 *
 * Buffer-heavy and log-oriented; no DOM involved.
 */
import { describe, expect, it } from "vitest";

import { redact } from "@/server/observability/logger";
import {
  MAX_PHOTO_BYTES,
  MAX_PHOTOS_PER_REPORT,
  sniffImageType,
  validateImage,
} from "@/server/storage/images";

// ---------------------------------------------------------------------------
// Upload validation
// ---------------------------------------------------------------------------

/** Real magic bytes, followed by filler so the buffer has plausible length. */
const PNG = Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), Buffer.alloc(64, 1)]);
const JPEG = Buffer.concat([Buffer.from("ffd8ff", "hex"), Buffer.alloc(64, 1)]);
const WEBP = Buffer.concat([
  Buffer.from("52494646", "hex"), // "RIFF"
  Buffer.from("00000000", "hex"), // length, unused by the sniffer
  Buffer.from("57454250", "hex"), // "WEBP"
  Buffer.alloc(64, 1),
]);

describe("sniffImageType", () => {
  it("recognises the three supported formats from their bytes", () => {
    expect(sniffImageType(PNG)).toBe("image/png");
    expect(sniffImageType(JPEG)).toBe("image/jpeg");
    expect(sniffImageType(WEBP)).toBe("image/webp");
  });

  it("returns null for anything else", () => {
    expect(sniffImageType(Buffer.from("<html><body>hello</body></html>"))).toBeNull();
    expect(sniffImageType(Buffer.from("GIF89a"))).toBeNull();
    expect(sniffImageType(Buffer.from("%PDF-1.7"))).toBeNull();
    expect(sniffImageType(Buffer.alloc(0))).toBeNull();
  });

  it("does not mistake a truncated header for a valid image", () => {
    // A file cut short mid-signature must not pass. Reading past the end of a
    // short buffer is also how a sniffer throws instead of rejecting.
    expect(sniffImageType(Buffer.from("89504e47", "hex"))).toBeNull();
    expect(sniffImageType(Buffer.from("ffd8", "hex"))).toBeNull();
    expect(sniffImageType(Buffer.from("52494646", "hex"))).toBeNull();
  });

  it("rejects a RIFF container that is not WebP", () => {
    // A WAV file is also RIFF. Checking only the first four bytes would accept
    // it as an image.
    const wav = Buffer.concat([
      Buffer.from("52494646", "hex"),
      Buffer.from("00000000", "hex"),
      Buffer.from("57415645", "hex"), // "WAVE"
      Buffer.alloc(32, 0),
    ]);
    expect(sniffImageType(wav)).toBeNull();
  });
});

describe("validateImage", () => {
  it("accepts a real image whose declared type matches its bytes", () => {
    const result = validateImage(PNG, "image/png");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.contentType).toBe("image/png");
      expect(result.extension).toBe("png");
    }
  });

  it("rejects a script disguised as an image", () => {
    // The attack this check exists for: a file named photo.png, declared
    // image/png, containing markup. Accepting it and serving it back would be
    // stored cross-site scripting against every visitor who opens the case.
    const payload = Buffer.from('<script>alert("xss")</script>');
    const result = validateImage(payload, "image/png");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/not a JPEG, PNG or WebP/i);
  });

  it("rejects a real image whose declared type is a lie", () => {
    // Usually a renamed file rather than an attack, and the message says so —
    // but either way the declared type is not trusted.
    const result = validateImage(JPEG, "image/png");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/actually a JPEG/i);
  });

  it("rejects an empty file", () => {
    const result = validateImage(Buffer.alloc(0), "image/png");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/empty/i);
  });

  it("rejects a file over the per-photograph limit", () => {
    const tooBig = Buffer.concat([
      Buffer.from("89504e470d0a1a0a", "hex"),
      Buffer.alloc(MAX_PHOTO_BYTES + 1, 1),
    ]);
    const result = validateImage(tooBig, "image/png");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/under 8MB/i);
  });

  it("checks the size before sniffing, so an oversized file is not decoded first", () => {
    // A 200MB buffer that is not an image should be refused for its size, not
    // walked byte by byte to establish it is also not a PNG.
    const huge = Buffer.alloc(MAX_PHOTO_BYTES + 1024, 0);
    const result = validateImage(huge, "image/png");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/under 8MB/i);
  });

  it("accepts a file with no declared type at all, if the bytes are right", () => {
    // Some clients send no Content-Type per part. The bytes are the authority,
    // so their absence is not itself a reason to refuse.
    const result = validateImage(WEBP, null);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.contentType).toBe("image/webp");
  });

  it("caps photographs per report at a number the UI also enforces", () => {
    expect(MAX_PHOTOS_PER_REPORT).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Log redaction
// ---------------------------------------------------------------------------

describe("log redaction", () => {
  it("removes credentials", () => {
    const output = redact({
      password: "hunter2",
      token: "eyJhbGciOi",
      accessToken: "abc",
      apiKey: "sk-live-1234",
      cookie: "locora_at=xyz",
      authorization: "Bearer abc",
      jti: "11111111-1111-4111-8111-111111111111",
    }) as Record<string, unknown>;

    for (const value of Object.values(output)) {
      expect(value).toBe("[redacted]");
    }
  });

  it("removes the personal data specific to this product", () => {
    const output = redact({
      contactPhone: "+92 300 1234567",
      contactEmail: "family@example.com",
      fullName: "Aisha Khan",
      lastSeenAddress: "Near Liberty Market",
      currentWhereabouts: "District hospital",
      lastSeenLatitude: 31.5204,
      lastSeenLongitude: 74.3587,
      reviewNotes: "Verified",
      policeReportNumber: "FIR-1",
    }) as Record<string, unknown>;

    // A log line naming a missing child, their address and their family's
    // phone number is a copy of the most sensitive record in the system,
    // sitting outside every access control the application has.
    for (const [key, value] of Object.entries(output)) {
      expect(value, `${key} was not redacted`).toBe("[redacted]");
    }
  });

  it("matches keys case-insensitively and as substrings", () => {
    const output = redact({
      REPORTER_PHONE: "+92 300 1234567",
      user_email_address: "a@b.co",
      ContactName: "Farah",
      nestedFullName: "Aisha",
    }) as Record<string, unknown>;

    for (const value of Object.values(output)) {
      expect(value).toBe("[redacted]");
    }
  });

  it("keeps the operational fields that make a log line useful", () => {
    const output = redact({
      reportId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      status: "published",
      durationMs: 42,
      ok: true,
      city: "Lahore",
    }) as Record<string, unknown>;

    // Over-redacting is the safe direction, but a logger that redacted
    // everything would be a logger nobody could debug with.
    expect(output.reportId).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(output.status).toBe("published");
    expect(output.durationMs).toBe(42);
    expect(output.ok).toBe(true);
    expect(output.city).toBe("Lahore");
  });

  it("redacts inside nested objects and arrays", () => {
    const output = redact({
      report: { id: "x", contactPhone: "+92 300 1234567" },
      reports: [{ fullName: "Aisha" }],
    }) as { report: Record<string, unknown>; reports: Record<string, unknown>[] };

    expect(output.report.id).toBe("x");
    expect(output.report.contactPhone).toBe("[redacted]");
    expect(output.reports[0]?.fullName).toBe("[redacted]");
  });

  it("stops descending rather than recursing forever on a cycle", () => {
    // A circular object would otherwise hang the process from inside a logger,
    // which is the worst possible place for an infinite loop.
    const cyclic: Record<string, unknown> = { id: "x" };
    cyclic.self = cyclic;

    expect(() => redact(cyclic)).not.toThrow();
    expect(JSON.stringify(redact(cyclic))).toContain("[truncated]");
  });

  it("truncates a very long string and a very long array", () => {
    const output = redact({
      description: "x".repeat(2000),
      items: Array.from({ length: 100 }, (_, index) => index),
    }) as { description: string; items: number[] };

    expect(output.description.length).toBeLessThan(600);
    expect(output.description.endsWith("…")).toBe(true);
    // An accidental log of a whole result set should not become a
    // thousand-line entry.
    expect(output.items).toHaveLength(20);
  });

  it("reduces an Error to its name and message, with no stack", () => {
    const output = redact(new Error("boom")) as Record<string, unknown>;
    expect(output).toEqual({ name: "Error", message: "boom" });
  });

  it("passes null and undefined through untouched", () => {
    expect(redact(null)).toBeNull();
    expect(redact(undefined)).toBeUndefined();
  });
});
