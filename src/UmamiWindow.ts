// types/umami.d.ts
declare global {
  interface Window {
    umami?: {
      identify: (data: { email: string }) => void;
      track: (event: string, data?: any) => void;
    };
  }
}

export {}; // This export is needed to make the file a module
