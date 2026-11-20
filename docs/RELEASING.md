# Building releases

Run `npm run dist` on Windows to create the NSIS setup package and portable executable. The development build works without a certificate.

To enable updates for a distribution build, configure Windows publisher signing with Electron Builder and supply the HTTPS endpoint in `SABRI_UPDATE_FEED` and the certificate publisher name in `SABRI_UPDATE_PUBLISHER` before running `npm run dist`. Publish the Windows installer, block map, and `latest.yml` together using your own release hosting. Keep the signing publisher consistent between versions. The local build has no update feed.

Use `npx electron-builder --mac` or `npx electron-builder --linux` after `npm run build` on the corresponding platform. Signing and notarization depend on your publisher credentials.
