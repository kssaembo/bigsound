/// <reference types="vite/client" />
declare module 'jsmediatags/dist/jsmediatags.min.js' {
  const tags: { read(file: File, options: { onSuccess: (result: { tags: { picture?: { data: number[]; format: string } } }) => void; onError: (error: unknown) => void }): void };
  export default tags;
}
