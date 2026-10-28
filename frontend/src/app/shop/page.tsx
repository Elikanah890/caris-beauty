import { Suspense } from 'react';
import type { Metadata } from 'next';
import { SiteFooter } from '@/components/public/SiteFooter';
import { SiteHeader } from '@/components/public/SiteHeader';
import { getPublicCategories, getPublicProducts } from '@/lib/public-catalog';
import { ShopClient } from './ShopClient';

export const metadata: Metadata = {
  title: { absolute: 'Shop · CARIS' },
  description:
    'Browse skincare, haircare, makeup, perfumes, body care and beauty accessories. Order on WhatsApp +255 657 031 253.'
};

export const dynamic = 'force-dynamic';

export default async function ShopPage() {
  const [categories, products] = await Promise.all([
    getPublicCategories(),
    getPublicProducts()
  ]);

  return (
    <>
      <SiteHeader variant="home" />
      <main className="bg-blush-50 py-14 sm:py-20">
        <div className="mx-auto mb-8 max-w-7xl px-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-blush-700">
            The shop
          </p>
          <h1 className="mt-2 font-display text-4xl font-semibold text-[#2a2022] sm:text-5xl">
            Shop all products
          </h1>
          <p className="mt-3 max-w-xl text-sm text-[#6c5559]">
            Browse by category, or message us on WhatsApp and we&apos;ll confirm
            what&apos;s in store.
          </p>
        </div>

        <Suspense
          fallback={
            <p className="mx-auto max-w-7xl px-4 text-sm text-[#6c5559]">Loading shop…</p>
          }
        >
          <ShopClient categories={categories} products={products} />
        </Suspense>
      </main>
      <SiteFooter variant="home" />
    </>
  );
}
