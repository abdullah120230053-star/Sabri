import { useState, type CSSProperties } from "react";
import DOMPurify from "dompurify";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Code,
  Heading2,
  Italic,
  Link2,
  List,
  ListOrdered,
  Pin,
  Plus,
  StickyNote,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { active, noteSchema, type RecordFor } from "../shared/schema";
import { fresh, remove, save, tell, useSabri } from "./store";
import {
  Button,
  Empty,
  Field,
  FormActions,
  IconButton,
  Modal,
  PageHead,
  Panel,
  Segments,
} from "./ui";

type Note = RecordFor<"notes">;
const clean = (html: string) =>
  DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "p",
      "h1",
      "h2",
      "h3",
      "ul",
      "ol",
      "li",
      "blockquote",
      "strong",
      "em",
      "s",
      "code",
      "pre",
      "br",
      "a",
      "hr",
    ],
    ALLOWED_ATTR: ["href"],
  });
const plain = (html: string) => DOMPurify.sanitize(html, { ALLOWED_TAGS: [] });
const newNote = () => ({
  ...noteSchema.parse({
    ...fresh(),
    title: "Note",
    content: "",
    tags: [],
    pinned: false,
    color: "#7355c8",
  }),
  title: "",
});

function NoteForm({
  initial,
  close,
  capture = false,
}: {
  initial: Note;
  close(): void;
  capture?: boolean;
}) {
  const { t } = useTranslation(),
    courses = useSabri((s) => s.data.courses);
  const [note, set] = useState(initial),
    [link, setLink] = useState<string>(),
    [tags, setTags] = useState(initial.tags.join(", "));
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        link: { openOnClick: false, defaultProtocol: "https" },
      }),
    ],
    content: clean(initial.content),
    editorProps: {
      attributes: { "aria-label": t("Note content"), role: "textbox" },
    },
  });
  return (
    <form
      className="form-grid"
      onSubmit={async (event) => {
        event.preventDefault();
        const content = clean(editor?.getHTML() ?? "");
        if (
          await save("notes", {
            ...note,
            content,
            tags: tags
              .split(",")
              .map((value) => value.trim().slice(0, 80))
              .filter(Boolean)
              .slice(0, 40),
          })
        ) {
          if (capture) tell(t("Saved"));
          close();
        }
      }}
    >
      <Field label={t("Title")} wide>
        <input
          autoFocus
          maxLength={200}
          required
          value={note.title}
          onChange={(e) => set({ ...note, title: e.target.value })}
        />
      </Field>
      {!capture && (
        <>
          <Field label={t("Course")}>
            <select
              value={note.courseId ?? ""}
              onChange={(e) =>
                set({ ...note, courseId: e.target.value || undefined })
              }
            >
              <option value="">{t("No course")}</option>
              {active(courses).map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("Tags")}>
            <input value={tags} onChange={(e) => setTags(e.target.value)} />
          </Field>
        </>
      )}
      <div className="wide rich-text">
        <div
          className="editor-toolbar"
          role="group"
          aria-label={t("Text formatting")}
        >
          <IconButton
            icon={Bold}
            label={t("Bold")}
            onClick={() => editor?.chain().focus().toggleBold().run()}
          />
          <IconButton
            icon={Italic}
            label={t("Italic")}
            onClick={() => editor?.chain().focus().toggleItalic().run()}
          />
          <IconButton
            icon={Heading2}
            label={t("Heading")}
            onClick={() =>
              editor?.chain().focus().toggleHeading({ level: 2 }).run()
            }
          />
          <IconButton
            icon={List}
            label={t("Bullet list")}
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
          />
          <IconButton
            icon={ListOrdered}
            label={t("Numbered list")}
            onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          />
          <IconButton
            icon={Code}
            label={t("Code block")}
            onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
          />
          <IconButton
            icon={Link2}
            label={t("Insert link")}
            onClick={() => setLink(editor?.getAttributes("link").href ?? "")}
          />
        </div>
        {link !== undefined && (
          <div className="actions editor-link">
            <input
              aria-label={t("Link URL")}
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://…"
            />
            <Button
              onClick={() => {
                if (!link.trim()) {
                  editor
                    ?.chain()
                    .focus()
                    .extendMarkRange("link")
                    .unsetLink()
                    .run();
                  setLink(undefined);
                  return;
                }
                try {
                  const url = new URL(link);
                  if (!["https:", "http:", "mailto:"].includes(url.protocol))
                    throw Error();
                  editor
                    ?.chain()
                    .focus()
                    .extendMarkRange("link")
                    .setLink({ href: url.href })
                    .run();
                  setLink(undefined);
                } catch {
                  tell(t("Enter a valid website or email link."));
                }
              }}
            >
              {t("Apply")}
            </Button>
            <Button onClick={() => setLink(undefined)}>{t("Cancel")}</Button>
          </div>
        )}
        <EditorContent editor={editor} />
      </div>
      {!capture && (
        <>
          <Field label={t("Color")}>
            <input
              type="color"
              value={note.color}
              onChange={(e) => set({ ...note, color: e.target.value })}
            />
          </Field>
          <label className="check-label">
            <input
              type="checkbox"
              checked={note.pinned}
              onChange={(e) => set({ ...note, pinned: e.target.checked })}
            />
            {t("Pinned")}
          </label>
        </>
      )}
      <FormActions close={close} />
    </form>
  );
}
export function NotesPage() {
  const { t } = useTranslation(),
    data = useSabri((s) => s.data);
  const [params, update] = useSearchParams(),
    [selected, set] = useState<Note>(),
    [search, query] = useState(""),
    [courseId, setCourse] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const notes = active(data.notes)
    .filter(
      (item) =>
        (!courseId || item.courseId === courseId) &&
        [item.title, plain(item.content), ...item.tags]
          .join(" ")
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort(
      (a, b) =>
        Number(b.pinned) - Number(a.pinned) ||
        b.updatedAt.localeCompare(a.updatedAt),
    );
  const note = selected ?? (params.has("new") ? newNote() : undefined);
  const close = () => {
    set(undefined);
    if (params.has("new")) update({});
  };
  return (
    <>
      <PageHead
        title={t("Notes")}
        description={t("Capture ideas, lecture notes, and quick reminders.")}
        action={
          <Button variant="primary" icon={Plus} onClick={() => set(newNote())}>
            {t("New note")}
          </Button>
        }
      />
      <div className="toolbar">
        <div className="actions">
          <input
            type="search"
            aria-label={t("Search notes")}
            placeholder={t("Search notes")}
            value={search}
            onChange={(e) => query(e.target.value)}
          />
          <select
            aria-label={t("Course")}
            value={courseId}
            onChange={(e) => setCourse(e.target.value)}
          >
            <option value="">{t("All courses")}</option>
            {active(data.courses).map((course) => (
              <option key={course.id} value={course.id}>
                {course.name}
              </option>
            ))}
          </select>
        </div>
        <Segments<typeof view>
          label={t("Notes view")}
          value={view}
          onChange={setView}
          options={[
            { value: "grid", label: t("Grid") },
            { value: "list", label: t("List") },
          ]}
        />
      </div>
      {notes.length ? (
        <div className={"notes-grid notes-" + view}>
          {notes.map((item) => (
            <button
              className="panel note-card"
              type="button"
              key={item.id}
              onClick={() => set(item)}
              style={{ "--note-color": item.color } as CSSProperties}
            >
              <span className="note-heading">
                <strong>{item.title}</strong>
                {item.pinned && <Pin size={15} />}
              </span>
              <p>{plain(item.content).slice(0, 241)}</p>
              <div className="actions">
                {item.tags.map((tag) => (
                  <span className="pill" key={tag}>
                    {tag}
                  </span>
                ))}
              </div>
            </button>
          ))}
        </div>
      ) : (
        <Panel title={t("Notes")} icon={StickyNote}>
          <Empty
            icon={StickyNote}
            title={t("No notes to show")}
            action={
              <Button icon={Plus} onClick={() => set(newNote())}>
                {t("New note")}
              </Button>
            }
          />
        </Panel>
      )}
      {note && (
        <Modal title={t(note.title ? "Edit note" : "New note")} close={close}>
          <NoteForm key={note.id} initial={note} close={close} />
          {note.title && (
            <div className="modal-secondary">
              <Button
                variant="danger"
                onClick={() => {
                  void remove("notes", note);
                  close();
                }}
              >
                {t("Delete")}
              </Button>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
export function CapturePage() {
  const { t } = useTranslation(),
    [note, setNote] = useState(newNote);
  return (
    <main className="mini">
      <Panel title={t("Quick note")} icon={StickyNote}>
        <NoteForm
          key={note.id}
          initial={note}
          close={() => setNote(newNote())}
          capture
        />
      </Panel>
    </main>
  );
}
