import axios from "axios";
import chalk from "chalk";
import { Command } from "commander";
import path from "node:path";
import {
  getConfig,
  getInstantiatedVirtualResourceName,
  getVirtualResourceName,
} from "./config.js";
import { logger } from "./log.js";
import {
  buildLegalRegistrationNumberVC,
  buildParticipantVC,
  buildTermsConditionsVC,
  writeDIDFile,
} from "./participant.js";
import { buildOpenAPIResources, buildServiceOffering } from "./service.js";
import { buildVerifiablePresentation, joinUrl, writeFile } from "./utils.js";
import { validateCertificate, isEVSSL, checkTrustAnchor } from "./certificate-validator.js";
import { generateSelfDescription } from "./self-description-generator.js";
import { getLetsEncryptCert } from "./letsencrypt.js";
import { generateComplianceReport } from "./report-generator.js";
import { analyzeComplianceError } from './ai/AIAnalyzer.js';
import { analyzeAnyError } from './ai/AIAnalyzer.js';

export async function signCredentials({ verifiableCredentials }) {
  const config = getConfig();

  const verifiablePresentation = buildVerifiablePresentation({
    verifiableCredentials,
  });

  logger.info("Sending Verifiable Presentation to Compliance API");
  logger.info(`POST -> ${config.urlAPICompliance}`);
  logger.debug(verifiablePresentation);

  try {
    const res = await axios.post(
      config.urlAPICompliance,
      verifiablePresentation
    );

    logger.info(chalk.green("✅ Compliance success"));
    logger.debug(res.data);

    return res.data;
  } catch (err) {
    logger.error(chalk.red("🔴 Compliance error"));
    const errMsg = (err.response && err.response.data) || err;
    logger.error(errMsg);
    throw new Error(`Error in Compliance API request: ${JSON.stringify(errMsg)}`);
  }
}

