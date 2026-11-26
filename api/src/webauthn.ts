import { createHash, createPublicKey, randomBytes, timingSafeEqual, verify as verifySignature } from "node:crypto";

type CborValue = number | string | Uint8Array | boolean | null | CborValue[] | Map<unknown, unknown>;
function cborLength(data: Buffer, offset: number, additional: number): { length: number; next: number } {
  if (additional < 24) return { length: additional, next: offset };
  if (additional === 24) return { length: data[offset]!, next: offset + 1 };
  if (additional === 25) return { length: data.readUInt16BE(offset), next: offset + 2 };
  if (additional === 26) return { length: data.readUInt32BE(offset), next: offset + 4 };
  if (additional === 27) {
    const value = data.readBigUInt64BE(offset);
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("CBOR integer too large.");
    return { length: Number(value), next: offset + 8 };
  }
  throw new Error("Unsupported CBOR length.");
}
function decodeCborAt(data: Buffer, offset: number): { value: CborValue; next: number } {
  if (offset >= data.length) throw new Error("Truncated CBOR.");
  const initial = data[offset]!, major = initial >>> 5, additional = initial & 31;
  if (major === 7) {
    if (additional === 20) return { value: false, next: offset + 1 };
    if (additional === 21) return { value: true, next: offset + 1 };
    if (additional === 22 || additional === 23) return { value: null, next: offset + 1 };
    throw new Error("Unsupported CBOR simple value.");
  }
  const { length, next } = cborLength(data, offset + 1, additional);
  if (major === 0) return { value: length, next };
  if (major === 1) return { value: -1 - length, next };
  if (major === 2) {
    const end = next + length; if (end > data.length) throw new Error("Truncated CBOR byte string.");
    return { value: new Uint8Array(data.subarray(next, end)), next: end };
  }
  if (major === 3) {
    const end = next + length; if (end > data.length) throw new Error("Truncated CBOR text.");
    return { value: data.toString("utf8", next, end), next: end };
  }
  if (major === 4) {
    const values: CborValue[] = []; let cursor = next;
    for (let i = 0; i < length; i++) { const item = decodeCborAt(data, cursor); values.push(item.value); cursor = item.next; }
    return { value: values, next: cursor };
  }
  if (major === 5) {
    const values = new Map<unknown, unknown>(); let cursor = next;
    for (let i = 0; i < length; i++) { const key = decodeCborAt(data, cursor); const val = decodeCborAt(data, key.next); values.set(key.value, val.value); cursor = val.next; }
    return { value: values, next: cursor };
  }
  if (major === 6) return decodeCborAt(data, next);
  throw new Error("Unsupported CBOR major type.");
}
export function decodeCbor(data: Buffer): CborValue { return decodeCborAt(data, 0).value; }
export function base64urlDecode(value: string): Buffer { return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64"); }
export function base64urlEncode(value: Buffer): string { return value.toString("base64url"); }
export function createWebAuthnChallenge(): string { return randomBytes(32).toString("base64url"); }
export function sha256Buffer(value: Buffer | string): Buffer { return createHash("sha256").update(value).digest(); }

export function verifyClientData(clientDataText: string, expectedChallenge: string, expectedOrigin: string, expectedType: "webauthn.create" | "webauthn.get"): Buffer {
  const raw = base64urlDecode(clientDataText);
  const client = JSON.parse(raw.toString("utf8")) as Record<string, unknown>;
  if (client.type !== expectedType || client.challenge !== expectedChallenge || client.origin !== expectedOrigin || client.crossOrigin === true) {
    throw new Error("WebAuthn client data does not match the expected challenge or origin.");
  }
  return raw;
}
function verifyRpAndFlags(authData: Buffer, rpId: string): { flags: number; counter: number } {
  if (authData.length < 37) throw new Error("Authenticator data is truncated.");
  const rpHash = sha256Buffer(rpId);
  if (!timingSafeEqual(authData.subarray(0, 32), rpHash)) throw new Error("Passkey RP ID does not match.");
  const flags = authData[32]!;
  if (!(flags & 0x01) || !(flags & 0x04)) throw new Error("Passkey must confirm user presence and verification.");
  return { flags, counter: authData.readUInt32BE(33) };
}
export function parseNoneAttestation(attestationText: string, rpId: string): { credentialId: string; publicKey: string; signCount: number } {
  const attestation = decodeCbor(base64urlDecode(attestationText));
  if (!(attestation instanceof Map) || attestation.get("fmt") !== "none" || !(attestation.get("authData") instanceof Uint8Array)) {
    throw new Error("Only none-attestation passkeys are supported.");
  }
  const authData = Buffer.from(attestation.get("authData") as Uint8Array);
  const { flags, counter } = verifyRpAndFlags(authData, rpId);
  if (!(flags & 0x40) || authData.length < 55) throw new Error("Passkey attested credential data is missing.");
  const credentialLength = authData.readUInt16BE(53);
  const credentialStart = 55;
  const credentialEnd = credentialStart + credentialLength;
  if (credentialLength < 1 || credentialEnd >= authData.length) throw new Error("Invalid passkey credential ID.");
  const credentialId = authData.subarray(credentialStart, credentialEnd);
  const keyData = decodeCborAt(authData, credentialEnd);
  if (!(keyData.value instanceof Map)) throw new Error("Invalid passkey public key.");
  const cose = keyData.value;
  const kty = cose.get(1), alg = cose.get(3);
  if (!((kty === 2 && alg === -7) || (kty === 3 && alg === -257))) throw new Error("Unsupported passkey public-key algorithm.");
  return { credentialId: base64urlEncode(credentialId), publicKey: base64urlEncode(authData.subarray(credentialEnd, keyData.next)), signCount: counter };
}
function publicKeyFromCose(publicKeyText: string) {
  const cose = decodeCbor(base64urlDecode(publicKeyText));
  if (!(cose instanceof Map)) throw new Error("Stored passkey key is malformed.");
  const kty = cose.get(1), alg = cose.get(3);
  if (kty === 2 && alg === -7 && cose.get(-1) === 1) {
    const x = cose.get(-2), y = cose.get(-3);
    if (!(x instanceof Uint8Array) || !(y instanceof Uint8Array)) throw new Error("Invalid EC passkey key.");
    return createPublicKey({ key: { kty: "EC", crv: "P-256", x: base64urlEncode(Buffer.from(x)), y: base64urlEncode(Buffer.from(y)) }, format: "jwk" });
  }
  if (kty === 3 && alg === -257) {
    const n = cose.get(-1), e = cose.get(-2);
    if (!(n instanceof Uint8Array) || !(e instanceof Uint8Array)) throw new Error("Invalid RSA passkey key.");
    return createPublicKey({ key: { kty: "RSA", n: base64urlEncode(Buffer.from(n)), e: base64urlEncode(Buffer.from(e)) }, format: "jwk" });
  }
  throw new Error("Unsupported stored passkey key.");
}
export function verifyPasskeyAssertion(args: { authenticatorData: string; clientDataJSON: string; signature: string; publicKey: string; expectedChallenge: string; expectedOrigin: string; rpId: string }): number {
  const clientData = verifyClientData(args.clientDataJSON, args.expectedChallenge, args.expectedOrigin, "webauthn.get");
  const authData = base64urlDecode(args.authenticatorData);
  const { counter } = verifyRpAndFlags(authData, args.rpId);
  const signedData = Buffer.concat([authData, sha256Buffer(clientData)]);
  const valid = verifySignature("sha256", signedData, publicKeyFromCose(args.publicKey), base64urlDecode(args.signature));
  if (!valid) throw new Error("Passkey signature verification failed.");
  return counter;
}
