export function normalizeUsername(raw: string) {
  return raw.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9_.-]/g, '')
}
