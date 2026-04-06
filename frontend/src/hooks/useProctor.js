/**
 * useProctor.js
 * Central React hook that:
 *  1. Opens webcam via WebRTC
 *  2. Captures a frame every CAPTURE_INTERVAL ms
 *  3. Sends it to the Node backend via Socket.io
 *  4. Receives and exposes analysis results in real-time
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';

const BACKEND_URL       = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000';
const CAPTURE_INTERVAL  = 3000;   // ms between frame captures
const CANVAS_WIDTH      = 640;
const CANVAS_HEIGHT     = 480;

export default function useProctor({ sessionId, token, enabled = true }) {
  const videoRef    = useRef(null);
  const canvasRef   = useRef(document.createElement('canvas'));
  const socketRef   = useRef(null);
  const intervalRef = useRef(null);

  const [cameraReady,   setCameraReady]   = useState(false);
  const [connected,     setConnected]     = useState(false);
  const [analysis,      setAnalysis]      = useState(null);
  const [alerts,        setAlerts]        = useState([]);
  const [riskScore,     setRiskScore]     = useState(0);
  const [error,         setError]         = useState(null);
  const [sessionTerminated, setSessionTerminated] = useState(null);

  // ── 1. Init webcam ─────────────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT, facingMode: 'user' },
        audio: false,
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play();
          setCameraReady(true);
        };
      }
      return stream;
    } catch (err) {
      setError(`Camera error: ${err.message}`);
      return null;
    }
  }, []);

  const stopCamera = useCallback(() => {
    const stream = videoRef.current?.srcObject;
    if (stream) stream.getTracks().forEach(t => t.stop());
    setCameraReady(false);
  }, []);

  // ── 2. Capture frame as base64 ─────────────────────────────────────────────
  const captureFrame = useCallback(() => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || video.readyState < 2) return null;

    canvas.width  = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    return canvas.toDataURL('image/jpeg', 0.8);   // base64 JPEG
  }, []);

  // ── 3. Socket.io connection ────────────────────────────────────────────────
  useEffect(() => {
    if (!token || !sessionId || !enabled) return;

    const socket = io(BACKEND_URL, {
      auth: { token },
      transports: ['websocket'],
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('join-session', { sessionId });
    });

    socket.on('session-joined', (data) => {
      console.log('Joined proctoring session:', data.sessionId);
    });

    socket.on('proctor-result', (result) => {
      setAnalysis(result);
      setRiskScore(result.risk_score);

      if (result.alerts?.length) {
        setAlerts(prev => [
          { ...result, time: new Date().toLocaleTimeString() },
          ...prev.slice(0, 49),
        ]);
      }
    });

    socket.on('proctor-error', ({ message }) => {
      console.warn('Proctor error:', message);
    });
    socket.on('session-terminated', ({ reason, message }) => {
      console.error('Session terminated:', reason);
      setSessionTerminated({ reason, message });
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', (err) => setError(err.message));

    return () => {
      socket.disconnect();
      setConnected(false);
    };
  }, [token, sessionId, enabled]);

  // ── 4. Tab visibility detection ───────────────────────────────────────────
  useEffect(() => {
    if (!sessionId || !enabled) return;
    const handleVisibility = () => {
      if (document.hidden) {
        socketRef.current?.emit('tab-hidden', { sessionId });
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [sessionId, enabled]);

  // ── 5. Start / stop frame capture loop ────────────────────────────────────
  const startCapturing = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      if (!socketRef.current?.connected) return;
      const frame = captureFrame();
      if (frame) {
        socketRef.current.emit('proctor-frame', { sessionId, imageBase64: frame });
      }
    }, CAPTURE_INTERVAL);
  }, [captureFrame, sessionId]);

  const stopCapturing = useCallback(() => {
    clearInterval(intervalRef.current);
    intervalRef.current = null;
  }, []);

  // Auto-start capturing when camera is ready AND socket is connected
  useEffect(() => {
    if (cameraReady && connected && enabled) {
      startCapturing();
    } else {
      stopCapturing();
    }
    return () => stopCapturing();
  }, [cameraReady, connected, enabled, startCapturing, stopCapturing]);

  return {
    videoRef,
    cameraReady,
    connected,
    analysis,
    alerts,
    riskScore,
    error,
    sessionTerminated,
    startCamera,
    stopCamera,
    captureFrame,
  };
}
