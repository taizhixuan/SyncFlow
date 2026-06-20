import { ChevronLeft, ChevronRight, X } from 'lucide-react';

interface PresentationBarProps {
  slideIndex: number;
  totalSlides: number;
  onPrev(): void;
  onNext(): void;
  onExit(): void;
}

export function PresentationBar({
  slideIndex,
  totalSlides,
  onPrev,
  onNext,
  onExit,
}: PresentationBarProps): JSX.Element {
  return (
    <div
      role="toolbar"
      aria-label="Presentation controls"
      className="absolute bottom-4 left-1/2 z-30 flex max-w-[calc(100vw-1.5rem)] -translate-x-1/2 items-center gap-2 rounded-xl bg-paper px-3 py-2 shadow-lg ring-1 ring-line dark:bg-paper-dark dark:ring-line-dark sm:gap-3 sm:px-4"
    >
      <button
        onClick={onPrev}
        disabled={slideIndex === 0}
        aria-label="Previous slide"
        className="grid h-8 w-8 place-items-center rounded-md text-ink-600 disabled:opacity-40 hover:bg-sunken dark:text-ink-dark dark:hover:bg-sunken-dark"
      >
        <ChevronLeft size={20} aria-hidden="true" />
      </button>
      <span className="min-w-[5rem] text-center text-sm font-medium text-ink dark:text-ink-dark">
        Slide {slideIndex + 1} / {totalSlides}
      </span>
      <button
        onClick={onNext}
        disabled={slideIndex === totalSlides - 1}
        aria-label="Next slide"
        className="grid h-8 w-8 place-items-center rounded-md text-ink-600 disabled:opacity-40 hover:bg-sunken dark:text-ink-dark dark:hover:bg-sunken-dark"
      >
        <ChevronRight size={20} aria-hidden="true" />
      </button>
      <button
        onClick={onExit}
        aria-label="Exit presentation"
        className="ml-1 flex items-center gap-1 rounded-md px-2 py-1 text-sm text-ink-600 hover:bg-sunken dark:text-ink-dark dark:hover:bg-sunken-dark"
      >
        <X size={16} aria-hidden="true" />
        <span className="hidden sm:inline">Exit</span>
      </button>
    </div>
  );
}
