import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
// @ts-ignore - dashjs definition not available in this environment
import dashjs from 'dashjs';
import { 
  AlertTriangle, Loader2, Settings, Check, RefreshCw, Captions, 
  Volume2, Volume1, VolumeX, PictureInPicture2,
  Play, Pause, Rewind, FastForward, Maximize,
  Calendar, Info, Radio, Upload, Gauge
} from 'lucide-react';
import { EPGProgram } from '../types';

interface VideoPlayerProps {
  url: string;
  title: string;
  tvgId?: string;
  currentProgram?: EPGProgram | null;
  nextProgram?: EPGProgram | null;
  isEpgLoading?: boolean;
  autoPlay?: boolean;
  onStreamReady?: () => void;
}

interface QualityLevel {
  index: number; // -1 for auto
  height: number;
  bitrate?: number;
  label: string;
}

interface SubtitleTrack {
  index: number; // -1 for off, 999 for local
  label: string;
  lang?: string;
}

interface SubtitleSettings {
  size: number; // Percentage
  color: string; // Hex
}

// Helper to convert SRT to VTT for browser compatibility
const srtToVtt = (srtContent: string): string => {
  let vtt = "WEBVTT\n\n";
  // Remove possible BOM
  srtContent = srtContent.replace(/^\uFEFF/g, '');
  
  // Replace comma with dot in timestamps (00:00:20,000 --> 00:00:20.000)
  vtt += srtContent.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
  return vtt;
};

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ 
  url, 
  title, 
  tvgId,
  currentProgram,
  nextProgram,
  isEpgLoading = false,
  autoPlay = true, 
  onStreamReady 
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Player instances refs
  const hlsRef = useRef<Hls | null>(null);
  const dashRef = useRef<any | null>(null);

  // State
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Quality State
  const [qualities, setQualities] = useState<QualityLevel[]>([]);
  const [currentQuality, setCurrentQuality] = useState<number>(-1); // -1 = Auto
  const [showSettings, setShowSettings] = useState(false);

  // Speed State
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);

  // Subtitle State
  const [subtitles, setSubtitles] = useState<SubtitleTrack[]>([]);
  const [currentSubtitle, setCurrentSubtitle] = useState<number>(-1); // -1 = Off
  const [showSubtitlesMenu, setShowSubtitlesMenu] = useState(false);
  const [localSubtitleUrl, setLocalSubtitleUrl] = useState<string | null>(null);
  
  // Subtitle Appearance
  const [subSettings, setSubSettings] = useState<SubtitleSettings>({
    size: 100,
    color: '#FFFFFF'
  });

  // Volume State
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

  // Playback State
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  // PiP State
  const [isPipActive, setIsPipActive] = useState(false);
  
  // Zoom/Aspect Ratio State
  const [zoomMode, setZoomMode] = useState<'contain' | 'cover' | 'fill'>('contain');

  const [playerType, setPlayerType] = useState<'hls' | 'dash' | 'native' | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // EPG Helper Functions
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  const getProgressPercent = (start: Date, end: Date) => {
    const now = new Date().getTime();
    const s = start.getTime();
    const e = end.getTime();
    if (now < s) return 0;
    if (now > e) return 100;
    return ((now - s) / (e - s)) * 100;
  };

  const formatSeconds = (seconds: number) => {
    if (!seconds || isNaN(seconds) || !isFinite(seconds)) return '00:00';
    
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Helper to close settings when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowSettings(false);
        setShowSubtitlesMenu(false);
        setShowSpeedMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Sync Video Events
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const updateVolumeState = () => {
      setVolume(video.volume);
      setIsMuted(video.muted);
    };

    const updatePlayState = () => {
      setIsPlaying(!video.paused);
    };

    const updateTimeState = () => {
      if (!isDragging) {
        setCurrentTime(video.currentTime);
      }
    };

    const updateDurationState = () => {
      setDuration(video.duration);
    };

    const handleEnterPip = () => setIsPipActive(true);
    const handleLeavePip = () => setIsPipActive(false);

    video.addEventListener('volumechange', updateVolumeState);
    video.addEventListener('play', updatePlayState);
    video.addEventListener('pause', updatePlayState);
    video.addEventListener('timeupdate', updateTimeState);
    video.addEventListener('durationchange', updateDurationState);
    video.addEventListener('loadedmetadata', updateDurationState);
    video.addEventListener('enterpictureinpicture', handleEnterPip);
    video.addEventListener('leavepictureinpicture', handleLeavePip);

    // Initialize
    updateVolumeState();
    updatePlayState();
    
    return () => {
      video.removeEventListener('volumechange', updateVolumeState);
      video.removeEventListener('play', updatePlayState);
      video.removeEventListener('pause', updatePlayState);
      video.removeEventListener('timeupdate', updateTimeState);
      video.removeEventListener('durationchange', updateDurationState);
      video.removeEventListener('loadedmetadata', updateDurationState);
      video.removeEventListener('enterpictureinpicture', handleEnterPip);
      video.removeEventListener('leavepictureinpicture', handleLeavePip);
    };
  }, [isDragging]);

  // Inject Dynamic Subtitle Styles
  useEffect(() => {
    const styleId = 'iptv-player-subtitle-styles';
    let styleTag = document.getElementById(styleId);
    
    if (!styleTag) {
      styleTag = document.createElement('style');
      styleTag.id = styleId;
      document.head.appendChild(styleTag);
    }

    styleTag.textContent = `
      video::cue {
        font-size: ${subSettings.size}% !important;
        color: ${subSettings.color} !important;
        background-color: rgba(0, 0, 0, 0.6) !important;
        text-shadow: 1px 1px 2px black;
      }
      /* Webkit specific */
      video::-webkit-media-text-track-display {
        font-size: ${subSettings.size}% !important;
        color: ${subSettings.color} !important;
      }
      input[type=range]::-webkit-slider-thumb {
        -webkit-appearance: none;
        height: 12px;
        width: 12px;
        border-radius: 50%;
        background: #3b82f6;
        cursor: pointer;
        margin-top: -4px;
      }
      input[type=range]::-webkit-slider-runnable-track {
        width: 100%;
        height: 4px;
        cursor: pointer;
        background: rgba(255, 255, 255, 0.2);
        border-radius: 2px;
      }
    `;

    return () => {
      // Optional: cleanup styles if needed, but keeping them is fine for user session
    };
  }, [subSettings]);

  // Cleanup local subtitle URL on unmount or change
  useEffect(() => {
    return () => {
      if (localSubtitleUrl) {
        URL.revokeObjectURL(localSubtitleUrl);
      }
    };
  }, [localSubtitleUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Reset state
    setError(null);
    setLoading(true);
    setQualities([]);
    setCurrentQuality(-1);
    setSubtitles([]);
    setCurrentSubtitle(-1);
    setLocalSubtitleUrl(null); // Reset local subtitle
    setPlayerType(null);
    setShowSettings(false);
    setShowSubtitlesMenu(false);
    setShowSpeedMenu(false);
    setPlaybackSpeed(1);
    setIsPipActive(false);
    setCurrentTime(0);
    setDuration(0);

    // Cleanup previous players
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (dashRef.current) {
      dashRef.current.reset();
      dashRef.current = null;
    }

    // Remove old tracks
    const oldTracks = video.querySelectorAll('track');
    oldTracks.forEach(t => t.remove());

    // Determine stream type
    const isDash = url.endsWith('.mpd');
    const isHls = url.endsWith('.m3u8') || url.includes('m3u8'); // Fallback check

    const handleLoadedData = () => {
        setLoading(false);
    };
    video.addEventListener('loadeddata', handleLoadedData);

    try {
      if (isDash) {
        // --- DASH SETUP ---
        setPlayerType('dash');
        const player = dashjs.MediaPlayer().create();
        dashRef.current = player;
        
        player.initialize(video, url, autoPlay);
        
        player.on(dashjs.MediaPlayer.events.STREAM_INITIALIZED, () => {
          setLoading(false);
          if (onStreamReady) onStreamReady();
          
          // Qualities
          const bitrates = (player as any).getBitrateInfoListFor('video');
          const levels: QualityLevel[] = bitrates.map((b: any) => ({
            index: b.qualityIndex,
            height: b.height,
            bitrate: b.bitrate,
            label: b.height ? `${b.height}p` : `Bitrate ${Math.round(b.bitrate / 1000)}k`
          }));
          levels.sort((a, b) => b.height - a.height);
          setQualities(levels);

          // Subtitles (Text Tracks)
          const textTracks = player.getTracksFor('text');
          const subs: SubtitleTrack[] = textTracks.map((t: any, idx: number) => ({
            index: idx,
            label: t.labels?.[0]?.text || t.lang || `Faixa ${idx + 1}`,
            lang: t.lang
          }));
          setSubtitles(subs);
        });

        player.on(dashjs.MediaPlayer.events.TEXT_TRACKS_ADDED, () => {
            // Update subtitles if added dynamically
            const textTracks = player.getTracksFor('text');
            const subs: SubtitleTrack[] = textTracks.map((t: any, idx: number) => ({
              index: idx,
              label: t.labels?.[0]?.text || t.lang || `Faixa ${idx + 1}`,
              lang: t.lang
            }));
            setSubtitles(subs);
        });

        player.on(dashjs.MediaPlayer.events.ERROR, (e: any) => {
          console.error("DASH Error", e);
          setError("Erro na reprodução DASH.");
          setLoading(false);
        });

      } else if (Hls.isSupported() && isHls) {
        // --- HLS SETUP (Hls.js) ---
        setPlayerType('hls');
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          capLevelToPlayerSize: true
        });
        hlsRef.current = hls;

        hls.loadSource(url);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
          setLoading(false);
          if (onStreamReady) onStreamReady();

          if (autoPlay) {
            video.play().catch(e => console.error("Autoplay blocked (HLS)", e));
          }

          // Qualities
          const levels: QualityLevel[] = data.levels.map((level, index) => ({
            index: index,
            height: level.height,
            bitrate: level.bitrate,
            label: level.height ? `${level.height}p` : `L${index}`
          }));
          levels.sort((a, b) => b.height - a.height);
          setQualities(levels);
        });

        // Subtitles
        hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, (_, data) => {
           const subs: SubtitleTrack[] = data.subtitleTracks.map((t, idx) => ({
             index: idx,
             label: t.name || t.lang || `Faixa ${idx + 1}`,
             lang: t.lang
           }));
           setSubtitles(subs);
        });

        hls.on(Hls.Events.ERROR, (_, data) => {
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                hls.startLoad();
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                hls.recoverMediaError();
                break;
              default:
                hls.destroy();
                setError("Erro fatal de reprodução.");
                setLoading(false);
                break;
            }
          }
        });

      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // --- NATIVE HLS (Safari) ---
        setPlayerType('native');
        video.src = url;
        
        const onLoadedMetadata = () => {
           if (onStreamReady) onStreamReady();
           if (autoPlay) {
             video.play().catch(e => console.error("Autoplay blocked (Native)", e));
           }

           // Try to get native text tracks
           if (video.textTracks && video.textTracks.length > 0) {
              const subs: SubtitleTrack[] = [];
              for(let i=0; i< video.textTracks.length; i++) {
                 const t = video.textTracks[i];
                 subs.push({
                    index: i,
                    label: t.label || t.language || `Track ${i+1}`,
                    lang: t.language
                 });
              }
              setSubtitles(subs);
           }
        };
        video.addEventListener('loadedmetadata', onLoadedMetadata, { once: true });
        
      } else {
        // --- GENERIC/UNSUPPORTED ---
        setLoading(false);
        setError("Formato não suportado ou navegador incompatível.");
      }
    } catch (err) {
      console.error("Player initialization error", err);
      setError("Erro ao inicializar o player.");
      setLoading(false);
    }

    return () => {
      video.removeEventListener('loadeddata', handleLoadedData);
      if (hlsRef.current) hlsRef.current.destroy();
      if (dashRef.current) dashRef.current.reset();
    };
  }, [url, autoPlay, reloadKey, onStreamReady]);

  const changeQuality = (index: number) => {
    setCurrentQuality(index);
    setShowSettings(false);

    if (playerType === 'hls' && hlsRef.current) {
      hlsRef.current.currentLevel = index; // -1 is auto
    } else if (playerType === 'dash' && dashRef.current) {
      const settings = {
        streaming: {
          abr: {
            autoSwitchBitrate: {
              video: index === -1
            }
          }
        }
      };
      dashRef.current.updateSettings(settings);
      
      if (index !== -1) {
        dashRef.current.setQualityFor('video', index);
      }
    }
  };

  const handleSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed);
    if (videoRef.current) {
        videoRef.current.playbackRate = speed;
    }
    setShowSpeedMenu(false);
  };

  const changeSubtitle = (index: number) => {
    setCurrentSubtitle(index);
    // Don't close menu immediately
    
    const video = videoRef.current;
    if (!video) return;

    // Handle Local Track (index 999)
    const isLocal = index === 999;
    
    // 1. Manage Native Tracks (including the uploaded one)
    for(let i=0; i < video.textTracks.length; i++) {
       const track = video.textTracks[i];
       if (isLocal && track.label === "Local File") {
          track.mode = 'showing';
       } else {
          track.mode = 'hidden';
       }
    }

    if (isLocal) {
        // If local is selected, disable HLS/Dash internal text engines
        if (playerType === 'hls' && hlsRef.current) {
           hlsRef.current.subtitleTrack = -1; 
        } else if (playerType === 'dash' && dashRef.current) {
           dashRef.current.enableText(false);
        }
        return;
    }

    // 2. Manage HLS/Dash Tracks
    if (playerType === 'hls' && hlsRef.current) {
      hlsRef.current.subtitleTrack = index; // -1 disables
    } else if (playerType === 'dash' && dashRef.current) {
      dashRef.current.setTextTrack(index); // -1 disables usually, or use enableText
      dashRef.current.enableText(index !== -1);
    } else if (playerType === 'native') {
       // Native text track switching
       for(let i=0; i < video.textTracks.length; i++) {
          // Note: Local track logic handled above, this is for streaming tracks
          if (video.textTracks[i].label !== "Local File") {
             video.textTracks[i].mode = (i === index) ? 'showing' : 'hidden';
          }
       }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      let vttContent = content;

      // Convert SRT to VTT if needed
      if (file.name.toLowerCase().endsWith('.srt')) {
         vttContent = srtToVtt(content);
      }

      // Create Blob
      const blob = new Blob([vttContent], { type: 'text/vtt' });
      if (localSubtitleUrl) URL.revokeObjectURL(localSubtitleUrl);
      const url = URL.createObjectURL(blob);
      setLocalSubtitleUrl(url);

      // Append to Video
      const video = videoRef.current;
      if (video) {
        // Remove existing local track if any
        const existingTrack = video.querySelector('track[label="Local File"]');
        if (existingTrack) existingTrack.remove();

        const track = document.createElement('track');
        track.kind = 'subtitles';
        track.label = 'Local File';
        track.srclang = 'pt';
        track.src = url;
        track.default = true;
        video.appendChild(track);

        // Update State
        const newTrack: SubtitleTrack = {
           index: 999,
           label: `Local (${file.name})`,
           lang: 'local'
        };

        setSubtitles(prev => {
           // Remove old local track from state if exists
           const filtered = prev.filter(s => s.index !== 999);
           return [...filtered, newTrack];
        });

        // Auto-select the uploaded subtitle
        // Need to delay slightly to allow DOM update
        setTimeout(() => changeSubtitle(999), 100);
      }
    };
    reader.readAsText(file);
  };

  const cycleZoomMode = (e: React.MouseEvent) => {
    e.stopPropagation();
    const modes: ('contain' | 'cover' | 'fill')[] = ['contain', 'cover', 'fill'];
    const nextIndex = (modes.indexOf(zoomMode) + 1) % modes.length;
    setZoomMode(modes[nextIndex]);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVol = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.volume = newVol;
      videoRef.current.muted = newVol === 0;
    }
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
    }
  };

  const togglePip = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (videoRef.current && videoRef.current !== document.pictureInPictureElement) {
        await videoRef.current.requestPictureInPicture();
      }
    } catch (err) {
      console.error("Failed to toggle PiP", err);
    }
  };

  const handleReload = (e: React.MouseEvent) => {
    e.stopPropagation();
    setReloadKey(prev => prev + 1);
  };

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play();
      } else {
        videoRef.current.pause();
      }
    }
  };

  const seekRelative = (seconds: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (videoRef.current) {
      videoRef.current.currentTime += seconds;
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
  };

  const onSeekStart = () => setIsDragging(true);
  const onSeekEnd = () => setIsDragging(false);

  const isLive = !isFinite(duration) || duration === Infinity;

  return (
    <div className="w-full space-y-4">
      {/* Video Container (Always Dark) */}
      <div ref={containerRef} className="relative w-full aspect-video bg-black rounded-xl overflow-hidden shadow-2xl border border-gray-800 group">
        
        {/* Loading Overlay */}
        {loading && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-20 text-white">
            <Loader2 className="w-10 h-10 animate-spin mb-2 text-blue-500" />
            <p className="text-sm font-medium animate-pulse">Carregando transmissão...</p>
          </div>
        )}

        {/* Error Overlay */}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/95 z-30 text-white p-6 text-center backdrop-blur-sm">
            <AlertTriangle className="w-12 h-12 text-red-500 mb-3" />
            <h3 className="text-lg font-bold mb-1">Falha na Reprodução</h3>
            <p className="text-gray-400 text-sm max-w-md mb-4">{error}</p>
            <button 
              onClick={handleReload}
              className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition-colors"
            >
              <RefreshCw size={16} /> Tentar Novamente
            </button>
          </div>
        )}

        {/* Center Controls Overlay (Play/Pause/Seek) */}
        {!loading && !error && (
          <div className={`absolute inset-0 flex items-center justify-center gap-8 z-10 pointer-events-none transition-opacity duration-300 ${!isPlaying ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
            <button 
              onClick={(e) => seekRelative(-10, e)} 
              className="pointer-events-auto p-3 rounded-full bg-black/40 hover:bg-black/60 text-white backdrop-blur-md transition-transform hover:scale-110 flex flex-col items-center justify-center group/btn"
              title="Voltar 10s"
            >
              <Rewind size={24} />
              <span className="text-[10px] font-bold mt-1 opacity-70 group-hover/btn:opacity-100">10s</span>
            </button>
            
            <button 
              onClick={togglePlay} 
              className="pointer-events-auto p-5 rounded-full bg-blue-600/90 hover:bg-blue-500 text-white shadow-xl transition-transform hover:scale-110 flex items-center justify-center"
              title={isPlaying ? "Pausar" : "Reproduzir"}
            >
              {isPlaying ? <Pause size={32} fill="currentColor" className="text-white" /> : <Play size={32} fill="currentColor" className="ml-1 text-white" />}
            </button>

            <button 
              onClick={(e) => seekRelative(10, e)} 
              className="pointer-events-auto p-3 rounded-full bg-black/40 hover:bg-black/60 text-white backdrop-blur-md transition-transform hover:scale-110 flex flex-col items-center justify-center group/btn"
              title="Avançar 10s"
            >
              <FastForward size={24} />
              <span className="text-[10px] font-bold mt-1 opacity-70 group-hover/btn:opacity-100">10s</span>
            </button>
          </div>
        )}

        {/* Custom Header Overlay (Title & Controls) */}
        <div className="absolute top-0 left-0 w-full p-4 flex justify-between items-start bg-gradient-to-b from-black/80 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10 pointer-events-none">
          <h2 className="text-white font-bold text-lg drop-shadow-md select-none pointer-events-auto truncate max-w-[40%]">{title}</h2>
          
          <div className="flex items-center gap-2 pointer-events-auto">
            
            {/* Volume Control */}
            <div className="group/volume flex items-center bg-black/50 backdrop-blur-md rounded-lg border border-white/10 transition-all hover:bg-black/70">
              <button 
                onClick={toggleMute}
                className="p-1.5 text-white hover:text-blue-400 transition-colors"
                title={isMuted ? "Ativar som" : "Mudo"}
              >
                {isMuted || volume === 0 ? <VolumeX size={16} /> : volume < 0.5 ? <Volume1 size={16} /> : <Volume2 size={16} />}
              </button>
              <div className="w-0 overflow-hidden group-hover/volume:w-24 transition-all duration-300 ease-in-out flex items-center">
                <input 
                  type="range" 
                  min="0" 
                  max="1" 
                  step="0.05" 
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-20 h-1 mx-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
              </div>
            </div>

            {/* Zoom Control */}
            <button
              onClick={cycleZoomMode}
              className={`flex items-center gap-2 bg-black/50 hover:bg-black/70 backdrop-blur-md text-white px-3 py-1.5 rounded-lg text-xs font-medium border border-white/10 transition-all ${zoomMode !== 'contain' ? 'text-blue-400 border-blue-500/30' : ''}`}
              title="Modo de Exibição (Zoom)"
            >
              <Maximize size={14} />
              <span className="hidden sm:inline">
                {zoomMode === 'contain' ? 'Normal' : zoomMode === 'cover' ? 'Zoom' : 'Esticar'}
              </span>
            </button>

            {/* Picture-in-Picture Button */}
            {document.pictureInPictureEnabled && (
              <button
                onClick={togglePip}
                className={`flex items-center gap-2 bg-black/50 hover:bg-black/70 backdrop-blur-md text-white px-3 py-1.5 rounded-lg text-xs font-medium border border-white/10 transition-all ${isPipActive ? 'text-blue-400 border-blue-500/30' : ''}`}
                title="Picture-in-Picture"
              >
                <PictureInPicture2 size={14} />
                <span className="hidden sm:inline">PiP</span>
              </button>
            )}

            {/* Refresh Button */}
            <button
              onClick={handleReload}
              className="flex items-center gap-2 bg-black/50 hover:bg-black/70 backdrop-blur-md text-white px-3 py-1.5 rounded-lg text-xs font-medium border border-white/10 transition-all"
              title="Recarregar Stream"
            >
              <RefreshCw size={14} />
              <span className="hidden sm:inline">Atualizar</span>
            </button>

            {/* Subtitles Button */}
            <div className="relative">
                <button
                  onClick={(e) => { e.stopPropagation(); setShowSubtitlesMenu(!showSubtitlesMenu); setShowSettings(false); setShowSpeedMenu(false); }}
                  className={`flex items-center gap-2 bg-black/50 hover:bg-black/70 backdrop-blur-md text-white px-3 py-1.5 rounded-lg text-xs font-medium border border-white/10 transition-all ${currentSubtitle !== -1 ? 'text-blue-400 border-blue-500/30' : ''}`}
                  title="Legendas"
                >
                  <Captions size={14} />
                  <span className="hidden sm:inline">{currentSubtitle !== -1 ? (subtitles.find(s => s.index === currentSubtitle)?.label?.substring(0, 10) || 'Ligado') : 'CC'}</span>
                </button>

                {/* Subtitles Dropdown */}
                {showSubtitlesMenu && (
                  <div className="absolute right-0 top-full mt-2 w-64 bg-gray-900/95 backdrop-blur-xl border border-gray-700 rounded-lg shadow-xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-100 flex flex-col">
                      <div className="px-3 py-2 border-b border-gray-800 text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-950/50">
                        Faixas de Legenda
                      </div>
                      
                      {/* Upload Button */}
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full text-left px-4 py-2 text-xs bg-gray-800/50 hover:bg-gray-800 flex items-center gap-2 text-blue-400 transition-colors border-b border-gray-800"
                      >
                         <Upload size={12} />
                         <span>Carregar Legenda (.srt/.vtt)</span>
                      </button>
                      <input 
                         type="file" 
                         ref={fileInputRef} 
                         className="hidden" 
                         accept=".srt,.vtt"
                         onChange={handleFileUpload}
                      />

                      {/* Tracks List */}
                      <div className="max-h-40 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
                        <button
                            onClick={() => changeSubtitle(-1)}
                            className="w-full text-left px-4 py-2 text-sm hover:bg-blue-600 hover:text-white flex items-center justify-between group/item transition-colors text-gray-200"
                        >
                            <span>Desativado</span>
                            {currentSubtitle === -1 && <Check size={14} className="text-blue-400 group-hover/item:text-white" />}
                        </button>
                        {subtitles.map((s) => (
                            <button
                              key={s.index}
                              onClick={() => changeSubtitle(s.index)}
                              className="w-full text-left px-4 py-2 text-sm hover:bg-blue-600 hover:text-white flex items-center justify-between group/item transition-colors text-gray-300"
                            >
                              <span className="truncate">{s.label}</span>
                              {currentSubtitle === s.index && <Check size={14} className="text-blue-400 group-hover/item:text-white" />}
                            </button>
                        ))}
                      </div>

                      {/* Appearance Settings - Show only if subtitle is selected (or allow configuring always) */}
                      {currentSubtitle !== -1 && (
                        <div className="border-t border-gray-800 bg-gray-950/30 p-3 space-y-3">
                          <div>
                              <div className="text-[10px] font-semibold text-gray-500 uppercase mb-2">Tamanho</div>
                              <div className="flex gap-1">
                                {[
                                    { val: 75, label: 'P' },
                                    { val: 100, label: 'M' },
                                    { val: 150, label: 'G' },
                                    { val: 200, label: 'XG' }
                                ].map((opt) => (
                                    <button
                                      key={opt.val}
                                      onClick={() => setSubSettings(prev => ({...prev, size: opt.val}))}
                                      className={`flex-1 py-1 text-xs rounded border transition-colors ${subSettings.size === opt.val ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-700 text-gray-400 hover:bg-gray-800'}`}
                                    >
                                      {opt.label}
                                    </button>
                                ))}
                              </div>
                          </div>
                          
                          <div>
                              <div className="text-[10px] font-semibold text-gray-500 uppercase mb-2">Cor do Texto</div>
                              <div className="flex gap-2 justify-between">
                                {[
                                    { color: '#FFFFFF', name: 'Branco' },
                                    { color: '#FFFF00', name: 'Amarelo' },
                                    { color: '#00FFFF', name: 'Ciano' },
                                    { color: '#00FF00', name: 'Verde' },
                                    { color: '#FF00FF', name: 'Magenta' }
                                ].map((opt) => (
                                    <button
                                      key={opt.color}
                                      onClick={() => setSubSettings(prev => ({...prev, color: opt.color}))}
                                      className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${subSettings.color === opt.color ? 'border-white shadow-lg' : 'border-gray-600'}`}
                                      style={{ backgroundColor: opt.color }}
                                      title={opt.name}
                                    />
                                ))}
                              </div>
                          </div>
                        </div>
                      )}
                  </div>
                )}
            </div>

            {/* Speed Selector Button */}
            <div className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); setShowSpeedMenu(!showSpeedMenu); setShowSettings(false); setShowSubtitlesMenu(false); }}
                className={`flex items-center gap-2 bg-black/50 hover:bg-black/70 backdrop-blur-md text-white px-3 py-1.5 rounded-lg text-xs font-medium border border-white/10 transition-all ${playbackSpeed !== 1 ? 'text-blue-400 border-blue-500/30' : ''}`}
                title="Velocidade de Reprodução"
              >
                <Gauge size={14} />
                <span className="hidden sm:inline">{playbackSpeed}x</span>
              </button>

              {/* Speed Dropdown */}
              {showSpeedMenu && (
                <div className="absolute right-0 top-full mt-2 w-32 bg-gray-900/95 backdrop-blur-xl border border-gray-700 rounded-lg shadow-xl overflow-hidden py-1 z-50 animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-3 py-2 border-b border-gray-800 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Velocidade
                  </div>
                  <div className="overflow-y-auto">
                    {[0.5, 1, 1.5, 2].map((speed) => (
                      <button
                        key={speed}
                        onClick={() => handleSpeedChange(speed)}
                        className="w-full text-left px-4 py-2 text-sm hover:bg-blue-600 hover:text-white flex items-center justify-between group/item transition-colors text-gray-300"
                      >
                        <span>{speed}x</span>
                        {playbackSpeed === speed && <Check size={14} className="text-blue-400 group-hover/item:text-white" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Quality Selector Button */}
            {(qualities.length > 0) && (
              <div className="relative">
                <button
                  onClick={(e) => { e.stopPropagation(); setShowSettings(!showSettings); setShowSubtitlesMenu(false); setShowSpeedMenu(false); }}
                  className="flex items-center gap-2 bg-black/50 hover:bg-black/70 backdrop-blur-md text-white px-3 py-1.5 rounded-lg text-xs font-medium border border-white/10 transition-all"
                >
                  <Settings size={14} />
                  <span className="hidden sm:inline">
                    {currentQuality === -1 ? 'Auto' : qualities.find(q => q.index === currentQuality)?.label || 'Qualidade'}
                  </span>
                </button>

                {/* Quality Dropdown */}
                {showSettings && (
                  <div className="absolute right-0 top-full mt-2 w-48 bg-gray-900/95 backdrop-blur-xl border border-gray-700 rounded-lg shadow-xl overflow-hidden py-1 z-50 animate-in fade-in zoom-in-95 duration-100">
                    <div className="px-3 py-2 border-b border-gray-800 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Qualidade de Vídeo
                    </div>
                    <div className="max-h-60 overflow-y-auto">
                      <button
                        onClick={() => changeQuality(-1)}
                        className="w-full text-left px-4 py-2 text-sm hover:bg-blue-600 hover:text-white flex items-center justify-between group/item transition-colors text-gray-200"
                      >
                        <span>Automático</span>
                        {currentQuality === -1 && <Check size={14} className="text-blue-400 group-hover/item:text-white" />}
                      </button>
                      {qualities.map((q) => (
                        <button
                          key={q.index}
                          onClick={() => changeQuality(q.index)}
                          className="w-full text-left px-4 py-2 text-sm hover:bg-blue-600 hover:text-white flex items-center justify-between group/item transition-colors text-gray-300"
                        >
                          <span>{q.label}</span>
                          {currentQuality === q.index && <Check size={14} className="text-blue-400 group-hover/item:text-white" />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Bottom Progress Overlay */}
        <div className="absolute bottom-0 left-0 w-full p-4 bg-gradient-to-t from-black/90 via-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10 pointer-events-none flex items-center gap-4">
           {isLive ? (
              <div className="flex items-center gap-2 px-3 py-1 bg-red-600/20 border border-red-500/30 rounded-full text-red-500 text-xs font-bold animate-pulse pointer-events-auto">
                 <Radio size={14} /> AO VIVO
              </div>
           ) : (
             <div className="flex-1 flex items-center gap-3 pointer-events-auto">
                <span className="text-xs font-mono text-gray-300 min-w-[40px] text-right">{formatSeconds(currentTime)}</span>
                <input 
                  type="range"
                  min="0"
                  max={duration || 100}
                  value={isDragging ? undefined : currentTime}
                  onChange={handleSeek}
                  onMouseDown={onSeekStart}
                  onMouseUp={onSeekEnd}
                  onTouchStart={onSeekStart}
                  onTouchEnd={onSeekEnd}
                  className="flex-1 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-500 hover:h-1.5 transition-all"
                  style={{
                    background: `linear-gradient(to right, #3b82f6 ${(currentTime / (duration || 1)) * 100}%, #4b5563 0)`
                  }}
                />
                <span className="text-xs font-mono text-gray-400 min-w-[40px]">{formatSeconds(duration)}</span>
             </div>
           )}
        </div>

        <video
          ref={videoRef}
          className={`w-full h-full transition-all duration-300 object-${zoomMode}`}
          controls={false} // We are using custom controls now
          autoPlay={autoPlay}
          playsInline
          crossOrigin="anonymous"
          onContextMenu={(e) => e.preventDefault()}
        />
      </div>

      {/* EPG Section - Adaptive Theme */}
      <div className="bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-800 shadow-sm dark:shadow-lg transition-colors duration-300">
        <div className="flex items-center gap-2 mb-3">
          <Calendar size={18} className="text-blue-600 dark:text-blue-400" />
          <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">Guia de Programação</h3>
          {tvgId && isEpgLoading && <span className="text-xs text-gray-500 animate-pulse ml-2">Atualizando guia...</span>}
        </div>
        
        {currentProgram ? (
          <div className="space-y-4">
            <div>
              <div className="flex justify-between items-end mb-1">
                <span className="text-lg font-bold text-gray-900 dark:text-white">{currentProgram.title}</span>
                <span className="text-sm text-blue-600 dark:text-blue-400 font-mono">
                  {formatTime(currentProgram.start)} - {formatTime(currentProgram.end)}
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-800 rounded-full h-1.5 mb-2 overflow-hidden">
                <div 
                  className="bg-blue-600 h-1.5 rounded-full transition-all duration-1000" 
                  style={{ width: `${getProgressPercent(currentProgram.start, currentProgram.end)}%` }}
                ></div>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">{currentProgram.description || "Sem descrição disponível."}</p>
            </div>
            
            {nextProgram && (
              <div className="pt-3 border-t border-gray-200 dark:border-gray-800 flex items-center gap-3 opacity-90 dark:opacity-70">
                <span className="text-xs text-gray-500 uppercase font-bold whitespace-nowrap">A Seguir</span>
                <div className="text-sm text-gray-700 dark:text-gray-300 truncate">
                  <span className="font-mono text-gray-500 mr-2">{formatTime(nextProgram.start)}</span>
                  {nextProgram.title}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-500 italic flex items-center gap-2">
            <Info size={16} />
            {tvgId 
              ? "Informações de programação não disponíveis no momento." 
              : "Este canal não possui ID de guia (tvg-id) configurado."}
          </p>
        )}
      </div>
    </div>
  );
};