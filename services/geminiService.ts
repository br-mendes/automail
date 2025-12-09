import { GoogleGenAI } from "@google/genai";
import { EmailGenerationResponse } from "../types";
import { COMPANY_LOGO_URL } from "../constants";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Helper to remove accents and special characters for comparison
const normalizeText = (text: string) => {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9 ]/g, "");
};

/**
 * Determines the correct preposition (Ao/À) based on the Agency Name.
 * Checks for common feminine starting words in Portuguese context.
 */
const determineArticle = (name: string): string => {
    const feminineStarts = [
        'secretaria', 'fundacao', 'procuradoria', 'defensoria', 
        'agencia', 'diretoria', 'superintendencia', 'companhia', 
        'comissao', 'delegacia', 'corregedoria', 'escola', 
        'universidade', 'gerencia', 'camara', 'coordenadoria', 
        'vara', 'justica', 'associacao', 'coordenacao', 'administracao'
    ];
    
    // Clean up input to avoid issues with punctuation like "À Secretaria..." or "- Secretaria"
    const cleanName = normalizeText(name).trim();
    const parts = cleanName.split(' ');
    
    if (parts.length === 0) return 'Ao';
    
    const firstWord = parts[0];
    
    // Check if the first word is in the feminine list
    if (feminineStarts.includes(firstWord)) {
        return 'À';
    }
    
    // Default masculine
    return 'Ao';
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

  // 3. Determine Greeting Preposition
  // IMPORTANT: We use agencyName (which usually holds the Full Name e.g. "Secretaria de Saúde") for this check.
  const preposition = determineArticle(recipientName); 

  const subject = `Relatório de ${reportType} - ${agencyName} - ${monthName}/${year}`;
  const signatureUrl = COMPANY_LOGO_URL;

  // 4. Construct HTML Body (for internal use/future features)
  const bodyHtml = `
    <div style="font-family: sans-serif; color: #000;">
      <p>${preposition}<br><strong>${recipientName}</strong>,</p>
      <br>
      <p>Prezados(as) Senhores(as),</p>
      <p>Encaminhamos, em anexo, o relatório de <strong>${reportType}</strong> referente ao mês de ${monthName} de ${year}.</p>
      <p>Colocamo-nos à disposição para quaisquer esclarecimentos que se fizerem necessários.</p>
      <br>
      <p>Atenciosamente,</p>
      <br>
      <img src="${signatureUrl}" alt="Logo Petacorp" style="max-width: 200px; height: auto;" />
      <br>
      <a href="${signatureUrl}">${signatureUrl}</a>
    </div>
  `;

  // 5. Construct Plain Text Body (for mailto compatibility)
  const body = `${preposition}
${recipientName},

Prezados(as) Senhores(as),

Encaminhamos, em anexo, o relatório de ${reportType} referente ao mês de ${monthName} de ${year}.

Colocamo-nos à disposição para quaisquer esclarecimentos que se fizerem necessários.

Atenciosamente,

${signatureUrl}`;

  return Promise.resolve({
    subject,
    body,
    bodyHtml
  });
};

export const findBestMatch = async (
  targetName: string,
  availableFiles: string[]
): Promise<string | null> => {
  // Kept for backward compatibility
  if (availableFiles.length === 0) return null;
  return null; 
};
