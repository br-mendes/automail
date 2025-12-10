import React, { useState } from 'react';
import Papa from 'papaparse';
import { Recipient } from '../types';
import { Upload, FileText, AlertCircle } from 'lucide-react';
import { COMPANY_LOGO_URL } from '../constants';

interface CsvUploaderProps {
  onDataLoaded: (data: Recipient[]) => void;
}

export const CsvUploader: React.FC<CsvUploaderProps> = ({ onDataLoaded }) => {
  const [error, setError] = useState<string | null>(null);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length > 0) {
          setError("Erro ao ler o arquivo CSV. Verifique a formatação.");
          return;
        }

        // Validate basic structure
        const rows = results.data as any[];
        if (!rows.length) {
            setError("O arquivo está vazio.");
            return;
        }
        
        // Simple mapping (assuming columns exist or fuzzy mapping)
        const recipients: Recipient[] = rows.map((row, index) => {
          const agency = row['Orgao'] || row['orgao'] || row['Órgão'] || row['Agency'] || 'Geral';
          const servicesRaw = row['Servicos'] || row['servicos'] || row['Services'] || '';
          const services = servicesRaw ? servicesRaw.split(';').map((s: string) => s.trim()).filter((s: string) => s.length > 0) : [];

          return {
            id: `rec-${index}`,
            name: row['Nome'] || row['nome'] || row['Name'] || 'Desconhecido',
            agency: agency,
            sigla: agency,
            email: row['Email'] || row['email'] || row['E-mail'] || '',
            status: 'pending' as const,
            services: services,
            matchedFiles: [], // Initialize empty
            missingServices: [], // Initialize empty
            notes: row['Observacoes'] || row['observacoes'] || ''
          };
        }).filter(r => r.email && r.name !== 'Desconhecido');

        if (recipients.length === 0) {
            setError("Não foi possível identificar colunas de Nome e Email válidas.");
            return;
        }

        onDataLoaded(recipients);
      },
      error: () => {
        setError("Falha ao processar o arquivo.");
      }
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="flex flex-col items-center justify-center p-12 bg-white rounded-2xl shadow-xl border border-gray-100 max-w-lg w-full">
        <img 
          src={COMPANY_LOGO_URL}
          alt="Petacorp Logo" 
          className="h-12 mb-6 object-contain"
        />
        <div className="bg-blue-50 p-4 rounded-full mb-6">
          <FileText className="w-12 h-12 text-blue-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Carregar Planilha</h2>
        <p className="text-gray-500 text-center mb-8">
          Faça upload do arquivo CSV contendo os nomes, órgãos e e-mails dos destinatários.
        </p>

        <label className="relative cursor-pointer group w-full flex justify-center">
          <div className="flex items-center justify-center gap-3 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200 w-full sm:w-auto">
            <Upload className="w-5 h-5" />
            <span className="font-medium">Selecionar Arquivo CSV</span>
          </div>
          <input 
            type="file" 
            accept=".csv" 
            onChange={handleFileUpload} 
            className="hidden" 
          />
        </label>

        {error && (
          <div className="mt-6 flex items-center gap-2 text-red-600 bg-red-50 px-4 py-2 rounded-lg text-sm w-full justify-center">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}
        
        <div className="mt-8 text-xs text-gray-400 border-t pt-4 w-full text-center">
          Colunas esperadas: <strong>Nome, Orgao, Email</strong>
        </div>
      </div>
    </div>
  );
};