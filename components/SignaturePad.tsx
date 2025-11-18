
import React, { useRef, useState, useEffect } from 'react';
import { Button } from './ui/Button.tsx';
import { TrashIcon, PenIcon } from './Icons.tsx';

interface SignaturePadProps {
  onSave: (dataUrl: string) => void;
  onClear?: () => void;
  initialDataUrl?: string;
}

const SignaturePad: React.FC<SignaturePadProps> = ({ onSave, onClear, initialDataUrl }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isEmpty, setIsEmpty] = useState(!initialDataUrl);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const resizeCanvas = () => {
       const parent = canvas.parentElement;
       if(parent) {
           canvas.width = parent.clientWidth;
           canvas.height = 200; // Fixed height
           
           // Restore image if exists
           if (initialDataUrl) {
             const img = new Image();
             img.src = initialDataUrl;
             img.onload = () => {
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                setIsEmpty(false);
             };
           } else {
              ctx.lineWidth = 2;
              ctx.lineCap = 'round';
              ctx.strokeStyle = '#000';
           }
       }
    };
    
    resizeCanvas();
    // Recalculate on resize if needed, but simple for now
  }, []); // Run once

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    setIsDrawing(true);
    const { offsetX, offsetY } = getCoordinates(e, canvas);
    ctx.beginPath();
    ctx.moveTo(offsetX, offsetY);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#000';
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    e.preventDefault(); // Prevent scrolling on touch
    const { offsetX, offsetY } = getCoordinates(e, canvas);
    ctx.lineTo(offsetX, offsetY);
    ctx.stroke();
    setIsEmpty(false);
  };

  const stopDrawing = () => {
    if (isDrawing) {
        setIsDrawing(false);
        const canvas = canvasRef.current;
        if (canvas) {
            onSave(canvas.toDataURL());
        }
    }
  };

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }
    
    const rect = canvas.getBoundingClientRect();
    return {
      offsetX: clientX - rect.left,
      offsetY: clientY - rect.top
    };
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setIsEmpty(true);
    onSave(''); // Save empty string
    if(onClear) onClear();
  };

  return (
    <div className="border border-border rounded-md bg-white overflow-hidden">
        <div className="bg-muted p-2 flex justify-between items-center border-b border-border">
            <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1"><PenIcon className="w-3 h-3"/> Sign Here</span>
            <Button variant="ghost" size="sm" onClick={handleClear} className="h-6 text-xs text-destructive hover:bg-destructive/10"><TrashIcon className="w-3 h-3 mr-1"/> Clear</Button>
        </div>
        <div className="w-full h-[200px] relative bg-white cursor-crosshair touch-none">
             <canvas
                ref={canvasRef}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
                className="block w-full h-full"
             />
             {isEmpty && (
                 <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-muted-foreground/20 text-4xl font-serif italic">
                     Signature
                 </div>
             )}
        </div>
    </div>
  );
};

export default SignaturePad;
