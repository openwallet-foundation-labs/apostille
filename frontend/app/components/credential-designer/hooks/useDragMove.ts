'use client';

import { useCallback, useRef, useEffect, useState } from 'react';

interface UseDragMoveProps {
  x: number;
  y: number;
  onMove: (x: number, y: number) => void;
  enabled?: boolean;
  zoom?: number;
  bounds?: { width: number; height: number };
  elementSize?: { width: number; height: number };
}

interface DragState {
  isDragging: boolean;
  currentX: number;
  currentY: number;
}

export function useDragMove({
  x,
  y,
  onMove,
  enabled = true,
  zoom = 1,
  bounds,
  elementSize,
}: UseDragMoveProps) {
  // Local drag state for smooth visual updates
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    currentX: x,
    currentY: y,
  });

  // Refs for tracking drag without causing re-renders
  const isDraggingRef = useRef(false);
  const startMousePos = useRef({ x: 0, y: 0 });
  const startNodePos = useRef({ x: 0, y: 0 });
  const rafRef = useRef<number | null>(null);
  const lastPosition = useRef({ x, y });

  // Update local state when props change (but not during drag)
  useEffect(() => {
    if (!isDraggingRef.current) {
      setDragState((prev) => ({
        ...prev,
        currentX: x,
        currentY: y,
      }));
      lastPosition.current = { x, y };
    }
  }, [x, y]);

  // Cleanup RAF on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!enabled) return;

      // Only start drag on left mouse button
      if (e.button !== 0) return;

      // Don't start drag if clicking on interactive elements
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'BUTTON' ||
        target.tagName === 'SELECT' ||
        target.tagName === 'TEXTAREA'
      ) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      isDraggingRef.current = true;
      startMousePos.current = { x: e.clientX, y: e.clientY };
      startNodePos.current = { x, y };

      setDragState({
        isDragging: true,
        currentX: x,
        currentY: y,
      });

      // Prevent text selection and set cursor globally
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'grabbing';
    },
    [x, y, enabled]
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;

      // Cancel any pending RAF
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }

      // Use RAF for smooth updates
      rafRef.current = requestAnimationFrame(() => {
        // Calculate delta accounting for zoom
        const deltaX = (e.clientX - startMousePos.current.x) / zoom;
        const deltaY = (e.clientY - startMousePos.current.y) / zoom;

        let newX = startNodePos.current.x + deltaX;
        let newY = startNodePos.current.y + deltaY;

        // Apply boundary constraints
        newX = Math.max(0, newX);
        newY = Math.max(0, newY);

        if (bounds) {
          const maxX = bounds.width - (elementSize?.width || 50);
          const maxY = bounds.height - (elementSize?.height || 20);
          newX = Math.min(newX, maxX);
          newY = Math.min(newY, maxY);
        }

        // Round to avoid subpixel rendering issues
        newX = Math.round(newX);
        newY = Math.round(newY);

        // Only update if position actually changed
        if (newX !== lastPosition.current.x || newY !== lastPosition.current.y) {
          lastPosition.current = { x: newX, y: newY };
          setDragState({
            isDragging: true,
            currentX: newX,
            currentY: newY,
          });
        }
      });
    };

    const handleMouseUp = () => {
      if (!isDraggingRef.current) return;

      // Cancel any pending RAF
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }

      isDraggingRef.current = false;

      // Commit the final position
      const finalX = lastPosition.current.x;
      const finalY = lastPosition.current.y;

      setDragState({
        isDragging: false,
        currentX: finalX,
        currentY: finalY,
      });

      // Only call onMove if position actually changed
      if (finalX !== startNodePos.current.x || finalY !== startNodePos.current.y) {
        onMove(finalX, finalY);
      }

      // Reset body styles
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };

    // Use capture phase for better responsiveness
    document.addEventListener('mousemove', handleMouseMove, { passive: true });
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [zoom, bounds, elementSize, onMove]);

  return {
    onMouseDown: handleMouseDown,
    isDragging: dragState.isDragging,
    // Use drag state position during drag, prop position otherwise
    displayX: dragState.isDragging ? dragState.currentX : x,
    displayY: dragState.isDragging ? dragState.currentY : y,
  };
}
