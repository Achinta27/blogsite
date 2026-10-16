import type { ReactNode } from 'react';

export const LoadingState = ({ label = 'Loading…', className = 'py-20' }: { label?: string; className?: string }) => (
  <div role="status" aria-live="polite" className={`${className} flex flex-col items-center gap-3 text-muted`}>
    <span className="block h-px w-16 overflow-hidden bg-rule">
      <span className="block h-full w-1/3 animate-pulse bg-ink-soft" />
    </span>
    <span className="text-sm">{label}</span>
  </div>
);

export const EmptyState = ({
  title,
  children,
  action,
  className = 'py-16',
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) => (
  <div className={`${className} mx-auto max-w-md text-center`}>
    <p className="font-serif text-2xl text-ink">{title}</p>
    {children && <div className="mt-2 text-[0.9375rem] leading-relaxed text-muted">{children}</div>}
    {action && <div className="mt-6">{action}</div>}
  </div>
);

export const ErrorState = ({ message, onRetry, className = 'py-16' }: { message: string; onRetry?: () => void; className?: string }) => (
  <div role="alert" className={`${className} mx-auto max-w-md text-center`}>
    <p className="font-serif text-2xl text-ink">We couldn’t load this</p>
    <p className="mt-2 text-[0.9375rem] text-muted">{message}</p>
    {onRetry && (
      <button type="button" className="btn btn-outline mt-6" onClick={onRetry}>
        Try again
      </button>
    )}
  </div>
);

export const Notice = ({ tone = 'danger', children }: { tone?: 'danger' | 'ok' | 'warn'; children: ReactNode }) => {
  const tones = {
    danger: 'border-danger/30 bg-danger-wash text-danger',
    ok: 'border-ok/30 bg-ok-wash text-ok',
    warn: 'border-warn/30 bg-warn-wash text-warn',
  };
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={`rounded-[3px] border px-3.5 py-2.5 text-sm ${tones[tone]}`}>
      {children}
    </div>
  );
};
