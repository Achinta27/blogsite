import { Link } from 'react-router-dom';

/** Typographic wordmark: the name set in the serif, with a short vertical rule as the "margin". */
export const Wordmark = ({ to = '/', size = 'md' }: { to?: string; size?: 'md' | 'lg' }) => (
  <Link to={to} className="group inline-flex items-center gap-2.5 text-ink" aria-label="Margin, home">
    <span aria-hidden className={`block w-[3px] bg-accent ${size === 'lg' ? 'h-8' : 'h-6'}`} />
    <span
      className={`font-serif font-semibold tracking-[-0.02em] ${size === 'lg' ? 'text-4xl' : 'text-[1.7rem]'} leading-none`}
    >
      Margin
    </span>
  </Link>
);
