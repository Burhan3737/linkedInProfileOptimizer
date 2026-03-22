/// <reference types="vite/client" />

// Vite ?url suffix — resolves to a string URL at build time
declare module '*?url' {
  const url: string;
  export default url;
}
