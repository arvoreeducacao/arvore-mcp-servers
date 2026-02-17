import { describe, it, expect } from "vitest";
import { EmbeddingEngine } from "./embeddings.js";

describe("EmbeddingEngine", () => {
  describe("isReady", () => {
    it("should return false before init", () => {
      const engine = new EmbeddingEngine();
      expect(engine.isReady()).toBe(false);
    });
  });

  describe("getModelName", () => {
    it("should return default model name", () => {
      const engine = new EmbeddingEngine();
      expect(engine.getModelName()).toBe("Xenova/paraphrase-multilingual-MiniLM-L12-v2");
    });

    it("should return custom model name", () => {
      const engine = new EmbeddingEngine("Xenova/all-MiniLM-L6-v2");
      expect(engine.getModelName()).toBe("Xenova/all-MiniLM-L6-v2");
    });
  });

  describe("embed", () => {
    it("should throw if not initialized", async () => {
      const engine = new EmbeddingEngine();
      await expect(engine.embed("test")).rejects.toThrow("not initialized");
    });
  });
});
