import { useState, useRef, useEffect } from 'react';
import SmartImage from '../../ui/smart-image.jsx';

export default function OnionViewer({ comparison }) {
  let [position, setPosition] = useState(50);
  let [isDragging, setIsDragging] = useState(false);
  let containerRef = useRef(null);

  let updatePosition = clientX => {
    if (!containerRef.current) return;

    let rect = containerRef.current.getBoundingClientRect();
    let percentage = Math.max(
      0,
      Math.min(100, ((clientX - rect.left) / rect.width) * 100)
    );
    setPosition(percentage);
  };

  let handleMouseDown = e => {
    e.preventDefault();
    setIsDragging(true);
    updatePosition(e.clientX);
  };

  let handleMouseUp = () => {
    setIsDragging(false);
  };

  let handleTouchStart = e => {
    e.preventDefault();
    setIsDragging(true);
    updatePosition(e.touches[0].clientX);
  };

  let handleTouchMove = e => {
    if (isDragging) {
      e.preventDefault();
      updatePosition(e.touches[0].clientX);
    }
  };

  // Add global mouse event listeners when dragging
  useEffect(() => {
    if (isDragging) {
      let handleGlobalMouseMove = e => {
        updatePosition(e.clientX);
      };

      let handleGlobalMouseUp = () => {
        setIsDragging(false);
      };

      document.addEventListener('mousemove', handleGlobalMouseMove);
      document.addEventListener('mouseup', handleGlobalMouseUp);

      return () => {
        document.removeEventListener('mousemove', handleGlobalMouseMove);
        document.removeEventListener('mouseup', handleGlobalMouseUp);
      };
    }
  }, [isDragging]);

  return (
    <div
      ref={containerRef}
      className="onion-container"
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleMouseUp}
      style={{ cursor: isDragging ? 'ew-resize' : 'col-resize' }}
    >
      <SmartImage
        className="onion-baseline"
        src={comparison.baseline}
        alt="Baseline"
      />
      <SmartImage
        className="onion-current"
        src={comparison.current}
        alt="Current"
        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
      />
      <div className="onion-divider" style={{ left: `${position}%` }}></div>
    </div>
  );
}
