import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { DragDropProvider } from "@dnd-kit/react";
import { move } from "@dnd-kit/helpers";
import type { Board, BoardSummary, Priority, Card } from "../types";
import * as api from "../api";
import { BoardColumn } from "./BoardColumn";
import { CardDetail } from "./CardDetail";
import { CreateCardDialog } from "./CreateCardDialog";
import { Header } from "./Header";
import { useHotkeys } from "../hooks/useHotkeys";

export function BoardView() {
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [currentBoardId, setCurrentBoardId] = useState<string | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createColumnId, setCreateColumnId] = useState<string | undefined>();
  const [searchQuery, setSearchQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const loadBoards = useCallback(async () => {
    try {
      const data = await api.listBoards();
      setBoards(data.boards);
      if (!currentBoardId && data.boards.length > 0) {
        setCurrentBoardId(data.boards[0].id);
      }
    } catch {
      // ignore
    }
  }, [currentBoardId]);

  const loadBoard = useCallback(async () => {
    if (!currentBoardId) return;
    try {
      const data = await api.getBoard(currentBoardId);
      setBoard(data);
    } catch {
      // ignore
    }
  }, [currentBoardId]);

  useEffect(() => {
    loadBoards();
  }, [loadBoards]);

  useEffect(() => {
    loadBoard();
    const interval = setInterval(loadBoard, 3000);
    return () => clearInterval(interval);
  }, [loadBoard]);

  const allCards = useMemo(() => {
    if (!board) return [];
    return board.columns.flatMap((col) => col.cards);
  }, [board]);

  const allColumns = useMemo(() => {
    if (!board) return [];
    return board.columns.map(({ cards: _cards, ...col }) => col);
  }, [board]);

  const filteredBoard = useMemo(() => {
    if (!board) return null;
    if (!searchQuery.trim()) return board;
    const q = searchQuery.toLowerCase();
    return {
      ...board,
      columns: board.columns.map((col) => ({
        ...col,
        cards: col.cards.filter(
          (card) =>
            card.title.toLowerCase().includes(q) ||
            card.tags.some((t) => t.toLowerCase().includes(q)) ||
            card.assignee?.toLowerCase().includes(q)
        ),
      })),
    };
  }, [board, searchQuery]);

  const selectedCardIndex = useMemo(() => {
    if (!selectedCardId) return -1;
    return allCards.findIndex((c) => c.id === selectedCardId);
  }, [allCards, selectedCardId]);

  function navigateCards(direction: number) {
    if (allCards.length === 0) return;
    if (selectedCardIndex === -1) {
      setSelectedCardId(allCards[0].id);
      return;
    }
    const next = selectedCardIndex + direction;
    if (next >= 0 && next < allCards.length) {
      setSelectedCardId(allCards[next].id);
    }
  }

  async function handleSetPriority(cardId: string, priority: Priority) {
    if (!currentBoardId) return;
    await api.updateCard(currentBoardId, cardId, { priority });
    loadBoard();
  }

  async function handleMoveToColumn(cardId: string, columnId: string) {
    if (!currentBoardId) return;
    await api.moveCard(currentBoardId, cardId, { column_id: columnId });
    loadBoard();
  }

  async function handleArchive(cardId: string) {
    if (!currentBoardId) return;
    await api.archiveCard(currentBoardId, cardId);
    if (selectedCardId === cardId) setSelectedCardId(null);
    loadBoard();
  }

  async function handleDelete(cardId: string) {
    if (!currentBoardId) return;
    await api.deleteCard(currentBoardId, cardId);
    if (selectedCardId === cardId) setSelectedCardId(null);
    loadBoard();
  }

  async function handleCreateCard(data: {
    column_id: string;
    title: string;
    description?: string;
    priority?: Priority;
    tags?: string[];
  }) {
    if (!currentBoardId) return;
    await api.createCard(currentBoardId, data);
    loadBoard();
  }

  async function handleCreateBoard(name: string) {
    const result = await api.createBoard({ name });
    setCurrentBoardId(result.id);
    loadBoards();
  }

  function handleAddCard(columnId: string) {
    setCreateColumnId(columnId);
    setCreateDialogOpen(true);
  }

  useHotkeys(
    useMemo(
      () => ({
        c: () => setCreateDialogOpen(true),
        "/": () => searchRef.current?.focus(),
        Escape: () => {
          if (selectedCardId) setSelectedCardId(null);
        },
        ArrowLeft: () => navigateCards(-1),
        ArrowRight: () => navigateCards(1),
        Backspace: () => {
          if (selectedCardId) handleArchive(selectedCardId);
        },
        Delete: () => {
          if (selectedCardId) handleArchive(selectedCardId);
        },
      }),
      [selectedCardId, allCards]
    )
  );

  async function handleDragEnd(event: { operation: { source: { data?: Record<string, unknown> } | null; target: { id: string | number } | null }; canceled: boolean }) {
    if (event.canceled) return;
    const source = event.operation.source;
    const target = event.operation.target;

    if (!source?.data?.card || !target?.id || !currentBoardId) return;

    const card = source.data.card as Card;
    const targetColumnId = String(target.id);

    if (card.column_id !== targetColumnId) {
      await api.moveCard(currentBoardId, card.id, {
        column_id: targetColumnId,
        position: "bottom",
      });
      loadBoard();
    }
  }

  if (!filteredBoard) {
    return (
      <div className="flex h-screen flex-col bg-surface">
        <Header
          ref={searchRef}
          boards={boards}
          currentBoardId={currentBoardId}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onSelectBoard={setCurrentBoardId}
          onCreateBoard={handleCreateBoard}
        />
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <p className="text-sm text-text-muted">
              {boards.length === 0
                ? "No boards yet. Create one to get started."
                : "Loading board..."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-surface">
      <Header
        ref={searchRef}
        boards={boards}
        currentBoardId={currentBoardId}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSelectBoard={setCurrentBoardId}
        onCreateBoard={handleCreateBoard}
      />

      <div className="flex flex-1 overflow-hidden">
        <DragDropProvider onDragEnd={handleDragEnd}>
          <div className="flex flex-1 gap-4 overflow-x-auto p-4">
            {filteredBoard.columns.map((column) => (
              <BoardColumn
                key={column.id}
                column={column}
                cards={column.cards}
                allColumns={allColumns}
                selectedCardId={selectedCardId}
                onSelectCard={setSelectedCardId}
                onAddCard={handleAddCard}
                onSetPriority={handleSetPriority}
                onMoveToColumn={handleMoveToColumn}
                onArchive={handleArchive}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </DragDropProvider>

        {selectedCardId && currentBoardId && (
          <CardDetail
            boardId={currentBoardId}
            cardId={selectedCardId}
            columns={allColumns}
            onClose={() => setSelectedCardId(null)}
            onArchive={handleArchive}
            onDelete={handleDelete}
            onMoveToColumn={handleMoveToColumn}
            onUpdate={loadBoard}
          />
        )}
      </div>

      <CreateCardDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        columns={allColumns}
        defaultColumnId={createColumnId}
        onSubmit={handleCreateCard}
      />
    </div>
  );
}
