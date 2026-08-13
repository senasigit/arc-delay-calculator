import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/**
 * Menahan error render agar aplikasi tidak berubah jadi layar putih di lapangan.
 * Penyebab paling sering: data project lama dengan field yang hilang.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Render error:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="app-shell flex items-center justify-center p-6">
        <div className="panel max-w-md w-full p-6">
          <h1 className="text-base font-semibold text-danger mb-2">Terjadi kesalahan</h1>
          <p className="section-note mb-4">
            Aplikasi gagal menampilkan halaman. Detail teknis ada di bawah — muat ulang untuk kembali
            ke kondisi awal.
          </p>
          <pre className="text-[11px] text-ink-3 bg-raised border border-line rounded p-3 overflow-x-auto mb-4 whitespace-pre-wrap">
            {this.state.error.message}
          </pre>
          <button className="btn btn-primary w-full" onClick={() => window.location.reload()}>
            Muat ulang aplikasi
          </button>
        </div>
      </div>
    );
  }
}
