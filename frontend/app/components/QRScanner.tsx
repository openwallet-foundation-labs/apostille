'use client';

import React, { useEffect, useRef, useState } from 'react';

interface QRScannerProps {
  onScan: (data: string) => void;
  onError?: (error: string) => void;
  onClose: () => void;
}

export default function QRScanner({ onScan, onError, onClose }: QRScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Dynamically import jsQR only on client side
    let jsQR: any = null;

    const startCamera = async () => {
      try {
        // Request camera permission
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' } // Use back camera on mobile
        });

        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          setStream(mediaStream);
          setIsScanning(true);
        }
      } catch (err) {
        const errorMsg = 'Failed to access camera. Please grant camera permissions.';
        setError(errorMsg);
        onError?.(errorMsg);
        console.error('Camera access error:', err);
      }
    };

    const scanQRCode = async () => {
      if (!videoRef.current || !canvasRef.current || !jsQR) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');

      if (!context || video.readyState !== video.HAVE_ENOUGH_DATA) {
        return;
      }

      // Set canvas size to match video
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      // Draw video frame to canvas
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Get image data
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

      // Scan for QR code
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'dontInvert',
      });

      if (code && code.data) {
        // QR code found!
        console.log('QR Code detected:', code.data);
        onScan(code.data);
        stopScanning();
      }
    };

    const initScanner = async () => {
      // Import jsQR dynamically
      try {
        const jsQRModule = await import('jsqr');
        jsQR = jsQRModule.default;

        await startCamera();

        // Start scanning loop
        scanIntervalRef.current = setInterval(scanQRCode, 100);
      } catch (err) {
        console.error('Failed to initialize QR scanner:', err);
        setError('Failed to load QR scanner');
      }
    };

    initScanner();

    // Cleanup function
    return () => {
      stopScanning();
    };
  }, []);

  const stopScanning = () => {
    // Stop camera stream
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }

    // Clear scanning interval
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }

    setIsScanning(false);
  };

  const handleClose = () => {
    stopScanning();
    onClose();
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-container max-w-md w-full">
        <div className="p-4 border-b border-border-primary flex justify-between items-center">
          <h3 className="text-lg font-semibold text-text-primary">Scan QR Code</h3>
          <button
            onClick={handleClose}
            className="text-text-tertiary hover:text-text-secondary transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4">
          {error ? (
            <div className="bg-error-100 border border-error-300 text-error-700 px-4 py-3 rounded mb-4">
              <p className="text-sm">{error}</p>
            </div>
          ) : (
            <>
              <div className="relative bg-surface-900 rounded-lg overflow-hidden mb-4">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-64 object-cover"
                />
                <canvas ref={canvasRef} className="hidden" />

                {/* Scanning overlay */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="border-2 border-white rounded-lg w-48 h-48 relative">
                    <div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-primary-500"></div>
                    <div className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-primary-500"></div>
                    <div className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-primary-500"></div>
                    <div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-primary-500"></div>
                  </div>
                </div>
              </div>

              <p className="text-sm text-text-secondary text-center">
                Position the QR code within the frame to scan
              </p>
            </>
          )}
        </div>

        <div className="p-4 border-t border-border-primary flex justify-end">
          <button
            onClick={handleClose}
            className="btn btn-secondary"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
