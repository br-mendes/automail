
import { GoogleGenAI, Type } from "@google/genai";
import { EmailGenerationResponse } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Helper to remove accents and special characters for comparison
const normalizeText = (text: string) => {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
};

/**
 * Strict match based on user rules:
 * Rule 1: If Agency is specified (and not 'Geral'), the file MUST contain the Agency Name.
 * Rule 2: If Agency is generic/empty, match by Recipient Name.
 */
export const findKeywordMatch = (
    recipientName: string,
    agencyName: string,
    files: string[]
): string | null => {
    // 1. Prepare search terms
    const cleanAgency = normalizeText(agencyName).trim();
    const cleanName = normalizeText(recipientName).trim();
    
    // Check if we have a specific agency to filter by
    const hasSpecificAgency = cleanAgency.length > 2 && cleanAgency !== 'geral';
    
    const candidate = files.find(fileName => {
        const normFileName = normalizeText(fileName);
        
        // STRICT RULE: "exemplo: nome do órgão JFAL, arquivo deve conter JFAL"
        if (hasSpecificAgency) {
            // If the user has a defined agency (Sigla), the file MUST contain that agency tag.
            // We ignore the name in this specific strict mode to avoid false positives 
            // (e.g. "Maria" exists in many agencies, but we only want the one for "JFAL").
            return normFileName.includes(cleanAgency);
        }

        // Fallback: If no specific agency, match by Person Name
        return normFileName.includes(cleanName);
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

  // 2. Identify Report Type
  let reportType = "Healthcheck ou Chamados"; 
  const lowerName = fileName.toLowerCase();

  if (lowerName.includes('health') || lowerName.includes('hc') || lowerName.includes('check')) {
    reportType = "Healthcheck";
  } else if (lowerName.includes('chamado') || lowerName.includes('ticket') || lowerName.includes('atendimento')) {
    reportType = "Chamados";
  } else {
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

  // 3. Construct Template
  // Formatting Requirement: Line break after "Ao"
  const body = `Ao
${agencyName},

Prezados(as) Senhores(as),

Encaminhamos, em anexo, o relatório de ${reportType} referente ao mês de ${monthName} de ${year}.

Colocamo-nos à disposição para quaisquer esclarecimentos que se fizerem necessários.

Atenciosamente,

https://1drv.ms/i/c/9001c56eb955c86d/IQR6eojwjvGgSYkp266gHvyqAawCgXODNSK6ct0fNeb6GVQ`;

  const subject = `Relatório de ${reportType} - ${agencyName} - ${monthName}/${year}`;

  return Promise.resolve({
    subject,
    body
  });
};

export const findBestMatch = async (
  targetName: string,
  availableFiles: string[]
): Promise<string | null> => {
  // Kept for backward compatibility or future AI fuzzy matching usage
  if (availableFiles.length === 0) return null;
  return null; 
};
