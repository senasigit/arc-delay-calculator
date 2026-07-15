import { useEffect, useRef, useState } from 'react';
import type { SubwooferSettings, BoxCalculation } from '../types';
import { calculate2DSpatialHeatmap, splToColor } from '../utils';

interface VisualizerProps {
  settings: SubwooferSettings;
  calculations: BoxCalculation[];
}

export function Visualizer({ settings, calculations }: VisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredBox, setHoveredBox] = useState<BoxCalculation | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Panning and Zooming State
  const [zoomScale, setZoomScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resizeCanvas = () => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      draw();
    };

    const draw = () => {
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);

      const physicalDimensionX = settings.orientation === 'Landscape' ? settings.width : settings.depth;
      const physicalDimensionY = settings.orientation === 'Landscape' ? settings.depth : settings.width;
      
      const arrayLength = (settings.count - 1) * (physicalDimensionX + settings.gap) + physicalDimensionX + (settings.count % 2 === 0 ? settings.centralGap - settings.gap : 0);
      
      const maxPlotRadius = Math.max(arrayLength * 1.2, 10); 
      
      const padding = 20; 
      const baseScaleX = (width - padding * 2) / Math.max(arrayLength, 1);
      const baseScaleY = (height - padding * 2) / maxPlotRadius;
      
      // The final scale is the base scale multiplied by the user's zoom level
      const scale = Math.min(baseScaleX, baseScaleY, 150) * zoomScale; 
      
      const cx = width / 2;
      const cy = height / 2; 

      // 1. Gambar Heatmap 2D 360 derajat
      if (calculations.length > 0) {
        const mapData = calculate2DSpatialHeatmap(
          settings, 
          calculations, 
          width, 
          height, 
          cx, 
          cy, 
          scale,
          offset.x,
          offset.y
        );
        
        for (let r = 0; r < mapData.rows; r++) {
          for (let c = 0; c < mapData.cols; c++) {
            const spl = mapData.heatmap[r * mapData.cols + c];
            const color = splToColor(spl, mapData.maxSpl, 35); 
            
            ctx.fillStyle = color;
            ctx.fillRect(c * mapData.blockSize, r * mapData.blockSize, mapData.blockSize, mapData.blockSize);
          }
        }
      }

      // 2. Gambar Grid (Skala 1 meter)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.10)';
      ctx.lineWidth = 1;
      const gridSize = 1 * scale; 
      
      const startX = (cx + offset.x) % gridSize;
      const startY = (cy + offset.y) % gridSize;

      ctx.beginPath();
      for (let x = startX; x < width; x += gridSize) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      }
      for (let y = startY; y < height; y += gridSize) {
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
      ctx.stroke();

      // Titik tengah origin (0,0) meter
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.beginPath();
      ctx.moveTo(cx + offset.x, 0);
      ctx.lineTo(cx + offset.x, height);
      ctx.moveTo(0, cy + offset.y);
      ctx.lineTo(width, cy + offset.y);
      ctx.stroke();

      // 3. Gambar Fisik Subwoofer
      ctx.save();
      ctx.translate(cx + offset.x, cy + offset.y);
      
      const boxW = physicalDimensionX * scale;
      const boxH = physicalDimensionY * scale;
      
      calculations.forEach((box) => {
        const px = box.x * scale;
        const py = 0; 
        
        const isHovered = hoveredBox?.index === box.index;
        
        ctx.fillStyle = isHovered ? '#60a5fa' : '#1f2937'; 
        ctx.strokeStyle = isHovered ? '#ffffff' : '#111827'; 
        ctx.lineWidth = 2;
        
        const renderX = px - boxW / 2;
        const renderY = py - boxH / 2;
        
        ctx.fillRect(renderX, renderY, boxW, boxH);
        ctx.strokeRect(renderX, renderY, boxW, boxH);
        
        ctx.fillStyle = '#ef4444'; 
        ctx.beginPath();
        ctx.arc(px, py, 3, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();
      
      // Indikator Skala & Info Frekuensi
      ctx.fillStyle = 'white'; 
      ctx.font = '12px Inter, sans-serif';
      ctx.fillText(`Skala Grid: 1m | Zoom: ${(zoomScale * 100).toFixed(0)}%`, 15, 25);
      ctx.fillStyle = '#fca5a5'; 
      ctx.fillText(`Heatmap: ${settings.bandwidth} @ ${settings.frequency}Hz (${settings.resolution})`, 15, 45);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.fillText('Atas = Depan (Audience), Bawah = Belakang (Stage)', 15, 65);
    };

    draw();

    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, [settings, calculations, hoveredBox, zoomScale, offset]);

  // Handle Mouse Events for Pan and Zoom
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomSensitivity = 0.001;
    let newScale = zoomScale - e.deltaY * zoomSensitivity;
    if (newScale < 0.2) newScale = 0.2;
    if (newScale > 5) newScale = 5;
    setZoomScale(newScale);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDragging(true);
    setLastMousePos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    // Handle Panning
    if (isDragging) {
      const dx = e.clientX - lastMousePos.x;
      const dy = e.clientY - lastMousePos.y;
      setOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      setLastMousePos({ x: e.clientX, y: e.clientY });
      return;
    }

    // Handle Hover detection
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    setMousePos({ x: e.clientX, y: e.clientY });
    
    const { width, height } = canvas;
    const cx = width / 2;
    const cy = height / 2;
    
    const physicalDimensionX = settings.orientation === 'Landscape' ? settings.width : settings.depth;
    const physicalDimensionY = settings.orientation === 'Landscape' ? settings.depth : settings.width;
    const arrayLength = (settings.count - 1) * (physicalDimensionX + settings.gap) + physicalDimensionX + (settings.count % 2 === 0 ? settings.centralGap - settings.gap : 0);
    const maxPlotRadius = Math.max(arrayLength * 1.2, 10);
    const baseScale = Math.min((width - 40) / Math.max(arrayLength, 1), (height - 40) / maxPlotRadius, 150);
    const scale = baseScale * zoomScale;
    
    const boxW = physicalDimensionX * scale;
    const boxH = physicalDimensionY * scale;
    
    const hovered = calculations.find(box => {
       const px = cx + offset.x + box.x * scale;
       const py = cy + offset.y; 
       
       const left = px - boxW / 2;
       const right = px + boxW / 2;
       const top = py - boxH / 2;
       const bottom = py + boxH / 2;
       
       return mouseX >= left && mouseX <= right && mouseY >= top && mouseY <= bottom;
    });
    
    setHoveredBox(hovered || null);
  };

  return (
    <div ref={containerRef} className="flex-1 relative bg-[#0a0c10] w-full h-full overflow-hidden">
      <canvas 
        ref={canvasRef} 
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className="block w-full h-full cursor-grab active:cursor-grabbing"
      />
      
      {/* Tooltip */}
      {hoveredBox && !isDragging && (
        <div 
          className="absolute pointer-events-none bg-dark-panel border border-dark-border text-white text-sm rounded px-3 py-2 shadow-lg z-20"
          style={{ 
            left: mousePos.x + 15, 
            top: mousePos.y + 15,
          }}
        >
          <p className="font-bold border-b border-dark-border pb-1 mb-1">{hoveredBox.label}</p>
          <p className="text-gray-300">Posisi X: <span className="text-white">{hoveredBox.x > 0 ? '+' : ''}{hoveredBox.x.toFixed(2)} m</span></p>
          <p className="text-accent font-bold mt-1 text-base">{hoveredBox.delayMs.toFixed(2)} ms</p>
          {settings.cardioid && (
            <p className="text-green-400 font-bold mt-1 text-xs">Total Cardioid: {hoveredBox.totalCardioidDelayMs.toFixed(2)} ms</p>
          )}
        </div>
      )}
    </div>
  );
}
