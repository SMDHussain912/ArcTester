import { createHash, createHmac } from "node:crypto";

export interface R2StorageConfig {
  accountId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
}

export interface R2ObjectMetadata {
  key: string;
  sizeBytes: number;
  etag: string | null;
  contentType: string | null;
}

export class R2StorageError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly operation: "put" | "get" | "head",
  ) {
    super(message);
    this.name = "R2StorageError";
  }
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`R2 storage is not configured: missing ${name}.`);
  return value;
}

export function getR2StorageConfig(env: NodeJS.ProcessEnv = process.env): R2StorageConfig {
  const accountId = env.R2_ACCOUNT_ID?.trim() ?? "";
  const bucket = env.R2_BUCKET_NAME?.trim() ?? "";
  const accessKeyId = env.R2_ACCESS_KEY_ID?.trim() ?? "";
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY?.trim() ?? "";
  if (!accountId || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error("R2 storage is not configured. Set R2_ACCOUNT_ID, R2_BUCKET_NAME, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY.");
  }
  if (!/^[a-f0-9]{32}$/i.test(accountId)) throw new Error("R2_ACCOUNT_ID must be a 32-character Cloudflare account ID.");
  if (!/^[a-z0-9.-]{3,63}$/i.test(bucket) || bucket.startsWith(".") || bucket.endsWith(".")) {
    throw new Error("R2_BUCKET_NAME is invalid.");
  }
  return { accountId, bucket, accessKeyId, secretAccessKey, region: env.R2_REGION?.trim() || "auto" };
}

function sha256Hex(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function hmac(key: Uint8Array | string, value: string): Buffer {
  return createHmac("sha256", key).update(value).digest();
}

function awsEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function objectUrl(config: R2StorageConfig, key: string): URL {
  if (!key || key.length > 512 || key.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("R2 object key is invalid.");
  }
  const encodedKey = key.split("/").map(awsEncode).join("/");
  return new URL(`https://${config.accountId}.r2.cloudflarestorage.com/${awsEncode(config.bucket)}/${encodedKey}`);
}

function signedHeaders(
  config: R2StorageConfig,
  method: "PUT" | "GET" | "HEAD",
  url: URL,
  payloadHash: string,
  contentType?: string,
  now = new Date(),
): Record<string, string> {
  const amzDate = now.toISOString().replace(/[:-]|.d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const headers: Record<string, string> = {
    host: url.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  if (contentType) headers["content-type"] = contentType;
  const names = Object.keys(headers).sort();
  const canonicalHeaders = names.map((name) => `${name}:${headers[name].trim()}\n`).join("");
  const signedNames = names.join(";");
  const canonicalRequest = [
    method,
    url.pathname,
    url.searchParams.toString(),
    canonicalHeaders,
    signedNames,
    payloadHash,
  ].join("\n");
  const scope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const kDate = hmac(`AWS4${config.secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, config.region);
  const kService = hmac(kRegion, "s3");
  const kSigning = hmac(kService, "aws4_request");
  const signature = hmac(kSigning, stringToSign).toString("hex");
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, SignedHeaders=${signedNames}, Signature=${signature}`;
  return headers;
}

export class R2ObjectStorage {
  constructor(
    private readonly config: R2StorageConfig = getR2StorageConfig(),
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async putObject(key: string, bytes: Uint8Array, contentType: string): Promise<R2ObjectMetadata> {
    const url = objectUrl(this.config, key);
    const payloadHash = sha256Hex(bytes);
    const headers = signedHeaders(this.config, "PUT", url, payloadHash, contentType);
    const response = await this.fetchImpl(url, { method: "PUT", headers, body: new Uint8Array(bytes) });
    if (!response.ok) throw new R2StorageError("R2 rejected the object upload.", response.status, "put");
    return {
      key,
      sizeBytes: bytes.byteLength,
      etag: response.headers.get("etag"),
      contentType,
    };
  }

  async getObject(key: string): Promise<{ bytes: Uint8Array; metadata: R2ObjectMetadata }> {
    const url = objectUrl(this.config, key);
    const payloadHash = sha256Hex("");
    const response = await this.fetchImpl(url, {
      method: "GET",
      headers: signedHeaders(this.config, "GET", url, payloadHash),
    });
    if (!response.ok) throw new R2StorageError("R2 object could not be read.", response.status, "get");
    const bytes = new Uint8Array(await response.arrayBuffer());
    return {
      bytes,
      metadata: {
        key,
        sizeBytes: Number(response.headers.get("content-length") ?? bytes.byteLength),
        etag: response.headers.get("etag"),
        contentType: response.headers.get("content-type"),
      },
    };
  }

  async headObject(key: string): Promise<R2ObjectMetadata> {
    const url = objectUrl(this.config, key);
    const payloadHash = sha256Hex("");
    const response = await this.fetchImpl(url, {
      method: "HEAD",
      headers: signedHeaders(this.config, "HEAD", url, payloadHash),
    });
    if (!response.ok) throw new R2StorageError("R2 object metadata could not be read.", response.status, "head");
    return {
      key,
      sizeBytes: Number(response.headers.get("content-length") ?? 0),
      etag: response.headers.get("etag"),
      contentType: response.headers.get("content-type"),
    };
  }
}
