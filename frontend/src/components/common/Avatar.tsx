import { useState } from 'react';
import { initials } from '../../lib/format';

const SIZES = { sm: 'h-7 w-7 text-[0.6875rem]', md: 'h-9 w-9 text-xs', lg: 'h-20 w-20 text-2xl' };

export const Avatar = ({ name, src, size = 'md' }: { name: string; src?: string; size?: keyof typeof SIZES }) => {
  const [failed, setFailed] = useState(false);
  const classes = `${SIZES[size]} shrink-0 rounded-full`;

  if (src && !failed) {
    return (
      <img
        src={src}
        alt=""
        className={`${classes} object-cover bg-paper-deep`}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span aria-hidden className={`${classes} inline-flex items-center justify-center bg-paper-deep font-medium text-ink-soft`}>
      {initials(name)}
    </span>
  );
};
