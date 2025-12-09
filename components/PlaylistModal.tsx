import React, { useState, useRef } from 'react';
import { X, Upload, Link, FileUp, Loader2 } from 'lucide-react';

interface PlaylistModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddPlaylist: (name: string, content: string, source: 'url' | 'file', originalUrl?: string) => void;
}

export const PlaylistModal: React.FC<PlaylistModalProps> = ({ isOpen, onClose, onAddPlaylist }) => {
  const [mode, setMode] = useState<'url' | 'file'>('url');
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      if (!name.trim()) throw new Error("Por favor, dê um nome para a lista.");

      if (mode === 'url') {
        if (!url.trim()) throw new Error("Insira uma URL válida.");
        
        // Proxy warning in UI, but attempting fetch
        try {
          const response = await fetch(url);
          if (!response.ok) throw new Error(`Erro HTTP: ${response.status}`);
          const text = await response.text();
          
          if (!text.includes('#EXTM3U')) {
            // Not a strict requirement for some parsers, but good for validation
             console.warn("Header #EXTM3U missing, trying anyway...");
          }
          
          onAddPlaylist(name, text, 'url', url);
          onClose();
        } catch (fetchErr) {
          throw new Error("Não foi possível baixar a lista. Verifique a URL ou problemas de CORS (O servidor da lista pode bloquear acesso via navegador).");
        }
      } else {
        // File mode
        const file = fileInputRef.current?.files?.[0];
        if (!file) throw new Error("Selecione um arquivo .m3u ou .m3u8");

        const reader = new FileReader();
        reader.onload = (event) => {
          const content = event.target?.result as string;
          onAddPlaylist(name, content, 'file');
          onClose();
          setIsLoading(false);
        };
        reader.onerror = () => {
            setError("Erro ao ler o arquivo.");
            setIsLoading(false);
        };
        reader.readAsText(file);
        return; // Early return because reader is async
      }
    } catch (err: any) {
      setError(err.message || "Ocorreu um erro desconhecido.");
    } finally {
      if (mode === 'url') setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity duration-300">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 transition-colors">
        
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-850">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Adicionar Lista de Canais</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex p-2 bg-white dark:bg-gray-900 gap-2 border-b border-gray-100 dark:border-transparent">
          <button
            type="button"
            onClick={() => setMode('url')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
              mode === 'url' ? 'bg-blue-600 text-white shadow-lg' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            <Link size={16} /> URL Direta
          </button>
          <button
            type="button"
            onClick={() => setMode('file')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
              mode === 'file' ? 'bg-blue-600 text-white shadow-lg' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            <FileUp size={16} /> Arquivo Local
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-400 mb-1">Nome da Lista</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Meus Canais de Esporte"
              className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-lg px-4 py-2.5 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
          </div>

          {mode === 'url' ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-400 mb-1">URL da Lista M3U</label>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://exemplo.com/lista.m3u"
                className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-lg px-4 py-2.5 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
              <p className="text-xs text-gray-500 mt-2">
                Aviso: Algumas URLs podem ser bloqueadas pelo navegador devido a políticas de segurança (CORS).
              </p>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-400 mb-1">Arquivo M3U</label>
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-6 flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 dark:hover:border-blue-500 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-all group"
              >
                <Upload className="w-8 h-8 text-gray-400 group-hover:text-blue-500 mb-2 transition-colors" />
                <span className="text-sm text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-300">Clique para selecionar arquivo</span>
              </div>
              <input
                type="file"
                ref={fileInputRef}
                accept=".m3u,.m3u8"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.[0]) {
                     // Could show selected filename here
                  }
                }}
              />
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-100 dark:bg-red-900/20 border border-red-200 dark:border-red-900/50 rounded-lg text-red-700 dark:text-red-400 text-sm">
              {error}
            </div>
          )}

          <div className="pt-2">
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-semibold py-2.5 rounded-lg shadow-lg shadow-blue-500/20 dark:shadow-blue-900/20 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isLoading ? <Loader2 className="animate-spin" size={18} /> : 'Salvar Lista'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};