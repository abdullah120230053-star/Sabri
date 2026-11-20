import "reflect-metadata";
import {
  AuthorityKeyIdentifierExtension,
  BasicConstraintsExtension,
  ExtendedKeyUsage,
  ExtendedKeyUsageExtension,
  KeyUsageFlags,
  KeyUsagesExtension,
  SubjectAlternativeNameExtension,
  SubjectKeyIdentifierExtension,
  X509Certificate,
  X509CertificateGenerator,
} from "@peculiar/x509";
import { createHash } from "node:crypto";
import { isIPv4 } from "node:net";
import { z } from "zod";
import { Storage } from "./storage";

const schema = z.object({
  certificate: z.string().max(8192),
  privateKey: z.string().max(8192),
});
const algorithm = { name: "ECDSA", namedCurve: "P-256", hash: "SHA-256" };
const validity = (days: number) => ({
  notBefore: new Date(Date.now() - 86400000),
  notAfter: new Date(Date.now() + 86400000 * days),
  signingAlgorithm: algorithm,
});
const createKeys = () =>
  crypto.subtle.generateKey(algorithm, true, ["sign", "verify"]);
async function pem(key: CryptoKey) {
  const data = await crypto.subtle.exportKey("pkcs8", key);
  return (
    "-----BEGIN PRIVATE KEY-----\n" +
    Buffer.from(data)
      .toString("base64")
      .match(/.{1,64}/g)!
      .join("\n") +
    "\n-----END PRIVATE KEY-----\n"
  );
}
export class PhoneCertificates {
  private loading?: Promise<z.infer<typeof schema>>;
  constructor(private readonly storage: Storage) {}
  private root() {
    return (this.loading ??= this.loadOrCreate().catch((error: unknown) => {
      this.loading = undefined;
      throw error;
    }));
  }
  private async loadOrCreate() {
    const saved = await this.storage.readPhoneKeys("phone-tls");
    if (saved) return schema.parse(saved);
    const keys = await createKeys();
    const issuer = await X509CertificateGenerator.createSelfSigned({
      ...validity(1825),
      keys,
      name: "CN=Sabri Wi-Fi Root CA",
      extensions: [
        new BasicConstraintsExtension(true, 0, true),
        new KeyUsagesExtension(
          KeyUsageFlags.keyCertSign | KeyUsageFlags.cRLSign,
          true,
        ),
        await SubjectKeyIdentifierExtension.create(keys.publicKey),
      ],
    });
    const value = {
      certificate: issuer.toString("pem"),
      privateKey: await pem(keys.privateKey),
    };
    await this.storage.writePhoneKeys("phone-tls", value);
    return value;
  }
  async certificate() {
    const root = new X509Certificate((await this.root()).certificate);
    const bytes = Buffer.from(root.rawData);
    return {
      bytes,
      fingerprint: createHash("sha256")
        .update(bytes)
        .digest("hex")
        .toUpperCase()
        .match(/../g)!
        .join(":"),
    };
  }
  async forAddress(address: string) {
    if (!isIPv4(address))
      throw new Error("A private IPv4 address is required.");
    const identity = await this.root();
    const root = new X509Certificate(identity.certificate);
    const key = Buffer.from(
      identity.privateKey.replaceAll(/-----[^-]+-----|\s/g, ""),
      "base64",
    );
    const signer = await crypto.subtle.importKey(
      "pkcs8",
      key,
      algorithm,
      false,
      ["sign"],
    );
    const leaf = await createKeys();
    const certificate = await X509CertificateGenerator.create({
      ...validity(180),
      subject: "CN=Sabri Companion",
      issuer: root.subject,
      publicKey: leaf.publicKey,
      signingKey: signer,
      extensions: [
        new BasicConstraintsExtension(false, undefined, true),
        new KeyUsagesExtension(KeyUsageFlags.digitalSignature, true),
        new ExtendedKeyUsageExtension([ExtendedKeyUsage.serverAuth]),
        new SubjectAlternativeNameExtension([{ type: "ip", value: address }]),
        await AuthorityKeyIdentifierExtension.create(root.publicKey),
      ],
    });
    return {
      key: await pem(leaf.privateKey),
      cert: certificate.toString("pem") + "\n" + identity.certificate,
    };
  }
}
