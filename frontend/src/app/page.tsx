import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  CreditCard,
  Headphones,
  Lock,
  LogIn,
  ShieldCheck,
  Truck
} from 'lucide-react';
import { HeroSearch } from '@/components/public/HeroSearch';
import { InstallPwaButton } from '@/components/install-pwa-button';
import { ProductCard } from '@/components/public/ProductCard';
import { HeroVideo } from '@/components/public/HeroVideo';
import { SiteFooter } from '@/components/public/SiteFooter';
import { SiteHeader } from '@/components/public/SiteHeader';
import {
  categoryImage,
  getPublicCategories,
  getPublicProducts,
  type PublicCategory,
  type PublicProduct
} from '@/lib/public-catalog';

export const metadata: Metadata = {
  title: { absolute: 'CARIS · Beauty & Cosmetics — Mbeya' },
  description:
    'Genuine skincare, haircare, makeup and perfumes in Mbeya, Tanzania. Order on WhatsApp +255 657 031 253.'
};

const trustItems = [
  { icon: Truck, title: 'Fast & Reliable Delivery', body: 'Across Mbeya' },
  { icon: ShieldCheck, title: '100% Authentic Products', body: 'Trusted brands only' },
  { icon: CreditCard, title: 'Multiple Payment Methods', body: 'Cash, M-Pesa, Tigo, Airtel' },
  { icon: Headphones, title: 'Dedicated Support', body: "We're here to help" }
];



const editorialImages: Record<string, string> = {
  'Skin care': '/images/home/editorial-skincare.jpg?v=real1',
  Makeup: '/images/home/editorial-makeup.jpg?v=real1',
  'Perfumes & fragrances': '/images/home/editorial-perfume.jpg?v=real1'
};

