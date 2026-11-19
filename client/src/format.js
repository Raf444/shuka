export function formatAmd(n) {
  const v = Math.round(Number(n) || 0);
  const sign = v < 0 ? '-' : '';
  return sign + String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ֏';
}

export function formatDate(s, withTime = false) {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d)) return String(s);
  const opts = { year: 'numeric', month: 'short', day: 'numeric' };
  if (withTime) Object.assign(opts, { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleString('en-GB', opts);
}

export const STATUS_LABELS = {
  placed: 'Placed',
  confirmed: 'Confirmed',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export function stockLabel(stock) {
  if (stock <= 0) return { text: 'Out of stock', cls: 'stock-out' };
  if (stock <= 5) return { text: `Only ${stock} left`, cls: 'stock-low' };
  return { text: 'In stock', cls: 'stock-ok' };
}
