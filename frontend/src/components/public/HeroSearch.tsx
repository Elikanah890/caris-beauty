'use client';

import type { FormEvent } from 'react';

const WHATSAPP = '255657031253';

export function HeroSearch() {
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = String(new FormData(event.currentTarget).get('q') ?? '').trim();
    if (!query) return;
    window.location.href = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(
      `Hi, do you have ${query}?`
    )}`;
  };

  return (
    <form
      onSubmit={onSubmit}
      role="search"
      className="mx-auto mt-7 flex max-w-md overflow-hidden rounded-full border border-blush-300 bg-blush-50/90 p-1 shadow-[0_16px_40px_-20px_rgba(120,65,72,0.45)] transition focus-within:border-blush-500 focus-within:ring-4 focus-within:ring-blush-200/70"
    >
      <input
        type="text"
        name="q"
        aria-label="Search products"
        placeholder="Search products or brands..."
        className="min-w-0 flex-1 bg-transparent px-4 py-2.5 text-sm text-[#2a2022] outline-none placeholder:text-[#8c6f72]"
      />
      <button
        type="submit"
        className="shrink-0 rounded-full bg-blush-700 px-5 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-blush-800"
      >
        Search
      </button>
    </form>
  );
}
