// Static web rendering can't know the color scheme; always render light on web.
export function useColorScheme(): 'light' | 'dark' {
  return 'light';
}
