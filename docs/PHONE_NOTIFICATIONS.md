# Phone notifications

## Same-Wi-Fi inbox

Start **Phone sync** on Sabri for Windows. Connect your phone to the same Wi-Fi and scan a fresh pairing QR code. Open **Notifications** on the phone to see upcoming prayer, class, task, exam, habit, and timer reminders as Sabri sends them. **Send test alert** on the desktop checks the connection. This inbox and the planner sync over your Wi-Fi even when the internet is unavailable.

## Lock-screen and background alerts

1. On the desktop, turn on **Secure Wi-Fi for system alerts** under **Phone sync**. Export `Sabri-WiFi.cer` and transfer the certificate to your own phone. Verify its SHA-256 fingerprint against the one displayed by Sabri before trusting it. The certificate establishes trust in the desktop’s local HTTPS server and its key should stay on that computer.
2. On Android, install it as a **CA certificate** in the phone’s certificate or credential settings. Open the secure pairing link in Chrome or another browser that supports Web Push. On iPhone or iPad, install the profile and enable full trust under **Settings → General → About → Certificate Trust Settings**.
3. Start Secure Wi-Fi and generate a new QR code. On iOS or iPadOS 16.4 and later, open the secure page in Safari and add it to the Home Screen before enabling notifications. Use **Copy pairing link** on the pairing page to continue inside the Home Screen app if needed.
4. Pair the phone, open **Notifications**, tap **Enable system alerts**, and allow the prompt. Use **Send test alert** on the desktop. Each phone controls its own subscription and can disable it in the same panel.
5. Leave Sabri running with Secure Wi-Fi enabled. The browser’s push service needs internet access to wake the phone and display alerts when the app is closed. The encrypted payload contains the reminder title and body. The phone opens the full planner over the same local Wi-Fi connection.

If the desktop’s address or port changes, open its new secure URL and pair again. If you remove Sabri or stop using Secure Wi-Fi, remove the Sabri CA from the phone’s trusted certificates.

[Apple certificate trust](https://support.apple.com/en-us/102390) · [WebKit’s iPhone and iPad Web Push requirements](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/) · [Google’s Android certificate settings](https://support.google.com/pixelphone/answer/2844832)
