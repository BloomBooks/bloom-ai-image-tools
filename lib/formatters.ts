/**
 * A cost in dollars, as every display shows it: to the cent, or to a tenth of
 * a cent when it is under a cent. An image can cost well under a cent, and
 * "$0.01" for everything cheap hides the difference between the models.
 *
 * An amount too small to show at a tenth of a cent reads "<$0.001" rather than
 * "$0.000", which would say it was free.
 */
export const formatCost = (cost: number | null | undefined): string => {
  if (typeof cost !== "number" || !Number.isFinite(cost) || cost <= 0) {
    return "$0.00";
  }
  if (cost >= 0.01) {
    return `$${cost.toFixed(2)}`;
  }
  return cost < 0.0005 ? "<$0.001" : `$${cost.toFixed(3)}`;
};

/**
 * Formats a numeric credit value for display.
 * Returns "--" for invalid/missing values.
 */
export const formatCreditsValue = (value: number | null | undefined): string => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "--";
  }
  const formatted = value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `US$${formatted}`;
};
