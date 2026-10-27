'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { MessageCircle, Search, X } from 'lucide-react';
import { ProductCard } from '@/components/public/ProductCard';
import type { PublicCategory, PublicProduct } from '@/lib/public-catalog';

const ALL = 'All';

export function ShopClient({
  categories,
  products
}: {
  categories: PublicCategory[];
  products: PublicProduct[];
}) {
  const params = useSearchParams();
  const categoryParam = params.get('category');
  const queryParam = params.get('q');

  const [category, setCategory] = useState(categoryParam ?? ALL);
  const [query, setQuery] = useState(queryParam ?? '');

  useEffect(() => {
    setCategory(categoryParam ?? ALL);
    setQuery(queryParam ?? '');
  }, [categoryParam, queryParam]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return products.filter((product) => {
      const matchesCategory =
        category === ALL || product.categoryName === category;
      if (!matchesCategory) return false;
      if (!needle) return true;

      return (
        product.name.toLowerCase().includes(needle) ||
        (product.sku ?? '').toLowerCase().includes(needle) ||
        (product.categoryName ?? '').toLowerCase().includes(needle)
      );
    });
  }, [products, category, query]);

  const hasFilters = category !== ALL || query.trim().length > 0;

  return (
    <div className="mx-auto max-w-7xl px-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <label className="flex w-full max-w-md items-center gap-2 rounded-full border border-blush-200 bg-white px-4 py-3 shadow-[0_10px_28px_-22px_rgba(90,50,55,0.5)] transition focus-within:border-blush-400 focus-within:ring-4 focus-within:ring-blush-100">
          <Search size={18} className="text-[#8c6f72]" aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search products, brands, or SKU..."
            aria-label="Search products"
            className="min-w-0 flex-1 bg-transparent text-sm text-[#2a2022] outline-none placeholder:text-[#8c6f72]"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="text-[#8c6f72] hover:text-[#2a2022]"
            >
              <X size={16} />
            </button>
          )}
        </label>

        <div className="flex flex-wrap gap-2">
          {[ALL, ...categories.map((item) => item.name)].map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setCategory(item)}
              className={`rounded-full border px-3.5 py-2 text-xs font-semibold transition ${
                category === item
                  ? 'border-blush-700 bg-blush-700 text-white'
                  : 'border-blush-200 bg-white text-[#2a2022] hover:border-blush-300 hover:bg-blush-100'
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#8c6f72]">
          {filtered.length} of {products.length} products
        </p>
        {hasFilters && (
          <button
            type="button"
            onClick={() => {
              setCategory(ALL);
              setQuery('');
            }}
            className="text-xs font-semibold text-blush-700 underline-offset-4 hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {filtered.length > 0 ? (
        <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {filtered.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      ) : (
        <div className="mt-8 rounded-3xl border border-dashed border-blush-300 bg-white px-6 py-16 text-center shadow-[0_16px_42px_-32px_rgba(90,50,55,0.45)]">
          <p className="font-display text-2xl font-semibold text-[#2a2022]">
            No products found
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm text-[#6c5559]">
            Try another search or category, or message us on WhatsApp and we&apos;ll
            confirm what&apos;s in store.
          </p>
          <a
            href="https://wa.me/255657031253"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-blush-700 px-4 py-2.5 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:bg-blush-800"
          >
            <MessageCircle size={16} aria-hidden="true" /> Ask on WhatsApp
          </a>
        </div>
      )}
    </div>
  );
}
