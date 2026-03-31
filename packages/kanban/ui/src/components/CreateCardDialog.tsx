import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { PriorityIcon } from "./PriorityIcon";
import type { Column, Priority } from "../types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

interface CreateCardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  columns: Column[];
  defaultColumnId?: string;
  onSubmit: (data: {
    column_id: string;
    title: string;
    description?: string;
    priority?: Priority;
    tags?: string[];
  }) => void;
}

const PRIORITIES: { value: Priority; label: string }[] = [
  { value: "urgent", label: "Urgent" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
  { value: "none", label: "No priority" },
];

export function CreateCardDialog({
  open,
  onOpenChange,
  columns,
  defaultColumnId,
  onSubmit,
}: CreateCardDialogProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("none");
  const [columnId, setColumnId] = useState(defaultColumnId || columns[0]?.id || "");
  const [tags, setTags] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    onSubmit({
      column_id: columnId,
      title: title.trim(),
      description: description.trim() || undefined,
      priority,
      tags: tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    });
    setTitle("");
    setDescription("");
    setPriority("none");
    setTags("");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create card</DialogTitle>
          <DialogDescription>Add a new card to the board</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <Input
              placeholder="Card title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>

          <div>
            <textarea
              placeholder="Description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="flex min-h-[80px] w-full rounded-md border border-border-normal bg-surface-raised px-3 py-2 text-sm text-text placeholder:text-text-dim focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent resize-none"
            />
          </div>

          <div className="flex items-center gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" type="button">
                  <PriorityIcon priority={priority} className="mr-1.5" />
                  {PRIORITIES.find((p) => p.value === priority)?.label}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {PRIORITIES.map((p) => (
                  <DropdownMenuItem
                    key={p.value}
                    onClick={() => setPriority(p.value)}
                  >
                    <PriorityIcon priority={p.value} className="mr-2" />
                    {p.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" type="button">
                  <span
                    className="mr-1.5 h-2 w-2 rounded-full"
                    style={{
                      backgroundColor:
                        columns.find((c) => c.id === columnId)?.color ||
                        "#6b7280",
                    }}
                  />
                  {columns.find((c) => c.id === columnId)?.name || "Column"}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {columns.map((col) => (
                  <DropdownMenuItem
                    key={col.id}
                    onClick={() => setColumnId(col.id)}
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

          <div>
            <Input
              placeholder="Tags (comma separated)"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!title.trim()}>
              Create
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
