/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Power, Mic, Wifi, WifiOff, Loader2, ShieldCheck, Activity } from 'lucide-react';
import { connectToJarvis } from './services/jarvisService';

type AppState = 'loading' | 'activation' | 'connecting' | 'hud' | 'error';

export default function App() {
  const [appState, setAppState] = useState<AppState>('loading');
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [statusText, setStatusText] = useState('INITIALIZING GEMINI SYSTEMS...');
  const [lastMessage, setLastMessage] = useState('');
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected');
  const [audioLevel, setAudioLevel] = useState(0);
  const [assistantLevel, setAssistantLevel] = useState(0);
  const jarvisRef = useRef<{ disconnect: () => Promise<void> } | null>(null);

  // Initial loading simulation
  useEffect(() => {
    if (appState === 'loading') {
      const interval = setInterval(() => {
        setLoadingProgress((prev) => {
          if (prev >= 100) {
            clearInterval(interval);
            setTimeout(() => setAppState('activation'), 500);
            return 100;
          }
          return prev + 2;
        });
      }, 50);
      return () => clearInterval(interval);
    }
  }, [appState]);

  const handleActivate = async () => {
    setAppState('connecting');
    try {
      const jarvis = await connectToJarvis(
        (msg) => setLastMessage(msg),
        (status) => {
          setConnectionStatus(status);
          if (status === 'connected') {
            setAppState('hud');
          } else if (status === 'error') {
            setAppState('error');
          }
        },
        (level) => setAudioLevel(level),
        (level) => setAssistantLevel(level)
      );
      jarvisRef.current = jarvis;
    } catch (err) {
      console.error(err);
      setAppState('error');
    }
  };

  const handleDeactivate = async () => {
    if (jarvisRef.current) {
      await jarvisRef.current.disconnect();
      jarvisRef.current = null;
    }
    setAppState('activation');
  };

  return (
    <div className="relative h-screen w-screen flex flex-col items-center justify-center overflow-hidden">
      <div className="star-field" />
      <div className="scanline" />

      {/* Decorative HUD Corners */}
      <div className="absolute top-8 left-8 w-12 h-12 border-t-2 border-l-2 border-jarvis-cyan opacity-40" />
      <div className="absolute top-8 right-8 w-12 h-12 border-t-2 border-r-2 border-jarvis-cyan opacity-40" />
      <div className="absolute bottom-8 left-8 w-12 h-12 border-b-2 border-l-2 border-jarvis-cyan opacity-40" />
      <div className="absolute bottom-8 right-8 w-12 h-12 border-b-2 border-r-2 border-jarvis-cyan opacity-40" />

      <AnimatePresence mode="wait">
        {appState === 'loading' && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center"
          >
            <h1 className="text-6xl font-display font-bold tracking-[0.2em] text-jarvis-cyan glow-cyan mb-8">
              JARVIS
            </h1>
            <div className="w-64 h-1 bg-white/10 rounded-full overflow-hidden mb-4">
              <motion.div
                className="h-full bg-jarvis-cyan box-glow-cyan"
                initial={{ width: 0 }}
                animate={{ width: `${loadingProgress}%` }}
              />
            </div>
            <p className="text-[10px] font-mono tracking-[0.3em] text-jarvis-cyan/70">
              {statusText}
            </p>
          </motion.div>
        )}

        {appState === 'activation' && (
          <motion.div
            key="activation"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.1 }}
            className="flex flex-col items-center"
          >
            <button
              onClick={handleActivate}
              className="group relative w-24 h-24 rounded-full bg-black border-2 border-jarvis-cyan/30 flex items-center justify-center transition-all hover:border-jarvis-cyan hover:box-glow-cyan"
            >
              <div className="absolute inset-0 rounded-full bg-jarvis-cyan/5 group-hover:bg-jarvis-cyan/10 transition-colors" />
              <Power className="w-10 h-10 text-jarvis-cyan glow-cyan" />
            </button>
            <p className="mt-12 text-xs font-display tracking-[0.4em] text-jarvis-cyan glow-cyan uppercase">
              Активировать JARVIS
            </p>
          </motion.div>
        )}

        {appState === 'connecting' && (
          <motion.div
            key="connecting"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center"
          >
            <div className="relative w-48 h-48 flex items-center justify-center">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                className="absolute inset-0 border-2 border-dashed border-jarvis-cyan/20 rounded-full"
              />
              <motion.div
                animate={{ rotate: -360 }}
                transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                className="absolute inset-4 border border-jarvis-cyan/40 rounded-full"
              />
              <Mic className="w-12 h-12 text-jarvis-cyan animate-pulse" />
            </div>
            <p className="mt-8 text-xs font-mono tracking-[0.2em] text-jarvis-cyan glow-cyan">
              ПОДКЛЮЧЕНИЕ К GEMINI...
            </p>
          </motion.div>
        )}

        {appState === 'hud' && (
          <motion.div
            key="hud"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="w-full h-full flex flex-col items-center justify-center p-8"
          >
            {/* Main Visualizer */}
            <div className="relative w-96 h-96 flex items-center justify-center">
              {/* Radial Audio Lines (The "Voice" Visualization) */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                {[...Array(90)].map((_, i) => (
                  <motion.div
                    key={i}
                    style={{
                      position: 'absolute',
                      width: '2px',
                      backgroundColor: 'var(--color-jarvis-cyan)',
                      transformOrigin: 'bottom center',
                      rotate: `${i * 4}deg`,
                      bottom: '50%',
                    }}
                    animate={{ 
                      height: 8 + (Math.max(audioLevel, assistantLevel) * 100 * (0.7 + Math.random() * 0.3)),
                      opacity: 0.4 + (Math.max(audioLevel, assistantLevel) * 0.6),
                      translateY: -120 - (Math.max(audioLevel, assistantLevel) * 30)
                    }}
                    transition={{ type: "spring", stiffness: 400, damping: 40 }}
                    className="box-glow-cyan"
                  />
                ))}
              </div>

              {/* Central Mic Icon */}
              <div className="relative z-10 flex flex-col items-center">
                <div className="p-6 rounded-full bg-jarvis-cyan/5 border border-jarvis-cyan/20 backdrop-blur-sm">
                  <Mic className="w-12 h-12 text-jarvis-cyan glow-cyan-lg" />
                </div>
              </div>
            </div>

            {/* Subtitles / Transcription Area */}
            <div className="absolute bottom-40 max-w-2xl text-center px-6">
              <p className="text-lg font-display font-light text-jarvis-cyan/90 glow-cyan leading-relaxed min-h-[1.5em]">
                {lastMessage}
              </p>
            </div>

            {/* Controls */}
            <div className="absolute bottom-20 flex items-center gap-8">
              <button
                onClick={handleDeactivate}
                className="p-4 rounded-full border border-red-500/30 bg-red-500/5 text-red-500 hover:bg-red-500/10 transition-colors"
                title="Отключить"
              >
                <Power className="w-6 h-6" />
              </button>
            </div>
          </motion.div>
        )}

        {appState === 'error' && (
          <motion.div
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center"
          >
            <div className="w-20 h-20 rounded-full border-2 border-red-500 flex items-center justify-center mb-8">
              <WifiOff className="w-10 h-10 text-red-500" />
            </div>
            <h2 className="text-xl font-display text-red-500 mb-4 uppercase tracking-widest">Ошибка протокола</h2>
            <p className="text-sm font-mono text-white/60 mb-8">Не удалось установить связь с ядром ИИ.</p>
            <button
              onClick={() => setAppState('activation')}
              className="px-8 py-3 rounded-full border border-jarvis-cyan text-jarvis-cyan hover:bg-jarvis-cyan/10 transition-all uppercase text-xs tracking-widest"
            >
              Перезагрузить системы
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
