import { GoogleGenAI, Type } from "@google/genai";
import { EmailGenerationResponse } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Helper to remove accents and special characters for comparison
const normalizeText = (text: string) => {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
};

/**
 * Strict match based on user rules:
 * File MUST contain the Agency Name (e.g., JFAL) or Recipient Name.
 * If strictly different, do not consider.
 */
export const findKeywordMatch = (
    recipientName: string,
    agencyName: string,
    files: string[]
): string | null => {
    // 1. Prepare search terms
    const cleanAgency = normalizeText(agencyName).trim();
    const cleanName = normalizeText(recipientName).trim();
    
    // Safety check: if agency is too generic like "geral" or empty, rely on name
    const useAgency = cleanAgency.length > 2 && cleanAgency !== 'geral';
    
    const candidate = files.find(fileName => {
        const normFileName = normalizeText(fileName);
        
        // STRICT RULE: Filename must contain the Agency identifier (if valid) OR the Recipient Name
        // "exemplo: nome do órgão JFAL, arquivo deve conter JFAL"
        const containsAgency = useAgency && normFileName.includes(cleanAgency);
        const containsName = normFileName.includes(cleanName);

        // If it doesn't contain either the Agency tag or the Name, ignore it.
        if (!containsAgency && !containsName) {
            return false;
        }
        
        // Optional: If you still want to prioritize 'healthcheck' or 'relatorio' files among those that matched the name
        // you could add weighting here, but the request says "corresponder apenas ao nome".
        return true;
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
  // Request: "quebra de página após 'Ao'" -> interpreted as double line break for clean separation.
  // Request: "embed da imagem de assinatura" -> using link as mailto doesn't support HTML img tags.
  
  const body = `Ao ${agencyName},

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
  if (availableFiles.length === 0) return null;

  try {
    const prompt = `
      Eu tenho um nome de destinatário: "${targetName}".
      Eu tenho uma lista de arquivos: ${JSON.stringify(availableFiles)}.
      
      Retorne APENAS o nome exato do arquivo encontrado no formato JSON: { "filename": "nome_do_arquivo.ext" }
      O arquivo DEVE conter parte do nome do destinatário.
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
    console.warn("AI Matching failed", error);
    return null;
  }
};