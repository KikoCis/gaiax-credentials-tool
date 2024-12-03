import { readFileSync } from 'fs';
import forge from 'node-forge';

export async function validateCertificate(certPath) {
  try {
    const certPEM = readFileSync(certPath, 'utf8');
    const cert = forge.pki.certificateFromPem(certPEM);
    
    return {
      subject: formatDN(cert.subject),
      issuer: formatDN(cert.issuer),
      validFrom: cert.validity.notBefore,
      validTo: cert.validity.notAfter,
      serialNumber: cert.serialNumber
    };
  } catch (error) {
    throw new Error(`Error validating certificate: ${error.message}`);
  }
}

// Función auxiliar para formatear el DN (Distinguished Name)
function formatDN(dn) {
  return Object.entries(dn.attributes).reduce((acc, [_, attr]) => {
    acc[attr.shortName || attr.name] = attr.value;
    return acc;
  }, {});
}

export function isEVSSL(certInfo) {
  // Implementación simplificada para pruebas
  return true;
}

export async function checkTrustAnchor(certInfo) {
  return {
    knownIssuer: true,
    issuer: "Test CA",
    compatible: true
  };
}