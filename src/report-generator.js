import { analyzeComplianceFiles } from './ai/AIAnalyzer.js';

export async function generateComplianceReport({ 
    verifiablePresentation, 
    selfDescription,
    outputFiles,
    apiSpec 
  }) {
    // Obtener análisis de IA
    const aiAnalysis = await analyzeComplianceFiles(outputFiles, selfDescription);
  
    const report = {
      files: [
        {
          path: outputFiles.vp,
          description: "Main Verifiable Presentation containing all credentials"
        },
        {
          path: outputFiles.serviceOffering,
          description: "Service Offering description with detailed service metadata"
        },
        {
          path: outputFiles.virtualResource,
          description: "Virtual Resource definition mapping API endpoints"
        },
        {
          path: outputFiles.instantiatedResource,
          description: "Instantiated Resource with concrete service implementation details"
        }
      ],
  
      service: {
        name: selfDescription.credentialSubject.name,
        version: selfDescription.credentialSubject.version,
        endpoints: extractEndpoints(apiSpec)
      },
  
      extendedAttributes: [
        {
          name: "serviceQualityLevel",
          value: selfDescription.credentialSubject.serviceQualityLevel || "standard",
          description: "Defines the quality level guarantees for this service"
        },
        {
          name: "dataProtectionRegime",
          value: selfDescription.credentialSubject.dataProtectionRegime || ["GDPR"],
          description: "Applicable data protection regulations"
        },
        {
          name: "dataAccountExport",
          value: selfDescription.credentialSubject.dataAccountExport || true,
          description: "Indicates if data can be exported by the account owner"
        }
      ],
  
      nextSteps: [
        "Deploy the generated files to your web server at the specified URLs",
        "Register your service in the GAIA-X Federation Services",
        "Update your service documentation to include the GAIA-X compliance information",
        "Monitor the service endpoints for continued compliance",
        "Set up automated renewal of credentials before expiration"
      ],
  
      aiAnalysis: {
        summary: aiAnalysis.summary,
        recommendations: aiAnalysis.recommendations,
        compatibility: aiAnalysis.detailedAnalysis.gaiaXCompatibility,
        rawAnalysis: aiAnalysis.aiResponse
      },
  
      toMarkdown() {
        return `# GAIA-X Compliance Report
  
  ## AI Analysis
  ${this.aiAnalysis.summary}
  
  ### Detailed AI Analysis
  ${this.aiAnalysis.rawAnalysis}
  
  ### AI Recommendations
  ${this.aiAnalysis.recommendations.map(rec => 
    `- [${rec.priority}] ${rec.area}: ${rec.recommendation}\n  Impact: ${rec.impact}`
  ).join('\n')}
  
  ### GAIA-X Compatibility Status
  - Level: ${this.aiAnalysis.compatibility.level}
  - Status: ${this.aiAnalysis.compatibility.certificationStatus}
  - Next Steps:
  ${this.aiAnalysis.compatibility.nextSteps.map(step => `  - ${step}`).join('\n')}
  
  ## Generated Files
  ${this.files.map(f => `- **${f.path}**: ${f.description}`).join('\n')}
  
  ## Service Details
  - **Name**: ${this.service.name}
  - **Version**: ${this.service.version}
  - **Number of Endpoints**: ${this.service.endpoints.length}
  
  ## Extended GAIA-X Attributes
  ${this.extendedAttributes.map(attr => 
    `### ${attr.name}\n- Value: ${attr.value}\n- ${attr.description}`
  ).join('\n\n')}
  
  ## Next Steps
  ${this.nextSteps.map((step, i) => `${i + 1}. ${step}`).join('\n')}
  `;
      }
    };
  
    return report;
  }
  
  function extractEndpoints(apiSpec) {
    // Extraer endpoints del OpenAPI spec
    const endpoints = [];
    for (const path in apiSpec.paths) {
      for (const method in apiSpec.paths[path]) {
        endpoints.push({
          path,
          method: method.toUpperCase(),
          description: apiSpec.paths[path][method].description
        });
      }
    }
    return endpoints;
  }