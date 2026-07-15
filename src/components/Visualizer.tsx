import { useEffect, useRef, useState } from 'react';
import type { SubwooferSettings, BoxCalculation } from '../types';
import { calculatePolarPattern } from '../utils';

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

    const resizeCanvas = () => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      draw();
    };

    const draw = () => {
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);

      // Skala (pixels per meter)
      const arrayLength = (settings.count - 1) * (settings.width + settings.gap) + settings.width;
      const padding = 50; 
      
      // Radius maksimum peta penyebaran yang ingin ditampilkan (misal 20 meter, atau relatif terhadap lebar array)
      const maxPlotRadius = Math.max(arrayLength * 1.5, 10); // meter
      
      const scaleX = (width - padding * 2) / Math.max(arrayLength, 1);
      const scaleY = (height - padding * 2) / maxPlotRadius;
      const scale = Math.min(scaleX, scaleY, 150); 
      
      const cx = width / 2;
      const cy = height * 0.8; // Geser ke bawah sedikit agar polar plot punya banyak ruang di atas

      // 1. Gambar Grid (Skala 1 meter)
      ctx.strokeStyle = '#2a2e37';
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

      // 2. Hitung dan Gambar Peta Penyebaran (Polar Pattern Dispersion Map)
      if (calculations.length > 0) {
        const polarPoints = calculatePolarPattern(settings, calculations);
        
        ctx.save();
        ctx.translate(cx, cy);
        
        // Radius visual maksimum untuk polar plot di canvas
        const plotRadiusPixels = maxPlotRadius * scale * 0.8; 
        
        ctx.beginPath();
        ctx.moveTo(0, 0);
        
        for (const pt of polarPoints) {
          // pt.angleDeg adalah -90 sampai 90.
          // Dalam Canvas, 0 derajat biasanya arah X positif. 
          // Arah depan kita adalah Y negatif (atas).
          // Sehingga sudut drawing = -90 derajat (depan) + pt.angleDeg
          const drawAngleRad = (-90 + pt.angleDeg) * Math.PI / 180;
          
          const r = pt.magnitude * plotRadiusPixels;
          const px = Math.cos(drawAngleRad) * r;
          const py = Math.sin(drawAngleRad) * r;
          
          ctx.lineTo(px, py);
        }
        ctx.lineTo(0, 0);
        
        // Gradasi Radial untuk peta penyebaran
        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, plotRadiusPixels);
        gradient.addColorStop(0, 'rgba(59, 130, 246, 0.7)'); // biru
        gradient.addColorStop(0.5, 'rgba(59, 130, 246, 0.3)'); 
        gradient.addColorStop(1, 'rgba(59, 130, 246, 0)');
        
        ctx.fillStyle = gradient;
        ctx.fill();
        
        ctx.strokeStyle = 'rgba(96, 165, 250, 0.8)';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        ctx.restore();
      }

      // 3. Gambar Fisik Subwoofer
      ctx.save();
      ctx.translate(cx, cy);
      
      const boxW = settings.width * scale;
      const boxH = settings.depth * scale;
      
      calculations.forEach((box) => {
        const px = box.x * scale;
        const py = 0; 
        
        const isHovered = hoveredBox?.index === box.index;
        
        ctx.fillStyle = isHovered ? '#60a5fa' : '#1f2937'; 
        ctx.strokeStyle = isHovered ? '#ffffff' : '#4b5563'; 
        ctx.lineWidth = 2;
        
        const renderX = px - boxW / 2;
        const renderY = py - boxH / 2;
        
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
      ctx.fillStyle = '#9ca3af'; 
      ctx.font = '12px Inter, sans-serif';
      ctx.fillText('Grid: 1m x 1m', 15, 25);
      ctx.fillStyle = '#60a5fa';
      ctx.fillText(`Peta Penyebaran @ ${settings.frequency} Hz`, 15, 45);
    };

    resizeCanvas();
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
    const cy = height * 0.8;
    
    const arrayLength = (settings.count - 1) * (settings.width + settings.gap) + settings.width;
    const maxPlotRadius = Math.max(arrayLength * 1.5, 10);
    const scale = Math.min((width - 100) / Math.max(arrayLength, 1), (height - 100) / maxPlotRadius, 150);
    
    const boxW = settings.width * scale;
    const boxH = settings.depth * scale;
    
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
          <p className="text-gray-300">Posisi X: <span className="text-white">{hoveredBox.x.toFixed(2)} m</span></p>
          <p className="text-accent font-bold mt-1 text-base">{hoveredBox.delayMs.toFixed(2)} ms</p>
        </div>
      )}
    </div>
  );
}
