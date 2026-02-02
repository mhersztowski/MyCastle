import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  Box,
  Button,
  IconButton,
  CircularProgress,
  Alert,
  Typography,
} from '@mui/material';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import FlipCameraIosIcon from '@mui/icons-material/FlipCameraIos';
import CloseIcon from '@mui/icons-material/Close';
import HttpsIcon from '@mui/icons-material/Https';

interface CameraCaptureProps {
  onCapture: (blob: Blob) => void;
  onCancel: () => void;
}

const isIOS = (): boolean => {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

const isSecureContext = (): boolean => {
  return window.isSecureContext ||
    window.location.protocol === 'https:' ||
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1';
};

const CameraCapture: React.FC<CameraCaptureProps> = ({ onCapture, onCancel }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop();
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const startCamera = useCallback(async () => {
    setLoading(true);
    setError(null);

    // Check for secure context (HTTPS required for getUserMedia)
    if (!isSecureContext()) {
      setError('Camera access requires HTTPS. Please use a secure connection.');
      setLoading(false);
      return;
    }

    // Check if getUserMedia is supported
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError('Camera API is not supported in this browser.');
      setLoading(false);
      return;
    }

    // Stop existing stream
    stopStream();

    try {
      // iOS Safari needs simpler constraints
      const constraints: MediaStreamConstraints = isIOS()
        ? {
            video: { facingMode },
            audio: false,
          }
        : {
            video: {
              facingMode,
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            },
            audio: false,
          };

      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = mediaStream;

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        // iOS Safari needs explicit play() call
        try {
          await videoRef.current.play();
        } catch (playError) {
          console.warn('Video play() failed, will retry on user interaction:', playError);
        }
      }
    } catch (err) {
      console.error('Camera error:', err);
      stopStream();

      if (err instanceof Error) {
        switch (err.name) {
          case 'NotAllowedError':
          case 'PermissionDeniedError':
            setPermissionDenied(true);
            if (isIOS()) {
              setError('Camera access denied. Go to Settings > Safari > Camera and allow access for this website.');
            } else {
              setError('Camera access denied. Please allow camera access in your browser settings and refresh the page.');
            }
            break;
          case 'NotFoundError':
          case 'DevicesNotFoundError':
            setError('No camera found on this device.');
            break;
          case 'NotReadableError':
          case 'TrackStartError':
            setError('Camera is in use by another application. Please close other apps using the camera.');
            break;
          case 'OverconstrainedError':
            // Try again with simpler constraints
            try {
              const simpleStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: false,
              });
              streamRef.current = simpleStream;
              if (videoRef.current) {
                videoRef.current.srcObject = simpleStream;
                await videoRef.current.play();
              }
              setLoading(false);
              return;
            } catch {
              setError('Camera settings not supported. Please try a different browser.');
            }
            break;
          case 'AbortError':
            setError('Camera access was interrupted. Please try again.');
            break;
          case 'SecurityError':
            setError('Camera access blocked due to security settings. HTTPS is required.');
            break;
          default:
            setError(`Camera error: ${err.message}`);
        }
      } else {
        setError('Failed to access camera. Please check your permissions.');
      }
    } finally {
      setLoading(false);
    }
  }, [facingMode, stopStream]);

  useEffect(() => {
    startCamera();

    return () => {
      stopStream();
    };
  }, []);

  // Handle facingMode change
  useEffect(() => {
    if (!loading && !capturedImage && !error) {
      startCamera();
    }
  }, [facingMode]);

  const handleFlipCamera = () => {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
  };

  const handleCapture = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (!ctx) return;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    ctx.drawImage(video, 0, 0);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    setCapturedImage(dataUrl);

    stopStream();
  };

  const handleRetake = () => {
    setCapturedImage(null);
    startCamera();
  };

  const handleConfirm = () => {
    if (!canvasRef.current) return;

    canvasRef.current.toBlob(
      (blob) => {
        if (blob) {
          onCapture(blob);
        }
      },
      'image/jpeg',
      0.9
    );
  };

  const handleCancel = () => {
    stopStream();
    onCancel();
  };

  const handleRetryPermission = () => {
    setError(null);
    setPermissionDenied(false);
    startCamera();
  };

  if (error) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Alert severity="error" sx={{ mb: 2, textAlign: 'left' }}>
          {error}
        </Alert>
        {!isSecureContext() && (
          <Box sx={{ mb: 2, p: 2, bgcolor: 'warning.lighter', borderRadius: 1 }}>
            <HttpsIcon sx={{ fontSize: 40, color: 'warning.main', mb: 1 }} />
            <Typography variant="body2" color="text.secondary">
              Camera access requires a secure HTTPS connection.
              {isIOS() && ' On iOS, you can also try adding this site to your Home Screen.'}
            </Typography>
          </Box>
        )}
        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
          {permissionDenied && (
            <Button variant="outlined" onClick={handleRetryPermission}>
              Try Again
            </Button>
          )}
          <Button variant="contained" onClick={handleCancel}>
            Close
          </Button>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ position: 'relative', width: '100%', height: '100%', minHeight: 300 }}>
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {loading && (
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: 'grey.900',
            zIndex: 10,
          }}
        >
          <CircularProgress sx={{ color: 'white', mb: 2 }} />
          <Typography variant="body2" sx={{ color: 'grey.400' }}>
            {isIOS() ? 'Allow camera access when prompted...' : 'Starting camera...'}
          </Typography>
        </Box>
      )}

      {capturedImage ? (
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          <Box sx={{ flexGrow: 1, position: 'relative', overflow: 'hidden' }}>
            <img
              src={capturedImage}
              alt="Captured"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
              }}
            />
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, p: 2 }}>
            <Button variant="outlined" onClick={handleRetake}>
              Retake
            </Button>
            <Button variant="contained" color="primary" onClick={handleConfirm}>
              Use Photo
            </Button>
          </Box>
        </Box>
      ) : (
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          <Box sx={{ flexGrow: 1, position: 'relative', overflow: 'hidden', bgcolor: 'black' }}>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              webkit-playsinline="true"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              }}
            />
            <IconButton
              onClick={handleCancel}
              sx={{
                position: 'absolute',
                top: 8,
                right: 8,
                color: 'white',
                bgcolor: 'rgba(0,0,0,0.5)',
                '&:hover': { bgcolor: 'rgba(0,0,0,0.7)' },
              }}
            >
              <CloseIcon />
            </IconButton>
            <IconButton
              onClick={handleFlipCamera}
              sx={{
                position: 'absolute',
                top: 8,
                left: 8,
                color: 'white',
                bgcolor: 'rgba(0,0,0,0.5)',
                '&:hover': { bgcolor: 'rgba(0,0,0,0.7)' },
              }}
            >
              <FlipCameraIosIcon />
            </IconButton>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 2, bgcolor: 'grey.900' }}>
            <IconButton
              onClick={handleCapture}
              disabled={loading}
              sx={{
                bgcolor: 'white',
                width: 64,
                height: 64,
                '&:hover': { bgcolor: 'grey.200' },
                '&:disabled': { bgcolor: 'grey.500' },
              }}
            >
              <CameraAltIcon sx={{ fontSize: 32, color: 'grey.800' }} />
            </IconButton>
          </Box>
        </Box>
      )}
    </Box>
  );
};

export default CameraCapture;
