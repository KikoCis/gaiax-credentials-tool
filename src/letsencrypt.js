import { logger } from "./log.js";
import { exec } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { validateCertificate } from './certificate-validator.js';

export async function getLetsEncryptCert(domain) {
  logger.info(`Generando certificado Let's Encrypt para ${domain}...`);

  try {
    // Crear directorio temporal para certificados
    const certDir = path.join(process.cwd(), 'certs');
    await fs.mkdir(certDir, { recursive: true });

    const certPath = path.join(certDir, `${domain}.crt`);
    const keyPath = path.join(certDir, `${domain}.key`);

    // Para desarrollo/pruebas, generamos un certificado autofirmado
    if (domain === 'localhost') {
      await generateSelfSignedCert(domain, certPath, keyPath);
    } else {
      // En producción, usaríamos el cliente ACME para Let's Encrypt
      throw new Error('Certificados Let\'s Encrypt para dominios no-localhost aún no implementados');
    }

    // Validar el certificado generado
    const certInfo = await validateCertificate(certPath);
    
    logger.info('Certificado generado exitosamente');
    logger.debug('Información del certificado:', certInfo);

    return {
      path: certPath,
      keyPath: keyPath,
      info: certInfo
    };

  } catch (error) {
    logger.error('Error generando certificado:', error);
    throw new Error(`Error generando certificado Let's Encrypt: ${error.message}`);
  }
}

async function generateSelfSignedCert(domain, certPath, keyPath) {
  return new Promise((resolve, reject) => {
    const command = `openssl req -x509 -newkey rsa:4096 -keyout "${keyPath}" -out "${certPath}" -days 365 -nodes -subj "/CN=${domain}"`;
    
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`Error generando certificado autofirmado: ${error.message}`));
        return;
      }
      resolve();
    });
  });
}