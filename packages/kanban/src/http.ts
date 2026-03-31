import express from "express";
import cors from "cors";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { KanbanStore } from "./store.js";

export function startHttpServer(store: KanbanStore, port: number): void {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/api/boards", async (_req, res) => {
    try {
      const result = await store.listBoards();
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "Unknown error" });
    }
  });

  app.post("/api/boards", async (req, res) => {
    try {
      const result = await store.createBoard(req.body);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "Unknown error" });
    }
  });

  app.get("/api/boards/:id", async (req, res) => {
    try {
      const includeArchived = req.query.include_archived === "true";
      const result = await store.getBoard(req.params.id, includeArchived);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "Unknown error" });
    }
  });

  app.get("/api/boards/:boardId/cards/:cardId", async (req, res) => {
    try {
      const result = await store.getCard(req.params.boardId, req.params.cardId);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "Unknown error" });
    }
  });

  app.post("/api/boards/:boardId/cards", async (req, res) => {
    try {
      const result = await store.createCard({ board_id: req.params.boardId, ...req.body });
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "Unknown error" });
    }
  });

  app.patch("/api/boards/:boardId/cards/:cardId", async (req, res) => {
    try {
      const result = await store.updateCard({ board_id: req.params.boardId, card_id: req.params.cardId, ...req.body });
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "Unknown error" });
    }
  });

  app.post("/api/boards/:boardId/cards/:cardId/move", async (req, res) => {
    try {
      const result = await store.moveCard({ board_id: req.params.boardId, card_id: req.params.cardId, ...req.body });
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "Unknown error" });
    }
  });

  app.post("/api/boards/:boardId/cards/:cardId/claim", async (req, res) => {
    try {
      const result = await store.claimCard({ board_id: req.params.boardId, card_id: req.params.cardId, ...req.body });
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "Unknown error" });
    }
  });

  app.post("/api/boards/:boardId/cards/:cardId/release", async (req, res) => {
    try {
      const result = await store.releaseCard({ board_id: req.params.boardId, card_id: req.params.cardId, ...req.body });
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "Unknown error" });
    }
  });

  app.post("/api/boards/:boardId/cards/:cardId/archive", async (req, res) => {
    try {
      const result = await store.archiveCard({ board_id: req.params.boardId, card_id: req.params.cardId });
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "Unknown error" });
    }
  });

  app.delete("/api/boards/:boardId/cards/:cardId", async (req, res) => {
    try {
      const result = await store.deleteCard({ board_id: req.params.boardId, card_id: req.params.cardId });
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "Unknown error" });
    }
  });

  app.post("/api/search", async (req, res) => {
    try {
      const result = await store.searchCards(req.body);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "Unknown error" });
    }
  });

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const uiPath = join(__dirname, "..", "ui", "dist");
  app.use(express.static(uiPath));
  app.get("*", (_req, res) => {
    res.sendFile(join(uiPath, "index.html"));
  });

  app.listen(port, () => {
    console.error(`Kanban UI available at http://localhost:${port}`);
  });
}
