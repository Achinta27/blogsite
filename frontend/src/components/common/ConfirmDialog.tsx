import { useEffect, useRef, useState, type ReactNode } from 'react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  tone?: 'danger' | 'default';
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
}

/** Native <dialog>: focus trapping, Esc to close and inert background come from the browser. */
export const ConfirmDialog = ({ open, title, children, confirmLabel, tone = 'default', onConfirm, onClose }: ConfirmDialogProps) => {
  const ref = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const confirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="confirm-title"
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-[4px] border border-rule bg-card p-0 text-ink shadow-[0_20px_50px_-20px_rgb(27_26_23/0.35)] backdrop:bg-ink/30"
    >
      <div className="p-6">
        <h2 id="confirm-title" className="font-serif text-xl font-semibold">
          {title}
        </h2>
        {children && <div className="mt-2 text-[0.9375rem] leading-relaxed text-ink-soft">{children}</div>}
      </div>
      <div className="flex justify-end gap-2 border-t border-rule-soft bg-paper px-6 py-3.5">
        <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button
          type="button"
          className={`btn ${tone === 'danger' ? 'btn-danger' : 'btn-primary'}`}
          onClick={confirm}
          disabled={busy}
          autoFocus
        >
          {busy ? 'Working…' : confirmLabel}
        </button>
      </div>
    </dialog>
  );
};
