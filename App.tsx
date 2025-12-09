import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  Tv, 
  Plus, 
  Trash2, 
  Search, 
  Menu, 
  X, 
  Play, 
  List, 
  MonitorPlay,
  Settings,
  History,
  Clock,
  Filter,
  Star,
  ArrowUpDown,
  Calendar,
  Info,
  Sun,
  Moon,
  ArrowUp,
  Download
} from 'lucide-react';
import { Playlist, Channel, EPGData, EPGProgram } from './types';
import { parseM3U } from './utils/m3uParser';
import { fetchAndParseEPG } from './utils/epgParser';
import { VideoPlayer } from './components/VideoPlayer';
import { PlaylistModal } from './components/PlaylistModal';

const STORAGE_KEY = 'iptv_playlists_v1';
const HISTORY_KEY = 'iptv_history_v1';
const FAVORITES_KEY = 'iptv_favorites_v1';
const THEME_KEY = 'iptv_theme_v1';

type SortOrder = 'default' | 'name_asc' | 'name_desc';
type Theme = 'light' | 'dark';

function App() {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [history, setHistory] = useState<Channel[]>([]);
  const [favorites, setFavorites] = useState<Channel[]>([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [currentChannel, setCurrentChannel] = useState<Channel | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<string>('Todos');
  const [sortOrder, setSortOrder] = useState<SortOrder>('default');
  
  // Theme State
  const [theme, setTheme] = useState<Theme>('dark');

  // EPG State
  const [epgData, setEpgData] = useState<EPGData>({});
  const [isEpgLoading, setIsEpgLoading] = useState(false);
  // Force update every minute to refresh progress bars
  const [, setTick] = useState(0);

  // Scroll to Top State
  const listRef = useRef<HTMLDivElement>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);

  // Initialize from LocalStorage
  useEffect(() => {
    const storedPlaylists = localStorage.getItem(STORAGE_KEY);
    const storedHistory = localStorage.getItem(HISTORY_KEY);
    const storedFavorites = localStorage.getItem(FAVORITES_KEY);
    const storedTheme = localStorage.getItem(THEME_KEY);
    
    if (storedPlaylists) {
      try {
        const parsed = JSON.parse(storedPlaylists);
        setPlaylists(parsed);
        if (parsed.length > 0) {
          setSelectedPlaylistId(parsed[0].id);
        }
      } catch (e) {
        console.error("Failed to load playlists", e);
      }
    }

    if (storedHistory) {
      try {
        setHistory(JSON.parse(storedHistory));
      } catch (e) {
        console.error("Failed to load history", e);
      }
    }

    if (storedFavorites) {
      try {
        setFavorites(JSON.parse(storedFavorites));
      } catch (e) {
        console.error("Failed to load favorites", e);
      }
    }

    if (storedTheme) {
      setTheme(storedTheme as Theme);
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
       // Optional: Auto-detect system preference, defaulting to dark if not set
       // setTheme('light'); 
    }
    
    // Timer to update UI for progress bars
    const timer = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(timer);
  }, []);

  // Theme Handling
  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  // Scroll Handler
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const handleScroll = () => {
      if (list.scrollTop > 300) {
        setShowScrollTop(true);
      } else {
        setShowScrollTop(false);
      }
    };

    list.addEventListener('scroll', handleScroll);
    return () => list.removeEventListener('scroll', handleScroll);
  }, [selectedPlaylistId]); // Re-attach when playlist changes/list remounts

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const scrollToTop = () => {
    listRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Save Playlists to LocalStorage
  useEffect(() => {
    if (playlists.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(playlists));
    } else {
        localStorage.removeItem(STORAGE_KEY);
    }
  }, [playlists]);

  // Save History to LocalStorage
  useEffect(() => {
    if (history.length > 0) {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } else {
      localStorage.removeItem(HISTORY_KEY);
    }
  }, [history]);

  // Save Favorites to LocalStorage
  useEffect(() => {
    if (favorites.length > 0) {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
    } else {
      localStorage.removeItem(FAVORITES_KEY);
    }
  }, [favorites]);

  const selectedPlaylist = useMemo(() => 
    playlists.find(p => p.id === selectedPlaylistId), 
  [playlists, selectedPlaylistId]);

  // Reset filters and Load EPG when changing playlist
  useEffect(() => {
    setSearchQuery('');
    setSelectedGroup('Todos');
    setSortOrder('default');
    setShowScrollTop(false);
    
    // Load EPG if available
    if (selectedPlaylist && selectedPlaylist.epgUrl) {
      const loadEPG = async () => {
        setIsEpgLoading(true);
        // Note: This often fails due to CORS if the EPG server doesn't allow it. 
        // In a real production app, you'd use a proxy.
        const data = await fetchAndParseEPG(selectedPlaylist.epgUrl!);
        setEpgData(data);
        setIsEpgLoading(false);
      };
      loadEPG();
    } else {
      setEpgData({});
    }
  }, [selectedPlaylistId, selectedPlaylist]);

  const handleAddPlaylist = (name: string, content: string, source: 'url' | 'file', originalUrl?: string) => {
    const parsed = parseM3U(content);
    
    if (parsed.channels.length === 0) {
      alert("Nenhum canal encontrado nesta lista.");
      return;
    }

    const newPlaylist: Playlist = {
      id: Date.now().toString(),
      name,
      source,
      url: originalUrl,
      epgUrl: parsed.epgUrl, // Captured from #EXTM3U header
      channels: parsed.channels,
      createdAt: Date.now()
    };

    setPlaylists(prev => [...prev, newPlaylist]);
    setSelectedPlaylistId(newPlaylist.id);
  };

  const deletePlaylist = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('Tem certeza que deseja excluir esta lista?')) {
      setPlaylists(prev => prev.filter(p => p.id !== id));
      if (selectedPlaylistId === id) {
        setSelectedPlaylistId(null);
        setCurrentChannel(null);
      }
    }
  };

  const handleExportPlaylist = (playlist: Playlist, e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Reconstruct M3U content
    let m3uContent = '#EXTM3U';
    if (playlist.epgUrl) {
      m3uContent += ` x-tvg-url="${playlist.epgUrl}"`;
    }
    m3uContent += '\n\n';

    playlist.channels.forEach(channel => {
      // Construct #EXTINF line attributes
      let attributes = '';
      if (channel.tvgId) attributes += ` tvg-id="${channel.tvgId}"`;
      if (channel.name) attributes += ` tvg-name="${channel.name}"`;
      if (channel.logo) attributes += ` tvg-logo="${channel.logo}"`;
      if (channel.group) attributes += ` group-title="${channel.group}"`;
      
      m3uContent += `#EXTINF:-1${attributes},${channel.name}\n`;
      m3uContent += `${channel.url}\n`;
    });

    // Create Blob and download link
    const blob = new Blob([m3uContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    // Sanitize filename
    const safeName = playlist.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    a.download = `${safeName}.m3u`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleStreamReady = () => {
    if (!currentChannel) return;

    setHistory(prev => {
      // Remove current channel if it exists to bring it to top
      const filtered = prev.filter(ch => ch.url !== currentChannel.url);
      // Add to top, keep only last 10
      return [currentChannel, ...filtered].slice(0, 10);
    });
  };

  const toggleFavorite = (channel: Channel, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    
    setFavorites(prev => {
      const exists = prev.some(f => f.url === channel.url);
      if (exists) {
        return prev.filter(f => f.url !== channel.url);
      } else {
        return [...prev, channel];
      }
    });
  };

  const isFavorite = (channel: Channel) => {
    return favorites.some(f => f.url === channel.url);
  };

  // Extract unique groups from the playlist
  const availableGroups = useMemo(() => {
    if (!selectedPlaylist) return [];
    const groups = new Set(selectedPlaylist.channels.map(c => c.group || 'Geral'));
    return ['Todos', ...Array.from(groups).sort()];
  }, [selectedPlaylist]);

  // Advanced Filtering and Sorting
  const filteredChannels = useMemo(() => {
    if (!selectedPlaylist) return [];
    
    let result = [...selectedPlaylist.channels];

    // 1. Filter by Group
    if (selectedGroup !== 'Todos') {
      result = result.filter(ch => (ch.group || 'Geral') === selectedGroup);
    }

    // 2. Filter by Search Query (Name or Group)
    if (searchQuery) {
      const lowerQ = searchQuery.toLowerCase();
      result = result.filter(ch => 
        ch.name.toLowerCase().includes(lowerQ) ||
        (ch.group && ch.group.toLowerCase().includes(lowerQ))
      );
    }

    // 3. Sorting
    if (sortOrder === 'name_asc') {
      result.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    } else if (sortOrder === 'name_desc') {
      result.sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true, sensitivity: 'base' }));
    }

    return result;
  }, [selectedPlaylist, searchQuery, selectedGroup, sortOrder]);

  // EPG Helpers
  const getCurrentProgram = useCallback((tvgId: string | undefined): EPGProgram | null => {
    if (!tvgId || !epgData[tvgId]) return null;
    const now = new Date();
    return epgData[tvgId].find(p => now >= p.start && now < p.end) || null;
  }, [epgData]); // removed 'tick' dependency to avoid memo spam, using direct Date in render if needed, but here logic is robust

  const getNextProgram = useCallback((tvgId: string | undefined): EPGProgram | null => {
    if (!tvgId || !epgData[tvgId]) return null;
    const now = new Date();
    // Find the first program that starts after now
    return epgData[tvgId].find(p => p.start > now) || null;
  }, [epgData]);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  // Responsive Sidebar Toggle
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setIsSidebarOpen(false);
      } else {
        setIsSidebarOpen(true);
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize(); // Initial check
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-white overflow-hidden font-sans transition-colors duration-300">
      
      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 w-full h-16 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between px-4 z-40 transition-colors duration-300">
         <div className="flex items-center gap-2">
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 text-gray-600 dark:text-gray-300">
               <Menu />
            </button>
            <span className="font-bold text-blue-600 dark:text-blue-500">IPTV Pro</span>
         </div>
         {currentChannel && (
             <button onClick={() => setCurrentChannel(null)} className="text-xs bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-300 px-3 py-1 rounded-full border border-red-200 dark:border-red-800">
                Fechar
             </button>
         )}
      </div>

      {/* Sidebar */}
      <aside 
        className={`
          fixed md:relative z-30
          flex flex-col
          w-72 h-full bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800
          transition-transform duration-300 ease-in-out
          ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          ${!isSidebarOpen && 'md:-ml-72'} 
        `}
      >
        <div className="p-5 flex items-center justify-between border-b border-gray-200 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-900/50 backdrop-blur-md transition-colors duration-300">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Tv size={18} className="text-white" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">IPTV <span className="text-blue-600 dark:text-blue-500">Pro</span></h1>
          </div>
          
          <button 
            onClick={toggleTheme} 
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
            title={theme === 'dark' ? "Ativar Modo Claro" : "Ativar Modo Escuro"}
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>

        {/* Sidebar Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          
          {/* Favorites Section */}
          {favorites.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between px-2">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-500 uppercase tracking-wider flex items-center gap-1">
                   <Star size={12} className="text-yellow-500 fill-yellow-500" /> Favoritos
                </span>
                <span className="text-[10px] text-gray-500 dark:text-gray-600">{favorites.length} canais</span>
              </div>
              <div className="space-y-1">
                {favorites.map((ch, idx) => (
                   <button
                     key={`fav-${ch.url}-${idx}`}
                     onClick={() => {
                        setCurrentChannel(ch);
                        if (window.innerWidth < 768) setIsSidebarOpen(false);
                     }}
                     className={`w-full flex items-center gap-2 p-2 rounded-lg text-left transition-colors text-sm group ${
                        currentChannel?.url === ch.url 
                          ? 'bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300' 
                          : 'text-gray-700 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-200'
                     }`}
                   >
                     <div className={`w-6 h-6 rounded flex items-center justify-center overflow-hidden flex-shrink-0 ${currentChannel?.url === ch.url ? 'bg-blue-200 dark:bg-gray-800' : 'bg-gray-200 dark:bg-gray-800'}`}>
                        {ch.logo ? (
                           <img src={ch.logo} className="w-full h-full object-cover" onError={(e) => e.currentTarget.style.display = 'none'} />
                        ) : (
                           <Tv size={12} />
                        )}
                     </div>
                     <span className="truncate flex-1">{ch.name}</span>
                     <Play size={10} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                   </button>
                ))}
              </div>
            </div>
          )}

          {/* Recent Channels Section */}
          {history.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between px-2">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1">
                   <Clock size={12} /> Recentes
                </span>
                <button 
                  onClick={() => setHistory([])} 
                  className="text-[10px] text-gray-500 hover:text-red-500 transition-colors"
                >
                  Limpar
                </button>
              </div>
              <div className="space-y-1">
                {history.map((ch, idx) => (
                   <button
                     key={`${ch.id}-${idx}`}
                     onClick={() => {
                        setCurrentChannel(ch);
                        if (window.innerWidth < 768) setIsSidebarOpen(false);
                     }}
                     className={`w-full flex items-center gap-2 p-2 rounded-lg text-left transition-colors text-sm group ${
                        currentChannel?.url === ch.url 
                          ? 'bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300' 
                          : 'text-gray-700 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-200'
                     }`}
                   >
                     <div className={`w-6 h-6 rounded flex items-center justify-center overflow-hidden flex-shrink-0 ${currentChannel?.url === ch.url ? 'bg-blue-200 dark:bg-gray-800' : 'bg-gray-200 dark:bg-gray-800'}`}>
                        {ch.logo ? (
                           <img src={ch.logo} className="w-full h-full object-cover" onError={(e) => e.currentTarget.style.display = 'none'} />
                        ) : (
                           <Tv size={12} />
                        )}
                     </div>
                     <span className="truncate flex-1">{ch.name}</span>
                     <Play size={10} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                   </button>
                ))}
              </div>
            </div>
          )}

          {/* Playlists Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-2">
               <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Minhas Listas</span>
               <button 
                  onClick={() => setIsModalOpen(true)}
                  className="text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300 text-xs flex items-center gap-1 transition-colors"
               >
                 <Plus size={14} /> Nova
               </button>
            </div>

            {playlists.length === 0 ? (
              <div className="text-center py-6 px-4 bg-gray-100 dark:bg-gray-800/30 rounded-xl border border-dashed border-gray-300 dark:border-gray-700 transition-colors duration-300">
                <p className="text-gray-500 text-xs mb-3">Nenhuma lista adicionada.</p>
                <button 
                  onClick={() => setIsModalOpen(true)}
                  className="bg-blue-100 dark:bg-blue-600/20 hover:bg-blue-200 dark:hover:bg-blue-600/30 text-blue-700 dark:text-blue-400 px-3 py-1.5 rounded-md text-xs font-medium transition-colors w-full"
                >
                  Adicionar
                </button>
              </div>
            ) : (
              playlists.map(playlist => (
                <div 
                  key={playlist.id}
                  onClick={() => {
                    setSelectedPlaylistId(playlist.id);
                    if (window.innerWidth < 768) setIsSidebarOpen(false); // Auto close on mobile
                  }}
                  className={`
                    group flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all duration-200 border
                    ${selectedPlaylistId === playlist.id 
                      ? 'bg-blue-600 text-white border-blue-500 shadow-md shadow-blue-500/20' 
                      : 'bg-white dark:bg-gray-800/40 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-transparent hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-200'}
                  `}
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <List size={18} className={selectedPlaylistId === playlist.id ? 'text-blue-100' : 'text-gray-500 dark:text-gray-600'} />
                    <div className="flex flex-col min-w-0">
                      <span className="truncate font-medium text-sm">{playlist.name}</span>
                      <span className="text-[10px] opacity-80 truncate">
                        {playlist.channels.length} canais • {playlist.epgUrl ? 'EPG Link' : 'Sem EPG'}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={(e) => handleExportPlaylist(playlist, e)}
                      className={`
                        p-1.5 rounded-md transition-colors
                        ${selectedPlaylistId === playlist.id ? 'hover:bg-blue-700 text-blue-100' : 'hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500'}
                      `}
                      title="Baixar lista (.m3u)"
                    >
                      <Download size={14} />
                    </button>
                    <button 
                      onClick={(e) => deletePlaylist(playlist.id, e)}
                      className={`
                        p-1.5 rounded-md transition-colors
                        ${selectedPlaylistId === playlist.id ? 'hover:bg-blue-700 text-blue-100' : 'hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 hover:text-red-500'}
                      `}
                      title="Excluir lista"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-800 text-center transition-colors duration-300">
            <p className="text-[10px] text-gray-500">IPTV Pro Brasil © 2024</p>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full relative w-full pt-16 md:pt-0 bg-gray-50 dark:bg-gray-950 transition-colors duration-300">
        
        {/* Toggle Sidebar Button (Desktop only, visible when closed) */}
        {!isSidebarOpen && (
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="hidden md:flex absolute top-4 left-4 z-40 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white shadow-sm"
          >
            <Menu size={20} />
          </button>
        )}

        {/* Video Player Area */}
        {currentChannel ? (
           <div className="flex-shrink-0 bg-black w-full border-b border-gray-800">
              <div className="max-w-6xl mx-auto p-4 md:p-6">
                 <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                       <button onClick={() => setCurrentChannel(null)} className="md:hidden text-gray-400">
                          <X />
                       </button>
                       <h2 className="text-lg md:text-xl font-bold flex items-center gap-2 text-white">
                          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                          {currentChannel.name}
                       </h2>
                       <button 
                          onClick={(e) => toggleFavorite(currentChannel, e)}
                          className="text-gray-400 hover:text-yellow-400 transition-colors ml-2"
                          title="Favoritar"
                       >
                          <Star 
                             size={20} 
                             fill={isFavorite(currentChannel) ? "currentColor" : "none"} 
                             className={isFavorite(currentChannel) ? "text-yellow-500" : ""}
                          />
                       </button>
                    </div>
                    <button 
                       onClick={() => setCurrentChannel(null)}
                       className="hidden md:flex items-center gap-2 text-sm text-gray-400 hover:text-white bg-gray-800 px-3 py-1.5 rounded-lg transition-colors"
                    >
                       <X size={16} /> Fechar Player
                    </button>
                 </div>
                 
                 <div className="w-full mx-auto">
                    <VideoPlayer 
                      url={currentChannel.url} 
                      title={currentChannel.name}
                      tvgId={currentChannel.tvgId}
                      currentProgram={getCurrentProgram(currentChannel.tvgId)}
                      nextProgram={getNextProgram(currentChannel.tvgId)}
                      isEpgLoading={isEpgLoading}
                      autoPlay={true}
                      onStreamReady={handleStreamReady}
                    />
                 </div>
              </div>
           </div>
        ) : (
            selectedPlaylist && (
               <div className="hidden md:flex h-64 items-center justify-center bg-gray-100 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 text-gray-400 dark:text-gray-500 flex-col gap-3 transition-colors duration-300">
                  <MonitorPlay size={48} className="opacity-20" />
                  <p>Selecione um canal para começar a assistir</p>
               </div>
            )
        )}

        {/* Channel List Header & Search */}
        {selectedPlaylist ? (
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="p-4 md:p-6 border-b border-gray-200 dark:border-gray-800 bg-white/90 dark:bg-gray-950/90 backdrop-blur sticky top-0 z-20 transition-colors duration-300">
              <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">{selectedPlaylist.name}</h2>
                  <div className="flex items-center gap-3 text-sm text-gray-500 mt-1">
                     <span>{filteredChannels.length} canais</span>
                     {isEpgLoading && <span className="text-blue-500 flex items-center gap-1"><span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></span>Carregando EPG</span>}
                  </div>
                </div>
                
                <div className="flex flex-col sm:flex-row gap-3 w-full xl:w-auto">
                  
                  {/* Sorting Dropdown */}
                  <div className="relative w-full sm:w-40">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none">
                        <ArrowUpDown size={16} />
                      </div>
                      <select 
                        value={sortOrder}
                        onChange={(e) => setSortOrder(e.target.value as SortOrder)}
                        className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-800 text-gray-900 dark:text-white pl-10 pr-8 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all appearance-none cursor-pointer text-sm truncate"
                      >
                        <option value="default">Padrão</option>
                        <option value="name_asc">A-Z</option>
                        <option value="name_desc">Z-A</option>
                      </select>
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                      </div>
                  </div>

                  {/* Category Filter */}
                  {availableGroups.length > 1 && (
                    <div className="relative w-full sm:w-48">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none">
                        <Filter size={16} />
                      </div>
                      <select 
                        value={selectedGroup}
                        onChange={(e) => setSelectedGroup(e.target.value)}
                        className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-800 text-gray-900 dark:text-white pl-10 pr-8 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all appearance-none cursor-pointer text-sm truncate"
                      >
                        {availableGroups.map(group => (
                          <option key={group} value={group}>{group}</option>
                        ))}
                      </select>
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                      </div>
                    </div>
                  )}

                  {/* Search Input */}
                  <div className="relative w-full sm:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                    <input 
                      type="text" 
                      placeholder="Buscar por nome ou categoria..." 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-800 text-gray-900 dark:text-white pl-10 pr-4 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all placeholder-gray-500 dark:placeholder-gray-600 text-sm"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Channels Grid */}
            <div 
              ref={listRef}
              className="flex-1 overflow-y-auto p-4 md:p-6 bg-gray-50 dark:bg-gray-950 transition-colors duration-300 relative"
            >
               {filteredChannels.length > 0 ? (
                 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 md:gap-4">
                    {filteredChannels.map((channel) => {
                       const currentProg = getCurrentProgram(channel.tvgId);
                       
                       return (
                       <button
                          key={channel.id}
                          onClick={() => {
                             setCurrentChannel(channel);
                             window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                          className={`
                             group relative flex items-start gap-3 p-3 rounded-xl border text-left transition-all duration-200 shadow-sm
                             ${currentChannel?.id === channel.id 
                               ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-500/50 ring-1 ring-blue-500' 
                               : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-700 hover:shadow-md hover:-translate-y-0.5'
                             }
                          `}
                       >
                          <div className={`
                             w-10 h-10 md:w-12 md:h-12 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden mt-1 shadow-sm border border-gray-100 dark:border-gray-700
                             ${currentChannel?.id === channel.id ? 'bg-blue-600' : 'bg-gray-100 dark:bg-gray-800 group-hover:bg-gray-200 dark:group-hover:bg-gray-700'}
                          `}>
                             {channel.logo ? (
                                <img src={channel.logo} alt={channel.name} className="w-full h-full object-cover" onError={(e) => {
                                   (e.target as HTMLImageElement).style.display = 'none';
                                   (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                                }} />
                             ) : null}
                             <Tv size={20} className={`text-gray-400 dark:text-gray-500 ${channel.logo ? 'hidden' : ''}`} />
                          </div>
                          
                          <div className="flex-1 min-w-0">
                             <h3 className={`font-medium text-sm truncate ${currentChannel?.id === channel.id ? 'text-blue-700 dark:text-blue-200' : 'text-gray-800 dark:text-gray-200 group-hover:text-black dark:group-hover:text-white'}`}>
                                {channel.name}
                             </h3>
                             <p className="text-xs text-gray-500 truncate group-hover:text-gray-600 dark:group-hover:text-gray-400">
                                {channel.group || 'Geral'}
                             </p>
                             
                             {/* EPG Info in Grid */}
                             {currentProg && (
                                <div className="mt-1.5 flex items-center gap-1.5">
                                   <div className="w-1 h-1 rounded-full bg-green-500"></div>
                                   <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate w-full">
                                      <span className="font-mono text-gray-600 dark:text-gray-500 mr-1">{formatTime(currentProg.start)}</span>
                                      {currentProg.title}
                                   </p>
                                </div>
                             )}
                          </div>
                          
                          <div 
                            className="absolute right-2 top-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => toggleFavorite(channel, e)}
                          >
                             <div className={`p-1.5 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700/50 ${isFavorite(channel) ? 'opacity-100 text-yellow-500' : 'text-gray-400'}`}>
                                <Star 
                                  size={16} 
                                  fill={isFavorite(channel) ? "currentColor" : "none"} 
                                  className={isFavorite(channel) ? "text-yellow-500" : ""}
                                />
                             </div>
                          </div>
                          
                          {isFavorite(channel) && (
                              <div className="absolute right-2 top-2 z-0 opacity-100 group-hover:opacity-0 pointer-events-none">
                                 <Star size={12} fill="currentColor" className="text-yellow-500" />
                              </div>
                          )}

                          {currentChannel?.id === channel.id && !isFavorite(channel) && (
                             <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.8)]"></div>
                             </div>
                          )}
                       </button>
                    )})}
                 </div>
               ) : (
                  <div className="h-full flex flex-col items-center justify-center text-gray-400 dark:text-gray-600 opacity-60">
                     <Search size={48} className="mb-4" />
                     <p className="text-lg text-gray-600 dark:text-gray-400">Nenhum canal encontrado</p>
                     {selectedGroup !== 'Todos' && <p className="text-sm">na categoria "{selectedGroup}"</p>}
                  </div>
               )}

                {/* Back to Top Button */}
                <button
                  onClick={scrollToTop}
                  className={`fixed bottom-6 right-6 z-40 p-3 rounded-full bg-blue-600 text-white shadow-lg shadow-blue-600/30 hover:bg-blue-500 active:scale-95 transition-all duration-300 transform ${showScrollTop ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0 pointer-events-none'}`}
                  title="Voltar ao topo"
                  aria-label="Voltar ao topo"
                >
                  <ArrowUp size={20} />
                </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-500 bg-gray-50 dark:bg-gray-950 transition-colors duration-300">
            <div className="w-24 h-24 bg-white dark:bg-gray-900 rounded-3xl flex items-center justify-center mb-6 shadow-xl shadow-blue-500/10 dark:shadow-blue-900/10 border border-gray-100 dark:border-gray-800">
              <Tv size={48} className="text-blue-500" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">Bem-vindo ao IPTV Pro</h1>
            <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto mb-8 leading-relaxed">
              Adicione suas listas de reprodução M3U para começar a assistir seus canais favoritos. 
              Suporte para arquivos locais e URLs.
            </p>
            <button 
               onClick={() => setIsModalOpen(true)}
               className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-xl font-semibold shadow-lg shadow-blue-600/20 hover:shadow-blue-600/30 transition-all flex items-center gap-2"
            >
               <Plus size={20} /> Adicionar Nova Lista
            </button>
             <PlaylistModal 
               isOpen={isModalOpen} 
               onClose={() => setIsModalOpen(false)} 
               onAddPlaylist={handleAddPlaylist} 
            />
          </div>
        )}
      </main>
      
      {/* Global Modals */}
      <PlaylistModal 
        isOpen={isModalOpen && !!selectedPlaylist} 
        onClose={() => setIsModalOpen(false)} 
        onAddPlaylist={handleAddPlaylist} 
      />
    </div>
  );
}

export default App;