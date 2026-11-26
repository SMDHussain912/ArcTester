import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/index.js";
import { postJson, startTestServer, type TestServer } from "./server.js";

function cborHead(major: number, length: number): Buffer {
  if (length < 24) return Buffer.from([(major << 5) | length]);
  if (length < 256) return Buffer.from([(major << 5) | 24, length]);
  const output = Buffer.alloc(3);
  output[0] = (major << 5) | 25;
  output.writeUInt16BE(length, 1);
  return output;
}
function cborInt(value: number): Buffer {
  return value >= 0 ? cborHead(0, value) : cborHead(1, -1 - value);
}
function cborBytes(value: Buffer): Buffer {
  return Buffer.concat([cborHead(2, value.length), value]);
}
function cborMap(values: Map<number, number | Buffer>): Buffer {
  const rows: Buffer[] = [cborHead(5, values.size)];
  for (const [key, value] of values) {
    rows.push(cborInt(key), typeof value === "number" ? cborInt(value) : cborBytes(value));
  }
  return Buffer.concat(rows);
}

let server: TestServer;
let previousOrigins: string | undefined;

describe("passkey assertion replay protection", () => {
  beforeAll(async () => {
    previousOrigins = process.env.CORS_ORIGINS;
    process.env.CORS_ORIGINS = "https://study.example.com";
    server = await startTestServer(buildApp);
  });
  afterAll(async () => {
    if (server) await server.close();
    if (previousOrigins === undefined) delete process.env.CORS_ORIGINS;
    else process.env.CORS_ORIGINS = previousOrigins;
  });

  it("consumes a challenge and rejects a reused authenticator counter", async () => {
    const profile = {
      fullName: "Passkey Replay Student",
      collegeName: "Test Polytechnic",
      collegeCode: "999",
      registrationNumber: "24999-CM-053",
      postalPin: "",
      branchName: "Computer Engineering (CME)",
      branchCode: "CM",
    };
    const registration = await postJson(server.baseUrl + "/auth/register", {
      ...profile,
      email: "passkey-replay@example.com",
      password: "passkey-replay-password",
    });
    expect(registration.status).toBe(201);
    const user = await server.db.user.update({
      where: { email: "passkey-replay@example.com" },
      data: { accessStatus: "APPROVED" },
    });

    const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const jwk = publicKey.export({ format: "jwk" });
    const x = Buffer.from(jwk.x!, "base64url");
    const y = Buffer.from(jwk.y!, "base64url");
    const cosePublicKey = cborMap(new Map([[1, 2], [3, -7], [-1, 1], [-2, x], [-3, y]]));
    const credentialId = Buffer.from("arc-passkey-replay-fixture").toString("base64url");
    await server.db.passkeyCredential.create({
      data: {
        userId: user.id,
        credentialId,
        publicKey: cosePublicKey.toString("base64url"),
        signCount: 0,
        name: "Replay test passkey",
        transports: JSON.stringify(["internal"]),
      },
    });

    const getOptions = async (): Promise<{ challengeId: string }> => {
      const response = await fetch(server.baseUrl + "/auth/passkeys/login/options", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://study.example.com" },
        body: JSON.stringify({ email: "passkey-replay@example.com" }),
      });
      expect(response.status).toBe(200);
      return response.json() as Promise<{ challengeId: string }>;
    };
    const makeAssertion = (challengeId: string, counter: number, assertionCredentialId = credentialId, assertionPrivateKey = privateKey) => {
      const origin = "https://study.example.com";
      const clientData = Buffer.from(JSON.stringify({ type: "webauthn.get", challenge: challengeId, origin }));
      const counterBytes = Buffer.alloc(4);
      counterBytes.writeUInt32BE(counter);
      const authenticatorData = Buffer.concat([
        createHash("sha256").update("study.example.com").digest(),
        Buffer.from([0x05]),
        counterBytes,
      ]);
      const signedData = Buffer.concat([authenticatorData, createHash("sha256").update(clientData).digest()]);
      const signature = sign("sha256", signedData, assertionPrivateKey);
      return {
        challengeId,
        credentialId: assertionCredentialId,
        clientDataJSON: clientData.toString("base64url"),
        authenticatorData: authenticatorData.toString("base64url"),
        signature: signature.toString("base64url"),
      };
    };
    const verify = async (assertion: ReturnType<typeof makeAssertion>) => {
      const response = await fetch(server.baseUrl + "/auth/passkeys/login/verify", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://study.example.com" },
        body: JSON.stringify(assertion),
      });
      await response.arrayBuffer();
      return response.status;
    };

    const firstOptions = await getOptions();
    const firstAssertion = makeAssertion(firstOptions.challengeId, 1);
    expect(await verify(firstAssertion)).toBe(200);
    expect(await verify(firstAssertion)).toBe(403); // consumed challenge cannot be replayed

    const secondOptions = await getOptions();
    const repeatedCounterAssertion = makeAssertion(secondOptions.challengeId, 1);
    expect(await verify(repeatedCounterAssertion)).toBe(403); // authenticator counter must advance
    // Counterless authenticators report zero. The one-time challenge must still
    // guarantee that two simultaneous valid assertions create only one session.
    const zeroCounterKeys = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const zeroJwk = zeroCounterKeys.publicKey.export({ format: "jwk" });
    const zeroCose = cborMap(new Map([
      [1, 2], [3, -7], [-1, 1],
      [-2, Buffer.from(zeroJwk.x!, "base64url")],
      [-3, Buffer.from(zeroJwk.y!, "base64url")],
    ]));
    const zeroCredentialId = Buffer.from("arc-passkey-zero-counter-fixture").toString("base64url");
    await server.db.passkeyCredential.create({
      data: {
        userId: user.id,
        credentialId: zeroCredentialId,
        publicKey: zeroCose.toString("base64url"),
        signCount: 0,
        name: "Counterless test passkey",
        transports: JSON.stringify(["internal"]),
      },
    });
    const zeroOptions = await getOptions();
    const zeroAssertion = makeAssertion(zeroOptions.challengeId, 0, zeroCredentialId, zeroCounterKeys.privateKey);
    const simultaneous = await Promise.all([verify(zeroAssertion), verify(zeroAssertion)]);
    expect(simultaneous.sort((a, b) => a - b)).toEqual([200, 403]);

    const stored = await server.db.passkeyCredential.findUnique({ where: { credentialId } });
    expect(stored?.signCount).toBe(1);
  });
});
