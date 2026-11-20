import { useState, type CSSProperties } from "react";
import DOMPurify from "dompurify";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Mathematics from '@tiptap/extension-mathematics';
import Image from '@tiptap/extension-image';
import { convertTypedMath,MathTools,snippets,type MathEdit } from './note-math';
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
      "hr", "span", "div", "img",
    ],
    ALLOWED_ATTR: ["href","data-type","data-latex","src","alt"],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|sabri-media:\/\/attachments\/)/i,
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
  const [math,setMath]=useState<MathEdit>(),[pdf,setPdf]=useState(false),[formulaMenu,setFormulaMenu]=useState(false);
  const insertImages=async(files:File[])=>{
    for(const file of files){
      const formats:Record<string,'png'|'jpg'|'gif'|'webp'>={'image/png':'png','image/jpeg':'jpg','image/gif':'gif','image/webp':'webp'};
      const format=formats[file.type];
      if(!format||file.size>5000000)continue;
      try{
        const image=await window.sabri.addNoteImage({id:initial.id,name:file.name,bytes:new Uint8Array(await file.arrayBuffer()),format});
        set(current=>({...current,attachments:[...current.attachments,image]}));
        editor?.chain().focus().setImage({src:'sabri-media://attachments/'+initial.id+'/'+image.path,alt:image.name}).run();
      }catch{tell(t('Could not attach the image'));}
    }
  };
  const editor = useEditor({
    extensions: [
      Mathematics.configure({
        katexOptions:{trust:false,maxExpand:100,maxSize:12,throwOnError:false},
        inlineOptions:{onClick:(node,position)=>setMath({latex:String(node.attrs.latex),position,block:false})},
        blockOptions:{onClick:(node,position)=>setMath({latex:String(node.attrs.latex),position,block:true})},
      }),
      Image.configure({allowBase64:false}),
      StarterKit.configure({
        link: { openOnClick: false, defaultProtocol: "https" },
      }),
    ],
    content: clean(initial.content),
    onUpdate:({editor})=>convertTypedMath(editor),
    editorProps: {
      attributes: { "aria-label": t("Note content"), role: "textbox" },
      handlePaste:(_view,event)=>{
        const files=[...(event.clipboardData?.files??[])].filter(file=>file.type.startsWith('image/'));
        if(files.length){void insertImages(files);return true;}return false;
      },
      handleDrop:(_view,event)=>{
        const files=[...(event.dataTransfer?.files??[])].filter(file=>file.type.startsWith('image/'));
        if(files.length){void insertImages(files);return true;}return false;
      },
      handleKeyDown:(view,event)=>{
        if(event.key!=='Enter'&&event.key!==' ')return false;
        const {$from}=view.state.selection;
        const command=/\/(frac|int|sum|matrix|formula)$/.exec($from.parent.textBetween(0,$from.parentOffset,''));
        if(!command)return false;
        const key=command[1]!;
        view.dispatch(view.state.tr.delete($from.pos-command[0].length,$from.pos));
        if(key==='formula')setFormulaMenu(true);else setMath({latex:snippets[key]??'',block:false});
        return true;
      },
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
        <div className={pdf?'addon-print-note':undefined}><h1 className="addon-print-only">{note.title}</h1><EditorContent editor={editor}/></div>
        <MathTools editor={editor} value={math} set={setMath}/>
        {formulaMenu&&<SavedFormulaPicker editor={editor} close={()=>setFormulaMenu(false)}/>}
        <div className="actions addon-section">
          <Button onClick={async()=>{
            try{const value=await window.sabri.addAttachment({id:initial.id,domain:'note',mode:'copied'});
              if(value){set(current=>({...current,attachments:[...current.attachments,value]}));if(/\.(png|jpe?g|gif|webp)$/i.test(value.path))editor?.chain().focus().setImage({src:'sabri-media://attachments/'+initial.id+'/'+value.path,alt:value.name}).run();}
            }catch{tell(t('Could not attach the file'));}
          }}>{t('Attach image or PDF')}</Button>
          <Button onClick={()=>{setPdf(true);window.setTimeout(()=>{void window.sabri.exportAddonPdf('note').catch(()=>tell(t('Could not export the PDF'))).finally(()=>setPdf(false));},50);}}>{t('Export note PDF')}</Button>
        </div>
        {note.attachments.map(item=><div key={item.id} className="data-row"><span className="grow">{item.name}</span><Button disabled={!initial.attachments.some(file=>file.id===item.id)} onClick={()=>void window.sabri.openAttachment({id:initial.id,domain:'note',file:item.id}).catch(()=>tell(t('Could not open the file')))}>{t('Open')}</Button></div>)}
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
function SavedFormulaPicker({editor,close}:{editor:ReturnType<typeof useEditor>;close:()=>void}){
  const {t}=useTranslation(),formulas=useSabri(state=>state.data.formulas);
  return <div className="addon-preview"><h3>{t('Insert a saved formula')}</h3>{active(formulas).map(item=><Button key={item.id} onClick={()=>{editor?.chain().focus().insertInlineMath({latex:item.latex}).run();close();}}>{item.name}</Button>)}<Button onClick={close}>{t('Cancel')}</Button></div>;
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
