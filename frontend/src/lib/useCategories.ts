import { useEffect, useState } from 'react';
import { taxonomyApi } from '../api';
import type { Category } from '../types';

// Categories change rarely; one request per page load is shared by every component.
let cache: Promise<Category[]> | null = null;

export const invalidateCategories = () => {
  cache = null;
};

export const useCategories = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  useEffect(() => {
    let active = true;
    if (!cache) cache = taxonomyApi.categories().catch((error) => ((cache = null), Promise.reject(error)));
    cache.then((list) => active && setCategories(list)).catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  return categories;
};
