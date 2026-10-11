import React, { useState, useRef, useEffect } from 'react';
import { Camera, X, RefreshCw, Check, AlertCircle, SwitchCamera } from 'lucide-react';
import Button from './Button';

export default function CameraModal({ isOpen, onClose, onCapture }) {
  const [stream, setStream] = useState(null);
  const [capturedImage, setCapturedImage] = useState(null);
  const [cameraError, setCameraError] = useState(null);
  const [facingMode, setFacingMode] = useState('environment'); // 'environment' (back) or 'user' (front)
  const [devices, setDevices] = useState([]);
  
  const videoRef = useRef(null);
  const fileInputRef = useRef(null);

  // Initialize camera stream when opened
  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      setCapturedImage(null);
      setCameraError(null);
      return;
    }

    startCamera(facingMode);

    return () => {
      stopCamera();
    };
  }, [isOpen, facingMode]);

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  const startCamera = async (mode) => {
    stopCamera();
    setCameraError(null);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('Camera access is not supported by your browser. You can upload an image file instead.');
      return;
    }

    try {
      const constraints = {
        video: {
          facingMode: { ideal: mode },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      };

      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(mediaStream);

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }

      // Check available video devices
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const videoDevs = allDevices.filter(d => d.kind === 'videoinput');
      setDevices(videoDevs);
    } catch (err) {
      console.warn('Camera stream error:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraError('Camera permission was denied. Please allow camera access in browser settings, or select a photo file.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setCameraError('No camera found on this device. Please upload a photo file.');
      } else {
        setCameraError(`Could not access camera (${err.message || 'Error'}). Please upload a photo file instead.`);
      }
    }
  };

  // Flip camera if multiple devices exist
  const handleToggleFacingMode = () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
  };

  // Capture frame from video to canvas
  const handleCapturePhoto = () => {
    if (!videoRef.current) return;

    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    setCapturedImage(dataUrl);
    stopCamera();
  };

  // Retake photo
  const handleRetake = () => {
    setCapturedImage(null);
    startCamera(facingMode);
  };

  // Confirm and send captured photo
  const handleConfirm = () => {
    if (capturedImage) {
      onCapture(capturedImage);
      onClose();
    }
  };

  // Fallback file input
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setCapturedImage(event.target.result);
        stopCamera();
      };
      reader.readAsDataURL(file);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-stone-950/80 backdrop-blur-sm animate-fade-fast">
      <div className="w-full max-w-xl bg-stone-900 border border-stone-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-stone-100 animate-pop-fast">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-stone-800 bg-stone-900/90">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Snap Bill or Invoice</h3>
              <p className="text-[11px] text-stone-400">Position the document clearly within the frame</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Viewfinder / Preview Body */}
        <div className="relative bg-black aspect-4/3 flex items-center justify-center overflow-hidden">
          {capturedImage ? (
            // Captured Snapshot Preview
            <img
              src={capturedImage}
              alt="Captured invoice snapshot"
              className="w-full h-full object-contain bg-black"
            />
          ) : cameraError ? (
            // Error State with File Upload Fallback
            <div className="p-6 text-center max-w-sm">
              <AlertCircle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
              <p className="text-xs text-stone-300 mb-4">{cameraError}</p>
              <Button
                variant="primary"
                onClick={() => fileInputRef.current?.click()}
                className="bg-emerald-600 hover:bg-emerald-500 text-white"
              >
                Choose Photo from Device
              </Button>
            </div>
          ) : (
            // Live Video Feed
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
                onLoadedMetadata={() => videoRef.current?.play()}
              />
              {/* Document Alignment Frame Box */}
              <div className="absolute inset-8 border-2 border-dashed border-emerald-400/70 rounded-xl pointer-events-none flex flex-col justify-between p-3">
                <div className="flex justify-between">
                  <div className="w-4 h-4 border-t-2 border-l-2 border-emerald-400"></div>
                  <div className="w-4 h-4 border-t-2 border-r-2 border-emerald-400"></div>
                </div>
                <div className="text-center">
                  <span className="bg-stone-900/80 backdrop-blur-sm text-[11px] px-2.5 py-1 rounded-full text-stone-300 font-medium">
                    Align invoice or receipt here
                  </span>
                </div>
                <div className="flex justify-between">
                  <div className="w-4 h-4 border-b-2 border-l-2 border-emerald-400"></div>
                  <div className="w-4 h-4 border-b-2 border-r-2 border-emerald-400"></div>
                </div>
              </div>
            </>
          )}

          {/* Hidden file input for fallback or mobile shutter */}
          <input
            type="file"
            ref={fileInputRef}
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        {/* Footer Controls */}
        <div className="p-4 bg-stone-900 border-t border-stone-800 flex items-center justify-between">
          {capturedImage ? (
            // Controls after capturing
            <>
              <button
                type="button"
                onClick={handleRetake}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-stone-300 hover:text-white hover:bg-stone-800 transition-colors cursor-pointer flex items-center gap-2"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Retake Photo
              </button>
              <Button
                variant="primary"
                onClick={handleConfirm}
                icon={Check}
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-5"
              >
                Scan This Photo
              </Button>
            </>
          ) : (
            // Controls during live feed
            <>
              <div className="flex items-center gap-2">
                {devices.length > 1 && (
                  <button
                    type="button"
                    onClick={handleToggleFacingMode}
                    className="p-2.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 transition-colors cursor-pointer"
                    title="Switch Camera (Front/Back)"
                  >
                    <SwitchCamera className="w-4 h-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-[11px] text-stone-400 hover:text-stone-200 underline cursor-pointer"
                >
                  Upload file instead
                </button>
              </div>

              {/* Shutter Button */}
              <button
                type="button"
                onClick={handleCapturePhoto}
                disabled={Boolean(cameraError)}
                className="w-14 h-14 rounded-full border-4 border-white bg-emerald-500 hover:bg-emerald-400 active:scale-95 transition-all flex items-center justify-center cursor-pointer shadow-lg disabled:opacity-40"
                aria-label="Capture photo"
              >
                <div className="w-10 h-10 rounded-full bg-white"></div>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="px-3 py-2 text-xs text-stone-400 hover:text-white cursor-pointer"
              >
                Cancel
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
