import { GoogleGenAI, Type } from "@google/genai";
import { EmailGenerationResponse } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Helper to remove accents and special characters for comparison
const normalizeText = (text: string) => {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
};

/**
 * Deterministic match based on user rules:
 * File must contain (Healthcheck OR Relatório) AND (Recipient Name)
 */
export const findKeywordMatch = (
    recipientName: string,
    files: string[]
): string | null => {
    const normalizedTarget = normalizeText(recipientName).replace(/\s+/g, ''); // e.g. "ministeriodasaude"
    
    // Filter files that match the keywords first
    const keywords = ['healthcheck', 'relatorio', 'relatório'];
    
    const candidate = files.find(fileName => {
        const normFileName = normalizeText(fileName);
        
        // 1. Must contain at least one keyword
        const hasKeyword = keywords.some(k => normFileName.includes(k));
        if (!hasKeyword) return false;

        // 2. Must contain the recipient name (simple substring check after stripping spaces)
        // We strip spaces from filename too to match "Ministerio Da Saude" with "MinisterioDaSaude"
        const normFileNameClean = normFileName.replace(/[^a-z0-9]/g, '');
        return normFileNameClean.includes(normalizedTarget);
    });

    return candidate || null;
};

export const generateEmailContent = async (
  recipientName: string,
  agencyName: string,
  fileName: string
): Promise<EmailGenerationResponse> => {
  // 1. Get Date Info in PT-BR
  const date = new Date();
  const monthName = date.toLocaleString('pt-BR', { month: 'long' });
  const year = date.getFullYear();

  // 2. Identify Report Type (Healthcheck vs Chamados)
  let reportType = "Healthcheck ou Chamados"; // Fallback
  const lowerName = fileName.toLowerCase();

  // Heuristic check
  if (lowerName.includes('health') || lowerName.includes('hc') || lowerName.includes('check')) {
    reportType = "Healthcheck";
  } else if (lowerName.includes('chamado') || lowerName.includes('ticket') || lowerName.includes('atendimento')) {
    reportType = "Chamados";
  } else {
    // AI Fallback for ambiguous names
    try {
      const classification = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Analise o nome do arquivo "${fileName}". Ele se refere a um relatório de "Healthcheck" ou de "Chamados"? Responda apenas com uma das duas palavras. Se incerto, responda "Geral".`,
      });
      const text = classification.text?.trim();
      if (text && (text.includes('Health') || text.includes('Chamado'))) {
        reportType = text;
      }
    } catch (e) {
      console.warn("AI classification failed", e);
    }
  }

  // 3. Construct Strict Template with Line Breaks (\n)
  // Note: We use \n. When passed to encodeURIComponent for mailto, it becomes %0A.
  const body = `Ao ${agencyName},

Prezados(as) Senhores(as),

Encaminhamos, em anexo, o relatório de ${reportType} referente ao mês de ${monthName} de ${year}.

Colocamo-nos à disposição para quaisquer esclarecimentos que se fizerem necessários.

Atenciosamente,

https://1drv.ms/i/c/9001c56eb955c86d/IQR6eojwjvGgSYkp266gHvyqAawCgXODNSK6ct0fNeb6GVQ`;

  const subject = `Relatório de ${reportType} - ${agencyName} - ${monthName}/${year}`;

  // Return immediate result
  return Promise.resolve({
    subject,
    body
  });
};

export const findBestMatch = async (
  targetName: string,
  availableFiles: string[]
): Promise<string | null> => {
  if (availableFiles.length === 0) return null;

  try {
    const prompt = `
      Eu tenho um nome de destinatário: "${targetName}".
      Eu tenho uma lista de arquivos: ${JSON.stringify(availableFiles)}.
      
      Qual arquivo desta lista é o mais provável de pertencer a este destinatário?
      A correspondência pode ser parcial (ex: "João Silva" combina com "relatorio_joao_silva_2024.pdf" ou "Ministério da Saúde" combina com "healthcheck_min_saude.xlsx").
      
      Priorize arquivos que contenham palavras como "Relatório" ou "Healthcheck".

      Retorne APENAS o nome exato do arquivo encontrado no formato JSON: { "filename": "nome_do_arquivo.ext" }
      Se nenhum arquivo parecer correto, retorne null no valor.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
            type: Type.OBJECT,
            properties: {
                filename: { type: Type.STRING, nullable: true }
            }
        }
      },
    });

    const result = JSON.parse(response.text || "{}");
    return result.filename || null;

  } catch (error) {
    console.warn("AI Matching failed, falling back to basic includes check", error);
    // Fallback: simple case-insensitive substring match
    const normalizedTarget = normalizeText(targetName).replace(/\s+/g, '');
    return availableFiles.find(f => normalizeText(f).replace(/[^a-z0-9]/g, '').includes(normalizedTarget)) || null;
  }
};