async function actionCredentials(options) {
  try {
    if (!options.apiSpec) {
      throw new Error(chalk.red("Es necesario especificar la ruta a la especificación OpenAPI/AsyncAPI usando --api-spec"));
    }
    
    const config = getConfig();
    
    // Validar certificado
    logger.info("Validating trust anchor certificate...");
    const certInfo = await validateCertificate(options.cert || config.cert);
    
    if (!isEVSSL(certInfo)) {
      if (!options.allowNonEVSSL) {
        throw new Error(chalk.red("Certificate is not from an EV-SSL authority. Use --allow-non-evssl to override."));
      }
      logger.warn(chalk.yellow("⚠️ Warning: Using non-EV-SSL certificate"));
    }

    // Verificar emisor conocido
    const trustAnchorStatus = await checkTrustAnchor(certInfo);
    if (trustAnchorStatus.knownIssuer && !trustAnchorStatus.compatible) {
      logger.warn(chalk.yellow(`⚠️ Known issuer ${trustAnchorStatus.issuer} has compatibility issues with GXDCH`));
    }

    // Generar Self-Description desde OpenAPI/AsyncAPI
    logger.info("Generating Self-Description from API specification...");
    const selfDescription = await generateSelfDescription({
      apiSpec: config.openAPISpec,
      type: "OpenAPI", // o "AsyncAPI"
      didIssuer: config.didWebId,
      certInfo
    });

    logger.info("Building Participant Verifiable Credential");
    const vcParticipant = await buildParticipantVC();
    logger.debug(vcParticipant);

    logger.info("Building Legal Registration Number Verifiable Credential");
    const vcLRN = await buildLegalRegistrationNumberVC();
    logger.debug(vcLRN);

    logger.info("Building Terms and Conditions Verifiable Credential");
    const vcTC = await buildTermsConditionsVC();
    logger.debug(vcTC);

    logger.info("Building Verifiable Credentials for Resources");

    const virtResourceName = getVirtualResourceName({
      openAPISpec: config.openAPISpec,
    });

    const instVirtResourceName = getInstantiatedVirtualResourceName({
      openAPISpec: config.openAPISpec,
    });

    const virtResourceUrl = joinUrl(config.baseUrl, `${virtResourceName}.json`);

    const instVirtResourceUrl = joinUrl(
      config.baseUrl,
      `${instVirtResourceName}.json`
    );

    const virtResourceWritePath = path.join(
      config.webserverDir,
      `${virtResourceName}.json`
    );

    const instVirtResourceWritePath = path.join(
      config.webserverDir,
      `${instVirtResourceName}.json`
    );

    const { instantiatedVirtualResource: vcIVR, virtualResource: vcVR } =
      await buildOpenAPIResources({
        openAPIUrl: config.openAPISpec,
        didIssuer: config.didWebId,
        participantUrl: config.urlParticipant,
        virtResourceUrl,
        virtResourceWritePath,
        instVirtResourceUrl,
        instVirtResourceWritePath,
      });

    logger.debug(vcIVR);
    logger.debug(vcVR);

    logger.info("Building Verifiable Credential for Service Offering");

    const vcSO = await buildServiceOffering({
      didIssuer: config.didWebId,
      legalParticipantUrl: config.urlParticipant,
      termsConditionsUrl: config.urlTermsConditions,
      serviceOfferingUrl: config.urlServiceOffering,
      serviceOfferingWritePath: config.pathServiceOffering,
      aggregatedResourceUrls: [virtResourceUrl],
    });

    logger.debug(vcSO);

    const verifiableCredentials = [vcParticipant, vcLRN, vcTC, vcSO];

    const vcCompliance = await signCredentials({
      verifiableCredentials,
    });

    const vpResult = buildVerifiablePresentation({
      verifiableCredentials: [
        ...verifiableCredentials,
        vcCompliance,
        vcVR,
        vcIVR,
      ],
    });

    logger.info(
      `Writing resulting Verifiable Presentation to ${config.pathVerifiablePresentation}`
    );

    await writeFile(config.pathVerifiablePresentation, vpResult);
    
    // Añadir validación final
    const isValid = await validateCompliance(vpResult);
    if (!isValid) {
      logger.warn(chalk.yellow("⚠️ Se detectaron problemas en la validación final"));
      
      const errorReport = await analyzeComplianceError(vpResult);
      
      logger.error("Informe de IA sobre incumplimiento GAIA-X:");
      logger.error(errorReport.summary);
      logger.error("Soluciones recomendadas:");
      errorReport.solutions.forEach(solution => {
        logger.info(`- ${solution}`);
      });
      
      // Guardar análisis detallado
      const errorReportPath = path.join(config.webserverDir, "gaiax-error-analysis.md");
      await writeFile(errorReportPath, `# GAIA-X Compliance Error Analysis
      
${errorReport.detailedAnalysis}

## Recomendaciones
${errorReport.solutions.map(sol => `- ${sol}`).join('\n')}

## Análisis LLM Completo
${errorReport.rawLLMResponse}
      `);
      
      logger.info(chalk.yellow(`Análisis detallado guardado en: ${errorReportPath}`));
      throw new Error("La validación final no cumple con los estándares GAIA-X");
    }

    if (isValid) {
      logger.info(chalk.green("✅ Self-Description validation successful"));
      
      // Generar informe detallado
      const report = await generateComplianceReport({
        verifiablePresentation: vpResult,
        selfDescription,
        outputFiles: {
          vp: config.pathVerifiablePresentation,
          serviceOffering: config.pathServiceOffering,
          virtualResource: virtResourceWritePath,
          instantiatedResource: instVirtResourceWritePath
        },
        apiSpec: config.openAPISpec
      });

      // Mostrar informe
      logger.info(chalk.blue("\n📋 GAIA-X Compliance Report"));
      logger.info("=========================");
      
      logger.info(chalk.yellow("\n📑 Generated Files:"));
      report.files.forEach(file => {
        logger.info(`- ${chalk.cyan(file.path)}: ${file.description}`);
      });

      logger.info(chalk.yellow("\n🔍 Service Details:"));
      logger.info(`- Service Name: ${report.service.name}`);
      logger.info(`- Version: ${report.service.version}`);
      logger.info(`- Endpoints: ${report.service.endpoints.length}`);
      
      logger.info(chalk.yellow("\n✨ Extended Attributes:"));
      report.extendedAttributes.forEach(attr => {
        logger.info(`- ${chalk.cyan(attr.name)}: ${attr.value}`);
        logger.info(`  ${chalk.gray(attr.description)}`);
      });

      logger.info(chalk.yellow("\n📌 Next Steps:"));
      report.nextSteps.forEach((step, index) => {
        logger.info(`${index + 1}. ${step}`);
      });

      // Guardar informe en archivo
      const reportPath = path.join(config.webserverDir, "gaiax-report.md");
      await writeFile(reportPath, report.toMarkdown());
      logger.info(chalk.green(`\n✅ Full report saved to: ${reportPath}`));
    }
  } catch (error) {
    logger.error(chalk.red("🔴 Error en el proceso de credenciales"));
    
    // Analizar el error con IA
    const errorAnalysis = await analyzeAnyError(error, {
      options,
      config: getConfig(),
      context: 'actionCredentials'
    });

    // Mostrar análisis del error
    logger.error(chalk.red("\n🤖 Análisis de IA del error:"));
    logger.error(chalk.yellow("Explicación:"));
    logger.error(errorAnalysis.analysis.explanation);
    
    logger.error(chalk.yellow("\nPasos a seguir:"));
    errorAnalysis.analysis.nextSteps.forEach((step, index) => {
      logger.error(`${index + 1}. ${step}`);
    });

    logger.error(chalk.yellow("\nPrevención:"));
    errorAnalysis.analysis.prevention.forEach(tip => {
      logger.error(`- ${tip}`);
    });

    logger.error(chalk.yellow("\nRecursos útiles:"));
    errorAnalysis.analysis.resources.forEach(resource => {
      logger.error(`- ${resource}`);
    });

    // Guardar análisis detallado en archivo
    const errorReportPath = path.join(process.cwd(), "gaiax-error-analysis.md");
    await writeFile(errorReportPath, `# GAIA-X Error Analysis
    
        ## Error
        ${errorAnalysis.error}

        ## Explicación
        ${errorAnalysis.analysis.explanation}

        ## Pasos a seguir
        ${errorAnalysis.analysis.nextSteps.map(step => `- ${step}`).join('\n')}

        ## Prevención
        ${errorAnalysis.analysis.prevention.map(tip => `- ${tip}`).join('\n')}

        ## Recursos
        ${errorAnalysis.analysis.resources.map(resource => `- ${resource}`).join('\n')}

        ## Análisis completo
        \`\`\`
        ${errorAnalysis.rawLLMResponse}
        \`\`\`
            `);
            
    logger.info(chalk.yellow(`\nAnálisis detallado guardado en: ${errorReportPath}`));
    process.exit(1);
  }
}

