// Vite asset imports the Studio bundle uses (see studio/pageFrame.ts).
declare module "*?raw" {
  const text: string;
  export default text;
}

declare module "*?url" {
  const url: string;
  export default url;
}

interface ImportMeta {
  glob<T>(
    pattern: string,
    options: { query: string; import: string; eager: true },
  ): Record<string, T>;
}
