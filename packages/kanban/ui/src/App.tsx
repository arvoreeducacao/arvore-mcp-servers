import { TooltipProvider } from "./components/ui/tooltip";
import { BoardView } from "./components/BoardView";

export default function App() {
  return (
    <TooltipProvider>
      <BoardView />
    </TooltipProvider>
  );
}
