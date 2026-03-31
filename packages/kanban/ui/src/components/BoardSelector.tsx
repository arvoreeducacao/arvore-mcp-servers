import { useState } from "react";
import type { BoardSummary } from "../types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { ChevronDown, Plus, LayoutGrid } from "lucide-react";

interface BoardSelectorProps {
  boards: BoardSummary[];
  currentBoardId: string | null;
  onSelectBoard: (boardId: string) => void;
  onCreateBoard: (name: string) => void;
}

export function BoardSelector({
  boards,
  currentBoardId,
  onSelectBoard,
  onCreateBoard,
}: BoardSelectorProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [newBoardName, setNewBoardName] = useState("");

  const currentBoard = boards.find((b) => b.id === currentBoardId);

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newBoardName.trim()) return;
    onCreateBoard(newBoardName.trim());
    setNewBoardName("");
    setCreateOpen(false);
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="gap-2 text-text font-medium">
            <LayoutGrid className="h-4 w-4 text-accent" />
            {currentBoard?.name || "Select board"}
            <ChevronDown className="h-3.5 w-3.5 text-text-dim" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[220px]">
          {boards.map((board) => (
            <DropdownMenuItem
              key={board.id}
              onClick={() => onSelectBoard(board.id)}
            >
              <span className="flex items-center gap-2">
                <LayoutGrid className="h-3.5 w-3.5 text-text-dim" />
                <span className="flex-1 truncate">{board.name}</span>
                <span className="text-[10px] text-text-dim">
                  {board.cards_total}
                </span>
              </span>
            </DropdownMenuItem>
          ))}
          {boards.length > 0 && <DropdownMenuSeparator />}
          <DropdownMenuItem onClick={() => setCreateOpen(true)}>
            <span className="flex items-center gap-2 text-accent">
              <Plus className="h-3.5 w-3.5" />
              New board
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create board</DialogTitle>
            <DialogDescription>
              Create a new kanban board
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="mt-4 space-y-4">
            <Input
              placeholder="Board name"
              value={newBoardName}
              onChange={(e) => setNewBoardName(e.target.value)}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!newBoardName.trim()}>
                Create
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
