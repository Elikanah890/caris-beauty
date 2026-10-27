import type { Metadata } from 'next';
import Link from 'next/link';
import { MapPin, MessageCircle, Phone } from 'lucide-react';
import { SiteFooter } from '@/components/public/SiteFooter';
import { SiteHeader } from '@/components/public/SiteHeader';

export const metadata: Metadata = {
  title: { absolute: 'About · Caris Beauty and Cosmetics' },
  description:
    'A neighbourhood cosmetics and perfume shop in Mbeya, Tanzania. Genuine skincare, haircare, makeup and perfumes at fair prices.'
};

export default function AboutPage() {
  return (
    <>
      <SiteHeader />

      <main className="bg-cream">
        <section className="mx-auto max-w-4xl px-4 py-16 sm:py-24">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-700">
            About us
          </p>
          <h1 className="mt-3 font-display text-4xl font-semibold leading-tight text-ink sm:text-5xl">
            Who we are
          </h1>

          <div className="mt-6 space-y-4 text-base leading-relaxed text-muted">
            <p>
              Caris Beauty and Cosmetics is a neighbourhood cosmetics and perfume shop
              based in Mbeya, Tanzania. We stock genuine skincare, haircare, makeup, and
              perfumes — carefully chosen to fit your everyday routine and your budget.
            </p>
            <p>
              Whether you&apos;re shopping for your daily moisturizer, a special-occasion
              fragrance, or a gift for someone you love, we&apos;re here to help you find what
              you need at a fair price.
            </p>
          </div>

          <div className="mt-10 flex flex-wrap gap-3">
            <a
              href="https://wa.me/255657031253"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-brand-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-800"
            >
              <MessageCircle size={16} />
              Order on WhatsApp
            </a>
            <a
              href="tel:+255657031253"
              className="inline-flex items-center gap-2 rounded-full border border-line bg-paper px-5 py-3 text-sm font-semibold text-ink transition hover:border-brand-300 hover:bg-brand-50"
            >
              <Phone size={16} />
              +255 657 031 253
            </a>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-line bg-paper p-5 shadow-soft">
              <MapPin size={20} className="text-brand-700" aria-hidden="true" />
              <p className="mt-2 text-sm font-semibold text-ink">Location</p>
              <p className="mt-1 text-sm text-muted">Mbeya, Tanzania</p>
            </div>
            <div className="rounded-2xl border border-line bg-paper p-5 shadow-soft">
              <Phone size={20} className="text-brand-700" aria-hidden="true" />
              <p className="mt-2 text-sm font-semibold text-ink">Call us</p>
              <p className="mt-1 text-sm text-muted">+255 657 031 253</p>
            </div>
            <div className="rounded-2xl border border-line bg-paper p-5 shadow-soft">
              <MessageCircle size={20} className="text-brand-700" aria-hidden="true" />
              <p className="mt-2 text-sm font-semibold text-ink">WhatsApp</p>
              <p className="mt-1 text-sm text-muted">Chat with us anytime</p>
            </div>
          </div>

          <Link
            href="/"
            className="mt-10 inline-block text-sm font-semibold text-brand-700 hover:underline"
          >
            ← Back to home
          </Link>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
