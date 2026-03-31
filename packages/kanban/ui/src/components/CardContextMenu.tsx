import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "./ui/context-menu";
import { PriorityIcon } from "./PriorityIcon";
import type { Card, Column, Priority } from "../types";
import {
  ArrowRight,
  Archive,
  Trash2,
  User,
  Signal,
} from "lucide-react";

interface CardContextMenuProps {
  card: Card;
  columns: Column[];
  children: React.ReactNode;
  onSetPriority: (cardId: string, priority: Priority) => void;
  onMoveToColumn: (cardId: string, columnId: string) => void;
  onArchive: (cardId: string) => void;
  onDelete: (cardId: string) => void;
}

const PRIORITIES: { value: Priority; label: string }[] = [
  { value: "urgent", label: "Urgent" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
  { value: "none", label: "No priority" },
];

export function CardContextMenu({
  card,
  columns,
  children,
  onSetPriority,
  onMoveToColumn,
  onArchive,
  onDelete,
}: CardContextMenuProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuLabel>
          <span className="flex items-center gap-1.5">
            <Signal className="h-3 w-3" />
            Set priority
          </span>
        </ContextMenuLabel>
        {PRIORITIES.map((p) => (
          <ContextMenuItem
            key={p.value}
            onClick={() => onSetPriority(card.id, p.value)}
          >
            <span className="flex items-center gap-2">
              <PriorityIcon priority={p.value} />
              <span>{p.label}</span>
              {card.priority === p.value && (
                <span className="ml-auto text-accent">✓</span>
              )}
            </span>
          </ContextMenuItem>
        ))}

        <ContextMenuSeparator />

        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <span className="flex items-center gap-2">
              <ArrowRight className="h-3.5 w-3.5" />
              Move to column
            </span>
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            {columns.map((col) => (
              <ContextMenuItem
                key={col.id}
                onClick={() => onMoveToColumn(card.id, col.id)}
                disabled={col.id === card.column_id}
              >
                <span className="flex items-center gap-2">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: col.color || "#6b7280" }}
                  />
                  {col.name}
                  {col.id === card.column_id && (
                    <span className="ml-auto text-text-dim text-xs">
                      current
                    </span>
                  )}
                </span>
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuItem disabled>
          <span className="flex items-center gap-2">
            <User className="h-3.5 w-3.5" />
            Assign to...
          </span>
        </ContextMenuItem>

        <ContextMenuSeparator />

        <ContextMenuItem onClick={() => onArchive(card.id)}>
          <span className="flex items-center gap-2">
            <Archive className="h-3.5 w-3.5" />
            Archive
          </span>
        </ContextMenuItem>

        <ContextMenuItem
          onClick={() => onDelete(card.id)}
          className="text-priority-urgent focus:text-priority-urgent"
        >
          <span className="flex items-center gap-2">
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
