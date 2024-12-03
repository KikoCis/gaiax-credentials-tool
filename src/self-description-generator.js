import { logger } from "./log.js";
import axios from "axios";

export async function generateSelfDescription({ apiSpec, type, didIssuer, certInfo }) {
  logger.info(`Generando Self-Description desde especificación ${type}...`);

  try {
    // Cargar y validar la especificación API
    const apiDocument = await loadAPISpec(apiSpec);
    
    // Crear estructura base del Self-Description
    const selfDescription = {
      "@context": [
        "https://www.w3.org/2018/credentials/v1",
        "https://w3id.org/gaia-x/service#"
      ],
      type: ["VerifiableCredential", "GaiaXService"],
      issuer: didIssuer,
      issuanceDate: new Date().toISOString(),
      credentialSubject: {
        id: didIssuer,
        type: "Service",
        name: apiDocument.info.title,
        description: apiDocument.info.description,
        version: apiDocument.info.version,
        providedBy: didIssuer,
        certificate: {
          issuer: certInfo.issuer,
          subject: certInfo.subject,
          validFrom: certInfo.validFrom,
          validUntil: certInfo.validUntil
        }
      }
    };

    logger.debug("Self-Description generado exitosamente");
    return selfDescription;

  } catch (error) {
    logger.error("Error generando Self-Description:", error);
    throw new Error(`Error en la generación del Self-Description: ${error.message}`);
  }
}

async function loadAPISpec(specPath) {
  try {
    if (specPath.startsWith('http')) {
      const response = await axios.get(specPath);
      return response.data;
    } else {
      // Si es una ruta local, importar el archivo
      return (await import(specPath)).default;
    }
  } catch (error) {
    throw new Error(`Error cargando especificación API: ${error.message}`);
  }
}
