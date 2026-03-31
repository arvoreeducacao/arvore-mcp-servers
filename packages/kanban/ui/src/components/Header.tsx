import { forwardRef } from "react";
import type { BoardSummary } from "../types";
import { BoardSelector } from "./BoardSelector";
import { Input } from "./ui/input";
import { Search } from "lucide-react";

interface HeaderProps {
  boards: BoardSummary[];
  currentBoardId: string | null;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSelectBoard: (boardId: string) => void;
  onCreateBoard: (name: string) => void;
}

export const Header = forwardRef<HTMLInputElement, HeaderProps>(
  function Header(
    {
      boards,
      currentBoardId,
      searchQuery,
      onSearchChange,
      onSelectBoard,
      onCreateBoard,
    },
    searchRef
  ) {
    return (
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-surface-raised px-4">
        <BoardSelector
          boards={boards}
          currentBoardId={currentBoardId}
          onSelectBoard={onSelectBoard}
          onCreateBoard={onCreateBoard}
        />

        <div className="relative w-64">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-dim" />
          <Input
            ref={searchRef}
            placeholder="Search cards..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-7 pl-8 text-xs"
          />
          <kbd className="absolute right-2 top-1/2 -translate-y-1/2 rounded border border-border-normal bg-surface-overlay px-1 py-0.5 text-[10px] text-text-dim">
            /
          </kbd>
        </div>
      </header>
    );
  }
);
