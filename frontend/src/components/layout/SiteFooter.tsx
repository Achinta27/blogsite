import { Link } from 'react-router-dom';
import { useCategories } from '../../lib/useCategories';
import { Wordmark } from '../common/Wordmark';

const YEAR = new Date().getFullYear();

export const SiteFooter = () => {
  const categories = useCategories();
  return (
  <footer className="mt-24 border-t border-rule">
    <div className="wrap grid gap-10 py-12 sm:grid-cols-[1.4fr_1fr]">
      <div>
        <Wordmark />
        <p className="mt-4 max-w-sm font-serif text-lg leading-relaxed text-ink-soft">
          Considered writing on technology, science, culture and design.
        </p>
      </div>
      <nav aria-label="Footer">
        <p className="kicker text-muted">Sections</p>
        <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          {categories.map((c) => (
            <li key={c._id}>
              <Link to={`/?category=${c.slug}`} className="text-ink-soft hover:text-ink">
                {c.name}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
    <div className="border-t border-rule-soft">
      <p className="wrap py-5 text-xs text-muted">© {YEAR} Margin. All articles belong to their authors.</p>
    </div>
  </footer>
  );
};
