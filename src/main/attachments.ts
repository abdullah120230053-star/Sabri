import { randomUUID } from "node:crypto";
import { mkdir, stat, copyFile, writeFile, realpath } from "node:fs/promises";
import { basename, extname, isAbsolute, join, relative, sep } from "node:path";
import { BrowserWindow, dialog, shell } from "electron";
import { z } from "zod";
import type { Storage } from "./storage";

const maxBytes = 30_000_000;
export const attachmentAdd = z.object({
  id: z.uuid(),
  domain: z.enum(["assignment", "note"]),
  mode: z.enum(["copied", "linked"]).default("copied"),
});
export const attachmentOpen = z.object({
  id: z.uuid(),
  domain: z.enum(["assignment", "note"]),
  file: z.uuid().optional(),
  folder: z.boolean().default(false),
});
export const noteImageRequest = z.object({
  id: z.uuid(),
  name: z.string().max(180),
  bytes: z
    .instanceof(Uint8Array)
    .refine((bytes) => bytes.byteLength <= 5_000_000),
  format: z.enum(["png", "jpg", "webp", "gif"]),
});
export type Attachment = {
  id: string;
  name: string;
  mode: "copied" | "linked";
  path: string;
  sizeBytes?: number;
};
const safeFile = /^[a-f0-9-]{36}(?:\.[a-z0-9]{1,10})?$/i;
const previewExtensions = new Set([
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".txt",
  ".csv",
  ".docx",
  ".xlsx",
  ".pptx",
  ".odt",
  ".ods",
]);

export class Attachments {
  constructor(
    private readonly storage: Storage,
    private readonly root: string,
  ) {}
  private directory(input: { id: string; domain: "assignment" | "note" }) {
    return input.domain === "note"
      ? join(this.root, "notes", input.id)
      : join(this.root, input.id);
  }
  async add(input: z.infer<typeof attachmentAdd>, win: BrowserWindow) {
    const result = await dialog.showOpenDialog(win, {
      properties: ["openFile"],
    });
    const path = result.filePaths[0];
    if (!path) return null;
    const info = await stat(path);
    if (!info.isFile() || info.size > maxBytes)
      throw new Error("Attachments must be smaller than 30 MB.");
    const id = randomUUID(),
      suffix = extname(path).toLowerCase(),
      name = basename(path).slice(0, 200);
    if (input.mode === "linked")
      return {
        id,
        name,
        mode: "linked" as const,
        path: await realpath(path),
        sizeBytes: info.size,
      };
    const file = id + (/^\.[a-z0-9]{1,10}$/.test(suffix) ? suffix : "");
    const location = this.directory(input);
    await mkdir(location, { recursive: true });
    await copyFile(path, join(location, file));
    return {
      id,
      name,
      mode: "copied" as const,
      path: file,
      sizeBytes: info.size,
    };
  }
  async addImage(input: z.infer<typeof noteImageRequest>) {
    const id = randomUUID(),
      file = id + "." + input.format,
      location = this.directory({ id: input.id, domain: "note" });
    const body = Buffer.from(input.bytes);
    const valid = {
      png: body.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")),
      jpg: body.subarray(0, 3).equals(Buffer.from("ffd8ff", "hex")),
      webp:
        body.subarray(0, 4).toString() === "RIFF" &&
        body.subarray(8, 12).toString() === "WEBP",
      gif: /^GIF8[79]a$/.test(body.subarray(0, 6).toString()),
    };
    if (!valid[input.format]) throw new Error("Invalid image.");
    await mkdir(location, { recursive: true });
    await writeFile(join(location, file), body, { flag: "wx" });
    return {
      id,
      name: (input.name || "Image").slice(0, 180),
      mode: "copied" as const,
      path: file,
      sizeBytes: body.byteLength,
    };
  }
  private async localPath(directory: string, file: string) {
    if (!safeFile.test(file)) throw new Error("Invalid attachment.");
    const prefix = await realpath(this.root);
    const path = await realpath(join(directory, file));
    const beneath = relative(prefix, path);
    if (
      !beneath ||
      isAbsolute(beneath) ||
      beneath === ".." ||
      beneath.startsWith(".." + sep)
    )
      throw new Error("Invalid attachment.");
    return path;
  }
  async image(noteId: string, file: string) {
    if (
      !z.uuid().safeParse(noteId).success ||
      !/\.(?:png|jpg|jpeg|webp|gif)$/i.test(file)
    )
      throw new Error("Invalid image.");
    return this.localPath(this.directory({ id: noteId, domain: "note" }), file);
  }
  async open(input: z.infer<typeof attachmentOpen>) {
    const row =
      input.domain === "assignment"
        ? this.storage.state.assignments.find(
            (item) => item.id === input.id && !item.deletedAt,
          )
        : this.storage.state.notes.find(
            (item) => item.id === input.id && !item.deletedAt,
          );
    if (!row) throw new Error("Attachment record is no longer available.");
    if (input.folder) {
      const target = this.directory(input);
      await mkdir(target, { recursive: true });
      return !(await shell.openPath(target));
    }
    const file = row.attachments.find((item) => item.id === input.file);
    if (!file) throw new Error("Attachment is no longer available.");
    const path =
      file.mode === "linked"
        ? file.path
        : await this.localPath(this.directory(input), file.path);
    if (!previewExtensions.has(extname(path).toLowerCase())) {
      shell.showItemInFolder(path);
      return true;
    }
    return !(await shell.openPath(path));
  }
}
