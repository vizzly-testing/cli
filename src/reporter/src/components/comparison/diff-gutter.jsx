import { useEffect, useState } from 'react';
import { describeDiffBand } from '../../utils/diff-bands.js';

function bandStyle(band, imageHeight, minHeight) {
  return {
    top: `${(band.y1 / imageHeight) * 100}%`,
    height: `max(${((band.y2 - band.y1) / imageHeight) * 100}%, ${minHeight}px)`,
    background: 'var(--bd-danger)',
  };
}

export function DiffGutter({
  bands,
  imageHeight,
  scale,
  activeId,
  onHover,
  onSelect,
}) {
  if (!imageHeight || !bands.length) return null;
  let active = bands.find(band => band.id === activeId);
  return (
    <nav
      aria-label="Changes"
      className="absolute top-0 bottom-0 z-30"
      style={{ left: -14 / scale, width: 8 / scale }}
    >
      {bands.map(band => (
        <button
          aria-label={describeDiffBand(band)}
          aria-current={band.id === activeId ? 'true' : undefined}
          className="absolute left-0 w-full cursor-pointer rounded-sm hover:brightness-125"
          key={band.id}
          onBlur={() => onHover(null)}
          onFocus={() => onHover(band.id)}
          onMouseEnter={() => onHover(band.id)}
          onMouseLeave={() => onHover(null)}
          onClick={() => onSelect(band)}
          style={bandStyle(band, imageHeight, 3 / scale)}
          type="button"
        />
      ))}
      {active && (
        <div
          role="status"
          className="pointer-events-none absolute whitespace-nowrap rounded border border-[var(--bd-border)] bg-[var(--bd-bg)] font-mono text-[var(--bd-text-secondary)]"
          style={{
            left: 14 / scale,
            top: `${(active.y1 / imageHeight) * 100}%`,
            fontSize: 11 / scale,
            padding: `${3 / scale}px ${7 / scale}px`,
          }}
        >
          {describeDiffBand(active)}
        </div>
      )}
    </nav>
  );
}

// Read the viewport from the actual scrolling canvas; no timers or polling.
function useViewport(containerRef, imageRef) {
  let [viewport, setViewport] = useState(null);
  useEffect(() => {
    let container = containerRef.current;
    let image = imageRef.current;
    let update = () => {
      let containerRect = container.getBoundingClientRect();
      let imageRect = image.getBoundingClientRect();
      setViewport({
        scrollable: container.scrollHeight > container.clientHeight + 1,
        imageTop: imageRect.top - containerRect.top + container.scrollTop,
        imageHeight: imageRect.height,
        scrollTop: container.scrollTop,
        height: container.clientHeight,
        scrollbarWidth: container.offsetWidth - container.clientWidth,
      });
    };
    let observer = new ResizeObserver(update);
    observer.observe(container);
    observer.observe(image);
    container.addEventListener('scroll', update, { passive: true });
    update();
    return () => {
      observer.disconnect();
      container.removeEventListener('scroll', update);
    };
  }, [containerRef, imageRef]);
  return viewport;
}

export function DiffOverview({
  bands,
  imageHeight,
  containerRef,
  imageRef,
  activeId,
  onHover,
  onSelect,
}) {
  let viewport = useViewport(containerRef, imageRef);
  if (
    !viewport?.scrollable ||
    !viewport.imageHeight ||
    !imageHeight ||
    !bands.length
  )
    return null;
  let top = Math.max(
    0,
    (viewport.scrollTop - viewport.imageTop) / viewport.imageHeight
  );
  let bottom = Math.min(
    1,
    (viewport.scrollTop + viewport.height - viewport.imageTop) /
      viewport.imageHeight
  );
  return (
    <nav
      aria-label="Changes overview"
      className="absolute top-3 bottom-3 z-30 w-2.5 rounded bg-[var(--bd-raised)] ring-1 ring-[var(--bd-border)]"
      style={{ right: viewport.scrollbarWidth + 6 }}
    >
      {bottom > top && (
        <div
          className="pointer-events-none absolute -inset-x-1 rounded-sm border border-[var(--bd-text-tertiary)]"
          style={{ top: `${top * 100}%`, height: `${(bottom - top) * 100}%` }}
        />
      )}
      {bands.map(band => (
        <button
          aria-label={describeDiffBand(band)}
          aria-current={band.id === activeId ? 'true' : undefined}
          className="absolute inset-x-0.5 cursor-pointer rounded-sm hover:brightness-125"
          key={band.id}
          onClick={() => onSelect(band)}
          onMouseEnter={() => onHover(band.id)}
          onMouseLeave={() => onHover(null)}
          style={bandStyle(band, imageHeight, 3)}
          type="button"
        />
      ))}
    </nav>
  );
}