const editorialNames = ['Skin care', 'Makeup', 'Perfumes & fragrances'];

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const [categories, products] = await Promise.all([
    getPublicCategories(),
    getPublicProducts()
  ]);
  const featured = categories.slice(0, 5);
  const featuredProducts = categories
    .map(
      (category) =>
        products.find((product) => product.categoryId === category.id && product.inStock) ??
        products.find((product) => product.categoryId === category.id)
    )
    .filter((product): product is PublicProduct => Boolean(product))
    .slice(0, 8);
  const homeProducts = featuredProducts.length > 0 ? featuredProducts : products.slice(0, 8);
  const editorial = editorialNames
    .map((name) => categories.find((category) => category.name === name))
    .filter((category): category is PublicCategory => Boolean(category));

  return (
    <div className="bg-blush-50">
      <div className="bg-blush-300 text-[#4a3034]">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] sm:px-6 lg:px-8">
          <p>Genuine beauty · Skincare · Makeup · Perfumes</p>
          <div className="hidden items-center gap-5 sm:flex">
            <a href="tel:+255657031253" className="transition hover:text-blush-800">
              +255 657 031 253
            </a>
            <span>Mbeya, Tanzania</span>
          </div>
        </div>
      </div>

      <SiteHeader variant="home" />

      <main>
        <section
          id="search"
          className="relative min-h-[560px] overflow-hidden bg-blush-100 sm:min-h-[620px] lg:min-h-[660px]"
        >
          <HeroVideo />
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,249,247,0.68)_0%,rgba(255,249,247,0.5)_38%,rgba(248,220,215,0.12)_72%,rgba(248,220,215,0.02)_100%)]"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-b from-blush-50/10 via-transparent to-blush-100/45"
            aria-hidden="true"
          />
          <div className="relative z-10 mx-auto flex min-h-[560px] max-w-7xl items-center justify-center px-4 py-16 sm:min-h-[620px] sm:px-6 sm:py-20 lg:min-h-[660px] lg:px-8">
            <div className="mx-auto max-w-[600px] text-center [text-shadow:0_1px_1px_rgba(255,249,247,0.95),0_0_10px_rgba(255,249,247,0.55)]">
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-blush-800 sm:text-xs">
                Premium Cosmetics · Skincare · Perfumes
              </p>

              <h1 className="mt-4 font-display text-4xl font-semibold leading-[1.03] text-[#2a2022] sm:text-6xl lg:text-[64px]">
                Your Beauty,
                <br />
                <span className="text-blush-700">Our Priority</span>
              </h1>

              <p className="mx-auto mt-5 max-w-[470px] text-sm leading-relaxed text-[#574248] sm:text-base">
                Discover authentic cosmetics, premium perfumes, and high-quality beauty
                products — all in one place.
              </p>

              <HeroSearch />

              <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 rounded-full bg-blush-700 px-5 py-2.5 text-xs font-semibold text-white transition hover:bg-blush-800"
                >
                  <LogIn size={14} /> Staff login
                </Link>
                <InstallPwaButton
                  variant="home"
                  label="Download app"
                  className="!rounded-full px-5 py-2.5"
                />
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11px] text-[#5d474b]">
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-blush-700" />
                  Authentic Products
                </span>
                <span className="flex items-center gap-1.5">
                  <Truck className="h-4 w-4 text-blush-700" />
                  Fast Delivery
                </span>
                <span className="flex items-center gap-1.5">
                  <Lock className="h-4 w-4 text-blush-700" />
                  Secure Payment
                </span>
              </div>

              <Link
                href="/about"
                className="mt-6 inline-flex items-center gap-2 text-xs font-semibold text-blush-700 transition hover:text-blush-800"
              >
                Our story
                <span className="font-normal text-[#8c6f72]">Beauty for every you</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </section>

        <section id="categories" className="bg-blush-50 py-14 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-blush-700">
                Shop by Category
              </p>
              <h2 className="mt-2 font-display text-3xl font-semibold text-[#2a2022] sm:text-4xl">
                Find What You Need
              </h2>
              <p className="mt-2 text-sm text-[#6c5559]">
                Explore our wide range of beauty and personal care products, all in one
                place.
              </p>
            </div>

            <div className="mt-10 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-5">
              {featured.map((category) => (
                <Link
                  key={category.name}
                  href={`/shop?category=${encodeURIComponent(category.name)}`}
                  className="group text-center last:col-span-2 last:mx-auto last:w-[calc(50%-0.5rem)] sm:last:col-span-1 sm:last:mx-0 sm:last:w-auto"
                >
                  <div className="overflow-hidden rounded-xl bg-blush-100">
                    <img
                      src={categoryImage(category.name)}
                      alt=""
                      aria-hidden="true"
                      className="aspect-[10/7] w-full object-cover transition duration-500 group-hover:scale-[1.04]"
                    />
                  </div>
                  <h3 className="mt-4 text-sm font-semibold text-[#2a2022]">
                    {category.name}
                  </h3>
                  <p className="mt-1 line-clamp-1 text-[11px] text-[#8c6f72]">
                    {category.subtitle}
                  </p>
                  <span className="mt-2 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.14em] text-blush-700">
                    Shop Now
                    <ArrowRight className="h-3 w-3" />
                  </span>
                </Link>
              ))}
            </div>

            <div className="mt-9 text-center">
              <Link
                href="/categories"
                className="inline-flex items-center gap-2 rounded-full border border-blush-300 bg-blush-50 px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-blush-700 transition hover:bg-blush-100"
              >
                View all categories
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </section>

        {homeProducts.length > 0 && (
          <section className="border-y border-blush-200 bg-white py-14 sm:py-20">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-blush-700">
                    In Store Now
                  </p>
                  <h2 className="mt-2 font-display text-3xl font-semibold text-[#2a2022] sm:text-4xl">
                    Shop Our Products
                  </h2>
                  <p className="mt-2 max-w-lg text-sm text-[#6c5559]">
                    Genuine beauty essentials from our shelves. Browse and order directly
                    on WhatsApp.
                  </p>
                </div>
                <Link
                  href="/shop"
                  className="inline-flex shrink-0 items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-blush-700 transition hover:text-blush-800"
                >
                  View all {products.length} products
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>

              <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {homeProducts.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            </div>
          </section>
        )}

        <section className="bg-blush-200 py-12 sm:py-16">
          <div className="mx-auto grid max-w-7xl items-center gap-8 px-4 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-blush-700">
                Best Sellers
              </p>
              <h2 className="mt-3 font-display text-4xl font-semibold leading-[1.05] text-[#2a2022] sm:text-5xl">
                Glow Naturally
                <br />
                Skincare You&apos;ll Love
              </h2>
              <p className="mt-3 text-sm text-[#6c5559]">Healthy skin, happy you.</p>

              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href="/shop?category=Skin%20care"
                  className="inline-flex items-center gap-2 rounded-full bg-blush-700 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-blush-800"
                >
                  Shop Skincare
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
                <Link
                  href="/shop?category=Perfumes%20%26%20fragrances"
                  className="inline-flex items-center gap-2 rounded-full border border-blush-600 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-blush-800 transition hover:bg-blush-50"
                >
                  Shop Perfumes
                </Link>
              </div>

              <div className="mt-7 max-w-md border-t border-blush-300 pt-5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-blush-700">
                  Premium
                </p>
                <p className="mt-1 font-display text-xl font-semibold text-[#2a2022]">
                  Iconic Fragrances · For Every Moment
                </p>
                <p className="mt-1 text-sm text-[#6c5559]">Find your signature scent.</p>
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-[360px] overflow-hidden rounded-[2rem] border border-white/70 bg-white shadow-[0_30px_60px_-35px_rgba(90,50,55,0.55)]">
              <img
                src="/images/home/sale-products-close.jpg?v=real1"
                alt="Skincare products"
                className="h-[320px] w-full object-cover sm:h-[400px]"
              />
              <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-black/5" />
            </div>
          </div>
        </section>

        <section className="bg-blush-50 py-14 sm:py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid gap-6 md:grid-cols-3">
              {editorial.map((category) => (
                <Link
                  key={category.name}
                  href={`/shop?category=${encodeURIComponent(category.name)}`}
                  className="group overflow-hidden rounded-xl bg-white shadow-[0_12px_36px_-24px_rgba(90,50,55,0.45)]"
                >
                  <div className="overflow-hidden">
                    <img
                      src={editorialImages[category.name] ?? '/images/home/editorial-skincare.jpg?v=real1'}
                      alt=""
                      aria-hidden="true"
                      className="aspect-[4/3] w-full object-cover transition duration-500 group-hover:scale-[1.04]"
                    />
                  </div>
                  <div className="px-6 py-5 text-center">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-blush-700">
                      {category.name}
                    </p>
                    <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-[#6c5559]">
                      {category.description}
                    </p>
                    <span className="mt-4 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.14em] text-blush-700">
                      Shop Now
                      <ArrowRight className="h-3 w-3" />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y border-blush-200 bg-blush-100 py-8 text-[#2a2022]">
          <div className="mx-auto grid max-w-7xl gap-6 px-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:px-8">
            {trustItems.map((item) => (
              <div key={item.title} className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-blush-300 bg-blush-50 text-blush-700">
                  <item.icon className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-[#2a2022]">{item.title}</p>
                  <p className="mt-0.5 text-xs text-[#6c5559]">{item.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      <SiteFooter variant="home" />
    </div>
  );
}
