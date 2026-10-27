import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { SiteFooter } from '@/components/public/SiteFooter';
import { SiteHeader } from '@/components/public/SiteHeader';
import { categoryImage, getPublicCategories } from '@/lib/public-catalog';

export const metadata: Metadata = {
  title: { absolute: 'Categories · CARIS' },
  description:
    'Shop skincare, haircare, makeup, perfumes, body care and beauty accessories in Mbeya, Tanzania.'
};

export default async function CategoriesPage() {
  const categories = await getPublicCategories();

  return (
    <>
      <SiteHeader variant="home" />
      <main className="bg-blush-50 py-14 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-blush-700">
            Browse
          </p>
          <h1 className="mt-2 font-display text-4xl font-semibold text-[#2a2022] sm:text-5xl">
            Shop by category
          </h1>
          <p className="mt-3 max-w-xl text-sm text-[#6c5559]">
            Find what you need across our beauty and personal care range.
          </p>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((category) => (
              <Link
                key={category.name}
                href={`/shop?category=${encodeURIComponent(category.name)}`}
                className="group overflow-hidden rounded-2xl border border-blush-200 bg-white shadow-[0_14px_36px_-28px_rgba(90,50,55,0.5)] transition duration-300 hover:-translate-y-1 hover:border-blush-300 hover:shadow-[0_24px_44px_-28px_rgba(90,50,55,0.55)]"
              >
                <div className="overflow-hidden bg-blush-100">
                  <img
                    src={categoryImage(category.name)}
                    alt=""
                    aria-hidden="true"
                    className="aspect-[10/7] w-full object-cover transition duration-500 group-hover:scale-[1.04]"
                  />
                </div>
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="font-display text-2xl font-semibold text-[#2a2022]">
                      {category.name}
                    </h2>
                    <span className="shrink-0 rounded-full bg-blush-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-blush-800">
                      {category.productCount}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-[#6c5559]">{category.description}</p>
                  <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.14em] text-blush-700">
                    Shop {category.name}
                    <ArrowRight size={14} aria-hidden="true" />
                  </span>
                </div>
              </Link>
            ))}
          </div>

          <div className="mt-12 flex flex-col items-start justify-between gap-4 rounded-3xl border border-blush-200 bg-gradient-to-r from-blush-100 to-white px-6 py-8 text-[#2a2022] sm:flex-row sm:items-center sm:px-10">
            <div>
              <h2 className="font-display text-2xl font-semibold">Not sure where to start?</h2>
              <p className="mt-1 text-sm text-[#6c5559]">
                Message us and we&apos;ll help you find the right product.
              </p>
            </div>
            <a
              href="https://wa.me/255657031253"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-blush-700 px-5 py-2.5 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:bg-blush-800"
            >
              Ask on WhatsApp
            </a>
          </div>
        </div>
      </main>
      <SiteFooter variant="home" />
    </>
  );
}
