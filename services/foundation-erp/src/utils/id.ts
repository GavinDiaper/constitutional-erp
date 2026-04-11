export function newId(prefix: string): string {
  return `${prefix}${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}
