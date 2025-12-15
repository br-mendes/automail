

import { GoogleGenAI } from "@google/genai";
import { EmailGenerationResponse, SignatureConfig } from "../types";
import { COMPANY_LOGO_URL } from "../constants";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Helper to remove accents and special characters for comparison
const normalizeText = (text: string) => {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9 ]/g, "");
};

/**
 * Determines the correct preposition (Ao/À) based on the Agency Name.
 */
const determineArticle = (name: string): string => {
    const feminineStarts = [
        'secretaria', 'fundacao', 'procuradoria', 'defensoria', 
        'agencia', 'diretoria', 'superintendencia', 'companhia', 
        'comissao', 'delegacia', 'corregedoria', 'escola', 
        'universidade', 'gerencia', 'camara', 'coordenadoria', 
        'vara', 'justica', 'associacao', 'coordenacao', 'administracao', 'caixa'
    ];
    
    const cleanName = normalizeText(name).trim();
    const parts = cleanName.split(' ');
    
    if (parts.length === 0) return 'Ao';
    
    const firstWord = parts[0];
    
    if (feminineStarts.includes(firstWord)) {
        return 'À';
    }
    return 'Ao';
};

/**
 * Helper to format services list with proper grammar (comma + 'e')
 * Ex: ["Varonis", "Loqed"] -> "Varonis e Loqed"
 * Ex: ["A", "B", "C"] -> "A, B e C"
 */
const formatServicesList = (services: string[]): string => {
  if (!services || services.length === 0) return 'Serviços';
  if (services.length === 1) return services[0];
  
  const last = services[services.length - 1];
  const rest = services.slice(0, services.length - 1);
  return `${rest.join(', ')} e ${last}`;
};

/**
 * Strict match logic.
 * CAIXA: Must match "JAMC_7490_2025"
 * General: Must match Sigla + Service
 */
export const findKeywordMatch = (
    recipientName: string,
    agencyName: string, // This is Sigla
    serviceName: string, // Specific Service
    files: string[]
): string | null => {
    const cleanAgency = normalizeText(agencyName).trim();
    const cleanName = normalizeText(recipientName).trim();
    const cleanService = normalizeText(serviceName).trim();
    
    // Check if client is CAIXA
    const isCaixa = cleanName.includes("caixa") && cleanName.includes("federal");
    const isCaixaSigla = cleanAgency === "caixa" || cleanAgency === "jamc";

    const candidate = files.find(fileName => {
        const normFileName = normalizeText(fileName);
        
        // CAIXA Strict Rule: Must contain JAMC_7490_2025
        if (isCaixa || isCaixaSigla) {
            return normFileName.includes("jamc") && normFileName.includes("7490") && normFileName.includes("2025");
        }

        // General Strict Rule: Must contain Sigla AND Service Name
        const hasSpecificAgency = cleanAgency.length > 2 && cleanAgency !== 'geral';
        
        // Special Case: "Relatório de Chamados" should match files named simply "Chamados"
        const isChamadosService = cleanService.includes("chamados");
        
        if (hasSpecificAgency) {
            // Only match if it contains BOTH Sigla and Service
            // Allow flexibility if service contains "Chamados" -> accept matching "chamados" in file
            if (isChamadosService) {
                 return normFileName.includes(cleanAgency) && normFileName.includes("chamados");
            }
            return normFileName.includes(cleanAgency) && normFileName.includes(cleanService);
        }

        // Fallback for weak sigla (rare)
        if (isChamadosService) {
             return normFileName.includes(cleanName) && normFileName.includes("chamados");
        }
        return normFileName.includes(cleanName) && normFileName.includes(cleanService);
    });

    return candidate || null;
};

