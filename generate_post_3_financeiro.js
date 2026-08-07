const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

async function buildPost3() {
  const outputPath = path.join('/Users/dimitre/.gemini/antigravity/brain/a51dc691-be6d-430f-916a-de04369e7e0f', 'myclinica_post3_financeiro.png');
  const projectOutputPath = path.join(__dirname, 'public', 'myclinica_post3_financeiro.png');
  
  const logoPath = path.join(__dirname, 'public', 'myclinica-logo.png');
  const logoBase64 = fs.readFileSync(logoPath).toString('base64');

  const width = 1080;
  const height = 1080; 

  const svgContent = `
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
    <defs>
      <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#F8FAFC" />
        <stop offset="100%" stop-color="#E2FAF5" />
      </linearGradient>
      
      <linearGradient id="chartGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#14B8A6" stop-opacity="0.4" />
        <stop offset="100%" stop-color="#14B8A6" stop-opacity="0.0" />
      </linearGradient>

      <filter id="shadow" x="-10%" y="-10%" width="130%" height="130%">
        <feDropShadow dx="0" dy="25" stdDeviation="35" flood-color="#0F172A" flood-opacity="0.1" />
      </filter>
      
      <filter id="floatShadow" x="-10%" y="-10%" width="130%" height="130%">
        <feDropShadow dx="0" dy="15" stdDeviation="20" flood-color="#0F172A" flood-opacity="0.15" />
      </filter>

      <style>
        .title { font-family: 'Plus Jakarta Sans', 'Inter', 'Segoe UI', sans-serif; font-weight: 800; fill: #0F172A; }
        .title-teal { font-family: 'Plus Jakarta Sans', 'Inter', 'Segoe UI', sans-serif; font-weight: 800; fill: #0D9488; }
        .text { font-family: 'Plus Jakarta Sans', 'Inter', 'Segoe UI', sans-serif; font-weight: 500; fill: #64748B; }
        .text-bold { font-family: 'Plus Jakarta Sans', 'Inter', 'Segoe UI', sans-serif; font-weight: 700; fill: #0F172A; }
        .badge { font-family: 'Plus Jakarta Sans', 'Inter', 'Segoe UI', sans-serif; font-weight: 700; fill: #059669; }
      </style>
    </defs>

    <!-- Fundo Claro -->
    <rect width="${width}" height="${height}" fill="url(#bgGrad)" />
    
    <!-- Elementos Decorativos -->
    <circle cx="850" cy="150" r="300" fill="#2DD4BF" opacity="0.1" />
    <circle cx="150" cy="950" r="400" fill="#0D9488" opacity="0.05" />

    <!-- Header Logo -->
    <g transform="translate(420, 60)">
      <image href="data:image/png;base64,${logoBase64}" x="0" y="0" width="60" height="60" />
      <text x="75" y="42" class="title" font-size="32" letter-spacing="-1.0">MyClinica</text>
    </g>

    <!-- Main Copy -->
    <text x="540" y="220" class="title" font-size="60" letter-spacing="-1.5" text-anchor="middle">Você sabe quanto</text>
    <text x="540" y="290" class="title" font-size="60" letter-spacing="-1.5" text-anchor="middle">a sua clínica vai</text>
    <text x="540" y="360" class="title-teal" font-size="60" letter-spacing="-1.5" text-anchor="middle">faturar neste mês?</text>

    <!-- Dashboard Widget Floating (100% SVG) -->
    <g transform="translate(180, 480)">
      
      <!-- Card Principal -->
      <g filter="url(#shadow)">
        <rect x="0" y="0" width="720" height="340" rx="30" fill="#FFFFFF" />
        
        <!-- Header do Card -->
        <text x="40" y="60" class="text" font-size="22">Faturamento Atual</text>
        <text x="40" y="120" class="title" font-size="56" letter-spacing="-1.0">R$ 48.500,00</text>
        
        <!-- Badge +15% -->
        <rect x="440" y="80" width="120" height="40" rx="20" fill="#D1FAE5" />
        <text x="500" y="108" class="badge" font-size="20" text-anchor="middle">+15.2%</text>

        <!-- Gráfico (Chart Area) -->
        <path d="M 40 300 Q 120 220 200 250 T 360 200 T 520 120 T 680 80 L 680 300 Z" fill="url(#chartGrad)" />
        <path d="M 40 300 Q 120 220 200 250 T 360 200 T 520 120 T 680 80" fill="none" stroke="#0D9488" stroke-width="6" stroke-linecap="round" />
        
        <!-- Grid horizontal lines (faded) -->
        <line x1="40" y1="200" x2="680" y2="200" stroke="#E2E8F0" stroke-width="2" stroke-dasharray="6,6" />
        <line x1="40" y1="250" x2="680" y2="250" stroke="#E2E8F0" stroke-width="2" stroke-dasharray="6,6" />
      </g>
      
      <!-- Floating Tag 1: A receber -->
      <g transform="translate(480, -40)" filter="url(#floatShadow)">
        <rect x="0" y="0" width="280" height="100" rx="20" fill="#FFFFFF" stroke="#F1F5F9" stroke-width="2" />
        <circle cx="40" cy="50" r="20" fill="#E0F2FE" />
        <!-- Icon -->
        <path d="M30 50 L38 58 L52 42" fill="none" stroke="#0284C7" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
        <text x="80" y="42" class="text" font-size="18">A Receber</text>
        <text x="80" y="72" class="text-bold" font-size="26">R$ 12.350,00</text>
      </g>
      
      <!-- Floating Tag 2: Comissões -->
      <g transform="translate(-60, 180)" filter="url(#floatShadow)">
        <rect x="0" y="0" width="280" height="100" rx="20" fill="#FFFFFF" stroke="#F1F5F9" stroke-width="2" />
        <circle cx="40" cy="50" r="20" fill="#FEE2E2" />
        <!-- Icon -->
        <path d="M32 40 L48 60 M48 40 L32 60" fill="none" stroke="#EF4444" stroke-width="4" stroke-linecap="round" />
        <text x="80" y="42" class="text" font-size="18">Comissões</text>
        <text x="80" y="72" class="text-bold" font-size="26">R$ 4.200,00</text>
      </g>
    </g>

    <!-- Footer Copy -->
    <text x="540" y="960" class="text" font-size="26" text-anchor="middle">Com o MyClinica, o seu caixa atualiza em tempo real.</text>
    <text x="540" y="1000" class="text-bold" font-size="30" fill="#0F172A" text-anchor="middle">O que era surpresa vira previsão.</text>

  </svg>
  `;

  await sharp(Buffer.from(svgContent))
    .png({ quality: 100, compressionLevel: 0 })
    .toFile(outputPath);

  await sharp(Buffer.from(svgContent))
    .png({ quality: 100, compressionLevel: 0 })
    .toFile(projectOutputPath);

  console.log('Post 3 Generated Successfully at:', outputPath);
}

buildPost3().catch(console.error);
