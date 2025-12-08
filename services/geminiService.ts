import { GoogleGenAI, Type } from "@google/genai";
import { EmailGenerationResponse } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateEmailContent = async (
  recipientName: string,
  agencyName: string,
  fileName: string
): Promise<EmailGenerationResponse> => {
  try {
    const prompt = `
      Você é um assistente administrativo profissional.
      Escreva um e-mail curto e formal para encaminhar um documento anexo.
      
      Destinatário: ${recipientName}
      Órgão/Empresa: ${agencyName}
      Nome do Arquivo Anexo: ${fileName}
      
      O e-mail deve ser polido, direto e em Português do Brasil.
      Não inclua placeholders como [Seu Nome], apenas o corpo do texto.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            subject: { type: Type.STRING },
            body: { type: Type.STRING },
          },
          required: ["subject", "body"],
        },
      },
    });

    const jsonText = response.text;
    if (!jsonText) throw new Error("No response from AI");
    
    return JSON.parse(jsonText) as EmailGenerationResponse;
  } catch (error) {
    console.error("Error generating email:", error);
    return {
      subject: `Encaminhamento de documento - ${agencyName}`,
      body: `Prezado(a) ${recipientName},\n\nSegue em anexo o documento referente ao órgão ${agencyName}.\n\nAtenciosamente,`
    };
  }
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
      A correspondência pode ser parcial (ex: "João Silva" combina com "relatorio_joao_silva_2024.pdf").
      
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