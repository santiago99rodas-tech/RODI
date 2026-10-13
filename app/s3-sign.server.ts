import crypto from "node:crypto";

// Minimal AWS Signature V4 for S3-compatible storage (Cloudflare R2, Backblaze B2, AWS S3, MinIO...).
// Used only to push backup snapshots off the server; no SDK needed for a single PUT.

const hmac = (key: crypto.BinaryLike, data: string) => crypto.createHmac("sha256", key).update(data).digest();
const sha256Hex = (data: crypto.BinaryLike) => crypto.createHash("sha256").update(data).digest("hex");

const encodePath = (p: string) =>
  p.split("/").map((s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)).join("/");

export type SignInput = {
  method: string;
  url: string; // full URL, no query string needed for our use
  region: string;
  service: string;
  accessKeyId: string;
  secretAccessKey: string;
  headers?: Record<string, string>; // extra headers to sign (lowercase names)
  payloadHash: string;
  amzDate?: string; // 20150830T123600Z
};

export function signV4(input: SignInput): { headers: Record<string, string>; signature: string; canonicalRequest: string } {
  const u = new URL(input.url);
  const amzDate = input.amzDate ?? new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const day = amzDate.slice(0, 8);
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries({ ...(input.headers ?? {}), host: u.host, "x-amz-date": amzDate })) headers[k.toLowerCase()] = String(v).trim();
  const names = Object.keys(headers).sort();
  const canonicalHeaders = names.map((n) => `${n}:${headers[n]}\n`).join("");
  const signedHeaders = names.join(";");
  const query = [...u.searchParams.entries()]
    .map(([k, v]) => [encodeURIComponent(k), encodeURIComponent(v)] as const)
    .sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const canonicalRequest = [input.method.toUpperCase(), encodePath(decodeURIComponent(u.pathname)) || "/", query, canonicalHeaders, signedHeaders, input.payloadHash].join("\n");
  const scope = `${day}/${input.region}/${input.service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256Hex(canonicalRequest)].join("\n");
  const kDate = hmac(`AWS4${input.secretAccessKey}`, day);
  const kRegion = hmac(kDate, input.region);
  const kService = hmac(kRegion, input.service);
  const kSigning = hmac(kService, "aws4_request");
  const signature = crypto.createHmac("sha256", kSigning).update(stringToSign).digest("hex");
  const authorization = `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return { headers: { ...headers, Authorization: authorization }, signature, canonicalRequest };
}

export function putObjectRequest(opts: {
  endpoint: string; bucket: string; key: string; region: string; accessKeyId: string; secretAccessKey: string; body: Buffer;
}) {
  const url = `${opts.endpoint.replace(/\/+$/, "")}/${opts.bucket}/${encodePath(opts.key)}`;
  const payloadHash = sha256Hex(opts.body);
  const signed = signV4({
    method: "PUT", url, region: opts.region, service: "s3", accessKeyId: opts.accessKeyId, secretAccessKey: opts.secretAccessKey,
    headers: { "x-amz-content-sha256": payloadHash, "content-type": "application/gzip" }, payloadHash,
  });
  return { url, headers: signed.headers };
}
