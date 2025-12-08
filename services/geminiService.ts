import { GoogleGenAI, Type } from "@google/genai";
import { EmailGenerationResponse } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

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

  // 3. Construct Strict Template
  const body = `Ao ${agencyName},

Prezados(as) Senhores(as),

Encaminhamos, em anexo, o relatório de ${reportType} referente ao mês de ${monthName} de ${year}.

Colocamo-nos à disposição para quaisquer esclarecimentos que se fizerem necessários.

Atenciosamente,`;

  const subject = `Relatório de ${reportType} - ${agencyName} - ${monthName}/${year}`;

  // Return immediate result (no AI generation needed for the body text itself since it's a strict template)
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
    const normalizedTarget = targetName.toLowerCase().replace(/\s+/g, '');
    return availableFiles.find(f => f.toLowerCase().replace(/[^a-z0-9]/g, '').includes(normalizedTarget)) || null;
  }
};
