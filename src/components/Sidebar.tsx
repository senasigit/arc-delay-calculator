import type { SubwooferSettings, ArrayStats } from '../types';

interface SidebarProps {
  settings: SubwooferSettings;
  onChange: (settings: SubwooferSettings) => void;
  stats: ArrayStats;
}

export function Sidebar({ settings, onChange, stats }: SidebarProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      onChange({ ...settings, [name]: checked });
      return;
    }

    if (name === 'orientation' || name === 'bandwidth' || name === 'resolution') {
      onChange({ ...settings, [name]: value });
      return;
    }

    let numValue = parseFloat(value);
    
    // Validate number of subwoofers
    if (name === 'count') {
      numValue = parseInt(value, 10);
      if (numValue < 2) numValue = 2;
      if (numValue > 32) numValue = 32;
    }
    
    onChange({ ...settings, [name]: isNaN(numValue) ? 0 : numValue });
  };

  return (
    <div className="w-80 h-full bg-dark-panel border-r border-dark-border flex flex-col overflow-y-auto">
      <div className="p-6 pb-2">
        <h1 className="text-xl font-bold text-white mb-2">Arc Delay Subwoofer</h1>
        <p className="text-sm text-gray-400 mb-4">Konfigurasi DSP & Peta Visual</p>

        <div className="mb-4 bg-[#0f1115] p-4 rounded border border-dark-border space-y-2 shadow-inner">
          <div className="flex justify-between items-center">
             <span className="text-xs text-gray-400">Total Panjang Array</span>
             <span className="text-sm font-semibold text-accent">{stats.totalArrayLength.toFixed(2)} m</span>
          </div>
          <div className="flex justify-between items-center">
             <span className="text-xs text-gray-400">Jarak Pusat Akustik (y)</span>
             <span className="text-sm font-semibold text-gray-200">{stats.acousticCenterSpacing.toFixed(2)} m</span>
          </div>
          <div className="flex justify-between items-center">
             <span className="text-xs text-gray-400">Batas Freq Atas</span>
             <span className="text-sm font-semibold text-red-400">{stats.upperFreqLimit.toFixed(0)} Hz</span>
          </div>
        </div>
      </div>

      <div className="flex-1 px-6 space-y-4 pb-6 overflow-y-auto">
        <div className="flex flex-col">
          <label htmlFor="count" className="text-sm font-medium text-gray-300 mb-1">Jumlah Subwoofer</label>
          <input 
            id="count"
            type="number" 
            name="count"
            min="2"
            max="32"
            value={settings.count}
            onChange={handleChange}
            className="bg-[#0f1115] border border-dark-border rounded px-3 py-2 text-white focus:outline-none focus:border-accent transition-colors"
          />
        </div>

        <div className="flex flex-col">
          <label htmlFor="orientation" className="text-sm font-medium text-gray-300 mb-1">Orientasi</label>
          <select 
            id="orientation"
            name="orientation"
            value={settings.orientation}
            onChange={handleChange}
            className="bg-[#0f1115] border border-dark-border rounded px-3 py-2 text-white focus:outline-none focus:border-accent transition-colors"
          >
            <option value="Landscape">Landscape</option>
            <option value="Portrait">Portrait</option>
          </select>
        </div>
        
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col">
            <label htmlFor="width" className="text-xs font-medium text-gray-300 mb-1">Lebar (W) m</label>
            <input 
              id="width"
              type="number" 
              name="width"
              min="0.1"
              step="0.05"
              value={settings.width}
              onChange={handleChange}
              className="bg-[#0f1115] border border-dark-border rounded px-2 py-2 text-white focus:outline-none focus:border-accent transition-colors text-sm"
            />
          </div>

          <div className="flex flex-col">
            <label htmlFor="depth" className="text-xs font-medium text-gray-300 mb-1">Dalam (D) m</label>
            <input 
              id="depth"
              type="number" 
              name="depth"
              min="0.1"
              step="0.05"
              value={settings.depth}
              onChange={handleChange}
              className="bg-[#0f1115] border border-dark-border rounded px-2 py-2 text-white focus:outline-none focus:border-accent transition-colors text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col">
            <label htmlFor="gap" className="text-xs font-medium text-gray-300 mb-1">Sub Gap m</label>
            <input 
              id="gap"
              type="number" 
              name="gap"
              min="0"
              step="0.05"
              value={settings.gap}
              onChange={handleChange}
              className="bg-[#0f1115] border border-dark-border rounded px-2 py-2 text-white focus:outline-none focus:border-accent transition-colors text-sm"
            />
          </div>
          
          <div className="flex flex-col">
            <label htmlFor="centralGap" className="text-xs font-medium text-gray-300 mb-1" title="Gap tengah (hanya untuk genap)">Central Gap</label>
            <input 
              id="centralGap"
              type="number" 
              name="centralGap"
              min="0"
              step="0.05"
              value={settings.centralGap}
              onChange={handleChange}
              disabled={settings.count % 2 !== 0}
              className={`bg-[#0f1115] border border-dark-border rounded px-2 py-2 text-white focus:outline-none focus:border-accent transition-colors text-sm ${settings.count % 2 !== 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
            />
          </div>
        </div>

        <div className="flex flex-col">
          <label htmlFor="theta" className="text-sm font-medium text-gray-300 mb-1">Sudut Cakupan (Theta) °</label>
          <input 
            id="theta"
            type="number" 
            name="theta"
            min="0"
            max="180"
            value={settings.theta}
            onChange={handleChange}
            className="bg-[#0f1115] border border-dark-border rounded px-3 py-2 text-white focus:outline-none focus:border-accent transition-colors"
          />
        </div>

        <div className="flex flex-col border-t border-dark-border pt-4 mt-2">
          <div className="flex items-center mb-3">
            <input 
              type="checkbox" 
              id="cardioid" 
              name="cardioid"
              checked={settings.cardioid}
              onChange={handleChange}
              className="w-4 h-4 rounded border-gray-300 text-accent focus:ring-accent bg-[#0f1115]"
            />
            <label htmlFor="cardioid" className="ml-2 text-sm font-medium text-gray-300">Gunakan Setup Cardioid</label>
          </div>
          
          {settings.cardioid && (
            <div className="flex flex-col pl-6">
              <label htmlFor="cardioidDelay" className="text-xs font-medium text-gray-400 mb-1">Cardioid Delay (ms)</label>
              <input 
                id="cardioidDelay"
                type="number" 
                name="cardioidDelay"
                min="0"
                step="0.1"
                value={settings.cardioidDelay}
                onChange={handleChange}
                className="bg-[#0f1115] border border-dark-border rounded px-2 py-2 text-white focus:outline-none focus:border-accent transition-colors text-sm"
              />
            </div>
          )}
        </div>

        {/* Pengaturan Resolusi dan Bandwidth Heatmap */}
        <div className="flex flex-col border-t border-dark-border pt-4 mt-2 space-y-3">
          <h3 className="text-sm font-bold text-white mb-1">Peta Penyebaran (Heatmap)</h3>
          
          <div className="flex flex-col">
            <label htmlFor="frequency" className="text-xs font-medium text-gray-300 mb-1">Frekuensi Pusat (Hz)</label>
            <input 
              id="frequency"
              type="number" 
              name="frequency"
              min="20"
              max="200"
              value={settings.frequency}
              onChange={handleChange}
              className="bg-[#0f1115] border border-dark-border rounded px-3 py-2 text-white focus:outline-none focus:border-accent transition-colors text-sm"
            />
          </div>

          <div className="flex flex-col">
            <label htmlFor="bandwidth" className="text-xs font-medium text-gray-300 mb-1">Bandwidth Spektrum</label>
            <select 
              id="bandwidth"
              name="bandwidth"
              value={settings.bandwidth}
              onChange={handleChange}
              className="bg-[#0f1115] border border-dark-border rounded px-3 py-2 text-white focus:outline-none focus:border-accent transition-colors text-sm"
            >
              <option value="Single">Single Tone</option>
              <option value="1/3 Octave">1/3 Octave</option>
              <option value="1 Octave">1 Octave</option>
              <option value="Broadband">Broadband (Full Range)</option>
            </select>
          </div>
          
          <div className="flex flex-col">
            <label htmlFor="resolution" className="text-xs font-medium text-gray-300 mb-1">Kualitas Resolusi Peta</label>
            <select 
              id="resolution"
              name="resolution"
              value={settings.resolution}
              onChange={handleChange}
              className="bg-[#0f1115] border border-dark-border rounded px-3 py-2 text-white focus:outline-none focus:border-accent transition-colors text-sm"
            >
              <option value="Low">Low (Cepat)</option>
              <option value="Medium">Medium</option>
              <option value="High">High (Detail)</option>
            </select>
          </div>
        </div>

        <div className="flex flex-col pb-4 border-t border-dark-border pt-4 mt-2">
          <label htmlFor="speedOfSound" className="text-xs font-medium text-gray-300 mb-1">Kecepatan Suara (m/s)</label>
          <input 
            id="speedOfSound"
            type="number" 
            name="speedOfSound"
            min="300"
            max="400"
            step="0.1"
            value={settings.speedOfSound}
            onChange={handleChange}
            className="bg-[#0f1115] border border-dark-border rounded px-3 py-2 text-white focus:outline-none focus:border-accent transition-colors text-sm"
          />
        </div>
      </div>
    </div>
  );
}
