import { safeStorage } from "electron";
import { z } from "zod";
import type { Storage } from "../storage";

export const credentialSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("moodle_ics"), url: z.string() }),
  z.object({
    type: z.literal("moodle_ws"),
    url: z.string(),
    token: z.string(),
  }),
  z.object({
    type: z.literal("google_classroom"),
    clientId: z.string(),
    clientSecret: z.string(),
    refreshToken: z.string(),
  }),
]);
export type Credential = z.infer<typeof credentialSchema>;

export class TokenVault {
  constructor(private readonly storage: Storage) {}
  private available() {
    if (
      !safeStorage.isEncryptionAvailable() ||
      (process.platform === "linux" &&
        safeStorage.getSelectedStorageBackend() === "basic_text")
    )
      throw new Error("Encrypted storage is unavailable.");
  }
  async put(id: string, value: Credential) {
    this.available();
    await this.storage.writeSecret(
      id,
      safeStorage
        .encryptString(JSON.stringify(credentialSchema.parse(value)))
        .toString("base64"),
    );
  }
  async get(id: string) {
    this.available();
    const value = await this.storage.readSecret(id);
    return value
      ? credentialSchema.parse(
          JSON.parse(safeStorage.decryptString(Buffer.from(value, "base64"))),
        )
      : undefined;
  }
  clear(id: string) {
    return this.storage.deleteSecret(id);
  }
}
