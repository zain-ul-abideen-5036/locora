import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merges class names, letting a later class win over an earlier conflicting one.
 *
 * Plain concatenation does not do this: `"px-4" + " px-2"` leaves both in the
 * attribute and the winner is decided by stylesheet order, not by call order.
 * That makes a component's `className` prop unreliable — the one place a
 * caller most needs to be able to override a default.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
