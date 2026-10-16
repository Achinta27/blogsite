import { useEffect, useState, type ReactNode } from 'react';
import { Search } from 'lucide-react';

/** Search box (debounced) plus optional filter controls shared by the admin tables. */
export const AdminToolbar = ({
  placeholder,
  onSearch,
  children,
}: {
  placeholder: string;
  onSearch: (value: string) => void;
  children?: ReactNode;
}) => {
  const [value, setValue] = useState('');

  useEffect(() => {
    const id = setTimeout(() => onSearch(value.trim()), 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="mt-6 flex flex-wrap items-center gap-3">
      <div className="relative w-full sm:w-72">
        <label htmlFor="admin-search" className="sr-only">
          {placeholder}
        </label>
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          id="admin-search"
          type="search"
          className="field py-1.5 pl-9 text-sm"
          placeholder={placeholder}
          maxLength={100}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </div>
      {children}
    </div>
  );
};

export const FilterSelect = <T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T | '';
  options: { value: T | ''; label: string }[];
  onChange: (value: T | '') => void;
}) => (
  <label className="flex items-center gap-2 text-sm text-muted">
    {label}
    <select className="field w-auto py-1.5 text-sm" value={value} onChange={(e) => onChange(e.target.value as T | '')}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  </label>
);
