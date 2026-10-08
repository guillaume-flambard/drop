export type Theme = 'light' | 'dark';

/** Follows the operating system preference. There is no manual override yet. */
export function currentTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(root: HTMLElement): void {
  root.dataset.theme = currentTheme();
}
