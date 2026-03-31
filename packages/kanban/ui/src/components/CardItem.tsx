import { useSortable } from "@dnd-kit/react/sortable";
import type { Card, Column, Priority } from "../types";
import { PriorityIcon } from "./PriorityIcon";
import { SessionBadge } from "./SessionBadge";
import { CardContextMenu } from "./CardContextMenu";
import { Badge } from "./ui/badge";
import { cn } from "../lib/utils";
import { ListChecks } from "lucide-react";

interface CardItemProps {
  card: Card;
  columns: Column[];
  index: number;
  columnId: string;
  isSelected: boolean;
  onSelect: (cardId: string) => void;
  onSetPriority: (cardId: string, priority: Priority) => void;
  onMoveToColumn: (cardId: string, columnId: string) => void;
  onArchive: (cardId: string) => void;
  onDelete: (cardId: string) => void;
}

export function CardItem({
  card,
  columns,
  index,
  columnId,
  isSelected,
  onSelect,
  onSetPriority,
  onMoveToColumn,
  onArchive,
  onDelete,
}: CardItemProps) {
  const { ref, isDragSource } = useSortable({
    id: card.id,
    index,
    group: columnId,
    data: { card, columnId },
  });

  return (
    <CardContextMenu
      card={card}
      columns={columns}
      onSetPriority={onSetPriority}
      onMoveToColumn={onMoveToColumn}
      onArchive={onArchive}
      onDelete={onDelete}
    >
      <div
        ref={ref}
        onClick={() => onSelect(card.id)}
        className={cn(
          "group cursor-pointer rounded-md border bg-surface-raised px-3 py-2.5 transition-all",
          isSelected
            ? "border-l-2 border-l-accent border-t-border-normal border-r-border-normal border-b-border-normal bg-surface-overlay"
            : "border-border hover:border-border-hover hover:shadow-sm hover:shadow-black/20",
          isDragSource && "opacity-40"
        )}
      >
        <div className="flex items-start gap-2">
          <PriorityIcon
            priority={card.priority}
            className="mt-0.5 shrink-0"
          />
          <span className="text-[13px] font-medium leading-snug text-text">
            {card.title}
          </span>
        </div>

        {card.tags.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1 pl-5">
            {card.tags.map((tag) => (
              <Badge key={tag} className="text-[10px] px-1.5 py-0">
                {tag}
              </Badge>
            ))}
          </div>
        )}

        <div className="mt-2 flex items-center gap-2 pl-5">
          {card.assignee && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent/20 text-[10px] font-semibold text-accent uppercase">
              {card.assignee.charAt(0)}
            </span>
          )}

          {(card.subtasks_count ?? 0) > 0 && (
            <span className="flex items-center gap-0.5 text-[11px] text-text-dim">
              <ListChecks className="h-3 w-3" />
              {card.subtasks_done ?? 0}/{card.subtasks_count}
            </span>
          )}

          <SessionBadge
            session={card.session}
            sessionId={card.session_id}
            sessionStatus={card.session_status}
          />
        </div>
      </div>
    </CardContextMenu>
  );
}
