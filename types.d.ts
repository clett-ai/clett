// Global type declarations
declare global {
  var process: NodeJS.Process;
  var Buffer: typeof globalThis.Buffer;
}

export {};

// Temporary module declarations to satisfy TS if types are not resolved in the editor
declare module "react";
declare module "swr";
declare module "react-markdown";
declare module "remark-gfm";
declare module "rehype-highlight";
declare module "recharts";
declare module "next/headers";
