export const EXPENSE_CATEGORY_VALUES = [
  'salary',
  'transport',
  'rent',
  'utilities',
  'license',
  'tra',
  'security',
  'tbs',
  'supplies',
  'marketing',
  'repairs',
  'other'
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORY_VALUES)[number];

export const EXPENSE_CATEGORIES: ReadonlyArray<{
  value: ExpenseCategory;
  label: string;
}> = [
  { value: 'salary', label: 'Salary / Malipo ya mfanyakazi' },
  { value: 'transport', label: 'Transport / Usafiri' },
  { value: 'rent', label: 'Rent / Kodi ya pango' },
  { value: 'utilities', label: 'Utilities / Umeme, maji, internet' },
  { value: 'license', label: 'License / Leseni' },
  { value: 'tra', label: 'TRA fees / Kodi ya TRA' },
  { value: 'security', label: 'Security / Mlinzi' },
  { value: 'tbs', label: 'TBS fees' },
  { value: 'supplies', label: 'Supplies / Vifaa' },
  { value: 'marketing', label: 'Marketing / Matangazo' },
  { value: 'repairs', label: 'Repairs / Ukarabati' },
  { value: 'other', label: 'Other / Nyingine' }
];

const CATEGORY_LABELS = new Map<string, string>(
  EXPENSE_CATEGORIES.map((category) => [category.value, category.label])
);

export function expenseCategoryLabel(value: string): string {
  return CATEGORY_LABELS.get(value) ?? value;
}
