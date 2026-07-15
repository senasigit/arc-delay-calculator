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

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Resolusi blok untuk heatmap (makin kecil makin halus tapi berat)
    const RESOLUTION = 8; // pixel per block

    const resizeCanvas = () => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      draw();
    };

    const draw = () => {
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);

      // Hitung dimensi total array berdasarkan orientasi
      const dimension = settings.orientation === 'Landscape' ? settings.width : settings.depth;
      const physicalDimensionX = settings.orientation === 'Landscape' ? settings.width : settings.depth;
      const physicalDimensionY = settings.orientation === 'Landscape' ? settings.depth : settings.width;
      
      const arrayLength = (settings.count - 1) * (dimension + settings.gap) + dimension + (settings.count % 2 === 0 ? settings.centralGap - settings.gap : 0);
      
      // Radius rendering visual
      const maxPlotRadius = Math.max(arrayLength * 1.2, 10); // meter
      
      const padding = 20; 
      const scaleX = (width - padding * 2) / Math.max(arrayLength, 1);
      const scaleY = (height - padding * 2) / maxPlotRadius;
      const scale = Math.min(scaleX, scaleY, 150); 
      
      const cx = width / 2;
      const cy = height / 2; // Taruh di tengah agar penyebaran ke belakang (atas layar) terlihat

      // 1. Gambar Heatmap 2D 360 derajat
      if (calculations.length > 0) {
        // Kita gambar heatmap di atas background
        const mapData = calculate2DSpatialHeatmap(settings, calculations, width, height, cx, cy, scale, RESOLUTION);
        
        for (let r = 0; r < mapData.rows; r++) {
          for (let c = 0; c < mapData.cols; c++) {
            const spl = mapData.heatmap[r * mapData.cols + c];
            const color = splToColor(spl, mapData.maxSpl, 35); // 35dB dynamic range
            
            ctx.fillStyle = color;
            ctx.fillRect(c * RESOLUTION, r * RESOLUTION, RESOLUTION, RESOLUTION);
          }
        }
      }

      // 2. Gambar Grid (Skala 1 meter) dengan opacity tipis di atas heatmap
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 1;
      const gridSize = 1 * scale; 
      
      ctx.beginPath();
      for (let x = cx % gridSize; x < width; x += gridSize) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      }
      for (let y = cy % gridSize; y < height; y += gridSize) {
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
      for (let y = cy % gridSize; y > 0; y -= gridSize) {
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
      ctx.stroke();

      // Titik tengah origin (0,0) meter
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.beginPath();
      ctx.moveTo(cx, 0);
      ctx.lineTo(cx, height);
      ctx.moveTo(0, cy);
      ctx.lineTo(width, cy);
      ctx.stroke();

      // 3. Gambar Fisik Subwoofer
      ctx.save();
      ctx.translate(cx, cy);
      
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
        
        // Kotak hitam untuk menutupi heatmap di area box
        ctx.fillRect(renderX, renderY, boxW, boxH);
        ctx.strokeRect(renderX, renderY, boxW, boxH);
        
        // Titik pusat akustik (merah)
        ctx.fillStyle = '#ef4444'; 
        ctx.beginPath();
        ctx.arc(px, py, 3, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();
      
      // Indikator Skala & Info Frekuensi
      ctx.fillStyle = 'white'; 
      ctx.font = '12px Inter, sans-serif';
      ctx.fillText('Grid: 1m x 1m', 15, 25);
      ctx.fillStyle = '#fca5a5'; // red-300
      ctx.fillText(`2D SPL Heatmap @ ${settings.frequency} Hz`, 15, 45);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.fillText('Atas = Depan (Audience), Bawah = Belakang (Stage)', 15, 65);
    };

    // Only draw once on settings change, or on resize
    draw();

    window.addEventListener('resize', resizeCanvas);
    
    return () => {
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [settings, calculations, hoveredBox]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    setMousePos({ x: e.clientX, y: e.clientY });
    
    const { width, height } = canvas;
    const cx = width / 2;
    const cy = height / 2;
    
    const dimension = settings.orientation === 'Landscape' ? settings.width : settings.depth;
    const arrayLength = (settings.count - 1) * (dimension + settings.gap) + dimension + (settings.count % 2 === 0 ? settings.centralGap - settings.gap : 0);
    const maxPlotRadius = Math.max(arrayLength * 1.2, 10);
    const scale = Math.min((width - 40) / Math.max(arrayLength, 1), (height - 40) / maxPlotRadius, 150);
    
    const physicalDimensionX = settings.orientation === 'Landscape' ? settings.width : settings.depth;
    const physicalDimensionY = settings.orientation === 'Landscape' ? settings.depth : settings.width;
    const boxW = physicalDimensionX * scale;
    const boxH = physicalDimensionY * scale;
    
    const hovered = calculations.find(box => {
       const px = cx + box.x * scale;
       const py = cy; 
       
       const left = px - boxW / 2;
       const right = px + boxW / 2;
       const top = py - boxH / 2;
       const bottom = py + boxH / 2;
       
       return mouseX >= left && mouseX <= right && mouseY >= top && mouseY <= bottom;
    });
    
    setHoveredBox(hovered || null);
  };

  const handleMouseLeave = () => {
    setHoveredBox(null);
  };

  return (
    <div ref={containerRef} className="flex-1 relative bg-[#0a0c10]">
      <canvas 
        ref={canvasRef} 
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className="block w-full h-full cursor-crosshair"
      />
      
      {/* Tooltip */}
      {hoveredBox && (
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
