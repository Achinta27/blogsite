import { useState } from 'react';
import type { CoverImage as Cover } from '../../types';

/**
 * Cover image with a quiet paper-toned fallback when there is no image or it fails to load.
 * `ratio` keeps layout stable before the image arrives.
 */
export const CoverImage = ({
  cover,
  ratio = 'aspect-[3/2]',
  className = '',
  eager = false,
  sizes,
}: {
  cover: Cover | null | undefined;
  ratio?: string;
  className?: string;
  eager?: boolean;
  sizes?: string;
}) => {
  const [failed, setFailed] = useState(false);

  if (!cover?.url || failed) {
    return (
      <div aria-hidden className={`${ratio} ${className} relative overflow-hidden bg-paper-deep`}>
        <div className="absolute inset-y-0 left-[12%] w-px bg-rule" />
        <div className="absolute inset-x-0 top-[22%] h-px bg-rule-soft" />
      </div>
    );
  }

  return (
    <div className={`${ratio} ${className} overflow-hidden bg-paper-deep`}>
      <img
        src={cover.url}
        alt={cover.alt || ''}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        sizes={sizes}
        className="h-full w-full object-cover"
        onError={() => setFailed(true)}
      />
    </div>
  );
};
