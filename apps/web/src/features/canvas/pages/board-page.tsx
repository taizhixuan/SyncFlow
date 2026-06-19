import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '@/features/auth/auth-context';
import { useCanvasDocument } from '../hooks/use-canvas-document';
import { TOOLS, type ToolId } from '../lib/tools';
import { CanvasStage } from '../components/canvas-stage';
import { ToolRail } from '../components/tool-rail';
import { CanvasTopBar } from '../components/canvas-top-bar';

function isTypingTarget(): boolean {
  const el = document.activeElement;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
}

export function BoardPage(): JSX.Element {
  const { boardId } = useParams();
  const { user } = useAuth();
  const doc = useCanvasDocument();
  const [tool, setTool] = useState<ToolId>('select');
  const [spaceDown, setSpaceDown] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (isTypingTarget()) return;
      if (e.code === 'Space') {
        setSpaceDown(true);
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (doc.selectedId) {
          e.preventDefault();
          doc.remove([doc.selectedId]);
          doc.setSelectedId(null);
        }
        return;
      }
      if (e.key === 'Escape') {
        doc.setSelectedId(null);
        return;
      }
      const match = TOOLS.find((t) => t.shortcut.toLowerCase() === e.key.toLowerCase());
      if (match) setTool(match.id);
    }
    function onKeyUp(e: KeyboardEvent): void {
      if (e.code === 'Space') setSpaceDown(false);
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [doc]);

  return (
    <div className="flex h-screen flex-col bg-paper">
      <CanvasTopBar title={boardId === 'local' ? 'Local board' : (boardId ?? 'Board')} />
      <div className="relative flex flex-1 overflow-hidden">
        <div className="absolute left-3 top-3 z-10">
          <ToolRail tool={tool} onToolChange={setTool} />
        </div>
        <CanvasStage
          tool={tool}
          onToolChange={setTool}
          doc={doc}
          spaceDown={spaceDown}
          createdBy={user?.id}
        />
      </div>
    </div>
  );
}
