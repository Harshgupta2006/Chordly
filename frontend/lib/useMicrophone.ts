import { useCallback, useEffect, useRef } from "react";

/** One cancellable PCM capture session. Call start directly from a user gesture. */
export function useMicrophone(onError: (message: string) => void) {
  const context = useRef<AudioContext | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const capture = useRef<AudioWorkletNode | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const release = useCallback(() => {
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = null;
    if (capture.current) {
      capture.current.port.onmessage = null;
      capture.current.port.close();
      capture.current.disconnect();
      capture.current = null;
    }
    stream.current?.getTracks().forEach(track => { track.onended = null; track.stop(); });
    stream.current = null;
    if (context.current) {
      context.current.onstatechange = null;
      void context.current.close().catch(() => {});
      context.current = null;
    }
  }, []);

  const fail = useCallback((message: string) => {
    release();
    onError(message);
  }, [onError, release]);

  useEffect(() => {
    const interrupt = () => {
      if (context.current) fail("Microphone stopped when the page was hidden. Keep this page open and try again.");
    };
    const visibility = () => { if (document.hidden) interrupt(); };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", interrupt);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", interrupt);
      release();
    };
  }, [fail, release]);

  const start = async (onSamples: (pcm: Float32Array) => void, onReady: (rate: number) => void) => {
    if (context.current) return;
    let session: AudioContext | null = null;
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
        throw new Error("Microphone access needs a supported browser on localhost or HTTPS.");
      }
      session = new AudioContext();
      context.current = session;
      if (!session.audioWorklet || typeof AudioWorkletNode === "undefined") {
        throw new Error("This browser does not support live microphone capture.");
      }
      // Resume during the tap, before the permission prompt loses user activation.
      const resumed = session.resume();
      void resumed.catch(() => {});
      timeout.current = setTimeout(() => {
        if (context.current === session) fail("Microphone startup timed out. Check the browser permission prompt and try again.");
      }, 20000);
      const input = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      if (context.current !== session) {
        input.getTracks().forEach(track => track.stop());
        return;
      }
      stream.current = input;
      input.getAudioTracks().forEach(track => {
        track.onended = () => {
          if (context.current === session) fail("Microphone access ended. Reconnect your microphone and try again.");
        };
      });
      await session.audioWorklet.addModule("/audio-capture-worklet.js");
      await resumed;
      if (context.current !== session) return;
      if (session.state !== "running") throw new Error("Audio capture is paused. Keep this page open and try again.");
      const node = new AudioWorkletNode(session, "chordly-capture");
      capture.current = node;
      node.port.onmessage = (event: MessageEvent<Float32Array>) => onSamples(event.data);
      node.onprocessorerror = () => { if (context.current === session) fail("Audio capture was interrupted. Please try again."); };
      session.createMediaStreamSource(input).connect(node);
      node.connect(session.destination);
      session.onstatechange = () => {
        if (context.current === session && session?.state !== "running") fail("Audio capture was interrupted. Keep this page open and try again.");
      };
      if (timeout.current) clearTimeout(timeout.current);
      timeout.current = null;
      onReady(session.sampleRate);
    } catch (cause) {
      if (session && context.current !== session) return;
      const name = cause instanceof DOMException ? cause.name : "";
      fail(name === "NotAllowedError" ? "Microphone permission was denied. Allow access in your browser settings, then retry."
        : name === "NotFoundError" ? "No microphone was found. Connect one and try again."
        : name === "NotReadableError" ? "The microphone is unavailable or in use by another application."
        : cause instanceof Error ? cause.message : "Could not start the microphone.");
    }
  };
  return { start, release };
}
