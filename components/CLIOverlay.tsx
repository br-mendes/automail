
import React, { useState, useEffect, useRef } from 'react';
import { Terminal, X, ChevronRight, Command } from 'lucide-react';
import { AppState, Client, FileEntry } from '../types';

interface CLIOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  appState: AppState;
  setAppState: (state: AppState) => void;
  clients: Client[];
  files: FileEntry[];
  onScan: () => void;
  onOpenSettings: () => void;
}

export const CLIOverlay: React.FC<CLIOverlayProps> = ({
  isOpen,
  onClose,
  appState,
  setAppState,
  clients,
  files,
  onScan,
  onOpenSettings
}) => {
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<{ type: 'cmd' | 'res' | 'err'; text: string }[]>([
    { type: 'res', text: 'AutoMail Dispatcher CLI v1.0. Digite "help" para comandos.' }
  ]);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history]);

  if (!isOpen) return null;

  const addLog = (text: string, type: 'cmd' | 'res' | 'err' = 'res') => {
    setHistory(prev => [...prev, { type, text }]);
  };

  const handleCommand = (e: React.FormEvent) => {
    e.preventDefault();
    const cmd = input.trim().toLowerCase();
    if (!cmd) return;

    addLog(`> ${input}`, 'cmd');
    setInput('');

    const [action, ...args] = cmd.split(' ');

    switch (action) {
      case 'help':
        addLog('Comandos disponíveis:');
        addLog(' - scan: Inicia varredura de arquivos');
        addLog(' - goto [home|clientes|pastas|dash]: Muda de tela');
        addLog(' - ls clients: Lista siglas dos clientes');
        addLog(' - ls files: Lista arquivos encontrados');
        addLog(' - settings: Abre configurações');
        addLog(' - clear: Limpa o terminal');
        addLog(' - exit: Fecha a CLI');
        break;

      case 'scan':
        onScan();
        addLog('Varredura iniciada em todas as pastas monitoradas.');
        break;

      case 'clear':
        setHistory([{ type: 'res', text: 'Console limpo.' }]);
        break;

      case 'settings':
        onOpenSettings();
        onClose();
        break;

      case 'exit':
        onClose();
        break;

      case 'ls':
        if (args[0] === 'clients') {
          addLog(`Clientes cadastrados (${clients.length}):`);
          clients.forEach(c => addLog(` • ${c.sigla} - ${c.name}`));
        } else if (args[0] === 'files') {
          addLog(`Arquivos na pasta (${files.length}):`);
          files.forEach(f => addLog(` • ${f.name}`));
        } else {
          addLog('Use "ls clients" ou "ls files"', 'err');
        }
        break;

      case 'goto':
        const target = args[0];
        if (target === 'home') { setAppState(AppState.HOME); addLog('Navegando para Home...'); }
        else if (target === 'clientes') { setAppState(AppState.MANAGE_CLIENTS); addLog('Navegando para Clientes...'); }
        else if (target === 'pastas') { setAppState(AppState.SELECT_FOLDER); addLog('Navegando para Pastas...'); }
        else if (target === 'dash') { setAppState(AppState.DASHBOARD); addLog('Navegando para Dashboard...'); }
        else { addLog('Destino inválido. Use: home, clientes, pastas ou dash', 'err'); }
        break;

      default:
        addLog(`Comando desconhecido: "${action}". Digite "help" para ajuda.`, 'err');
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/50 backdrop-blur-sm p-4 pt-20 animate-in fade-in duration-200">
      <div 
        className="bg-[#1a1a1a] w-full max-w-3xl rounded-2xl shadow-2xl border border-white/5 flex flex-col overflow-hidden animate-in slide-in-from-top-4 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* CLI Header */}
        <div className="bg-[#242424] px-5 py-3 flex justify-between items-center border-b border-white/5">
          <div className="flex items-center gap-3">
            <Terminal className="w-4 h-4 text-blue-400" />
            <span className="text-[10px] font-bold tracking-[0.2em] text-gray-400 uppercase">Dispatcher System Terminal</span>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition p-1 hover:bg-white/5 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Output Area */}
        <div 
          ref={scrollRef}
          className="h-80 overflow-y-auto p-6 font-mono text-sm custom-scrollbar bg-[#0f0f0f]"
        >
          {history.map((log, i) => (
            <div 
              key={i} 
              className={`mb-1.5 break-all ${
                log.type === 'cmd' ? 'text-blue-400 font-bold' : 
                log.type === 'err' ? 'text-red-400' : 
                'text-green-500/90'
              }`}
            >
              {log.text}
            </div>
          ))}
        </div>

        {/* Input Area */}
        <form onSubmit={handleCommand} className="p-5 bg-[#1a1a1a] border-t border-white/5 flex items-center gap-4">
          <ChevronRight className="w-5 h-5 text-blue-500 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Digite o comando aqui..."
            className="bg-transparent border-none focus:ring-0 text-white font-mono w-full outline-none placeholder:text-gray-700 text-base"
            autoComplete="off"
            spellCheck="false"
          />
          <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-md bg-white/5 border border-white/10 shrink-0">
             <Command className="w-3 h-3 text-gray-500" />
             <span className="text-[10px] text-gray-500 font-bold">ENTER</span>
          </div>
        </form>
      </div>
    </div>
  );
};
