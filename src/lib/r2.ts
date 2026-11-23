import "server-only";
import { DeleteObjectsCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Cloudflare R2 is S3-compatible, so the S3 SDK talks to it. Browsers upload clips straight to the
// bucket with presigned URLs (a Vercel function can't take a 200 MB request body).
//
// Env: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET. See PRODUCTION.md.

export function filmStorageConfigured(): boolean {
  return !!(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET);
}

let client: S3Client | null = null;
function s3() {
  if (!filmStorageConfigured()) throw new Error("Film storage isn't set up.");
  client ??= new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! },
    // Newer SDKs add checksum parameters to presigned uploads that a browser can't satisfy.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  return client;
}
const bucket = () => process.env.R2_BUCKET!;

// Parent clips live in their own bucket (R2_CLIPS_BUCKET) because they are kept 60 days, while the
// film bucket's lifecycle rule erases everything after a day. Same account and credentials.
export function clipStorageConfigured(): boolean {
  return filmStorageConfigured() && !!process.env.R2_CLIPS_BUCKET;
}
export const clipBucket = () => process.env.R2_CLIPS_BUCKET!;

type BucketOpts = { bucket?: string; contentType?: string };

export function presignUpload(key: string, expiresInSec = 3600, opts: BucketOpts = {}) {
  return getSignedUrl(s3(), new PutObjectCommand({ Bucket: opts.bucket ?? bucket(), Key: key, ContentType: opts.contentType ?? "video/mp4" }), {
    expiresIn: expiresInSec,
  });
}

/** A short-lived link a browser can play inline (no download header). */
export function presignView(key: string, expiresInSec: number, opts: BucketOpts = {}) {
  return getSignedUrl(
    s3(),
    new GetObjectCommand({ Bucket: opts.bucket ?? bucket(), Key: key, ResponseContentType: opts.contentType ?? "video/mp4" }),
    { expiresIn: Math.max(60, Math.min(expiresInSec, 3600)) },
  );
}

export function presignDownload(key: string, filename: string, expiresInSec: number, opts: BucketOpts = {}) {
  return getSignedUrl(
    s3(),
    new GetObjectCommand({
      Bucket: opts.bucket ?? bucket(),
      Key: key,
      ResponseContentDisposition: `attachment; filename="${filename.replace(/"/g, "")}"`,
      ResponseContentType: opts.contentType ?? "video/mp4",
    }),
    { expiresIn: Math.max(60, Math.min(expiresInSec, 3600)) },
  );
}

/** The stored size of an object, or null when it isn't there. */
export async function objectSize(key: string, bucketName?: string): Promise<number | null> {
  try {
    const res = await s3().send(new HeadObjectCommand({ Bucket: bucketName ?? bucket(), Key: key }));
    return res.ContentLength ?? null;
  } catch {
    return null;
  }
}

export async function deleteObjects(keys: string[], bucketName?: string) {
  for (let i = 0; i < keys.length; i += 500) {
    const batch = keys.slice(i, i + 500);
    await s3().send(new DeleteObjectsCommand({ Bucket: bucketName ?? bucket(), Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true } }));
  }
}
