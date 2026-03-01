declare module "@xenova/transformers" {
  interface PretrainedOptions {
    quantized?: boolean;
    progress_callback?: (progress: unknown) => void;
  }

  interface PipelineOutput {
    (input: string | string[], options?: Record<string, unknown>): Promise<{ data: Float32Array }[]>;
  }

  export function pipeline(task: string, model?: string, options?: PretrainedOptions): Promise<PipelineOutput>;
}
