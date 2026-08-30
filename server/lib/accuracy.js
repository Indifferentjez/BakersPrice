// Accuracy labels the baker sees against every number.
//   KNOWN            - baker entered it
//   CALCULATED       - pure arithmetic on KNOWN / CALCULATED inputs
//   ESTIMATED        - derived from the brief's generic tables (fill %, moisture, density)
//   REQUIRES_TESTING - should be checked with a real bake before relying on it commercially
export const ACC = {
  KNOWN: 'KNOWN',
  CALCULATED: 'CALCULATED',
  ESTIMATED: 'ESTIMATED',
  REQUIRES_TESTING: 'REQUIRES_TESTING',
};

const RANK = { KNOWN: 0, CALCULATED: 1, ESTIMATED: 2, REQUIRES_TESTING: 3 };

// The weakest (highest-rank) label among inputs propagates to a derived value.
export function weakest(...labels) {
  return labels.flat().filter(Boolean).sort((a, b) => RANK[b] - RANK[a])[0] ?? ACC.CALCULATED;
}

export function known(value, note) {
  return { value, accuracy: ACC.KNOWN, note: note ?? null };
}
export function calculated(value, from, note) {
  return { value, accuracy: weakest(ACC.CALCULATED, from), note: note ?? null };
}
export function estimated(value, note) {
  return { value, accuracy: ACC.ESTIMATED, note: note ?? null };
}
export function range(min, max, accuracy, note) {
  return { min, max, accuracy, note: note ?? null };
}
