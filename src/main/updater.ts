import { app } from "electron";
import { existsSync } from "node:fs";
import { join } from "node:path";
import updaterPackage from "electron-updater";

export function configureUpdater() {
  const supported =
    app.isPackaged &&
    process.platform === "win32" &&
    !process.env.PORTABLE_EXECUTABLE_FILE &&
    existsSync(join(process.resourcesPath, "app-update.yml"));
  const updater = updaterPackage.autoUpdater;
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;
  let available: string | undefined,
    ready = false;
  return {
    async check() {
      if (!supported) return { state: "unconfigured" as const };
      const result = await updater.checkForUpdates();
      available = result?.isUpdateAvailable
        ? result.updateInfo.version
        : undefined;
      return available
        ? { state: "available" as const, version: available }
        : { state: "current" as const };
    },
    async download() {
      if (!supported || !available) return false;
      await updater.downloadUpdate();
      ready = true;
      return true;
    },
    install() {
      if (!supported || !ready) return;
      updater.quitAndInstall(false, true);
    },
  };
}
