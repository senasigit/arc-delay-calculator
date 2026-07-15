import { useEffect, useRef, useState } from 'react';
import type { SubwooferSettings, BoxGroup } from '../types';
import { calculate2DSpatialHeatmap, splToColor } from '../utils';

interface VisualizerProps {
  settings: SubwooferSettings;
  groups: BoxGroup[];
}

export function Visualizer({ settings, groups }: VisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  
  const [hoveredGroup, setHoveredGroup] = useState<BoxGroup | null>(null);

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
    
    const dpr = window.devicePixelRatio || 1;

    const resizeCanvas = () => {
      const rect = container.getBoundingClientRect();
      
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      
      draw(rect.width, rect.height, dpr);
    };

    const draw = (logicalWidth: number, logicalHeight: number, ratio: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      ctx.save();
      ctx.scale(ratio, ratio);

      const physicalDimensionX = settings.orientation === 'Landscape' ? settings.width : settings.depth;
      const physicalDimensionY = settings.orientation === 'Landscape' ? settings.depth : settings.width;
      
      const arrayLength = (settings.count - 1) * (physicalDimensionX + settings.gap) + physicalDimensionX + (settings.count % 2 === 0 ? settings.centralGap - settings.gap : 0);
      const maxPlotRadius = Math.max(arrayLength * 1.2, 10); 
      
      const padding = 20; 
      const baseScaleX = (logicalWidth - padding * 2) / Math.max(arrayLength, 1);
      const baseScaleY = (logicalHeight - padding * 2) / maxPlotRadius;
      
      const scale = Math.min(baseScaleX, baseScaleY, 150) * zoomScale; 
      
      const cx = logicalWidth / 2;
      const cy = logicalHeight / 2; 

      if (groups.length > 0 && settings.showHeatmap) {
        const mapData = calculate2DSpatialHeatmap(
          settings, 
          groups, 
          logicalWidth, 
          logicalHeight, 
          cx, 
          cy, 
          scale,
          offset.x,
          offset.y
        );
        
        for (let r = 0; r < mapData.rows; r++) {
          for (let c = 0; c < mapData.cols; c++) {
            const spl = mapData.heatmap[r * mapData.cols + c];
            const colorStr = splToColor(spl, mapData.maxSpl, 35);
            ctx.fillStyle = colorStr;
            ctx.fillRect(c * mapData.blockSize, r * mapData.blockSize, mapData.blockSize + 0.5, mapData.blockSize + 0.5);
          }
        }
      }

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 1;
      const gridSize = 1 * scale; 
      
      const startX = (cx + offset.x) % gridSize;
      const startY = (cy + offset.y) % gridSize;

      ctx.beginPath();
      for (let x = startX; x < logicalWidth; x += gridSize) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, logicalHeight);
      }
      for (let y = startY; y < logicalHeight; y += gridSize) {
        ctx.moveTo(0, y);
        ctx.lineTo(logicalWidth, y);
      }
      ctx.stroke();

      const originX = cx + offset.x;
      const originY = cy + offset.y;
      
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.beginPath();
      ctx.moveTo(originX, 0);
      ctx.lineTo(originX, logicalHeight);
      ctx.moveTo(0, originY);
      ctx.lineTo(logicalWidth, originY);
      ctx.stroke();
      
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.font = '10px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      
      for (let x = originX % gridSize; x < logicalWidth; x += gridSize) {
         if (Math.abs(x - originX) < 1) continue; 
         const meterX = (x - originX) / scale;
         ctx.fillText(`${meterX.toFixed(0)}m`, x, originY + 5);
         
         ctx.beginPath();
         ctx.moveTo(x, originY - 3);
         ctx.lineTo(x, originY + 3);
         ctx.stroke();
      }
      
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (let y = originY % gridSize; y < logicalHeight; y += gridSize) {
         if (Math.abs(y - originY) < 1) continue; 
         const meterY = (y - originY) / scale;
         ctx.fillText(`${meterY.toFixed(0)}m`, originX - 5, y);
         
         ctx.beginPath();
         ctx.moveTo(originX - 3, y);
         ctx.lineTo(originX + 3, y);
         ctx.stroke();
      }

      ctx.save();
      ctx.translate(originX, originY);
      
      const boxW = physicalDimensionX * scale;
      const boxH = physicalDimensionY * scale;
      
      groups.forEach(group => {
        const px = group.x * scale;
        const py = 0; // Tampilan 2D selalu ditumpuk di koordinat fisik Y (0)
        
        const isHovered = hoveredGroup?.positionId === group.positionId;
        const isMuted = group.muted;
        
        ctx.fillStyle = isMuted ? '#1f2937' : (isHovered ? '#60a5fa' : '#374151'); 
        ctx.strokeStyle = isMuted ? '#111827' : (isHovered ? '#ffffff' : '#111827'); 
        ctx.lineWidth = 2;
        
        const renderX = px - boxW / 2;
        const renderY = py - boxH / 2;
        
        ctx.fillRect(renderX, renderY, boxW, boxH);
        ctx.strokeRect(renderX, renderY, boxW, boxH);
        
        ctx.fillStyle = isMuted ? '#4b5563' : '#ef4444'; // Red dot untuk indikasi center depan (tampak atas)
        ctx.beginPath();
        ctx.arc(px, renderY + boxH * 0.2, 3, 0, Math.PI * 2);
        ctx.fill();

        if (settings.stack > 0) {
           ctx.fillStyle = isMuted ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.9)';
           ctx.font = 'bold 11px Inter, sans-serif';
           ctx.textAlign = 'center';
           ctx.textBaseline = 'middle';
           
           const frontCount = group.boxes.filter(b => !b.isRear).length;
           const rearCount = group.boxes.filter(b => b.isRear).length;
           
           if (settings.cardioid && rearCount > 0) {
               ctx.fillText(`\u2191 ${frontCount}`, px, py - 5);
               ctx.fillStyle = isMuted ? 'rgba(167, 139, 250, 0.3)' : '#a78bfa'; // Purple for rear
               ctx.fillText(`\u2193 ${rearCount}`, px, py + 10);
           } else {
               ctx.fillText(`x${settings.stack}`, px, py);
           }
        }
        
        if (isMuted) {
           ctx.strokeStyle = '#ef4444';
           ctx.lineWidth = 2;
           ctx.beginPath();
           ctx.moveTo(renderX, renderY);
           ctx.lineTo(renderX + boxW, renderY + boxH);
           ctx.moveTo(renderX + boxW, renderY);
           ctx.lineTo(renderX, renderY + boxH);
           ctx.stroke();
        }
      });
      ctx.restore();
      
      // Indikator Info Overlay
      ctx.fillStyle = 'rgba(15, 17, 21, 0.8)';
      ctx.fillRect(10, 10, 240, 75);
      ctx.strokeStyle = '#2a2e37';
      ctx.strokeRect(10, 10, 240, 75);
      
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = 'white'; 
      ctx.font = 'bold 12px Inter, sans-serif';
      ctx.fillText(`Zoom: ${(zoomScale * 100).toFixed(0)}%`, 20, 30);
      ctx.fillStyle = '#9ca3af';
      ctx.font = '11px Inter, sans-serif';
      ctx.fillText(`Area: ${((logicalWidth / scale)).toFixed(1)}m x ${((logicalHeight / scale)).toFixed(1)}m`, 110, 30);
      
      ctx.fillStyle = settings.showHeatmap ? '#fca5a5' : '#9ca3af'; 
      ctx.fillText(settings.showHeatmap ? `${settings.bandwidth} Map @ ${settings.frequency}Hz` : 'Heatmap Dimatikan', 20, 50);
      ctx.fillStyle = '#9ca3af';
      ctx.fillText('Depan (Audience) \u2191 | \u2193 Belakang', 20, 70);

      ctx.restore();
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, [settings, groups, hoveredGroup, zoomScale, offset]);

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomSensitivity = 0.001;
    let newScale = zoomScale - e.deltaY * zoomSensitivity;
    if (newScale < 0.2) newScale = 0.2;
    if (newScale > 10) newScale = 10;
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
    
    if (isDragging) {
      const dx = e.clientX - lastMousePos.x;
      const dy = e.clientY - lastMousePos.y;
      setOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      setLastMousePos({ x: e.clientX, y: e.clientY });
      return;
    }

    const rect = canvas.getBoundingClientRect();
    
    if (tooltipRef.current) {
      tooltipRef.current.style.left = `${e.clientX + 15}px`;
      tooltipRef.current.style.top = `${e.clientY + 15}px`;
    }
    
    const { width: logicalWidth, height: logicalHeight } = rect;
    const cx = logicalWidth / 2;
    const cy = logicalHeight / 2;
    
    const physicalDimensionX = settings.orientation === 'Landscape' ? settings.width : settings.depth;
    const physicalDimensionY = settings.orientation === 'Landscape' ? settings.depth : settings.width;
    const arrayLength = (settings.count - 1) * (physicalDimensionX + settings.gap) + physicalDimensionX + (settings.count % 2 === 0 ? settings.centralGap - settings.gap : 0);
    const maxPlotRadius = Math.max(arrayLength * 1.2, 10);
    const baseScale = Math.min((logicalWidth - 40) / Math.max(arrayLength, 1), (logicalHeight - 40) / maxPlotRadius, 150);
    const scale = baseScale * zoomScale;
    
    const boxW = physicalDimensionX * scale;
    const boxH = physicalDimensionY * scale;
    
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const hovered = groups.find(group => {
       const px = cx + offset.x + group.x * scale;
       const py = cy + offset.y + 0;
       
       const left = px - boxW / 2;
       const right = px + boxW / 2;
       const top = py - boxH / 2;
       const bottom = py + boxH / 2;
       
       return mouseX >= left && mouseX <= right && mouseY >= top && mouseY <= bottom;
    });
    
    setHoveredGroup(hovered || null);
  };

  return (
    <div ref={containerRef} className="flex-1 relative bg-[#0a0c10] print:bg-white w-full h-full overflow-hidden">
      <canvas 
        ref={canvasRef} 
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className="block cursor-grab active:cursor-grabbing"
      />
      
      <div 
        ref={tooltipRef}
        className={`fixed pointer-events-none bg-dark-panel border border-dark-border text-white text-sm rounded px-3 py-2 shadow-lg z-20 transition-opacity duration-150 print:hidden ${hoveredGroup && !isDragging ? 'opacity-100' : 'opacity-0'}`}
      >
        {hoveredGroup && (
          <>
            <p className="font-bold border-b border-dark-border pb-1 mb-1">{hoveredGroup.label}</p>
            {hoveredGroup.muted && <p className="text-red-400 font-bold text-xs mb-1">MUTED</p>}
            <p className="text-gray-300 text-xs mb-1">X: {hoveredGroup.x > 0 ? '+' : ''}{hoveredGroup.x.toFixed(2)} m</p>
            
            <div className="mt-2 border-t border-gray-700 pt-1">
              {[...hoveredGroup.boxes].reverse().map(box => (
                <div key={box.stackIndex} className="flex justify-between space-x-3 text-xs mb-1">
                   <span className="text-gray-400">Box {box.stackIndex + 1}</span>
                   {box.isRear ? (
                      <span className="text-purple-400 font-bold">{box.delayMs.toFixed(2)}ms (Rear)</span>
                   ) : (
                      <span className="text-accent font-bold">{box.delayMs.toFixed(2)}ms</span>
                   )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
