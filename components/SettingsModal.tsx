
import React, { useState, useEffect } from 'react';
import { Settings, X, PenTool, Mail, Clock, CreditCard, LayoutTemplate } from 'lucide-react';
import { SignatureConfig, AutoScanConfig } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (sigConfig: SignatureConfig, scanConfig: AutoScanConfig, globalCC: string) => void;
  initialSignature: SignatureConfig;
  initialScan: AutoScanConfig;
  initialCC: string;
}

type SettingsTab = 'signature' | 'general';

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialSignature,
  initialScan,
  initialCC
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('signature');
  
  // Local State
  const [sigConfig, setSigConfig] = useState<SignatureConfig>(initialSignature);
  const [scanConfig, setScanConfig] = useState<AutoScanConfig>(initialScan);
  const [globalCC, setGlobalCC] = useState<string>(initialCC);

  // Sync state when modal opens
  useEffect(() => {
    if (isOpen) {
        setSigConfig(initialSignature);
        setScanConfig(initialScan);
        setGlobalCC(initialCC);
    }
  }, [isOpen, initialSignature, initialScan, initialCC]);

  if (!isOpen) return null;

  // Phone Mask Logic
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value.replace(/\D/g, '');
    if (raw.startsWith('55')) {
        raw = raw.substring(2);
    }
    if (raw.length > 11) raw = raw.slice(0, 11);

    let formatted = '';
    if (raw.length > 0) {
        formatted = '+55 ';
        formatted += `(${raw.slice(0, 2)}`;
        if (raw.length >= 2) formatted += ') ';
        if (raw.length > 2) formatted += raw.slice(2, 7);
        if (raw.length > 7) formatted += `-${raw.slice(7)}`;
    }
    setSigConfig(prev => ({ ...prev, phone: formatted }));
  };

  const handleSaveInternal = () => {
      onSave(sigConfig, scanConfig, globalCC);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[95vh]">
        
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b shrink-0">
          <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <div className="p-2 bg-blue-50 rounded-lg"><Settings className="w-5 h-5 text-blue-600" /></div>
            Configurações
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-red-500 transition">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100">
            <button
                onClick={() => setActiveTab('signature')}
                className={`flex-1 py-4 text-sm font-semibold flex items-center justify-center gap-2 transition-all border-b-2 ${
                    activeTab === 'signature' 
                    ? 'border-blue-600 text-blue-600 bg-white' 
                    : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}
            >
                <PenTool className="w-4 h-4" />
                Assinatura
            </button>
            <button
                onClick={() => setActiveTab('general')}
                className={`flex-1 py-4 text-sm font-semibold flex items-center justify-center gap-2 transition-all border-b-2 ${
                    activeTab === 'general' 
                    ? 'border-blue-600 text-blue-600 bg-white' 
                    : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}
            >
                <LayoutTemplate className="w-4 h-4" />
                Geral e Automação
            </button>
        </div>
        
        {/* Content Area */}
        <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar bg-white">
          
          {/* TAB: SIGNATURE */}
          {activeTab === 'signature' && (
              <div className="space-y-6 animate-in slide-in-from-left-4 duration-300">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                       <div>
                           <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Nome Completo <span className="text-red-500">*</span></label>
                           <input 
                                type="text" 
                                value={sigConfig.name} 
                                onChange={e => setSigConfig({...sigConfig, name: e.target.value})} 
                                className="w-full border border-gray-200 rounded-lg text-sm p-2.5 bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition shadow-sm" 
                                placeholder="Seu Nome" 
                           />
                       </div>
                       <div>
                           <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Cargo / Função</label>
                           <input 
                                type="text" 
                                value={sigConfig.role} 
                                onChange={e => setSigConfig({...sigConfig, role: e.target.value})} 
                                className="w-full border border-gray-200 rounded-lg text-sm p-2.5 bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition shadow-sm" 
                                placeholder="Analista..." 
                           />
                       </div>
                       <div>
                           <label className="block text-xs font-bold text-gray-400 uppercase mb-1">E-mail <span className="text-red-500">*</span></label>
                           <input 
                                type="text" 
                                value={sigConfig.email} 
                                onChange={e => setSigConfig({...sigConfig, email: e.target.value})} 
                                className="w-full border border-gray-200 rounded-lg text-sm p-2.5 bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition shadow-sm" 
                                placeholder="seu.email@petacorp.com.br" 
                           />
                       </div>
                       <div>
                           <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Telefone / Celular</label>
                           <input 
                                type="text" 
                                value={sigConfig.phone} 
                                onChange={handlePhoneChange} 
                                className="w-full border border-gray-200 rounded-lg text-sm p-2.5 bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition shadow-sm" 
                                placeholder="+55 (xx) xxxxx-xxxx" 
                           />
                       </div>
                       <div className="md:col-span-2">
                           <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Endereço</label>
                           <input 
                                type="text" 
                                value={sigConfig.address} 
                                onChange={e => setSigConfig({...sigConfig, address: e.target.value})} 
                                className="w-full border border-gray-200 rounded-lg text-sm p-2.5 bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition shadow-sm" 
                           />
                       </div>
                       <div className="md:col-span-2">
                           <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Site</label>
                           <input 
                                type="text" 
                                value={sigConfig.website} 
                                onChange={e => setSigConfig({...sigConfig, website: e.target.value})} 
                                className="w-full border border-gray-200 rounded-lg text-sm p-2.5 bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition shadow-sm" 
                           />
                       </div>
                  </div>
                  
                  {/* Style Controls */}
                  <div className="bg-white p-4 rounded-lg border border-gray-100 shadow-sm">
                      <h5 className="text-xs font-bold text-gray-400 uppercase mb-3">Estilo da Assinatura</h5>
                      <div className="flex flex-wrap gap-6">
                          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                              <input 
                                type="checkbox" 
                                checked={sigConfig.isNameBold} 
                                onChange={e => setSigConfig({...sigConfig, isNameBold: e.target.checked})} 
                                className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500" 
                              />
                              Negrito no Nome
                          </label>
                          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                               Tamanho da Fonte:
                               <select 
                                    value={sigConfig.fontSizeName} 
                                    onChange={e => setSigConfig({...sigConfig, fontSizeName: e.target.value})} 
                                    className="text-xs border border-gray-200 rounded py-1 pl-2 pr-6 ml-1 bg-white text-gray-900 focus:ring-2 focus:ring-blue-500"
                                >
                                   <option value="10pt">10pt (Pequeno)</option>
                                   <option value="11pt">11pt (Médio)</option>
                                   <option value="12pt">12pt (Grande)</option>
                               </select>
                          </label>
                      </div>
                  </div>

                  {/* Preview */}
                  <div className="mt-4 border border-gray-100 rounded-lg p-4 bg-white shadow-inner">
                      <span className="text-[10px] text-gray-300 font-bold uppercase mb-2 block">Pré-visualização em tempo real</span>
                      <div className="bg-white p-6 border border-gray-100 rounded-lg shadow-sm text-black" style={{ fontFamily: 'Calibri, sans-serif' }}>
                          <div style={{ fontSize: sigConfig.fontSizeName, color: '#000' }}>
                            <span style={{ fontWeight: sigConfig.isNameBold ? 'bold' : 'normal' }}>{sigConfig.name || 'Seu Nome'}</span><br/>
                            <span style={{ fontStyle: sigConfig.isRoleItalic ? 'italic' : 'normal' }}>{sigConfig.role || 'Seu Cargo'}</span>
                          </div>
                          <div style={{ fontSize: sigConfig.fontSizeDetails, color: '#666666', marginTop: '10px' }}>
                            {sigConfig.phone && <>{sigConfig.phone}<br/></>}
                            {sigConfig.email || 'email@exemplo.com'}<br/>
                            Endereço: {sigConfig.address}<br/>
                            <span style={{ color: '#666666', textDecoration: 'none' }}>{sigConfig.website}</span>
                          </div>
                      </div>
                  </div>
              </div>
          )}

          {/* TAB: GENERAL */}
          {activeTab === 'general' && (
              <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
                  <div className="space-y-4">
                    <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2 border-b border-gray-100 pb-2">
                        <Mail className="w-4 h-4" />
                        Destinatários Cópia (CC)
                    </h4>
                    <div className="bg-white border border-gray-200 p-4 rounded-xl shadow-sm">
                        <p className="text-xs text-gray-400 mb-2">
                            E-mails em cópia automática. Use <strong>ponto e vírgula (;)</strong> para separar.
                        </p>
                        <textarea 
                            value={globalCC}
                            onChange={(e) => setGlobalCC(e.target.value)}
                            placeholder="email1@petacorp.com.br; email2@petacorp.com.br"
                            className="w-full rounded-lg border-gray-200 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 p-3 border text-sm h-24 bg-white text-gray-900 outline-none transition"
                        />
                    </div>
                  </div>

                  <div className="space-y-4">
                      <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2 border-b border-gray-100 pb-2">
                        <Clock className="w-4 h-4" />
                        Rotina de Varredura
                      </h4>
                      
                      <div className="grid grid-cols-1 gap-3">
                        {/* Manual Mode */}
                        <button
                            onClick={() => setScanConfig({ ...scanConfig, mode: 'disabled' })}
                            className={`p-4 rounded-xl border text-left flex items-start gap-3 transition-all ${
                                scanConfig.mode === 'disabled' 
                                ? 'bg-gray-900 text-white border-gray-900 shadow-md transform scale-[1.01]' 
                                : 'bg-white border-gray-200 hover:border-gray-300 text-gray-600'
                            }`}
                        >
                            <div className={`mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${scanConfig.mode === 'disabled' ? 'border-white' : 'border-gray-300'}`}>
                                {scanConfig.mode === 'disabled' && <div className="w-2 h-2 rounded-full bg-white" />}
                            </div>
                            <div>
                                <span className="font-bold block text-sm">Manual</span>
                                <span className="text-[11px] opacity-75 mt-1 block">Varredura apenas sob demanda.</span>
                            </div>
                        </button>

                        {/* Interval Mode */}
                        <button
                            onClick={() => setScanConfig({ ...scanConfig, mode: 'interval' })}
                            className={`p-4 rounded-xl border text-left flex items-start gap-3 transition-all ${
                                scanConfig.mode === 'interval' 
                                ? 'bg-blue-600 text-white border-blue-600 shadow-md transform scale-[1.01]' 
                                : 'bg-white border-gray-200 hover:border-blue-300 text-gray-600'
                            }`}
                        >
                             <div className={`mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${scanConfig.mode === 'interval' ? 'border-white' : 'border-gray-300'}`}>
                                {scanConfig.mode === 'interval' && <div className="w-2 h-2 rounded-full bg-white" />}
                            </div>
                            <div className="w-full">
                                <span className="font-bold block text-sm flex justify-between items-center w-full">
                                    Intervalos Regulares
                                    {scanConfig.mode === 'interval' && (
                                         <select 
                                            value={scanConfig.intervalMinutes}
                                            onChange={(e) => setScanConfig({ ...scanConfig, intervalMinutes: Number(e.target.value) })}
                                            className="text-xs text-blue-900 bg-white border-none rounded py-0.5 pl-2 pr-6 cursor-pointer focus:ring-0 h-6 shadow-sm"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <option value={5}>A cada 5 min</option>
                                            <option value={10}>A cada 10 min</option>
                                            <option value={30}>A cada 30 min</option>
                                            <option value={60}>A cada 1 hora</option>
                                        </select>
                                    )}
                                </span>
                                <span className="text-[11px] opacity-75 mt-1 block">Busca automática cíclica.</span>
                            </div>
                        </button>

                        {/* Fixed Mode */}
                        <button
                            onClick={() => setScanConfig({ ...scanConfig, mode: 'fixed' })}
                            className={`p-4 rounded-xl border text-left flex items-start gap-3 transition-all ${
                                scanConfig.mode === 'fixed' 
                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-md transform scale-[1.01]' 
                                : 'bg-white border-gray-200 hover:border-indigo-300 text-gray-600'
                            }`}
                        >
                             <div className={`mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${scanConfig.mode === 'fixed' ? 'border-white' : 'border-gray-300'}`}>
                                {scanConfig.mode === 'fixed' && <div className="w-2 h-2 rounded-full bg-white" />}
                            </div>
                            <div>
                                <span className="font-bold block text-sm flex items-center gap-2">
                                    Horários Fixos (08h, 12h, 16h)
                                </span>
                                <span className="text-[11px] opacity-75 mt-1 block">Execução agendada 3x ao dia.</span>
                            </div>
                        </button>
                      </div>
                  </div>
              </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t bg-white flex justify-end gap-3 shrink-0">
          <button 
            onClick={handleSaveInternal} 
            className="px-8 py-3 bg-gray-900 text-white font-bold rounded-xl hover:bg-black transition shadow-lg shadow-gray-200"
          >
            Salvar Alterações
          </button>
        </div>
      </div>
    </div>
  );
};
