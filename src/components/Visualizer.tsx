import { useEffect, useRef, useState } from 'react';
import type { SubwooferSettings, BoxGroup, VenueArea } from '../types';
import { calculate2DSpatialHeatmap, splToColor } from '../utils';

interface VisualizerProps {
  settings: SubwooferSettings;
  groups: BoxGroup[];
  areas?: VenueArea[];
  activeAreaId?: string | null;
  onSelectArea?: (id: string | null) => void;
  onUpdateArea?: (id: string, updates: Partial<VenueArea>) => void;
}

export function Visualizer({ settings, groups, areas, activeAreaId, onSelectArea, onUpdateArea }: VisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  
  const [hoveredGroup, setHoveredGroup] = useState<BoxGroup | null>(null);
  
  // Touch state
  const [lastTouchDistance, setLastTouchDistance] = useState<number | null>(null);

  const [zoomScale, setZoomScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [draggingAreaId, setDraggingAreaId] = useState<string | null>(null);
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });
  const scaleRef = useRef<number>(1);
  
  // Offscreen canvas for debounced heatmap
  const heatmapCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [heatmapVersion, setHeatmapVersion] = useState(0);

  if (!heatmapCanvasRef.current) {
     heatmapCanvasRef.current = document.createElement('canvas');
  }

  // Debounced Heatmap Calculation
  useEffect(() => {
    if (!settings.showHeatmap || groups.length === 0) return;
    
    const timeout = setTimeout(() => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      
      const logicalWidth = rect.width;
      const logicalHeight = rect.height;
      const physicalDimensionX = settings.orientation === 'Landscape' ? Number(settings.width) : Number(settings.depth);
      const arrayLength = (Number(settings.count) - 1) * (physicalDimensionX + Number(settings.gap)) + physicalDimensionX + (Number(settings.count) % 2 === 0 ? Number(settings.centralGap) - Number(settings.gap) : 0);
      const maxPlotRadius = Math.max(arrayLength * 1.2, 10); 
      const padding = 20; 
      const baseScaleX = (logicalWidth - padding * 2) / Math.max(arrayLength, 1);
      const baseScaleY = (logicalHeight - padding * 2) / maxPlotRadius;
      const scale = Math.min(baseScaleX, baseScaleY, 150) * zoomScale; 
      const cx = logicalWidth / 2;
      const cy = logicalHeight / 2; 

      const data = calculate2DSpatialHeatmap(
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
      
      const hCanvas = heatmapCanvasRef.current;
      if (hCanvas) {
         const dpr = window.devicePixelRatio || 1;
         hCanvas.width = logicalWidth * dpr;
         hCanvas.height = logicalHeight * dpr;
         const hCtx = hCanvas.getContext('2d');
         if (hCtx) {
            hCtx.scale(dpr, dpr);
            hCtx.clearRect(0, 0, logicalWidth, logicalHeight);
            for (let r = 0; r < data.rows; r++) {
              for (let c = 0; c < data.cols; c++) {
                const spl = data.heatmap[r * data.cols + c];
                const colorStr = splToColor(spl, data.maxSpl, 35);
                hCtx.fillStyle = colorStr;
                hCtx.fillRect(c * data.blockSize, r * data.blockSize, data.blockSize + 0.5, data.blockSize + 0.5);
              }
            }
         }
      }
      setHeatmapVersion(v => v + 1);
    }, 150);

    return () => clearTimeout(timeout);
  }, [settings, groups, offset, zoomScale]);

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

      const physicalDimensionX = settings.orientation === 'Landscape' ? Number(settings.width) : Number(settings.depth);
      const physicalDimensionY = settings.orientation === 'Landscape' ? Number(settings.depth) : Number(settings.width);
      
      const arrayLength = (Number(settings.count) - 1) * (physicalDimensionX + Number(settings.gap)) + physicalDimensionX + (Number(settings.count) % 2 === 0 ? Number(settings.centralGap) - Number(settings.gap) : 0);
      const maxPlotRadius = Math.max(arrayLength * 1.2, 10); 
      
      const padding = 20; 
      const baseScaleX = (logicalWidth - padding * 2) / Math.max(arrayLength, 1);
      const baseScaleY = (logicalHeight - padding * 2) / maxPlotRadius;
      
      const scale = Math.min(baseScaleX, baseScaleY, 150) * zoomScale; 
      scaleRef.current = scale;
      
      const cx = logicalWidth / 2;
      const cy = logicalHeight / 2; 

      // Draw the debounced heatmap
      if (groups.length > 0 && settings.showHeatmap && heatmapCanvasRef.current) {
        ctx.save();
        // If there are areas, clip the heatmap to only show inside them
        if (areas && areas.length > 0) {
          ctx.beginPath();
          areas.forEach(area => {
            const originX = cx + offset.x;
            const originY = cy + offset.y;
            const ax = originX + area.x * scale;
            const ay = originY + -area.y * scale; // Note: Y axis is inverted logically in our coordinate system!
            
            ctx.save();
            ctx.translate(ax, ay);
            ctx.rotate((area.rotation * Math.PI) / 180);
            
            if (area.shape === 'Rectangle') {
              const w = area.width * scale;
              const h = area.height * scale;
              ctx.rect(-w/2, -h/2, w, h);
            } else if (area.shape === 'Circle') {
              const r = area.radius * scale;
              ctx.moveTo(r, 0); 
              ctx.arc(0, 0, r, 0, Math.PI * 2);
            } else if (area.shape === 'Triangle') {
              const w = area.width * scale;
              const h = area.height * scale;
              ctx.moveTo(0, -h/2);
              ctx.lineTo(w/2, h/2);
              ctx.lineTo(-w/2, h/2);
              ctx.closePath();
            } else if (area.shape === 'Trapezoid') {
              const tw = (area.topWidth || area.width) * scale;
              const bw = (area.bottomWidth || area.width) * scale;
              const h = area.height * scale;
              ctx.moveTo(-tw/2, -h/2);
              ctx.lineTo(tw/2, -h/2);
              ctx.lineTo(bw/2, h/2);
              ctx.lineTo(-bw/2, h/2);
              ctx.closePath();
            }
            ctx.restore();
          });
          ctx.clip();
        }
        
        ctx.drawImage(heatmapCanvasRef.current, 0, 0, logicalWidth, logicalHeight);
        ctx.restore();
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
      
      ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
      ctx.shadowBlur = 4;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
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

      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;

      // Draw Venue Areas
      if (areas && areas.length > 0) {
        ctx.save();
        ctx.translate(originX, originY);
        
        areas.forEach(area => {
           ctx.save();
           const ax = area.x * scale;
           const ay = -area.y * scale;
           ctx.translate(ax, ay);
           ctx.rotate(area.rotation * Math.PI / 180);
           
           ctx.beginPath();
           if (area.shape === 'Rectangle') {
              const aw = (area.width || 0) * scale;
              const ah = (area.height || 0) * scale;
              ctx.rect(-aw/2, -ah/2, aw, ah);
           } else if (area.shape === 'Circle') {
              ctx.arc(0, 0, (area.radius || 0) * scale, 0, 2 * Math.PI);
           } else if (area.shape === 'Triangle') {
              const aw = (area.width || 0) * scale;
              const ah = (area.height || 0) * scale;
              ctx.moveTo(0, -ah/2);
              ctx.lineTo(aw/2, ah/2);
              ctx.lineTo(-aw/2, ah/2);
              ctx.closePath();
           } else if (area.shape === 'Trapezoid') {
              const tw = (area.topWidth || area.width || 0) * scale;
              const bw = (area.bottomWidth || area.width || 0) * scale;
              const ah = (area.height || 0) * scale;
              ctx.moveTo(-tw/2, -ah/2);
              ctx.lineTo(tw/2, -ah/2);
              ctx.lineTo(bw/2, ah/2);
              ctx.lineTo(-bw/2, ah/2);
              ctx.closePath();
           }
           
           const isActive = area.id === activeAreaId;
           ctx.fillStyle = area.color + '40';
           ctx.fill();
           ctx.lineWidth = isActive ? 3 : 2;
           ctx.strokeStyle = isActive ? '#ffffff' : area.color;
           if (isActive) ctx.setLineDash([5, 5]);
           ctx.stroke();
           ctx.restore();
           
           ctx.fillStyle = '#ffffff';
           ctx.font = 'bold 10px Inter, sans-serif';
           ctx.textAlign = 'center';
           ctx.textBaseline = 'middle';
           ctx.fillText(area.name, ax, ay);
        });
        
        ctx.restore();
      }

      ctx.save();
      ctx.translate(originX, originY);
      
      const rectW = physicalDimensionX * scale;
      const rectH = physicalDimensionY * scale;
      
      groups.forEach(group => {
        const isHovered = hoveredGroup?.positionId === group.positionId;
        const isMuted = group.muted;
        
        ctx.fillStyle = isMuted ? '#1f2937' : (isHovered ? '#60a5fa' : '#374151'); 
        ctx.strokeStyle = isMuted ? '#111827' : (isHovered ? '#ffffff' : '#111827'); 
        ctx.lineWidth = 2;
        
        // Draw each physical box in the group (handles rows, stacks will draw over each other which is fine for 2D)
        const isRowBased = Number(settings.rows) > 1;
        group.boxes.forEach(box => {
            // Revert the acoustic center shift to draw the physical footprint for stacked reversed boxes
            const physicalY = box.y - (!isRowBased && box.isRear ? physicalDimensionY : 0);
            
            const px = box.x * scale;
            const py = physicalY * scale;
            const renderX = px - rectW / 2;
            const renderY = py - rectH / 2;
            
            ctx.fillRect(renderX, renderY, rectW, rectH);
            ctx.strokeRect(renderX, renderY, rectW, rectH);
            
            if (isMuted) {
               ctx.strokeStyle = '#ef4444';
               ctx.lineWidth = 2;
               ctx.beginPath();
               ctx.moveTo(renderX, renderY);
               ctx.lineTo(renderX + rectW, renderY + rectH);
               ctx.moveTo(renderX + rectW, renderY);
               ctx.lineTo(renderX, renderY + rectH);
               ctx.stroke();
            }
        });
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

    const observer = new ResizeObserver(() => {
      resizeCanvas();
    });
    
    observer.observe(container);
    return () => observer.disconnect();
  }, [settings, groups, hoveredGroup, zoomScale, offset, heatmapVersion, areas, activeAreaId]);

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomSensitivity = 0.001;
    let newScale = zoomScale - e.deltaY * zoomSensitivity;
    if (newScale < 0.2) newScale = 0.2;
    if (newScale > 10) newScale = 10;
    setZoomScale(newScale);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    if (areas && areas.length > 0 && onSelectArea) {
       const cx = rect.width / 2;
       const cy = rect.height / 2;
       const originX = cx + offset.x;
       const originY = cy + offset.y;
       const scale = scaleRef.current;
       
       let hitId: string | null = null;
       for (let i = areas.length - 1; i >= 0; i--) {
          const area = areas[i];
          const ax = originX + area.x * scale;
          const ay = originY - area.y * scale;
          const width = (area.shape === 'Circle' ? area.radius * 2 : Math.max(area.width || 0, area.topWidth || 0, area.bottomWidth || 0)) * scale;
          const height = (area.shape === 'Circle' ? area.radius * 2 : area.height || 0) * scale;
          
          if (mouseX >= ax - width/2 && mouseX <= ax + width/2 && mouseY >= ay - height/2 && mouseY <= ay + height/2) {
             hitId = area.id;
             break;
          }
       }
       
       if (hitId) {
          onSelectArea(hitId);
          setDraggingAreaId(hitId);
          setIsDragging(false);
          setLastMousePos({ x: e.clientX, y: e.clientY });
          return;
       } else {
          onSelectArea(null);
       }
    }

    setIsDragging(true);
    setLastMousePos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setDraggingAreaId(null);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    if (draggingAreaId && onUpdateArea) {
       const dx = e.clientX - lastMousePos.x;
       const dy = e.clientY - lastMousePos.y;
       const scale = scaleRef.current;
       
       const area = areas?.find(a => a.id === draggingAreaId);
       if (area) {
         onUpdateArea(area.id, {
           x: area.x + dx / scale,
           y: area.y - dy / scale
         });
       }
       setLastMousePos({ x: e.clientX, y: e.clientY });
       return;
    }

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
    
    const physicalDimensionX = settings.orientation === 'Landscape' ? Number(settings.width) : Number(settings.depth);
    const physicalDimensionY = settings.orientation === 'Landscape' ? Number(settings.depth) : Number(settings.width);
    const arrayLength = (Number(settings.count) - 1) * (physicalDimensionX + Number(settings.gap)) + physicalDimensionX + (Number(settings.count) % 2 === 0 ? Number(settings.centralGap) - Number(settings.gap) : 0);
    const maxPlotRadius = Math.max(arrayLength * 1.2, 10);
    const baseScale = Math.min((logicalWidth - 40) / Math.max(arrayLength, 1), (logicalHeight - 40) / maxPlotRadius, 150);
    const scale = baseScale * zoomScale;
    
    const boxW = physicalDimensionX * scale;
    const boxH = physicalDimensionY * scale;
    
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const hovered = groups.find(group => {
       const px = cx + offset.x + group.x * scale;
       const py = cy + offset.y + group.y * scale;
       
       const left = px - boxW / 2;
       const right = px + boxW / 2;
       const top = py - boxH / 2;
       const bottom = py + boxH / 2;
       
       return mouseX >= left && mouseX <= right && mouseY >= top && mouseY <= bottom;
    });
    
    setHoveredGroup(hovered || null);
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 1) {
      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const touchX = e.touches[0].clientX - rect.left;
        const touchY = e.touches[0].clientY - rect.top;
        
        if (areas && areas.length > 0 && onSelectArea) {
           const cx = rect.width / 2;
           const cy = rect.height / 2;
           const originX = cx + offset.x;
           const originY = cy + offset.y;
           const scale = scaleRef.current;
           
           let hitId: string | null = null;
           for (let i = areas.length - 1; i >= 0; i--) {
              const area = areas[i];
              const ax = originX + area.x * scale;
              const ay = originY - area.y * scale;
              const width = (area.shape === 'Circle' ? area.radius * 2 : Math.max(area.width || 0, area.topWidth || 0, area.bottomWidth || 0)) * scale;
              const height = (area.shape === 'Circle' ? area.radius * 2 : area.height || 0) * scale;
              
              if (touchX >= ax - width/2 && touchX <= ax + width/2 && touchY >= ay - height/2 && touchY <= ay + height/2) {
                 hitId = area.id;
                 break;
              }
           }
           
           if (hitId) {
              onSelectArea(hitId);
              setDraggingAreaId(hitId);
              setIsDragging(false);
              setLastMousePos({ x: e.touches[0].clientX, y: e.touches[0].clientY });
              return;
           } else {
              onSelectArea(null);
           }
        }
      }

      setIsDragging(true);
      setLastMousePos({ x: e.touches[0].clientX, y: e.touches[0].clientY });
    } else if (e.touches.length === 2) {
      const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      setLastTouchDistance(dist);
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 1 && draggingAreaId && onUpdateArea) {
       const dx = e.touches[0].clientX - lastMousePos.x;
       const dy = e.touches[0].clientY - lastMousePos.y;
       const scale = scaleRef.current;
       
       const area = areas?.find(a => a.id === draggingAreaId);
       if (area) {
         onUpdateArea(area.id, {
           x: area.x + dx / scale,
           y: area.y - dy / scale
         });
       }
       setLastMousePos({ x: e.touches[0].clientX, y: e.touches[0].clientY });
       return;
    }

    if (e.touches.length === 1 && isDragging) {
      const dx = e.touches[0].clientX - lastMousePos.x;
      const dy = e.touches[0].clientY - lastMousePos.y;
      setOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      setLastMousePos({ x: e.touches[0].clientX, y: e.touches[0].clientY });
    } else if (e.touches.length === 2 && lastTouchDistance !== null) {
      const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      const delta = dist - lastTouchDistance;
      setLastTouchDistance(dist);
      
      let newScale = zoomScale + delta * 0.01;
      if (newScale < 0.2) newScale = 0.2;
      if (newScale > 10) newScale = 10;
      setZoomScale(newScale);
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    setDraggingAreaId(null);
    setLastTouchDistance(null);
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
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        className="block cursor-grab active:cursor-grabbing touch-none"
      />
      
      <div 
        ref={tooltipRef}
        className={`fixed pointer-events-none bg-dark-panel border border-dark-border text-white text-sm rounded px-3 py-2 shadow-lg z-20 transition-opacity duration-150 print:hidden ${hoveredGroup && !isDragging ? 'opacity-100' : 'opacity-0'}`}
      >
        {hoveredGroup && (
          <>
            <p className="font-bold border-b border-dark-border pb-1 mb-1">{hoveredGroup.label}</p>
            {hoveredGroup.muted && <p className="text-red-400 font-bold text-xs mb-1">MUTED</p>}
            <p className="text-yellow-400 text-xs mb-1">X: {hoveredGroup.x > 0 ? '+' : ''}{hoveredGroup.x.toFixed(2)} m</p>
            
            <div className="mt-2 border-t border-gray-700 pt-1">
              {[...hoveredGroup.boxes].reverse().map(box => (
                <div key={box.stackIndex} className="flex justify-between space-x-3 text-xs mb-1">
                   <span className="text-yellow-400">Box {box.stackIndex + 1}</span>
                   {box.isRear ? (
                      <span className="text-yellow-400 font-bold">{box.delayMs.toFixed(2)}ms (Rear)</span>
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
