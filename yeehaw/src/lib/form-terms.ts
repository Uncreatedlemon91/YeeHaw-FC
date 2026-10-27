import { parseTerms, type TermErrors, type Terms } from "./contract-rules";

/** Terms from a FormData whose field names carry `prefix`; errors come back under the prefixed names. */
export function readTerms(
  data: FormData,
  prefix = "",
  opts: { allowBlank?: boolean } = {},
): { terms: Terms; fieldErrors?: undefined } | { terms?: undefined; fieldErrors: Record<string, string> } {
  const r = parseTerms((name) => String(data.get(prefix + name) ?? ""), opts);
  return r.terms ? { terms: r.terms } : { fieldErrors: prefixErrors(prefix, r.errors) };
}

export function prefixErrors(prefix: string, errors: TermErrors): Record<string, string> {
  return Object.fromEntries(Object.entries(errors).map(([k, v]) => [prefix + k, v as string]));
}
