export const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

/** Formats a currency amount in INR. */
export function formatCurrency(amount: number): string {
  return currency.format(amount);
}

/** Formats an ISO/Date timestamp for display, returning an em-dash if missing. */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) {
    return "—";
  }

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }

  return parsed.toLocaleString("en-IN");
}
