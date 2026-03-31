import { useDroppable } from "@dnd-kit/react";
import type { Card, Column, Priority } from "../types";
import { CardItem } from "./CardItem";
import { Plus } from "lucide-react";
import { Button } from "./ui/button";

interface BoardColumnProps {
  column: Column;
  cards: Card[];
  allColumns: Column[];
  selectedCardId: string | null;
  onSelectCard: (cardId: string) => void;
  onAddCard: (columnId: string) => void;
  onSetPriority: (cardId: string, priority: Priority) => void;
  onMoveToColumn: (cardId: string, columnId: string) => void;
  onArchive: (cardId: string) => void;
  onDelete: (cardId: string) => void;
}

export function BoardColumn({
  column,
  cards,
  allColumns,
  selectedCardId,
  onSelectCard,
  onAddCard,
  onSetPriority,
  onMoveToColumn,
  onArchive,
  onDelete,
}: BoardColumnProps) {
  const { ref } = useDroppable({
    id: column.id,
  });

  return (
    <div className="flex w-[280px] shrink-0 flex-col">
      <div className="flex items-center justify-between px-1 pb-3">
        <div className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: column.color || "#6b7280" }}
          />
          <span className="text-sm font-medium text-text">{column.name}</span>
          <span className="text-xs text-text-dim">{cards.length}</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-text-dim hover:text-text"
          onClick={() => onAddCard(column.id)}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div
        ref={ref}
        className="flex min-h-[100px] flex-1 flex-col gap-1.5 rounded-lg p-0.5"
      >
        {cards.map((card, index) => (
          <CardItem
            key={card.id}
            card={card}
            columns={allColumns}
            index={index}
            columnId={column.id}
            isSelected={selectedCardId === card.id}
            onSelect={onSelectCard}
            onSetPriority={onSetPriority}
            onMoveToColumn={onMoveToColumn}
            onArchive={onArchive}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
}
