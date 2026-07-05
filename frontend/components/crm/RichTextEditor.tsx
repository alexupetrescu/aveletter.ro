"use client";

import { useEffect, useState } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";

import type { TiptapDoc } from "@/lib/crm-api";
import MediaPicker from "./MediaPicker";

const EMPTY_DOC: TiptapDoc = { type: "doc", content: [{ type: "paragraph" }] };

function isNonEmptyDoc(doc: unknown): doc is TiptapDoc {
  return (
    typeof doc === "object" &&
    doc !== null &&
    (doc as TiptapDoc).type === "doc" &&
    Array.isArray((doc as { content?: unknown[] }).content)
  );
}

function ToolbarButton({
  active,
  onClick,
  children,
  title,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`px-2.5 py-1.5 text-[13px] rounded-sm transition-colors cursor-pointer ${
        active ? "bg-ink text-paper" : "text-soft hover:bg-ink/10"
      }`}
    >
      {children}
    </button>
  );
}

export default function RichTextEditor({
  value,
  onChange,
  placeholder = "Scrie aici…",
}: {
  value: TiptapDoc | null | undefined;
  onChange: (doc: TiptapDoc) => void;
  placeholder?: string;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: {
          openOnClick: false,
          autolink: true,
          defaultProtocol: "https",
        },
      }),
      Image.configure({ inline: false }),
      Placeholder.configure({ placeholder }),
    ],
    content: isNonEmptyDoc(value) ? value : EMPTY_DOC,
    onUpdate: ({ editor }) => {
      onChange(editor.getJSON() as TiptapDoc);
    },
    editorProps: {
      attributes: {
        class:
          "tiptap-editor focus:outline-none min-h-[260px] px-4 py-3 text-sm leading-relaxed",
      },
    },
  });

  const state = useEditorState({
    editor,
    selector: ({ editor }) => {
      if (!editor) return null;
      return {
        bold: editor.isActive("bold"),
        italic: editor.isActive("italic"),
        h2: editor.isActive("heading", { level: 2 }),
        h3: editor.isActive("heading", { level: 3 }),
        bulletList: editor.isActive("bulletList"),
        orderedList: editor.isActive("orderedList"),
        blockquote: editor.isActive("blockquote"),
        link: editor.isActive("link"),
      };
    },
  });

  // Sync external resets (e.g. switching records) without clobbering typing.
  useEffect(() => {
    if (!editor || editor.isFocused) return;
    const incoming = isNonEmptyDoc(value) ? value : EMPTY_DOC;
    if (JSON.stringify(editor.getJSON()) !== JSON.stringify(incoming)) {
      editor.commands.setContent(incoming, { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, value]);

  if (!editor) {
    return (
      <div className="border border-ink/15 rounded-sm bg-paper min-h-[300px] grid place-items-center text-muted text-sm">
        Se încarcă editorul…
      </div>
    );
  }

  function setLink() {
    if (!editor) return;
    const previous = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Adresa linkului:", previous ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }

  return (
    <div className="border border-ink/15 rounded-sm bg-paper">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-ink/10 px-2 py-1.5 sticky top-0 bg-paper z-10">
        <ToolbarButton
          title="Titlu secțiune"
          active={state?.h2}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          H2
        </ToolbarButton>
        <ToolbarButton
          title="Subtitlu"
          active={state?.h3}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          H3
        </ToolbarButton>
        <span className="w-px h-5 bg-ink/10 mx-1" />
        <ToolbarButton
          title="Bold"
          active={state?.bold}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <strong>B</strong>
        </ToolbarButton>
        <ToolbarButton
          title="Italic"
          active={state?.italic}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <em>I</em>
        </ToolbarButton>
        <ToolbarButton title="Link" active={state?.link} onClick={setLink}>
          Link
        </ToolbarButton>
        <span className="w-px h-5 bg-ink/10 mx-1" />
        <ToolbarButton
          title="Listă cu puncte"
          active={state?.bulletList}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          • Listă
        </ToolbarButton>
        <ToolbarButton
          title="Listă numerotată"
          active={state?.orderedList}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          1. Listă
        </ToolbarButton>
        <ToolbarButton
          title="Citat"
          active={state?.blockquote}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          &ldquo;Citat&rdquo;
        </ToolbarButton>
        <ToolbarButton
          title="Linie separatoare"
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
        >
          ―
        </ToolbarButton>
        <span className="w-px h-5 bg-ink/10 mx-1" />
        <ToolbarButton title="Imagine din media" onClick={() => setPickerOpen(true)}>
          Imagine
        </ToolbarButton>
      </div>
      <EditorContent editor={editor} />
      {pickerOpen && (
        <MediaPicker
          onClose={() => setPickerOpen(false)}
          onSelect={(asset) => {
            setPickerOpen(false);
            if (asset.url) {
              editor
                .chain()
                .focus()
                .setImage({ src: asset.url, alt: asset.alt_text || asset.title })
                .run();
            }
          }}
        />
      )}
    </div>
  );
}
