import { useEffect, useMemo } from 'react';
import { useStore } from 'zustand';
import { useParams } from 'react-router-dom';
import { useTheme } from '@/app/theme';
import { createCanvasStore } from '../engine/canvas-store';
import { CanvasStage } from '../components/canvas-stage';
import { ToolRail } from '../components/tool-rail';
import { CanvasTopBar } from '../components/canvas-top-bar';
import { StyleBar } from '../components/style-bar';
import { AlignBar } from '../components/align-bar';
import { useCanvasKeyboard } from '../hooks/use-canvas-keyboard';

export function BoardPage(): JSX.Element {
  const { boardId } = useParams();
  const id = boardId ?? 'local';
  const store = useMemo(() => createCanvasStore(id), [id]);
  const { theme, setTheme } = useTheme();

  // The board persists its own theme; mirror it onto the app theme.
  const storeTheme = useStore(store, (s) => s.theme);
  useEffect(() => {
    if (storeTheme !== theme) setTheme(storeTheme);
  }, [storeTheme, theme, setTheme]);

  useEffect(() => {
    (window as unknown as { __canvas?: unknown }).__canvas = store;
    return () => {
      delete (window as unknown as { __canvas?: unknown }).__canvas;
    };
  }, [store]);

  useCanvasKeyboard(store);

  return (
    <div className="flex h-screen flex-col bg-paper dark:bg-paper-dark">
      <CanvasTopBar store={store} title={id === 'local' ? 'Local board' : id} />
      <div className="relative flex flex-1 overflow-hidden">
        <div className="absolute left-3 top-3 z-10">
          <ToolRail store={store} />
        </div>
        <div className="absolute right-3 top-3 z-10">
          <StyleBar store={store} />
        </div>
        <div className="absolute left-1/2 top-3 z-10 -translate-x-1/2">
          <AlignBar store={store} />
        </div>
        <CanvasStage store={store} />
      </div>
    </div>
  );
}
