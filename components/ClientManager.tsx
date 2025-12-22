
import React, { useState, useRef, useMemo } from 'react';
import { Client, AVAILABLE_SERVICES } from '../types';
import { Plus, Trash2, Users, ArrowRight, Download, Upload, FileText, Search, ArrowLeft, Edit2, X, Save, CheckSquare, Square, Filter, FilePenLine } from 'lucide-react';
import Papa from 'papaparse';
import { useToast } from './ToastProvider';
import { ConfirmModal } from './ConfirmModal';

interface ClientManagerProps {
  clients: Client[];
  onUpdateClients: (clients: Client[]) => void;
  onNext: () => void;
  onBack?: () => void;
}

export const ClientManager: React.FC<ClientManagerProps> = ({ clients, onUpdateClients, onNext, onBack }) => {
  const { addToast } = useToast();
  const [newClient, setNewClient] = useState<Omit<Client, 'id'>>({
    sigla: '',
    name: '',
    email: '',
    services: [],
    notes: ''
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterService, setFilterService] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  const [confirmModal, setConfirmModal] = useState<{
      isOpen: boolean;
      title: string;
      message: string;
      action: () => void;
  }>({ isOpen: false, title: '', message: '', action: () => {} });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const mergeClients = (currentList: Client[], incoming: Omit<Client, 'id'>[]) => {
      const map = new Map<string, Client>();
      currentList.forEach(c => map.set(c.sigla.toLowerCase().trim(), c));

      incoming.forEach(inc => {
          const key = inc.sigla.toLowerCase().trim();
          const existing = map.get(key);
          if (existing) {
              const existingEmails = existing.email.split(/[,;]+/).map(e => e.trim());
              const newEmails = inc.email.split(/[,;]+/).map(e => e.trim());
              const uniqueEmails = Array.from(new Set([...existingEmails, ...newEmails])).filter(Boolean).join('; ');
              const existingServices = existing.services || [];
              const newServices = inc.services || [];
              const uniqueServices = Array.from(new Set([...existingServices, ...newServices]));
              map.set(key, { 
                  ...existing, 
                  email: uniqueEmails, 
                  name: inc.name || existing.name,
                  services: uniqueServices,
                  notes: inc.notes || existing.notes 
              });
          } else {
              map.set(key, {
                  id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                  sigla: inc.sigla.trim(),
                  name: inc.name.trim(),
                  email: inc.email.replace(/,/g, ';').trim(),
                  services: inc.services || [],
                  notes: inc.notes || ''
              });
          }
      });
      return Array.from(map.values());
  };

  const handleSiglaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputSigla = e.target.value.toUpperCase();
    const existing = clients.find(c => c.sigla.toLowerCase().trim() === inputSigla.toLowerCase().trim());
    setNewClient(prev => ({
        ...prev,
        sigla: inputSigla,
        name: existing ? existing.name : prev.name,
        services: existing ? (existing.services || []) : prev.services,
        notes: existing ? (existing.notes || '') : prev.notes
    }));
  };

  const handleSave = () => {
    if (!newClient.sigla || !newClient.name || !newClient.email) return;
    let updatedList: Client[];
    if (editingId) {
        updatedList = clients.map(c => {
            if (c.id === editingId) {
                return {
                    ...c,
                    sigla: newClient.sigla,
                    name: newClient.name,
                    email: newClient.email.replace(/,/g, ';'),
                    services: newClient.services,
                    notes: newClient.notes
                };
            }
            return c;
        });
        setEditingId(null);
        addToast('success', 'Cliente atualizado com sucesso.');
    } else {
        updatedList = mergeClients(clients, [newClient]);
        addToast('success', 'Cliente adicionado com sucesso.');
    }
    onUpdateClients(updatedList);
    setNewClient({ sigla: '', name: '', email: '', services: [], notes: '' });
  };

  const handleEdit = (client: Client) => {
      setNewClient({
          sigla: client.sigla,
          name: client.name,
          email: client.email,
          services: client.services || [],
          notes: client.notes || ''
      });
      setEditingId(client.id);
      window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
      setNewClient({ sigla: '', name: '', email: '', services: [], notes: '' });
      setEditingId(null);
  };

  const toggleService = (service: string) => {
      setNewClient(prev => {
          const current = prev.services || [];
          if (current.includes(service)) {
              return { ...prev, services: current.filter(s => s !== service) };
          } else {
              return { ...prev, services: [...current, service] };
          }
      });
  };

  const handleDelete = (id: string) => {
    setConfirmModal({
        isOpen: true,
        title: "Remover Cliente",
        message: "Tem certeza que deseja remover este cliente?",
        action: () => {
            onUpdateClients(clients.filter(c => c.id !== id));
            const newSet = new Set(selectedIds);
            newSet.delete(id);
            setSelectedIds(newSet);
            setConfirmModal(prev => ({ ...prev, isOpen: false }));
            addToast('info', 'Cliente removido.');
        }
    });
  };

  const handleExport = () => {
    const csvData = clients.map(c => ({
      Sigla: c.sigla,
      Nome: c.name,
      Email: c.email.replace(/;/g, ','),
      Servicos: (c.services || []).join(';'),
      Observacoes: c.notes || ''
    }));
    const csv = Papa.unparse(csvData, { quotes: true, delimiter: ";" });
    const blob = new Blob(["\ufeff" + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `clientes_petacorp_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    addToast('success', 'Arquivo CSV exportado.');
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      encoding: "UTF-8",
      complete: (results) => {
        const rows = results.data as any[];
        const incomingClients: Omit<Client, 'id'>[] = [];
        rows.forEach((row) => {
            const keys = Object.keys(row);
            const getVal = (key: string) => {
                const foundKey = keys.find(k => k.trim().toLowerCase() === key.toLowerCase());
                return foundKey ? row[foundKey] : undefined;
            };
            const sigla = getVal('sigla') || getVal('orgao') || getVal('agency');
            const name = getVal('nome') || getVal('name');
            const email = getVal('email') || getVal('e-mail');
            const servicosRaw = getVal('servicos') || getVal('services') || '';
            const notes = getVal('observacoes') || getVal('notes') || '';
            if (sigla && name && email) {
                let services: string[] = servicosRaw ? servicosRaw.split(';').map((s: string) => s.trim()).filter((s: string) => s.length > 0) : [];
                incomingClients.push({
                    sigla: sigla.toString().trim(),
                    name: name.toString().trim(),
                    email: email.toString().replace(/,/g, ';'),
                    services: services,
                    notes: notes.toString().trim()
                });
            }
        });
        if (incomingClients.length > 0) {
          onUpdateClients(mergeClients(clients, incomingClients));
          addToast('success', `${incomingClients.length} clientes processados.`);
        }
      },
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const filteredClients = useMemo(() => {
      const result = clients.filter(client => {
        const matchesTerm = client.name.toLowerCase().includes(searchTerm.toLowerCase()) || client.sigla.toLowerCase().includes(searchTerm.toLowerCase()) || client.email.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesService = filterService ? (client.services && client.services.includes(filterService)) : true;
        return matchesTerm && matchesService;
      });
      return result.sort((a, b) => a.sigla.localeCompare(b.sigla));
  }, [clients, searchTerm, filterService]);

  const allSelected = filteredClients.length > 0 && selectedIds.size >= filteredClients.length;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center py-10 px-4">
      <ConfirmModal isOpen={confirmModal.isOpen} title={confirmModal.title} message={confirmModal.message} onConfirm={confirmModal.action} onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))} />

      <div className="max-w-6xl w-full bg-white rounded-2xl shadow-xl overflow-hidden">
        
        {/* Header Section */}
        <div className="bg-white p-6 border-b border-gray-100 flex flex-col gap-6">
            <div className="flex items-center gap-4">
                {onBack && (
                  <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-full transition text-gray-500">
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                )}
                <div className="bg-blue-50 p-3 rounded-xl hidden sm:block">
                    <Users className="w-8 h-8 text-blue-600" />
                </div>
                <div>
                    <h2 className="text-2xl font-bold text-gray-800">Gerenciar Clientes</h2>
                    <p className="text-gray-400 text-sm">Cadastro e manutenção da base de destinatários.</p>
                </div>
            </div>
            
            <div className="flex flex-col md:flex-row gap-4 w-full">
                <div className="relative w-full md:w-1/3">
                    <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <select
                        value={filterService}
                        onChange={(e) => setFilterService(e.target.value)}
                        className="w-full pl-9 pr-8 py-2.5 border border-gray-200 rounded-lg text-sm text-black font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white shadow-sm"
                    >
                        <option value="">Todos Serviços</option>
                        {AVAILABLE_SERVICES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                </div>
                <div className="relative w-full md:w-2/3">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input type="text" placeholder="Buscar cliente..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm text-black font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm bg-white" />
                </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 w-full">
                 <div className="flex items-center gap-3 w-full sm:w-auto flex-1">
                    <button onClick={handleExport} className="flex-1 py-2.5 px-4 text-gray-600 bg-white border border-gray-200 hover:text-green-700 hover:border-green-200 transition-all rounded-lg text-sm font-bold shadow-sm">
                        Exportar CSV
                    </button>
                    <button onClick={() => fileInputRef.current?.click()} className="flex-1 py-2.5 px-4 text-gray-600 bg-white border border-gray-200 hover:text-blue-700 hover:border-blue-200 transition-all rounded-lg text-sm font-bold shadow-sm">
                        Importar CSV
                    </button>
                    <input type="file" ref={fileInputRef} onChange={handleImport} accept=".csv" className="hidden" />
                </div>
                {clients.length > 0 && !editingId && (
                    <button onClick={onNext} className="w-full sm:w-auto px-10 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-bold shadow-lg shadow-indigo-100 transition-all flex items-center justify-center gap-2">
                        Continuar <ArrowRight className="w-4 h-4" />
                    </button>
                )}
            </div>
        </div>

        {/* Form Area - Always White */}
        <div className={`p-8 border-b border-gray-100 bg-white transition-all duration-300 ${editingId ? 'ring-2 ring-yellow-400 ring-inset' : ''}`}>
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                    {editingId ? <><Edit2 className="w-4 h-4 text-yellow-500" /> Modo Edição</> : <><Plus className="w-4 h-4 text-blue-500" /> Novo Destinatário</>}
                </h3>
                {editingId && (
                    <button onClick={handleCancelEdit} className="text-xs font-bold text-red-500 hover:underline flex items-center gap-1">
                        Descartar Edição
                    </button>
                )}
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
                <div className="md:col-span-2">
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Sigla</label>
                    <input type="text" placeholder="Ex: JFAL" value={newClient.sigla} onChange={handleSiglaChange} className="w-full rounded-xl border-gray-200 text-black font-bold focus:border-blue-500 focus:ring-2 focus:ring-blue-500 p-3 border text-sm uppercase bg-white outline-none shadow-sm" />
                </div>
                <div className="md:col-span-5">
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Nome Completo do Órgão</label>
                    <input type="text" placeholder="Ex: Justiça Federal de Alagoas" value={newClient.name} onChange={e => setNewClient({...newClient, name: e.target.value})} className="w-full rounded-xl border-gray-200 text-black font-bold focus:border-blue-500 focus:ring-2 focus:ring-blue-500 p-3 border text-sm bg-white outline-none shadow-sm" />
                </div>
                <div className="md:col-span-5">
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">E-mails (Separar com ;)</label>
                    <input type="text" placeholder="nome@orgao.gov.br; cc@orgao.gov.br" value={newClient.email} onChange={e => setNewClient({...newClient, email: e.target.value})} className="w-full rounded-xl border-gray-200 text-black font-medium focus:border-blue-500 focus:ring-2 focus:ring-blue-500 p-3 border text-sm bg-white outline-none shadow-sm" />
                </div>
                
                <div className="md:col-span-12">
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-2">Serviços Habilitados</label>
                    <div className="flex flex-wrap gap-2">
                        {AVAILABLE_SERVICES.map(service => (
                            <button key={service} onClick={() => toggleService(service)} className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                                (newClient.services || []).includes(service) 
                                ? 'bg-blue-600 border-blue-600 text-white' 
                                : 'bg-white border-gray-200 text-gray-400 hover:border-blue-300'
                            }`}>
                                {service}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="md:col-span-12">
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Observações Internas</label>
                    <textarea rows={2} placeholder="Ex: Contato preferencial com a TI..." value={newClient.notes} onChange={e => setNewClient({...newClient, notes: e.target.value})} className="w-full rounded-xl border-gray-200 text-black font-medium focus:border-blue-500 focus:ring-2 focus:ring-blue-500 p-3 border text-sm bg-white outline-none shadow-sm resize-none" />
                </div>

                <div className="md:col-span-12">
                    <button onClick={handleSave} disabled={!newClient.sigla || !newClient.name || !newClient.email} className={`w-full py-4 text-white rounded-xl font-bold text-sm shadow-xl transition-all active:scale-95 disabled:opacity-30 ${editingId ? 'bg-yellow-500 hover:bg-yellow-600' : 'bg-blue-600 hover:bg-blue-700'}`}>
                        {editingId ? 'Atualizar Dados do Cliente' : 'Confirmar Cadastro'}
                    </button>
                </div>
            </div>
        </div>

        {/* Clients List Table */}
        <div className="overflow-x-auto bg-white">
            <table className="w-full text-left">
                <thead className="bg-white border-b border-gray-100">
                    <tr>
                        <th className="w-12 px-6 py-4">
                            <button onClick={() => { if(filteredClients.length) { const newSet = new Set(selectedIds); if(allSelected) filteredClients.forEach(c => newSet.delete(c.id)); else filteredClients.forEach(c => newSet.add(c.id)); setSelectedIds(newSet); } }} className="text-gray-300 hover:text-gray-500">
                                {allSelected ? <CheckSquare className="w-5 h-5 text-blue-600" /> : <Square className="w-5 h-5" />}
                            </button>
                        </th>
                        <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase">Sigla</th>
                        <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase">Órgão e Serviços</th>
                        <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase">Lista de E-mails</th>
                        <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase text-right">Ações</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                    {filteredClients.map(client => (
                        <tr key={client.id} className={`hover:bg-gray-50 group transition-colors ${editingId === client.id ? 'bg-yellow-50/30' : ''}`}>
                            <td className="px-6 py-4">
                                <button onClick={() => { const newSet = new Set(selectedIds); if(newSet.has(client.id)) newSet.delete(client.id); else newSet.add(client.id); setSelectedIds(newSet); }} className="text-gray-200 group-hover:text-gray-400">
                                    {selectedIds.has(client.id) ? <CheckSquare className="w-5 h-5 text-blue-600" /> : <Square className="w-5 h-5" />}
                                </button>
                            </td>
                            <td className="px-6 py-4 font-bold text-gray-800 text-sm">{client.sigla}</td>
                            <td className="px-6 py-4">
                                <div className="font-bold text-gray-700 text-sm">{client.name}</div>
                                <div className="flex flex-wrap gap-1 mt-1">
                                    {(client.services || []).map(s => <span key={s} className="px-1.5 py-0.5 bg-gray-100 text-gray-500 text-[9px] font-bold rounded uppercase">{s}</span>)}
                                </div>
                            </td>
                            <td className="px-6 py-4 max-w-xs">
                                <div className="text-xs text-gray-500 truncate font-mono" title={client.email}>{client.email}</div>
                            </td>
                            <td className="px-6 py-4 text-right">
                                <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => handleEdit(client)} className="p-2 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-white border border-transparent hover:border-gray-100"><Edit2 className="w-4 h-4" /></button>
                                    <button onClick={() => handleDelete(client.id)} className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-white border border-transparent hover:border-gray-100"><Trash2 className="w-4 h-4" /></button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
      </div>
    </div>
  );
};
