import type { Business } from './types';
import { includedSaleIds, type DateRange, type ReportSnapshot } from './reports';
import { eatDateKey } from './format';

function escape(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function eatTime(value: string): string {
  const date = new Date(new Date(value).getTime() + 3 * 3600_000);
  return date.toISOString().slice(11, 19);
}

export function downloadEfdCsv(
  snapshot: ReportSnapshot,
  range: DateRange,
  business: Business | null
): void {
  const ids = includedSaleIds(snapshot.sales, snapshot.payments, range);
  const sales = new Map(snapshot.sales.filter((sale) => ids.has(sale.id)).map((sale) => [sale.id, sale]));
  const customers = new Map(snapshot.customers.map((customer) => [customer.id, customer.name]));
  const rows = snapshot.saleItems.filter((item) => ids.has(item.saleId));

  const header = [
    'RECEIPT_NO',
    'DATE',
    'TIME',
    'TIN',
    'CUSTOMER',
    'ITEM',
    'QTY',
    'UNIT',
    'UNIT_PRICE_TZS',
    'LINE_TOTAL_TZS'
  ].join(',');

  const lines = rows.map((item) => {
    const sale = sales.get(item.saleId);
    return [
      escape(sale?.receiptNo),
      escape(sale ? eatDateKey(sale.soldAt) : ''),
      escape(sale ? eatTime(sale.soldAt) : ''),
      escape(business?.tin ?? ''),
      escape(sale?.customerId ? customers.get(sale.customerId) ?? 'Walk-in' : 'Walk-in'),
      escape(item.productName),
      escape(item.qty),
      escape(item.unitSymbol),
      escape(item.pricePerUnit),
      escape(item.lineTotal)
    ].join(',');
  });

  const blob = new Blob([[header, ...lines].join('\n')], {
    type: 'text/csv;charset=utf-8'
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `caris-efd-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json'
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function readJsonFile(file: File): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(JSON.parse(String(reader.result)));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
