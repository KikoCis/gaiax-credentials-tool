import { readFileSync } from 'fs';
import forge from 'node-forge';

const { x509 } = forge;

export async function validateCertificate(certPath) {
  try {
    const certPEM = readFileSync(certPath, 'utf8');
    const cert = x509.certificateFromPem(certPEM);
    
    return {
      subject: cert.subject,
      issuer: cert.issuer,
      validFrom: cert.validity.notBefore,
      validTo: cert.validity.notAfter,
      serialNumber: cert.serialNumber
    };
  } catch (error) {
    throw new Error(`Error validating certificate: ${error.message}`);
  }
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