export const generateEmailContent = async (
  recipientName: string,
  agencySigla: string,
  // matchedFiles is passed for context if needed, though mostly for validation logic outside
  fileName: string, 
  services: string[] = [],
  signatureConfig?: SignatureConfig
): Promise<EmailGenerationResponse> => {
  // 1. Get Date Info
  const date = new Date();
  const monthName = date.toLocaleString('pt-BR', { month: 'long' });
  const year = date.getFullYear();

  // 2. Sort Services: "Relatório de Chamados" (or just "Chamados") should be last
  const sortedServices = [...services].sort((a, b) => {
      const aLower = a.toLowerCase();
      const bLower = b.toLowerCase();
      const isAChamados = aLower.includes('chamados');
      const isBChamados = bLower.includes('chamados');

      if (isAChamados && !isBChamados) return 1; // A goes last
      if (!isAChamados && isBChamados) return -1; // B goes last
      return 0; // Keep original order otherwise
  });

  // 3. Identify Services String with Grammar
  const servicesStr = formatServicesList(sortedServices);

  // 4. Determine Logic Branch (CAIXA vs General)
  const normName = normalizeText(recipientName);
  const isCaixa = normName.includes('caixa') && normName.includes('federal');

  let subject = '';
  let body = '';
  let bodyHtml = '';
  // overrides are null by default, meaning use registered email
  let overrideTo: string | undefined;
  let overrideCc: string | undefined;

  // --- SIGNATURES GENERATION ---
  
  // Default values if config is missing (fallback)
  const sigName = signatureConfig?.name || 'Seu Nome';
  const sigRole = signatureConfig?.role || '';
  const sigEmail = signatureConfig?.email || 'email@petacorp.com.br';
  const sigPhone = signatureConfig?.phone || '';
  const sigAddr = signatureConfig?.address || 'SCES, Trecho 2, Conj. 8, Loja 3 – Brasília/DF – CEP: 70.200-002';
  const sigSite = signatureConfig?.website || 'www.petacorp.com.br';
  
  const fontMain = signatureConfig?.fontSizeName || '11pt';
  const fontDetails = signatureConfig?.fontSizeDetails || '9pt';
  const isBold = signatureConfig?.isNameBold ?? true;
  // Use Calibri stack
  const fontFamily = "Calibri, Candara, Segoe, 'Segoe UI', Optima, Arial, sans-serif";

  // Plain Text Signature (for mailto)
  const textSignature = `${sigName}
${sigRole}

${sigPhone ? sigPhone + '\n' : ''}${sigEmail}
Endereço: ${sigAddr}
${sigSite}`;

  // HTML Signature (for preview/future use)
  const htmlSignature = `
    <div style="font-family: ${fontFamily}; margin-top: 20px;">
      <div style="font-size: ${fontMain}; color: #000;">
        <span style="font-weight: ${isBold ? 'bold' : 'normal'};">${sigName}</span><br>
        ${sigRole ? `<span style="font-style: ${signatureConfig?.isRoleItalic ? 'italic' : 'normal'}">${sigRole}</span>` : ''}
      </div>
      <div style="font-size: ${fontDetails}; color: #666666; margin-top: 10px;">
        ${sigPhone ? `${sigPhone}<br>` : ''}
        ${sigEmail}<br>
        Endereço: ${sigAddr}<br>
        <a href="http://${sigSite.replace('http://', '').replace('https://', '')}" style="color: #666666; text-decoration: none;">${sigSite}</a>
      </div>
    </div>
  `;

  if (isCaixa) {
    // --- CAIXA LOGIC ---
    
    // Calculate last day of month
    const lastDay = new Date(year, date.getMonth() + 1, 0).getDate();
    const monthYearFormatted = `${monthName.charAt(0).toUpperCase() + monthName.slice(1)}/${year}`;
    
    // Subject: Relatório de chamados_JAMC_[Mês/Ano]_Contrato7490/2025
    subject = `Relatório de chamados_JAMC_${monthYearFormatted}_Contrato 7490/2025`;

    // Body
    const preposition = determineArticle("Caixa Econômica Federal");
    
    const bodyContent = `
Pelo presente, informamos que, no período de 1º a ${lastDay} de ${monthName} de ${year}, não foram identificados chamados de suporte por meio do canal https://www.veritas.com/support/.

Esses chamados referem-se ao serviço de suporte técnico e atualização tecnológica do produto Veritas Infoscale Storage, conforme especificado no Contrato nº 7490/2025.

Agradecemos antecipadamente pela atenção dispensada a este assunto e aguardamos, gentilmente, a emissão do ateste correspondente, que certificará a conformidade do registro de chamados com os termos estabelecidos em contrato.

Ficamos à disposição para eventuais esclarecimentos.`;

    bodyHtml = `
      <div style="font-family: ${fontFamily}; color: #000;">
        <p>${preposition}<br><strong>Caixa Econômica Federal</strong>,</p>
        <br>
        <p>Prezados(as) Senhores(as),</p>
        <div style="white-space: pre-line;">${bodyContent}</div>
        <br>
        <p>Atenciosamente,</p>
        ${htmlSignature}
      </div>
    `;

    body = `${preposition}
Caixa Econômica Federal,

Prezados(as) Senhores(as),
${bodyContent}

Atenciosamente,

${textSignature}`;

  } else {
    // --- GENERAL LOGIC ---
    
    // Determine singular/plural
    const isPlural = sortedServices.length > 1;
    
    // Redundancy Check: If single service and it already contains "Relatório", don't double it.
    // Ex: "Relatório de Chamados" -> Should be "DESO | Relatório de Chamados" NOT "DESO | Relatório Relatório de Chamados"
    const isSingleAndHasRelatorio = !isPlural && servicesStr.toLowerCase().trim().startsWith('relatório');

    let reportWord = isPlural ? "Relatórios" : "Relatório";
    let articlePhrase = isPlural ? "os relatórios de" : "o relatório de";

    if (isSingleAndHasRelatorio) {
        reportWord = ""; // Suppress redundant prefix in Subject
        articlePhrase = "o"; // Suppress "relatório de" in Body, keeping just the article
    }

    const referenceWord = isPlural ? "referentes" : "referente";
    
    // Subject: [SIGLA] | [Relatório?] [SERVIÇOS] - [MÊS/ANO]
    const monthYear = `${monthName.charAt(0).toUpperCase() + monthName.slice(1)}/${year}`;
    
    // Construct subject with proper spacing only if reportWord is not empty
    const subjectPrefix = reportWord ? `${reportWord} ` : '';
    subject = `${agencySigla} | ${subjectPrefix}${servicesStr} - ${monthYear}`;

    const preposition = determineArticle(recipientName);

    // Body: Encaminhamos...
    const bodyContent = `Encaminhamos, em anexo, ${articlePhrase} ${servicesStr} ${referenceWord} ao mês de ${monthName} de ${year}.

Colocamo-nos à disposição para quaisquer esclarecimentos que se fizerem necessários.`;

    bodyHtml = `
      <div style="font-family: ${fontFamily}; color: #000;">
        <p>${preposition}<br><strong>${recipientName}</strong>,</p>
        <br>
        <p>Prezados(as) Senhores(as),</p>
        <div style="white-space: pre-line;">${bodyContent}</div>
        <br>
        <p>Atenciosamente,</p>
        ${htmlSignature}
      </div>
    `;

    body = `${preposition}
${recipientName},

Prezados(as) Senhores(as),

${bodyContent}

Atenciosamente,

${textSignature}`;
  }

  return Promise.resolve({
    subject,
    body,
    bodyHtml,
    overrideTo,
    overrideCc
  });
};

// Legacy stub
export const findBestMatch = async (
  targetName: string,
  availableFiles: string[]
): Promise<string | null> => {
  return null; 
};
