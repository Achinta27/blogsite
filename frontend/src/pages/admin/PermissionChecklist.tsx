import { PERMISSIONS } from '../../lib/permissions';
import type { Permission } from '../../types';

/**
 * Checkbox list of staff permissions. Ticking a permission that depends on another ticks
 * that one too, and unticking a dependency unticks what relies on it (the API enforces the
 * same rule).
 */
export const PermissionChecklist = ({
  value,
  onChange,
  disabled = false,
}: {
  value: Permission[];
  onChange: (next: Permission[]) => void;
  disabled?: boolean;
}) => {
  const toggle = (permission: Permission, checked: boolean) => {
    let next = new Set(value);
    if (checked) {
      next.add(permission);
      PERMISSIONS.find((p) => p.value === permission)?.requires?.forEach((r) => next.add(r));
    } else {
      next.delete(permission);
      next = new Set([...next].filter((p) => !PERMISSIONS.find((x) => x.value === p)?.requires?.includes(permission)));
    }
    onChange(PERMISSIONS.map((p) => p.value).filter((p) => next.has(p)));
  };

  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {PERMISSIONS.map((p) => (
        <li key={p.value}>
          <label className="flex cursor-pointer gap-3 rounded-[3px] border border-rule-soft bg-paper px-3 py-2.5 hover:border-rule">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-[var(--color-accent)]"
              checked={value.includes(p.value)}
              disabled={disabled}
              onChange={(e) => toggle(p.value, e.target.checked)}
            />
            <span>
              <span className="block text-sm font-medium">{p.label}</span>
              <span className="block text-xs text-muted">
                {p.description}
                {p.requires && ` Requires ${p.requires.map((r) => PERMISSIONS.find((x) => x.value === r)?.label).join(', ')}.`}
              </span>
            </span>
          </label>
        </li>
      ))}
    </ul>
  );
};
