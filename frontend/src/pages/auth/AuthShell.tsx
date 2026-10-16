import type { ReactNode } from 'react';
import { authApi } from '../../api';

const GoogleMark = () => (
  <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4">
    <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.7Z" />
    <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24Z" />
    <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1Z" />
    <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9Z" />
  </svg>
);

const FacebookMark = () => (
  <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4">
    <path
      fill="#1877F2"
      d="M24 12a12 12 0 1 0-13.9 11.9v-8.4h-3V12h3V9.4c0-3 1.8-4.7 4.5-4.7 1.3 0 2.7.2 2.7.2v3h-1.5c-1.5 0-2 .9-2 1.9V12h3.4l-.5 3.5h-2.9v8.4A12 12 0 0 0 24 12Z"
    />
  </svg>
);

/** Full-page navigation to the API, which redirects to the provider (no tokens in JS). */
export const SocialButtons = () => (
  <div className="grid gap-2.5 sm:grid-cols-2">
    <a href={authApi.oauthUrl('google')} className="btn btn-outline w-full">
      <GoogleMark /> Google
    </a>
    <a href={authApi.oauthUrl('facebook')} className="btn btn-outline w-full">
      <FacebookMark /> Facebook
    </a>
  </div>
);

export const Divider = ({ label }: { label: string }) => (
  <div className="my-6 flex items-center gap-3 text-xs text-muted">
    <span className="h-px flex-1 bg-rule" />
    {label}
    <span className="h-px flex-1 bg-rule" />
  </div>
);

export const AuthShell = ({ title, intro, children, footer }: { title: string; intro: string; children: ReactNode; footer: ReactNode }) => (
  <div className="wrap py-14 sm:py-20">
    <div className="mx-auto max-w-[26rem]">
      <h1 className="text-center font-serif text-[2.2rem] font-semibold tracking-[-0.015em]">{title}</h1>
      <p className="mt-2 text-center font-serif text-lg text-ink-soft">{intro}</p>
      <div className="card mt-8 p-6 sm:p-8">{children}</div>
      <p className="mt-6 text-center text-sm text-muted">{footer}</p>
    </div>
  </div>
);
