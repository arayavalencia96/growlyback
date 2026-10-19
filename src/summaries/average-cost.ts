export function resolveAverageCostAmount(
  quantity: number,
  unitPrice: number | null | undefined,
  totalAmount: number,
): number {
  return unitPrice == null ? totalAmount : quantity * unitPrice;
}
