import { useState, useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.js?url';

// Configure PDF.js worker with bundled local asset (no external CDN network dependency)
if (typeof window !== 'undefined') {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;
  } catch {}
}

interface Props {
  blob: Blob;
  fileName: string;
  onOpenEditor?: () => void;
  onDownload?: () => void;
}

export default function PdfViewer({ blob, fileName, onOpenEditor, onDownload }: Props) {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNum, setPageNum] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.2);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const renderTaskRef = useRef<any>(null);

  // Load PDF Document
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    const loadPdf = async () => {
      try {
        const arrayBuffer = await blob.arrayBuffer();
        if (cancelled) return;

        const loadingTask = pdfjsLib.getDocument({
          data: arrayBuffer,
          useSystemFonts: true,
        });

        // 7-second timeout protection so PDF rendering never hangs indefinitely
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('PDF preview rendering timed out. You can download or edit directly.')), 7000)
        );

        const pdf = await Promise.race([loadingTask.promise, timeoutPromise]);
        if (cancelled) return;

        pdfDocRef.current = pdf;
        setNumPages(pdf.numPages);
        setPageNum(1);
        setLoading(false);
      } catch (err: unknown) {
        if (!cancelled) {
          console.error('PDF load error:', err);
          setError(err instanceof Error ? err.message : 'Unable to render PDF document.');
          setLoading(false);
        }
      }
    };

    void loadPdf();

    return () => {
      cancelled = true;
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {}
      }
    };
  }, [blob]);

  // Render current page onto canvas
  useEffect(() => {
    if (!pdfDocRef.current || pageNum < 1) return;

    let cancelled = false;

    const renderPage = async () => {
      try {
        const page = await pdfDocRef.current!.getPage(pageNum);
        if (cancelled || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Cancel existing render if any
        if (renderTaskRef.current) {
          try {
            renderTaskRef.current.cancel();
          } catch {}
        }

        const viewport = page.getViewport({ scale });
        const pixelRatio = window.devicePixelRatio || 1;

        canvas.width = viewport.width * pixelRatio;
        canvas.height = viewport.height * pixelRatio;
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

        const renderContext = {
          canvasContext: ctx,
          viewport,
        };

        const task = page.render(renderContext);
        renderTaskRef.current = task;
        await task.promise;
      } catch (err: unknown) {
        if (!cancelled && (err as any)?.name !== 'RenderingCancelledException') {
          console.warn('Page render notice:', err);
        }
      }
    };

    void renderPage();

    return () => {
      cancelled = true;
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {}
      }
    };
  }, [pageNum, scale, loading]);

  const handlePrevPage = () => {
    if (pageNum > 1) setPageNum(pageNum - 1);
  };

  const handleNextPage = () => {
    if (pageNum < numPages) setPageNum(pageNum + 1);
  };

  const handleZoomIn = () => {
    setScale(s => Math.min(s + 0.25, 2.5));
  };

  const handleZoomOut = () => {
    setScale(s => Math.max(s - 0.25, 0.6));
  };

  return (
    <div className="pdf-viewer-container">
      {/* Top Floating Controls Bar */}
      <div className="pdf-viewer-toolbar">
        {/* Page Nav */}
        <div className="pdf-page-controls">
          <button
            type="button"
            className="pdf-btn"
            onClick={handlePrevPage}
            disabled={pageNum <= 1 || loading}
            title="Previous Page"
          >
            ◀
          </button>
          <span className="pdf-page-indicator">
            Page {pageNum} of {numPages || 1}
          </span>
          <button
            type="button"
            className="pdf-btn"
            onClick={handleNextPage}
            disabled={pageNum >= numPages || loading}
            title="Next Page"
          >
            ▶
          </button>
        </div>

        {/* Zoom Controls */}
        <div className="pdf-zoom-controls">
          <button
            type="button"
            className="pdf-btn"
            onClick={handleZoomOut}
            title="Zoom Out"
          >
            🔍 −
          </button>
          <span className="pdf-zoom-label">{Math.round(scale * 100)}%</span>
          <button
            type="button"
            className="pdf-btn"
            onClick={handleZoomIn}
            title="Zoom In"
          >
            🔍 +
          </button>
        </div>

        {/* Edit like Google Doc Action */}
        {onOpenEditor && (
          <button
            type="button"
            className="action-btn primary pdf-edit-btn"
            onClick={onOpenEditor}
            title="Extract text and edit this PDF in full Google Doc editor"
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
              <span>Edit like Google Doc</span>
            </span>
          </button>
        )}
      </div>

      {/* Main Content Area */}
      <div className="pdf-canvas-scroll-wrap">
        {loading && (
          <div className="doc-loading-view" style={{ padding: '60px 20px' }}>
            <div className="loading-spinner" />
            <p style={{ marginTop: '12px', fontSize: '14px', color: 'var(--text-secondary)' }}>
              Rendering PDF pages…
            </p>
          </div>
        )}

        {error && (
          <div className="doc-generic-card" style={{ margin: '40px auto', maxWidth: '380px' }}>
            <div className="doc-generic-icon">📕</div>
            <h4>PDF Preview Notice</h4>
            <p className="doc-generic-desc" style={{ color: 'var(--danger)' }}>
              {error}
            </p>
            <div style={{ display: 'flex', gap: '10px', marginTop: '16px', justifyContent: 'center' }}>
              {onDownload && (
                <button type="button" className="action-btn primary" onClick={onDownload}>
                  ⬇️ Download PDF
                </button>
              )}
              {onOpenEditor && (
                <button type="button" className="action-btn" onClick={onOpenEditor}>
                  📝 Extract & Edit Text
                </button>
              )}
            </div>
          </div>
        )}

        {!loading && !error && (
          <div className="pdf-canvas-box">
            <canvas ref={canvasRef} className="pdf-render-canvas" />
          </div>
        )}
      </div>
    </div>
  );
}
