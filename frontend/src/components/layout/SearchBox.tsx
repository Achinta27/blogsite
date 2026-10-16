import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Clock, FileText, Hash, LayoutGrid, Loader2, Search, X } from 'lucide-react';
import { postApi } from '../../api';
import { useCategories } from '../../lib/useCategories';
import type { SearchSuggestions } from '../../types';

const RECENT_KEY = 'margin:recent-searches';
const RECENT_LIMIT = 5;
const DEBOUNCE_MS = 180;
const EMPTY: SearchSuggestions = { posts: [], categories: [], tags: [] };

const readRecent = (): string[] => {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(list) ? list.filter((v) => typeof v === 'string').slice(0, RECENT_LIMIT) : [];
  } catch {
    return [];
  }
};

const writeRecent = (list: string[]) => {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    // Storage unavailable (private window): recent searches are a convenience only
  }
};

/** Bolds every occurrence of the typed words inside a suggestion. */
const Highlight = ({ text, query }: { text: string; query: string }) => {
  const words = query.trim().split(/\s+/).filter(Boolean).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!words.length) return <>{text}</>;
  const parts = text.split(new RegExp(`(${words.join('|')})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="bg-transparent font-semibold text-ink">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
};

interface Option {
  key: string;
  to: string;
  /** Saved to recent searches when chosen. */
  remember?: string;
  render: (active: boolean) => ReactNode;
}

interface Group {
  label: string;
  action?: { label: string; onClick: () => void };
  options: Option[];
}

/**
 * Header search with a type-ahead dropdown: matching articles, sections and topics while typing,
 * recent searches and sections when empty. Arrow keys move, Enter opens, Escape closes.
 */
export const SearchBox = ({ initialQuery, onNavigate, autoFocus }: { initialQuery: string; onNavigate?: () => void; autoFocus?: boolean }) => {
  const navigate = useNavigate();
  const categories = useCategories();
  const listId = useId();
  const rootRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState(initialQuery);
  const [syncedQuery, setSyncedQuery] = useState(initialQuery);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [results, setResults] = useState<{ query: string; data: SearchSuggestions } | null>(null);
  const [failed, setFailed] = useState(false);
  const [recent, setRecent] = useState<string[]>(readRecent);

  // Follow the URL (back/forward, category links)
  if (initialQuery !== syncedQuery) {
    setSyncedQuery(initialQuery);
    setQuery(initialQuery);
  }

  const term = query.trim();
  const loading = Boolean(term) && results?.query !== term && !failed;

  useEffect(() => {
    if (!term || !open) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      postApi
        .suggest(term, controller.signal)
        .then((data) => {
          setFailed(false);
          setResults({ query: term, data });
        })
        .catch((error) => {
          if (!controller.signal.aborted) setFailed(Boolean(error));
        });
    }, DEBOUNCE_MS);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [term, open]);

  // Close when clicking anywhere else
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !rootRef.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const remember = (value: string) => {
    const next = [value, ...recent.filter((r) => r.toLowerCase() !== value.toLowerCase())].slice(0, RECENT_LIMIT);
    setRecent(next);
    writeRecent(next);
  };

  const go = (to: string, saved?: string) => {
    if (saved) remember(saved);
    // A full search keeps the words in the box (the URL holds them); opening a result clears it
    if (!to.startsWith('/?q=')) setQuery('');
    setOpen(false);
    setActive(-1);
    inputRef.current?.blur();
    navigate(to);
    onNavigate?.();
  };

  const searchAll = (value: string) => go(value ? `/?q=${encodeURIComponent(value)}` : '/', value || undefined);

  const groups = useMemo<Group[]>(() => {
    const row = (icon: ReactNode, main: ReactNode, meta?: ReactNode) => (activeRow: boolean) => (
      <span className={`flex items-center gap-3 px-3 py-2 ${activeRow ? 'bg-paper-deep' : ''}`}>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[3px] bg-paper-deep text-muted">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-ink-soft">{main}</span>
          {meta && <span className="block truncate text-xs text-muted">{meta}</span>}
        </span>
      </span>
    );

    if (!term) {
      const list: Group[] = [];
      if (recent.length) {
        list.push({
          label: 'Recent searches',
          action: {
            label: 'Clear',
            onClick: () => {
              setRecent([]);
              writeRecent([]);
            },
          },
          options: recent.map((r) => ({
            key: `recent:${r}`,
            to: `/?q=${encodeURIComponent(r)}`,
            remember: r,
            render: row(<Clock className="h-3.5 w-3.5" />, r),
          })),
        });
      }
      if (categories.length) {
        list.push({
          label: 'Browse sections',
          options: categories.slice(0, 5).map((c) => ({
            key: `cat:${c._id}`,
            to: `/?category=${c.slug}`,
            render: row(<LayoutGrid className="h-3.5 w-3.5" />, c.name, c.publishedCount ? `${c.publishedCount} articles` : undefined),
          })),
        });
      }
      return list;
    }

    const data = results?.query === term ? results.data : results?.data ?? EMPTY;
    const list: Group[] = [];
    if (data.posts.length) {
      list.push({
        label: 'Articles',
        options: data.posts.map((p) => ({
          key: `post:${p._id}`,
          to: `/post/${p.slug}`,
          remember: term,
          render: row(
            p.coverImage?.url ? (
              <img src={p.coverImage.url} alt="" className="h-7 w-7 rounded-[3px] object-cover" />
            ) : (
              <FileText className="h-3.5 w-3.5" />
            ),
            <Highlight text={p.title} query={term} />,
            [p.author?.name, p.category?.name, p.readingTime ? `${p.readingTime} min read` : null].filter(Boolean).join(' · ')
          ),
        })),
      });
    }
    if (data.categories.length) {
      list.push({
        label: 'Sections',
        options: data.categories.map((c) => ({
          key: `cat:${c._id}`,
          to: `/?category=${c.slug}`,
          render: row(<LayoutGrid className="h-3.5 w-3.5" />, <Highlight text={c.name} query={term} />),
        })),
      });
    }
    if (data.tags.length) {
      list.push({
        label: 'Topics',
        options: data.tags.map((t) => ({
          key: `tag:${t.tag}`,
          to: `/?tag=${encodeURIComponent(t.tag)}`,
          render: row(
            <Hash className="h-3.5 w-3.5" />,
            <Highlight text={t.tag} query={term} />,
            `${t.count} ${t.count === 1 ? 'article' : 'articles'}`
          ),
        })),
      });
    }
    return list;
  }, [term, results, recent, categories]);

  const options = groups.flatMap((g) => g.options);
  // The last keyboard stop is "search for …" when a term is typed
  const stops = options.length + (term ? 1 : 0);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        setOpen(false);
        setActive(-1);
      } else if (query) {
        setQuery('');
      }
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) return setOpen(true);
      if (!stops) return;
      const delta = e.key === 'ArrowDown' ? 1 : -1;
      // Positions run from -1 (input only) to stops - 1, wrapping at both ends
      setActive((i) => ((Math.min(i, stops - 1) + 1 + delta + stops + 1) % (stops + 1)) - 1);
    }
  };

  // Keep the index within range as results change (−1 means "nothing highlighted")
  const activeIndex = active >= stops ? -1 : active;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (activeIndex >= 0 && activeIndex < options.length) {
      const option = options[activeIndex];
      return go(option.to, option.remember);
    }
    searchAll(term);
  };

  const showPanel = open && (groups.length > 0 || Boolean(term));
  const activeId = activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined;
  let index = -1;

  return (
    <form ref={rootRef} role="search" onSubmit={submit} className="relative">
      <label htmlFor={`${listId}-input`} className="sr-only">
        Search articles
      </label>
      <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      <input
        ref={inputRef}
        id={`${listId}-input`}
        type="text"
        role="combobox"
        aria-expanded={showPanel}
        aria-controls={`${listId}-list`}
        aria-autocomplete="list"
        aria-activedescendant={activeId}
        autoComplete="off"
        autoFocus={autoFocus}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setFailed(false);
          setActive(-1);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Search articles, topics…"
        maxLength={100}
        className="field py-1.5 pl-9 pr-8 text-sm"
      />
      {loading && open ? (
        <Loader2 aria-hidden className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted" />
      ) : (
        query && (
          <button
            type="button"
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted hover:text-ink"
            onClick={() => {
              setQuery('');
              setActive(-1);
              inputRef.current?.focus();
            }}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )
      )}

      {showPanel && (
        <div
          id={`${listId}-list`}
          role="listbox"
          aria-label="Search suggestions"
          className="absolute left-0 right-0 z-40 mt-2 max-h-[70vh] min-w-[18rem] overflow-y-auto rounded-[4px] border border-rule bg-card py-1.5 shadow-[0_12px_32px_-16px_rgb(27_26_23/0.35)] md:right-auto md:w-[26rem]"
        >
          {groups.map((group) => (
            <div key={group.label} role="group" aria-label={group.label} className="py-1">
              <div className="flex items-center justify-between px-3 pb-1 pt-1.5">
                <span className="kicker text-[0.6875rem] text-muted">{group.label}</span>
                {group.action && (
                  <button
                    type="button"
                    className="text-xs text-muted hover:text-ink"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={group.action.onClick}
                  >
                    {group.action.label}
                  </button>
                )}
              </div>
              {group.options.map((option) => {
                index += 1;
                const i = index;
                return (
                  <div
                    key={option.key}
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={i === activeIndex}
                    className="cursor-pointer"
                    onMouseEnter={() => setActive(i)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => go(option.to, option.remember)}
                  >
                    {option.render(i === activeIndex)}
                  </div>
                );
              })}
            </div>
          ))}

          {term && !loading && !failed && groups.length === 0 && (
            <p className="px-3 py-3 text-sm text-muted">No matching articles yet. Try a shorter or different word.</p>
          )}
          {term && failed && <p className="px-3 py-3 text-sm text-muted">Suggestions are unavailable right now.</p>}

          {term && (
            <div
              id={`${listId}-${options.length}`}
              role="option"
              aria-selected={activeIndex === options.length}
              className={`mt-1 flex cursor-pointer items-center gap-2 border-t border-rule-soft px-3 py-2.5 text-sm text-accent ${
                activeIndex === options.length ? 'bg-paper-deep' : ''
              }`}
              onMouseEnter={() => setActive(options.length)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => searchAll(term)}
            >
              <Search aria-hidden className="h-3.5 w-3.5" />
              <span className="min-w-0 flex-1 truncate">
                See all results for “<span className="font-medium">{term}</span>”
              </span>
              <ArrowRight aria-hidden className="h-3.5 w-3.5" />
            </div>
          )}
        </div>
      )}
    </form>
  );
};
