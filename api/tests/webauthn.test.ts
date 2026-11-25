import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { base64urlEncode, verifyClientData, verifyPasskeyAssertion } from "../src/webauthn.js";

function cborHead(major:number,length:number):Buffer{
  if(length<24)return Buffer.from([(major<<5)|length]);
  if(length<256)return Buffer.from([(major<<5)|24,length]);
  const out=Buffer.alloc(3);out[0]=(major<<5)|25;out.writeUInt16BE(length,1);return out;
}
function cborInt(value:number):Buffer{return value>=0?cborHead(0,value):cborHead(1,-1-value)}
function cborBytes(value:Buffer):Buffer{return Buffer.concat([cborHead(2,value.length),value])}
function cborMap(values:Map<number,number|Buffer>):Buffer{
  const rows:Buffer[]=[cborHead(5,values.size)];
  for(const [key,value] of values){rows.push(cborInt(key));rows.push(typeof value==="number"?cborInt(value):cborBytes(value))}
  return Buffer.concat(rows);
}

describe("WebAuthn verification",()=>{
  it("rejects a mismatched challenge and origin",()=>{
    const clientData=Buffer.from(JSON.stringify({type:"webauthn.get",challenge:"right",origin:"https://example.com"})).toString("base64url");
    expect(()=>verifyClientData(clientData,"wrong","https://example.com","webauthn.get")).toThrow();
    expect(()=>verifyClientData(clientData,"right","https://evil.example","webauthn.get")).toThrow();
  });
  it("verifies a signed ES256 assertion with user presence and verification",()=>{
    const {publicKey,privateKey}=generateKeyPairSync("ec",{namedCurve:"prime256v1"});
    const jwk=publicKey.export({format:"jwk"});
    const x=Buffer.from(jwk.x!,"base64url"),y=Buffer.from(jwk.y!,"base64url");
    const cose=cborMap(new Map([[1,2],[3,-7],[-1,1],[-2,x],[-3,y]]));
    const challenge="test-challenge-base64url";
    const origin="https://example.com",rpId="example.com";
    const clientData=Buffer.from(JSON.stringify({type:"webauthn.get",challenge,origin}));
    const authData=Buffer.concat([createHash("sha256").update(rpId).digest(),Buffer.from([0x05]),Buffer.from([0,0,0,4])]);
    const signedData=Buffer.concat([authData,createHash("sha256").update(clientData).digest()]);
    const signature=sign("sha256",signedData,privateKey);
    const count=verifyPasskeyAssertion({authenticatorData:authData.toString("base64url"),clientDataJSON:clientData.toString("base64url"),signature:signature.toString("base64url"),publicKey:cose.toString("base64url"),expectedChallenge:challenge,expectedOrigin:origin,rpId});
    expect(count).toBe(4);
    expect(()=>verifyPasskeyAssertion({authenticatorData:authData.toString("base64url"),clientDataJSON:clientData.toString("base64url"),signature:Buffer.from("bad").toString("base64url"),publicKey:cose.toString("base64url"),expectedChallenge:challenge,expectedOrigin:origin,rpId})).toThrow();
  });
});
