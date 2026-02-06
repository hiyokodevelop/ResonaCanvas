
import React, { useState, useRef, useEffect } from 'react';
import { ReferenceImage } from '../types';

interface ImageCardProps {
  item: ReferenceImage;
  isSelected: boolean;
  onUpdatePosition: (id: string, x: number, y: number) => void;
  onUpdateSize: (id: string, width: number, height: number) => void;
  onRemove: (id: string) => void;
  onSelect: (id: string, multi: boolean) => void;
  onBringToFront: (id: string) => void;
  zoom: number;
}

const ImageCard: React.FC<ImageCardProps> = ({ 
  item, 
  isSelected, 
  onUpdatePosition, 
  onUpdateSize, 
  onRemove, 
  onSelect, 
  onBringToFront, 
  zoom 
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0 });

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.resize-handle')) return;
    
    e.stopPropagation();
    onSelect(item.id, e.shiftKey || e.ctrlKey || e.metaKey);
    onBringToFront(item.id);
    
    setIsDragging(true);
    dragOffset.current = {
      x: e.clientX / zoom - item.x,
      y: e.clientY / zoom - item.y
    };
  };

  const handleResizeStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsResizing(true);
    onBringToFront(item.id);
    resizeStart.current = {
      x: e.clientX,
      y: e.clientY,
      w: item.width,
      h: item.height
    };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        onUpdatePosition(item.id, e.clientX / zoom - dragOffset.current.x, e.clientY / zoom - dragOffset.current.y);
      } else if (isResizing) {
        const dx = (e.clientX - resizeStart.current.x) / zoom;
        const newWidth = Math.max(80, resizeStart.current.w + dx);
        const aspectRatio = resizeStart.current.h / resizeStart.current.w;
        onUpdateSize(item.id, newWidth, newWidth * aspectRatio);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
    };

    if (isDragging || isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isResizing, item.id, zoom, onUpdatePosition, onUpdateSize]);

  return (
    <div 
      data-id={item.id}
      className={`absolute bg-slate-800/40 backdrop-blur-sm border rounded-lg overflow-hidden transition-all select-none image-card
        ${isSelected ? 'ring-2 ring-indigo-500 border-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.4)]' : 'border-slate-700'} 
        ${isDragging ? 'z-50 opacity-90 cursor-grabbing' : 'cursor-grab'}`}
      style={{ 
        left: item.x, 
        top: item.y,
        width: item.width,
        height: item.height,
        transition: (isDragging || isResizing) ? 'none' : 'all 0.15s ease-out'
      }}
      onMouseDown={handleMouseDown}
    >
      {/* Image Content */}
      <div className="w-full h-full pointer-events-none bg-slate-900 flex items-center justify-center">
        {item.isGenerating ? (
          <div className="flex flex-col items-center gap-2">
            <div className="h-6 w-6 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
            <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest">Generating...</span>
          </div>
        ) : (
          <img src={item.base64} alt="Ref" className="w-full h-full object-cover" />
        )}
      </div>

      {/* Resize Handle */}
      {isSelected && !item.isGenerating && (
        <div 
          onMouseDown={handleResizeStart}
          className="resize-handle absolute bottom-0 right-0 w-6 h-6 cursor-nwse-resize z-30 flex items-end justify-end p-1 hover:scale-125 transition-transform"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" className="text-indigo-400">
            <path d="M0 10 L10 0 M4 10 L10 4 M8 10 L10 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
      )}

      {/* Close button - hidden during generation */}
      {!item.isGenerating && (
        <button 
          onClick={(e) => { e.stopPropagation(); onRemove(item.id); }}
          className="absolute top-2 right-2 z-20 p-1 bg-red-500/80 hover:bg-red-600 text-white rounded-full opacity-0 hover:opacity-100 transition-opacity"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      )}
    </div>
  );
};

export default ImageCard;