async function validateCompliance(verifiablePresentation) {
  try {
    const config = getConfig();
    const response = await axios.post(
      `${config.urlAPICompliance}/validate`,
      verifiablePresentation
    );
    return response.data.isValid;
  } catch (error) {
    logger.error("Error en la validación de compliance");
    return false;
  }
}

const program = new Command();

program
  .name("gaiax-credentials-cli")
  .description("CLI for automatic generation of Gaia-X Self-Descriptions")
  .version("0.1.0");

program
  .command("credentials")
  .description("Build and sign Gaia-X Self-Descriptions")
  .requiredOption("--api-spec <path>", "Path to OpenAPI/AsyncAPI specification")
  .option("-c, --cert <path>", "Path to trust anchor certificate")
  .option("-k, --key <path>", "Path to private key")
  .option("--allow-non-evssl", "Allow non-EV-SSL certificates")
  .option("--gxdch <url>", "GXDCH instance URL", "https://compliance.gaia-x.aire.es")
  .action(actionCredentials);

program
  .command("generate-cert")
  .description("Generate Let's Encrypt certificate for testing")
  .option("-d, --domain <domain>", "Domain for certificate")
  .action(async (options) => {
    try {
      const cert = await getLetsEncryptCert(options.domain);
      logger.info(chalk.green("✅ Certificate generated successfully"));
      logger.info(`Certificate saved to: ${cert.path}`);
    } catch (error) {
      logger.error(chalk.red("🔴 Error generating certificate"));
      
      // Analizar el error con IA
      const errorAnalysis = await analyzeAnyError(error, {
        options,
        context: 'generate-cert'
      });

      // Mostrar análisis
      logger.error(chalk.yellow("\nAnálisis del error:"));
      logger.error(errorAnalysis.analysis.explanation);
      logger.error("\nPasos sugeridos:");
      errorAnalysis.analysis.nextSteps.forEach((step, index) => {
        logger.error(`${index + 1}. ${step}`);
      });
    }
  });

program.parse();
