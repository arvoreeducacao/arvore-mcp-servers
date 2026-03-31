import { useState, useEffect, useCallback } from "react";
import type { CardDetail as CardDetailType, Priority, Column } from "../types";
import { getCard, updateCard } from "../api";
import { PriorityIcon } from "./PriorityIcon";
import { SessionBadge } from "./SessionBadge";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Separator } from "./ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import {
  X,
  Archive,
  Trash2,
  ListChecks,
  Clock,
} from "lucide-react";

interface CardDetailProps {
  boardId: string;
  cardId: string;
  columns: Column[];
  onClose: () => void;
  onArchive: (cardId: string) => void;
  onDelete: (cardId: string) => void;
  onMoveToColumn: (cardId: string, columnId: string) => void;
  onUpdate: () => void;
}

const PRIORITIES: { value: Priority; label: string }[] = [
  { value: "urgent", label: "Urgent" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
  { value: "none", label: "No priority" },
];

export function CardDetail({
  boardId,
  cardId,
  columns,
  onClose,
  onArchive,
  onDelete,
  onMoveToColumn,
  onUpdate,
}: CardDetailProps) {
  const [card, setCard] = useState<CardDetailType | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState("");
  const [editingDesc, setEditingDesc] = useState(false);
  const [descValue, setDescValue] = useState("");

  const loadCard = useCallback(async () => {
    try {
      const data = await getCard(boardId, cardId);
      setCard(data);
      setTitleValue(data.title);
      setDescValue(data.description || "");
    } catch {
      // ignore
    }
  }, [boardId, cardId]);

  useEffect(() => {
    loadCard();
  }, [loadCard]);

  async function saveTitle() {
    if (!card || !titleValue.trim()) return;
    setEditingTitle(false);
    await updateCard(boardId, cardId, { title: titleValue.trim() });
    onUpdate();
    loadCard();
  }

  async function saveDescription() {
    if (!card) return;
    setEditingDesc(false);
    await updateCard(boardId, cardId, { description: descValue });
    onUpdate();
    loadCard();
  }

  async function handleSetPriority(priority: Priority) {
    if (!card) return;
    await updateCard(boardId, cardId, { priority });
    onUpdate();
    loadCard();
  }

  if (!card) {
    return (
      <div className="flex h-full w-[400px] items-center justify-center border-l border-border bg-surface-raised">
        <span className="text-sm text-text-dim">Loading...</span>
      </div>
    );
  }

  return (
    <div className="flex h-full w-[400px] shrink-0 flex-col border-l border-border bg-surface-raised animate-slide-in-right">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="text-xs text-text-dim font-mono">
          {card.id.slice(0, 8)}
        </span>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-6 w-6">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {editingTitle ? (
          <input
            className="w-full bg-transparent text-base font-semibold text-text outline-none border-b border-accent pb-1"
            value={titleValue}
            onChange={(e) => setTitleValue(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => e.key === "Enter" && saveTitle()}
            autoFocus
          />
        ) : (
          <h2
            className="text-base font-semibold text-text cursor-pointer hover:text-accent transition-colors"
            onClick={() => setEditingTitle(true)}
          >
            {card.title}
          </h2>
        )}

        <div>
          <span className="text-xs font-medium text-text-dim uppercase tracking-wider">
            Description
          </span>
          {editingDesc ? (
            <textarea
              className="mt-1 w-full min-h-[80px] bg-transparent text-sm text-text-muted outline-none border border-border-normal rounded-md p-2 resize-none focus:border-accent"
              value={descValue}
              onChange={(e) => setDescValue(e.target.value)}
              onBlur={saveDescription}
              autoFocus
            />
          ) : (
            <p
              className="mt-1 text-sm text-text-muted cursor-pointer hover:text-text transition-colors min-h-[20px]"
              onClick={() => setEditingDesc(true)}
            >
              {card.description || "Add a description..."}
            </p>
          )}
        </div>

        <Separator />

        <div className="space-y-3">
          <span className="text-xs font-medium text-text-dim uppercase tracking-wider">
            Properties
          </span>

          <div className="flex items-center justify-between">
            <span className="text-sm text-text-muted">Priority</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7">
                  <PriorityIcon priority={card.priority} className="mr-1.5" />
                  <span className="text-xs">
                    {PRIORITIES.find((p) => p.value === card.priority)?.label}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {PRIORITIES.map((p) => (
                  <DropdownMenuItem
                    key={p.value}
                    onClick={() => handleSetPriority(p.value)}
                  >
                    <PriorityIcon priority={p.value} className="mr-2" />
                    {p.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-text-muted">Status</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7">
                  <span
                    className="mr-1.5 h-2 w-2 rounded-full"
                    style={{
                      backgroundColor:
                        columns.find((c) => c.id === card.column_id)?.color ||
                        "#6b7280",
                    }}
                  />
                  <span className="text-xs">
                    {card.column?.name ||
                      columns.find((c) => c.id === card.column_id)?.name}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {columns.map((col) => (
                  <DropdownMenuItem
                    key={col.id}
                    onClick={() => onMoveToColumn(card.id, col.id)}
                  >
                    <span
                      className="mr-2 h-2 w-2 rounded-full"
                      style={{ backgroundColor: col.color || "#6b7280" }}
                    />
                    {col.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-text-muted">Assignee</span>
            <span className="text-sm text-text">
              {card.assignee || "—"}
            </span>
          </div>

          {card.tags.length > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-muted">Tags</span>
              <div className="flex flex-wrap gap-1">
                {card.tags.map((tag) => (
                  <Badge key={tag} className="text-[10px]">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <SessionBadge
            session={card.session}
            sessionId={card.session_id}
            sessionStatus={card.session_status}
          />
        </div>

        {card.subtasks && card.subtasks.length > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              <span className="flex items-center gap-1.5 text-xs font-medium text-text-dim uppercase tracking-wider">
                <ListChecks className="h-3 w-3" />
                Subtasks
              </span>
              {card.subtasks.map((sub) => (
                <div
                  key={sub.id}
                  className="flex items-center gap-2 rounded-md bg-surface-overlay px-2.5 py-1.5"
                >
                  <PriorityIcon priority={sub.priority} />
                  <span className="flex-1 text-sm text-text truncate">
                    {sub.title}
                  </span>
                  <span className="text-[10px] text-text-dim">
                    {sub.column_name}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        {card.session_log && card.session_log.length > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              <span className="flex items-center gap-1.5 text-xs font-medium text-text-dim uppercase tracking-wider">
                <Clock className="h-3 w-3" />
                Activity
              </span>
              <div className="space-y-1.5">
                {card.session_log
                  .slice()
                  .reverse()
                  .map((entry, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 text-xs"
                    >
                      <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-border-normal" />
                      <div className="flex-1">
                        <span className="text-text-muted">
                          {entry.session_id}
                        </span>
                        <span className="text-text-dim"> — </span>
                        <span className="text-text">{entry.action}</span>
                        {entry.detail && (
                          <p className="mt-0.5 text-text-dim">
                            {entry.detail}
                          </p>
                        )}
                      </div>
                      <span className="shrink-0 text-text-dim">
                        {new Date(entry.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-border px-4 py-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onArchive(card.id)}
          className="text-text-muted"
        >
          <Archive className="mr-1.5 h-3.5 w-3.5" />
          Archive
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDelete(card.id)}
          className="text-priority-urgent hover:text-priority-urgent"
        >
          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
          Delete
        </Button>
      </div>
    </div>
  );
}
