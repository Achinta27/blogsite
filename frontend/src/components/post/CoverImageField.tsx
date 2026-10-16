import { useEffect, useMemo, useRef } from 'react';
import { ImagePlus } from 'lucide-react';
import type { CoverImage } from '../../types';
import { ACCEPTED_COVER_TYPES } from '../../lib/editor';


interface Props {
  saved: CoverImage | null;
  pendingFile: File | null;
  removed: boolean;
  alt: string;
  uploadProgress: number | null;
  error: string | null;
  onSelect: (file: File) => void;
  onRemove: () => void;
  onUndo: () => void;
  onAltChange: (alt: string) => void;
}

export const CoverImageField = ({
  saved,
  pendingFile,
  removed,
  alt,
  uploadProgress,
  error,
  onSelect,
  onRemove,
  onUndo,
  onAltChange,
}: Props) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrl = useMemo(() => (pendingFile ? URL.createObjectURL(pendingFile) : null), [pendingFile]);
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const shownUrl = previewUrl ?? (removed ? null : saved?.url ?? null);

  return (
    <div>
      <span className="field-label" id="cover-label">
        Cover image
      </span>

      {shownUrl ? (
        <div className="overflow-hidden rounded-[3px] border border-rule-soft">
          <div className="relative aspect-[3/2] bg-paper-deep">
            <img src={shownUrl} alt={alt || 'Cover preview'} className="h-full w-full object-cover" />
            {uploadProgress !== null && (
              <div className="absolute inset-x-0 bottom-0 bg-ink/70 px-3 py-2 text-xs text-paper" role="status">
                Uploading… {uploadProgress}%
                <div className="mt-1 h-1 bg-paper/30">
                  <div className="h-full bg-paper" style={{ width: `${uploadProgress}%` }} />
                </div>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-rule-soft bg-paper px-3 py-2">
            {pendingFile && <span className="mr-auto truncate text-xs text-muted">New image · uploads when you save</span>}
            {!pendingFile && <span className="mr-auto text-xs text-muted">Current cover</span>}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => inputRef.current?.click()}>
              Replace
            </button>
            {pendingFile ? (
              <button type="button" className="btn btn-ghost btn-sm" onClick={onUndo}>
                Discard
              </button>
            ) : (
              <button type="button" className="btn btn-ghost btn-sm text-danger" onClick={onRemove}>
                Remove
              </button>
            )}
          </div>
        </div>
      ) : (
        <button
          type="button"
          aria-describedby="cover-help"
          onClick={() => inputRef.current?.click()}
          className="flex aspect-[3/2] w-full flex-col items-center justify-center gap-2 rounded-[3px] border border-dashed border-rule bg-paper text-sm text-muted transition-colors hover:border-ink-soft hover:text-ink"
        >
          <ImagePlus aria-hidden className="h-6 w-6" />
          Add a cover image
        </button>
      )}

      {removed && !pendingFile && saved && (
        <p className="field-hint">
          The cover will be removed when you save.{' '}
          <button type="button" className="link" onClick={onUndo}>
            Undo
          </button>
        </p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_COVER_TYPES.join(',')}
        className="sr-only"
        aria-labelledby="cover-label"
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onSelect(file);
          e.target.value = '';
        }}
      />
      <p id="cover-help" className="field-hint">
        JPEG, PNG or WebP, up to 5 MB. Landscape images work best.
      </p>
      {error && <p className="field-error" role="alert">{error}</p>}

      {(shownUrl || pendingFile) && (
        <div className="mt-4">
          <label htmlFor="cover-alt" className="field-label">
            Image description <span className="font-normal text-muted">(alt text)</span>
          </label>
          <input
            id="cover-alt"
            className="field text-sm"
            maxLength={200}
            value={alt}
            placeholder="Describe the image for readers using screen readers"
            onChange={(e) => onAltChange(e.target.value)}
          />
        </div>
      )}
    </div>
  );
};
