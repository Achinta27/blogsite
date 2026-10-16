import { useState, type FormEvent, type ReactNode } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import {
  Bold,
  Italic,
  Strikethrough,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Code,
  Link as LinkIcon,
  Minus,
  Undo2,
  Redo2,
} from 'lucide-react';

const ToolbarButton = ({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    aria-pressed={active}
    disabled={disabled}
    onMouseDown={(e) => e.preventDefault()} // keep the editor selection
    onClick={onClick}
    className={`inline-flex h-8 w-8 items-center justify-center rounded-[3px] text-ink-soft transition-colors hover:bg-paper-deep hover:text-ink disabled:opacity-35 ${
      active ? 'bg-paper-deep text-ink' : ''
    }`}
  >
    {children}
  </button>
);

const Divider = () => <span aria-hidden className="mx-1 h-5 w-px bg-rule" />;

const LinkForm = ({ editor, onDone }: { editor: Editor; onDone: () => void }) => {
  const [url, setUrl] = useState<string>(editor.getAttributes('link').href ?? '');
  const [error, setError] = useState<string | null>(null);

  const apply = (e: FormEvent) => {
    e.preventDefault();
    const value = url.trim();
    if (!value) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return onDone();
    }
    const href = /^(https?:|mailto:)/i.test(value) ? value : `https://${value}`;
    try {
      new URL(href);
    } catch {
      return setError('Enter a valid web address.');
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
    onDone();
  };

  return (
    <form onSubmit={apply} className="flex flex-wrap items-center gap-2 border-b border-rule-soft bg-paper px-3 py-2">
      <label htmlFor="editor-link" className="text-xs font-medium text-muted">
        Link
      </label>
      <input
        id="editor-link"
        autoFocus
        className="field max-w-sm flex-1 py-1 text-sm"
        placeholder="https://example.com"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && onDone()}
      />
      <button type="submit" className="btn btn-primary btn-sm">
        Apply
      </button>
      {editor.isActive('link') && (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => {
            editor.chain().focus().extendMarkRange('link').unsetLink().run();
            onDone();
          }}
        >
          Remove
        </button>
      )}
      <button type="button" className="btn btn-ghost btn-sm" onClick={onDone}>
        Cancel
      </button>
      {error && <p className="field-error w-full">{error}</p>}
    </form>
  );
};

export const RichTextEditor = ({
  initialContent,
  onChange,
  labelledBy,
}: {
  initialContent: string;
  onChange: (html: string) => void;
  labelledBy?: string;
}) => {
  const [linkOpen, setLinkOpen] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3, 4] } }),
      Link.configure({ openOnClick: false, autolink: true, protocols: ['mailto'] }),
      Placeholder.configure({ placeholder: 'Tell your story…' }),
    ],
    content: initialContent,
    editorProps: {
      attributes: {
        class: 'prose-article',
        role: 'textbox',
        'aria-multiline': 'true',
        ...(labelledBy ? { 'aria-labelledby': labelledBy } : { 'aria-label': 'Article body' }),
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  if (!editor) return null;

  return (
    <div className="rounded-[4px] border border-rule bg-card focus-within:border-ink-soft">
      <div
        role="toolbar"
        aria-label="Formatting"
        className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 rounded-t-[4px] border-b border-rule-soft bg-card/95 px-2 py-1.5 backdrop-blur"
      >
        <ToolbarButton label="Heading" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
          <Heading2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton label="Subheading" active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
          <Heading3 className="h-4 w-4" />
        </ToolbarButton>
        <Divider />
        <ToolbarButton label="Bold" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton label="Italic" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton label="Strikethrough" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}>
          <Strikethrough className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton label="Inline code" active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()}>
          <Code className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton label="Link" active={editor.isActive('link') || linkOpen} onClick={() => setLinkOpen((v) => !v)}>
          <LinkIcon className="h-4 w-4" />
        </ToolbarButton>
        <Divider />
        <ToolbarButton label="Bulleted list" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton label="Numbered list" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton label="Quote" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
          <Quote className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton label="Section break" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
          <Minus className="h-4 w-4" />
        </ToolbarButton>
        <Divider />
        <ToolbarButton label="Undo" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}>
          <Undo2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton label="Redo" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}>
          <Redo2 className="h-4 w-4" />
        </ToolbarButton>
      </div>
      {linkOpen && <LinkForm editor={editor} onDone={() => setLinkOpen(false)} />}
      <EditorContent editor={editor} className="editor-surface px-4 py-6 sm:px-8" />
    </div>
  );
};
