import type { SubwooferSettings } from '../types';

interface SidebarProps {
  settings: SubwooferSettings;
  onChange: (settings: SubwooferSettings) => void;
}

export function Sidebar({ settings, onChange }: SidebarProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    let numValue = parseFloat(value);
    
    // Validate number of subwoofers to be odd
    if (name === 'count') {
      numValue = parseInt(value, 10);
      if (numValue % 2 === 0) numValue += 1; // force odd
      if (numValue < 3) numValue = 3;
      if (numValue > 21) numValue = 21;
    }
    
    onChange({ ...settings, [name]: numValue || 0 });
  };

  // Menghitung Total Panjang Array
  const totalLength = ((settings.count - 1) * (settings.width + settings.gap)) + settings.width;

  return (
    <div className="w-80 h-full bg-dark-panel border-r border-dark-border p-6 flex flex-col overflow-y-auto">
      <h1 className="text-xl font-bold text-white mb-2">Arc Delay Subwoofer</h1>
      <p className="text-sm text-gray-400 mb-6">Konfigurasi DSP & Peta Visual</p>

      <div className="mb-6 bg-[#0f1115] p-3 rounded border border-dark-border">
        <p className="text-xs text-gray-400 mb-1">Total Panjang Array</p>
        <p className="text-lg font-semibold text-accent">{totalLength.toFixed(2)} Meter</p>
      </div>

      <div className="space-y-5">
        <div className="flex flex-col">
          <label htmlFor="count" className="text-sm font-medium text-gray-300 mb-1">Jumlah Subwoofer (Ganjil)</label>
          <input 
            id="count"
            type="number" 
            name="count"
            min="3"
            max="21"
            step="2"
            value={settings.count}
            onChange={handleChange}
            className="bg-[#0f1115] border border-dark-border rounded px-3 py-2 text-white focus:outline-none focus:border-accent transition-colors"
          />
        </div>
        
        <div className="flex flex-col">
          <label htmlFor="width" className="text-sm font-medium text-gray-300 mb-1">Lebar Box (W) meter</label>
          <input 
            id="width"
            type="number" 
            name="width"
            min="0.1"
            step="0.05"
            value={settings.width}
            onChange={handleChange}
            className="bg-[#0f1115] border border-dark-border rounded px-3 py-2 text-white focus:outline-none focus:border-accent transition-colors"
          />
        </div>

        <div className="flex flex-col">
          <label htmlFor="depth" className="text-sm font-medium text-gray-300 mb-1">Kedalaman Box (D) meter</label>
          <input 
            id="depth"
            type="number" 
            name="depth"
            min="0.1"
            step="0.05"
            value={settings.depth}
            onChange={handleChange}
            className="bg-[#0f1115] border border-dark-border rounded px-3 py-2 text-white focus:outline-none focus:border-accent transition-colors"
          />
        </div>

        <div className="flex flex-col">
          <label htmlFor="gap" className="text-sm font-medium text-gray-300 mb-1">Jarak Antar Sub (G) meter</label>
          <input 
            id="gap"
            type="number" 
            name="gap"
            min="0"
            step="0.05"
            value={settings.gap}
            onChange={handleChange}
            className="bg-[#0f1115] border border-dark-border rounded px-3 py-2 text-white focus:outline-none focus:border-accent transition-colors"
          />
        </div>

        <div className="flex flex-col">
          <label htmlFor="theta" className="text-sm font-medium text-gray-300 mb-1">Sudut Cakupan (Theta) °</label>
          <div className="flex items-center space-x-3">
             <input 
              id="theta"
              type="range" 
              name="theta"
              min="30"
              max="180"
              value={settings.theta}
              onChange={handleChange}
              className="flex-1 accent-accent"
            />
            <span className="text-sm text-gray-300 w-8">{settings.theta}°</span>
          </div>
        </div>

        <div className="flex flex-col">
          <label htmlFor="frequency" className="text-sm font-medium text-gray-300 mb-1">Frekuensi Simulasi (Hz)</label>
          <select 
            id="frequency"
            name="frequency"
            value={settings.frequency}
            onChange={handleChange}
            className="bg-[#0f1115] border border-dark-border rounded px-3 py-2 text-white focus:outline-none focus:border-accent transition-colors"
          >
            {[30, 40, 50, 55, 63, 80, 100, 120].map(freq => (
              <option key={freq} value={freq}>{freq} Hz</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col">
          <label htmlFor="speedOfSound" className="text-sm font-medium text-gray-300 mb-1">Kecepatan Suara (m/s)</label>
          <input 
            id="speedOfSound"
            type="number" 
            name="speedOfSound"
            min="300"
            max="400"
            step="0.1"
            value={settings.speedOfSound}
            onChange={handleChange}
            className="bg-[#0f1115] border border-dark-border rounded px-3 py-2 text-white focus:outline-none focus:border-accent transition-colors"
          />
        </div>
      </div>
      
      <div className="mt-auto pt-8 pb-4">
         <p className="text-xs text-gray-500 text-center">Berdasarkan Rumus Standar Audio</p>
      </div>
    </div>
  );
}
