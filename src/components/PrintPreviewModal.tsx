import { PrintReportContent, type PrintReportProps } from './PrintReport';

interface PrintPreviewModalProps extends PrintReportProps {
  onClose: () => void;
  onPrint: () => void;
}

/**
 * Preview laporan di layar sebelum benar-benar dicetak/disimpan — memakai
 * PrintReportContent yang SAMA PERSIS dengan yang dipakai window.print(),
 * jadi apa yang terlihat di sini adalah apa yang akan keluar di PDF.
 */
export function PrintPreviewModal({ onClose, onPrint, ...report }: PrintPreviewModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/60 backdrop-blur-sm print-hide">
      <header className="flex-none flex items-center justify-between gap-3 px-4 py-2.5 bg-panel border-b border-line">
        <div>
          <h2 className="text-sm font-semibold">Preview laporan PDF</h2>
          <p className="text-[11px] text-ink-3">Periksa dulu isinya — cetak/simpan hanya bila sudah sesuai.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn" onClick={onClose}>
            Tutup
          </button>
          <button className="btn btn-primary" onClick={onPrint}>
            Cetak / Simpan PDF
          </button>
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain bg-gray-500 p-4 sm:p-8">
        <div className="mx-auto max-w-[900px] bg-white text-gray-900 shadow-2xl rounded-sm p-6 sm:p-10">
          <PrintReportContent {...report} />
        </div>
      </div>
    </div>
  );
}
