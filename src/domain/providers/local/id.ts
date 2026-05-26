let nextId = 1;

export function createId(prefix: string): string {
  const value = `${prefix}_${String(nextId).padStart(4, "0")}`;
  nextId += 1;
  return value;
}

export function resetIdsForTests(): void {
  nextId = 1;
}
