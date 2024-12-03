import axios from 'axios';
import { logger } from '../log.js';

const OLLAMA_ENDPOINT = 'http://localhost:11434/api/generate';

export async function analyzeComplianceFiles(files, selfDescription) {
  try {
    const prompt = `Analiza la siguiente Self-Description de GAIA-X y sus archivos generados:
    
    Self-Description: ${JSON.stringify(selfDescription, null, 2)}
    Archivos: ${JSON.stringify(files, null, 2)}
    
    Proporciona un análisis detallado incluyendo:
    1. Evaluación de seguridad
    2. Puntuación de cumplimiento
    3. Recomendaciones específicas
    4. Compatibilidad con GAIA-X
    
    Formato JSON requerido para la respuesta.`;

    const analysis = await queryOllama(prompt);
    const parsedAnalysis = parseAnalysis(analysis);

    return {
      summary: generateSummary(parsedAnalysis),
      detailedAnalysis: parsedAnalysis,
      recommendations: parsedAnalysis.recommendations,
      rawLLMResponse: analysis
    };
  } catch (error) {
    return await analyzeAnyError(error, { files, selfDescription });
  }
}

export async function analyzeComplianceError(verifiablePresentation) {
  try {
    const prompt = `Analiza el siguiente Verifiable Presentation que ha fallado la validación GAIA-X:
    
    ${JSON.stringify(verifiablePresentation, null, 2)}
    
    Proporciona:
    1. Análisis detallado del error
    2. Posibles causas
    3. Soluciones específicas
    4. Pasos para prevenir este error en el futuro
    
    Enfócate en los requisitos del GAIA-X Trust Framework.`;

    const analysis = await queryOllama(prompt);
    
    return {
      summary: extractSummary(analysis),
      solutions: extractSolutions(analysis),
      detailedAnalysis: analysis,
      rawLLMResponse: analysis
    };
  } catch (error) {
    return await analyzeAnyError(error, { verifiablePresentation });
  }
}

export async function analyzeAnyError(error, context = {}) {
  try {
    const prompt = `Analiza el siguiente error en el contexto de GAIA-X y proporciona una guía de solución:
    
    Error: ${error.message}
    Contexto: ${JSON.stringify(context, null, 2)}
    
    Por favor proporciona:
    1. Explicación simple del error
    2. Posibles causas
    3. Pasos específicos para solucionarlo
    4. Recomendaciones para prevenir este error
    5. Enlaces o recursos relevantes
    
    Enfócate en proporcionar una solución práctica y clara.`;

    const analysis = await queryOllama(prompt);
    
    return {
      error: error.message,
      analysis: {
        explanation: extractExplanation(analysis),
        nextSteps: extractNextSteps(analysis),
        prevention: extractPrevention(analysis),
        resources: extractResources(analysis)
      },
      rawLLMResponse: analysis
    };
  } catch (aiError) {
    // Fallback básico si el análisis LLM falla
    return {
      error: error.message,
      analysis: {
        explanation: "No se pudo realizar el análisis detallado",
        nextSteps: [
          "Verificar la configuración básica",
          "Revisar los logs para más detalles",
          "Contactar soporte técnico si el problema persiste"
        ],
        prevention: ["Documentar el error para futura referencia"],
        resources: ["https://docs.gaia-x.eu"]
      }
    };
  }
}

async function queryOllama(prompt) {
  try {
    const response = await axios.post(OLLAMA_ENDPOINT, {
      model: "qwen2.5:1.5b",
      prompt: prompt,
      stream: false
    });
    return response.data.response;
  } catch (error) {
    logger.error("Error llamando a Ollama:", error);
    throw new Error("Error en la consulta al modelo de IA");
  }
}

function parseAnalysis(rawAnalysis) {
  try {
    // Intentar parsear como JSON primero
    return JSON.parse(rawAnalysis);
  } catch {
    // Si no es JSON, extraer información del texto
    return {
      securityAnalysis: {
        score: extractScore(rawAnalysis, "security"),
        findings: extractFindings(rawAnalysis)
      },
      complianceScore: extractScore(rawAnalysis, "compliance"),
      recommendations: extractRecommendations(rawAnalysis),
      compatibility: {
        level: extractCompatibilityLevel(rawAnalysis),
        status: extractStatus(rawAnalysis)
      }
    };
  }
}

function generateSummary(analysis) {
  return `Análisis de Compliance GAIA-X:
- Puntuación de Seguridad: ${analysis.securityAnalysis.score}/100
- Puntuación de Compliance: ${analysis.complianceScore}/100
- Nivel de Compatibilidad: ${analysis.compatibility.level}
- Recomendaciones Críticas: ${analysis.recommendations.filter(r => r.priority === "HIGH").length}`;
}

// Funciones auxiliares para extraer información del texto
function extractSummary(text) {
  // Extraer primeros párrafos como resumen
  return text.split('\n\n')[0];
}

function extractSolutions(text) {
  // Buscar soluciones en el texto
  const solutions = text.match(/(?:solución|paso|recomendación)[:]\s*([^\n]+)/gi);
  return solutions ? solutions.map(s => s.split(':')[1].trim()) : [];
}

function extractScore(text, type) {
  const match = text.match(new RegExp(`${type}[^0-9]*([0-9]+)`, 'i'));
  return match ? parseInt(match[1]) : 85;
}

function extractFindings(text) {
  return text.match(/[•\-\*]\s*([^\n]+)/g) || [];
}

function extractCompatibilityLevel(text) {
  if (text.toLowerCase().includes('full')) return 'FULL';
  if (text.toLowerCase().includes('partial')) return 'PARTIAL';
  return 'UNKNOWN';
}

function extractStatus(text) {
  if (text.toLowerCase().includes('ready')) return 'READY';
  if (text.toLowerCase().includes('pending')) return 'PENDING';
  return 'REVIEW_NEEDED';
}

function extractExplanation(text) {
  const explanationMatch = text.match(/explicación[:\n]+(.*?)(?=\n\n|\n[0-9]|$)/is);
  return explanationMatch ? explanationMatch[1].trim() : text.split('\n')[0];
}

function extractNextSteps(text) {
  const steps = text.match(/(?:paso|step)[^:]*:[^\n]+/gi) || [];
  return steps.map(step => step.split(':')[1].trim());
}

function extractPrevention(text) {
  const prevention = text.match(/(?:prevenir|prevención)[^:]*:[^\n]+/gi) || [];
  return prevention.map(p => p.split(':')[1].trim());
}

function extractResources(text) {
  const resources = text.match(/(?:recurso|link|enlace)[^:]*:[^\n]+/gi) || [];
  return resources.map(r => r.split(':')[1].trim());
}