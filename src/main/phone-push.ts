import { generateVAPIDKeys, sendNotification } from "web-push";
import { z } from "zod";
import type { PushSubscriptionData } from "../shared/phone";
import { Storage } from "./storage";

const keySet = z.object({
  publicKey: z.string().regex(/^[a-zA-Z0-9_-]{87}$/),
  privateKey: z.string().regex(/^[a-zA-Z0-9_-]{43}$/),
});
type Identity = z.infer<typeof keySet>;
type PushAlert = { id: string; title: string; body: string; kind: string };

export class PhonePush {
  private loading?: Promise<Identity>;
  constructor(private readonly storage: Storage) {}
  private identity() {
    return (this.loading ??= this.open().catch((error: unknown) => {
      this.loading = undefined;
      throw error;
    }));
  }
  private async open() {
    const value = await this.storage.readPhoneKeys("phone-push");
    if (value) return keySet.parse(value);
    const keys = keySet.parse(generateVAPIDKeys());
    await this.storage.writePhoneKeys("phone-push", keys);
    return keys;
  }
  async publicKey() {
    return (await this.identity()).publicKey;
  }
  async send(
    subscription: PushSubscriptionData,
    alert: PushAlert,
    origin: string,
  ) {
    const credentials = await this.identity();
    try {
      await sendNotification(subscription, JSON.stringify(alert), {
        vapidDetails: { ...credentials, subject: origin },
        TTL: 1200,
        timeout: 6000,
        urgency: "normal",
      });
      return "sent" as const;
    } catch (error) {
      const status =
        typeof error === "object" && error !== null && "statusCode" in error
          ? error.statusCode
          : undefined;
      return status === 404 || status === 410
        ? ("expired" as const)
        : ("failed" as const);
    }
  }
}
