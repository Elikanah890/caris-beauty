export interface PublicCategory {
  id: string;
  name: string;
  color: string | null;
  productCount: number;
  subtitle: string;
  description: string;
  bg: string;
}

interface CategoryPresentation {
  subtitle: string;
  description: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

const PRESENTATION: Record<string, CategoryPresentation> = {
  'Skin care': {
    subtitle: 'Cleansers, creams, serums',
    description: 'Everyday cleansers, moisturizers and sun protection for healthy, glowing skin.'
  },
  'Hair care': {
    subtitle: 'Shampoo, treatments',
    description: 'Shampoos, conditioners and treatments for strong, healthy hair.'
  },
  Makeup: {
    subtitle: 'Foundations, lipsticks',
    description: 'Foundations, lipsticks and everyday makeup essentials.'
  },
  'Perfumes & fragrances': {
    subtitle: 'Perfumes, body mists',
    description: 'Signature scents and everyday fragrances for every occasion.'
  },
  'Body care': {
    subtitle: 'Lotions, oils, scrubs',
    description: 'Lotions, oils and scrubs to keep your skin soft and nourished.'
  },
  'Bath & hygiene': {
    subtitle: 'Soaps, washes, oral care',
    description: 'Everyday bath, hygiene and personal care essentials.'
  },
  'Beauty accessories': {
    subtitle: 'Brushes, tools, mirrors',
    description: 'Brushes, tools and accessories to complete your beauty routine.'
  },
  'Baby care': {
    subtitle: 'Lotions, oils, wipes',
    description: 'Gentle everyday care for babies and little ones.'
  },
  "Men's grooming": {
    subtitle: 'Shaving, beard, cologne',
    description: 'Shaving, beard care and grooming essentials for men.'
  },
  'Nail care': {
    subtitle: 'Polish, files, tools',
    description: 'Polish, files and tools for tidy, healthy nails.'
  }
};

const DISPLAY_ORDER = Object.keys(PRESENTATION);

const BACKGROUNDS = ['bg-brand-50', 'bg-paper'] as const;

function toPublicCategory(
  category: { id: string; name: string; color: string | null; productCount: number },
  index: number
): PublicCategory {
  const presentation = PRESENTATION[category.name] ?? {
    subtitle:
      category.productCount === 1
        ? '1 product in store'
        : `${category.productCount} products in store`,
    description: `Explore our ${category.name} range.`
  };

  return {
    ...category,
    ...presentation,
    bg: BACKGROUNDS[index % BACKGROUNDS.length] ?? BACKGROUNDS[0]
  };
}

function sortByDisplayOrder<T extends { name: string }>(categories: T[]): T[] {
  return [...categories].sort((a, b) => {
    const aIndex = DISPLAY_ORDER.indexOf(a.name);
    const bIndex = DISPLAY_ORDER.indexOf(b.name);
    const aRank = aIndex === -1 ? DISPLAY_ORDER.length : aIndex;
    const bRank = bIndex === -1 ? DISPLAY_ORDER.length : bIndex;
    return aRank - bRank || a.name.localeCompare(b.name);
  });
}

export async function getPublicCategories(): Promise<PublicCategory[]> {
  try {
    const response = await fetch(`${API_URL}/public/categories`, { cache: 'no-store' });

    if (!response.ok) throw new Error(`Category request failed: ${response.status}`);

    const data = (await response.json()) as {
      categories?: { id: string; name: string; color: string | null; productCount: number }[];
    };

    const categories = Array.isArray(data.categories) ? data.categories : [];
    return sortByDisplayOrder(categories).map(toPublicCategory);
  } catch {
    // Show only real store categories. Never invent demo categories when the
    // catalog API is unreachable.
    return [];
  }
}

export interface PublicProduct {
  id: string;
  name: string;
  sku: string | null;
  categoryId: string | null;
  categoryName: string | null;
  price: number;
  displayUnit: string;
  inStock: boolean;
}

export const CATEGORY_IMAGES: Record<string, string> = {
  'Skin care': '/images/home/category-skincare.jpg?v=real1',
  'Hair care': '/images/home/category-haircare.jpg?v=real1',
  Makeup: '/images/home/category-makeup.jpg?v=real1',
  'Perfumes & fragrances': '/images/home/category-perfume.jpg?v=real1',
  'Body care': '/images/home/category-bodycare.jpg?v=real1',
  'Bath & hygiene': '/images/home/category-bath.jpg?v=real1',
  'Beauty accessories': '/images/home/category-makeup.jpg?v=real1',
  'Baby care': '/images/home/category-baby.jpg?v=real1',
  "Men's grooming": '/images/home/category-mens.jpg?v=real1',
  'Nail care': '/images/home/category-nail.jpg?v=real1'
};

const FALLBACK_PRODUCT_IMAGE = '/images/home/category-skincare.jpg?v=real1';

export function categoryImage(name: string | null | undefined): string {
  return (name && CATEGORY_IMAGES[name]) || FALLBACK_PRODUCT_IMAGE;
}

export async function getPublicProducts(): Promise<PublicProduct[]> {
  try {
    const response = await fetch(`${API_URL}/public/products`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Product request failed: ${response.status}`);
    const data = (await response.json()) as { products?: PublicProduct[] };
    return Array.isArray(data.products) ? data.products : [];
  } catch {
    return [];
  }
}
