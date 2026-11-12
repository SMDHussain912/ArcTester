declare module "expo-screen-capture" {
  export function preventScreenCaptureAsync(): Promise<void>;
  export function allowScreenCaptureAsync(): Promise<void>;
}
