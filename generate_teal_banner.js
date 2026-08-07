const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

async function buildTealBanner() {
  const logoPath = path.join(__dirname, 'public', 'myclinica-logo.png');
  const outputPath = path.join('/Users/dimitre/.gemini/antigravity/brain/a51dc691-be6d-430f-916a-de04369e7e0f', 'myclinica_teal_banner.png');
  const projectOutputPath = path.join(__dirname, 'public', 'myclinica_teal_banner.png');

  // We need to tint the logo white or use it as is. 
  // Since our logo is currently teal, placing it on a teal background might not look great unless we add a white circle behind it or invert it.
  // Let's add a white background circle for the logo.
  const logoBase64 = fs.readFileSync(logoPath).toString('base64');

  const width = 1920;
  const height = 1080; 

  const svgContent = `
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
    <defs>
      <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#52E0C4" />
        <stop offset="100%" stop-color="#52E0C4" />
      </linearGradient>
      
      <linearGradient id="glow" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#2DD4BF" stop-opacity="0.3" />
        <stop offset="100%" stop-color="#0D9488" stop-opacity="0" />
      </linearGradient>

      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="15" stdDeviation="20" flood-color="#000000" flood-opacity="0.2" />
      </filter>
      
      <style>
        .title { font-family: 'Plus Jakarta Sans', 'Inter', 'Segoe UI', sans-serif; font-weight: 800; fill: #FFFFFF; }
      </style>
    </defs>

    <!-- Fundo Teal -->
    <rect width="${width}" height="${height}" fill="url(#bgGrad)" />
    
    <!-- Elementos decorativos (Glow) -->
    <circle cx="0" cy="0" r="800" fill="url(#glow)" />
    <circle cx="1920" cy="1080" r="1000" fill="url(#glow)" />

    <!-- Conteúdo Centralizado -->
    <g transform="translate(960, 540)">
      
      <!-- Logo (sem círculo branco) -->
      <image href="data:image/png;base64,${logoBase64}" x="-325" y="-85" width="130" height="130" />
      
      <!-- Nome MyClinica -->
      <text x="-120" y="20" class="title" font-size="110" letter-spacing="-2.0">MyClinica</text>
    </g>

  </svg>
  `;

  await sharp(Buffer.from(svgContent))
    .png({ quality: 100, compressionLevel: 0 })
    .toFile(outputPath);

  await sharp(Buffer.from(svgContent))
    .png({ quality: 100, compressionLevel: 0 })
    .toFile(projectOutputPath);

  console.log('Teal Banner Generated Successfully at:', outputPath);
}

buildTealBanner().catch(console.error);
