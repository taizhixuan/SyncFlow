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
      className="absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-xl bg-paper px-4 py-2 shadow-lg ring-1 ring-line dark:bg-paper-dark dark:ring-line-dark"
    >
      <button
        onClick={onPrev}
        disabled={slideIndex === 0}
        aria-label="Previous slide"
        className="rounded-md px-2 py-1 text-lg disabled:opacity-40 hover:bg-sunken dark:hover:bg-sunken-dark"
      >
        ◀
      </button>
      <span className="min-w-[6rem] text-center text-sm font-medium text-ink dark:text-ink-dark">
        Slide {slideIndex + 1} / {totalSlides}
      </span>
      <button
        onClick={onNext}
        disabled={slideIndex === totalSlides - 1}
        aria-label="Next slide"
        className="rounded-md px-2 py-1 text-lg disabled:opacity-40 hover:bg-sunken dark:hover:bg-sunken-dark"
      >
        ▶
      </button>
      <button
        onClick={onExit}
        aria-label="Exit presentation"
        className="ml-2 rounded-md px-2 py-1 text-sm text-ink-600 hover:bg-sunken dark:text-ink-dark dark:hover:bg-sunken-dark"
      >
        ✕ Exit
      </button>
    </div>
  );
}
