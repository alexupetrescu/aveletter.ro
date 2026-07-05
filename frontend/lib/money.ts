/** Format integer bani as Romanian lei, e.g. 5500 -> "55,00 lei". */
export function formatBani(amount: number, currency = "RON"): string {
  const lei = Math.floor(amount / 100);
  const bani = Math.abs(amount % 100).toString().padStart(2, "0");
  const formattedLei = lei.toLocaleString("ro-RO");
  const unit = currency === "RON" ? "lei" : currency;
  return `${formattedLei},${bani} ${unit}`;
}
