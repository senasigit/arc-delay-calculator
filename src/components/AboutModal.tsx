interface AboutModalProps {
  onClose: () => void;
}

const APP_VERSION = '1.0';
const DEVELOPER = 'Sena Sigit';
const INSTAGRAM = 'senatarium';

const CAPABILITIES = [
  ['Distribusi array', 'Curved / arc, straight delayed, dan L/R'],
  ['Pola directional', 'End-fire, gradient in-line, inverted stack, cardioid L/R'],
  ['Peta SPL', 'Penjumlahan fasor koheren dengan rata-rata daya per pita'],
  ['Kondisi udara', 'Kecepatan suara & serapan udara ISO 9613-1'],
  ['Utilities', '13 kalkulator pendukung sistem tata suara'],
];

export function AboutModal({ onClose }: AboutModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="panel w-full max-w-sm max-h-[85dvh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-title"
      >
        <header className="flex-none flex items-start gap-3 px-5 pt-5 pb-4 border-b border-line">
          <img src="/logo.png" alt="" className="w-10 h-10 object-contain flex-none" />
          <div className="min-w-0 flex-1">
            <h2 id="about-title" className="text-sm font-semibold">
              Sub Forge
            </h2>
            <p className="text-[11px] text-ink-3">Kalkulator array &amp; delay subwoofer · versi {APP_VERSION}</p>
          </div>
          <button className="btn btn-ghost px-2 flex-none" onClick={onClose} aria-label="Tutup">
            ✕
          </button>
        </header>

        <div className="flex-1 scroll-y px-5 py-4 space-y-4">
          <p className="section-note">
            Alat bantu perancangan susunan subwoofer: menghitung delay busur, pola cardioid, dan memetakan
            SPL spread berdasarkan penjumlahan gelombang dari tiap box.
          </p>

          <dl className="space-y-2">
            {CAPABILITIES.map(([label, value]) => (
              <div key={label}>
                <dt className="text-[11px] font-semibold text-ink-2">{label}</dt>
                <dd className="text-[11px] text-ink-3 m-0">{value}</dd>
              </div>
            ))}
          </dl>

          <div className="pt-3 border-t border-line space-y-2">
            <div className="stat-row">
              <dt>Pengembang</dt>
              <dd>{DEVELOPER}</dd>
            </div>
            <div className="stat-row">
              <dt>Instagram</dt>
              <dd>
                <a
                  className="text-accent-hi hover:underline"
                  href={`https://instagram.com/${INSTAGRAM}`}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  @{INSTAGRAM}
                </a>
              </dd>
            </div>
            <div className="stat-row">
              <dt>Hak cipta</dt>
              <dd>© {new Date().getFullYear()} {DEVELOPER}</dd>
            </div>
          </div>

          <p className="section-note pt-2 border-t border-line">
            Hasil perhitungan adalah model medan bebas (tanpa pantulan lantai, dinding, atau direktivitas
            kabinet). Selalu verifikasi di lokasi dengan pengukuran.
          </p>
        </div>

        <footer className="flex-none px-5 py-4 border-t border-line">
          <button className="btn btn-primary w-full" onClick={onClose}>
            Tutup
          </button>
        </footer>
      </div>
    </div>
  );
}
