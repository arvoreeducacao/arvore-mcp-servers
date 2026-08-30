declare module "pixelmatch" {
  interface PixelmatchOptions {
    threshold?: number;
    includeAA?: boolean;
    alpha?: number;
    aaColor?: [number, number, number];
    diffColor?: [number, number, number];
    diffColorAlt?: [number, number, number];
    diffMask?: boolean;
  }

  function pixelmatch(
    img1: Uint8Array,
    img2: Uint8Array,
    output: Uint8Array | null,
    width: number,
    height: number,
    options?: PixelmatchOptions
  ): number;

  export default pixelmatch;
}
