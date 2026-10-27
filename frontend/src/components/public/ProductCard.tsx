import { MessageCircle } from 'lucide-react';
import { formatTZS } from '@/lib/format';
import { categoryImage, type PublicProduct } from '@/lib/public-catalog';

const WHATSAPP = '255657031253';

export function ProductCard({ product }: { product: PublicProduct }) {
  const price = `${formatTZS(product.price)} ${
    product.displayUnit === 'each' ? 'each' : `/ ${product.displayUnit}`
  }`;
  const message = product.inStock
    ? `Hello CARIS, I would like to order ${product.name}${product.sku ? ` (${product.sku})` : ''} — ${price}. Is it available?`
    : `Hello CARIS, is ${product.name}${product.sku ? ` (${product.sku})` : ''} available?`;

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-blush-200 bg-white shadow-[0_14px_36px_-28px_rgba(90,50,55,0.5)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_24px_44px_-28px_rgba(90,50,55,0.55)]">
      <div className="relative aspect-[4/3] overflow-hidden bg-blush-100">
        <img
          src={categoryImage(product.categoryName)}
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
        />
        <span className="absolute left-3 top-3 rounded-full bg-blush-50/95 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-blush-800">
          {product.categoryName ?? 'Beauty'}
        </span>
        {!product.inStock && (
          <span className="absolute right-3 top-3 rounded-full bg-[#2a2022] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-white">
            Out of stock
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4 text-center">
        <h3 className="line-clamp-2 font-display text-lg font-semibold leading-snug text-[#2a2022]">
          {product.name}
        </h3>
        <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8c6f72]">
          {product.sku ?? 'CARIS Beauty'}
        </p>

        <div className="mt-3">
          <span className="text-base font-semibold text-blush-800">{formatTZS(product.price)}</span>
          <span className="ml-1 text-[11px] text-[#8c6f72]">
            {product.displayUnit === 'each' ? 'each' : `/ ${product.displayUnit}`}
          </span>
        </div>

        <p
          className={`mt-2 inline-flex items-center justify-center gap-1.5 text-[10px] font-semibold ${
            product.inStock ? 'text-moss' : 'text-berry'
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              product.inStock ? 'bg-moss' : 'bg-berry'
            }`}
          />
          {product.inStock ? 'In stock' : 'Out of stock'}
        </p>

        <a
          href={`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(message)}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={
            product.inStock
              ? `Order ${product.name} on WhatsApp`
              : `Ask about ${product.name} on WhatsApp`
          }
          className="mt-4 inline-flex items-center justify-center gap-2 rounded-full bg-blush-700 px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white transition hover:bg-blush-800"
        >
          <MessageCircle size={14} aria-hidden="true" />
          {product.inStock ? 'Order on WhatsApp' : 'Ask availability'}
        </a>
      </div>
    </article>
  );
}
