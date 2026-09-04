/**
 * Object storage for report photographs, on Vercel Blob.
 *
 * Vercel Blob rather than S3 or R2 because it lives in the same account as the
 * deployment: one vendor, one credential, and the token is injected
 * automatically when a store is linked to the project. There is nothing S3 does
 * here that it does not.
 *
 * ## Key naming
 *
 * `reports/<report-id>/<random>.<ext>`
 *
 * The random component is generated server-side and the client never supplies
 * any part of the key. That matters more than it looks: a client-influenced key
 * is a path-traversal and an overwrite primitive at once. Grouping by report id
 * also makes deleting a case's photographs a prefix operation rather than a
 * per-row lookup.
 *
 * `addRandomSuffix` is switched off precisely because the key already contains
 * a UUID — there is nothing to collide with, and leaving it on would mean the
 * stored key differs from the one we generated.
 *
 * ## Public URLs, and what that means
 *
 * Vercel Blob objects are served from a public hostname, so a photograph's URL
 * is a bearer capability: unguessable, but not access-controlled. That is a
 * deliberate trade and worth stating plainly.
 *
 * The alternative — proxying every image through an authenticated route — would
 * put a serverless invocation and a database lookup in front of every thumbnail
 * on the feed, and would make the public case feed, whose entire purpose is for
 * a stranger to recognise a face, unable to show one. What the URL does *not*
 * do is leak: it is a 32-hex-character random path, it is never returned by an
 * API response for a report the caller may not see (see
 * src/server/reports/visibility.ts), the pages that show it are `no-store`, and
 * `X-Robots-Tag: noindex` keeps it out of search results. Photographs are
 * deleted from the store when a case is taken down, which revokes the
 * capability.
 */
import { del, put } from "@vercel/blob";

import { env } from "@/server/config/env";
import { logger } from "@/server/observability/logger";

import type { AllowedImageType } from "./images";

export interface StoredPhoto {
  url: string;
  pathname: string;
  contentType: AllowedImageType;
  byteSize: number;
}

function assertConfigured(): void {
  if (!env.blobToken) {
    throw new Error(
      "BLOB_READ_WRITE_TOKEN is not set, so photographs cannot be stored.\n" +
        "  Vercel: link a Blob store to the project and the token is injected automatically.\n" +
        "  Local: copy the token from the store's page in the Vercel dashboard into .env.local.",
    );
  }
}

export function storageConfigured(): boolean {
  return Boolean(env.blobToken);
}

export async function storeReportPhoto(
  reportId: string,
  data: Buffer,
  contentType: AllowedImageType,
  extension: string,
): Promise<StoredPhoto> {
  assertConfigured();

  const key = `reports/${reportId}/${crypto.randomUUID().replace(/-/g, "")}.${extension}`;

  const result = await put(key, data, {
    access: "public",
    token: env.blobToken,
    contentType,
    // The verified type, never the declared one — see storage/images.ts.
    addRandomSuffix: false,
    // Content is immutable: a new photograph gets a new key, so nothing at this
    // key will ever change and it can be cached for as long as a browser likes.
    cacheControlMaxAge: 31_536_000,
  });

  return {
    url: result.url,
    pathname: result.pathname,
    contentType,
    byteSize: data.length,
  };
}

/**
 * Removes stored objects.
 *
 * Failure is logged, not thrown. This is called while taking a case down or
 * rejecting a report, and an orphaned object in a bucket must not be allowed to
 * block the database change that removes the case from the site. The stray
 * object is a housekeeping problem; a report that stays visible because a
 * delete failed is a privacy incident.
 */
export async function deleteStoredPhotos(urlsOrPathnames: string[]): Promise<void> {
  if (urlsOrPathnames.length === 0) return;
  if (!env.blobToken) {
    logger.warn("Cannot delete stored photographs: BLOB_READ_WRITE_TOKEN is not set", {
      count: urlsOrPathnames.length,
    });
    return;
  }

  try {
    await del(urlsOrPathnames, { token: env.blobToken });
  } catch (error) {
    logger.error("Failed to delete stored photographs", {
      count: urlsOrPathnames.length,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
