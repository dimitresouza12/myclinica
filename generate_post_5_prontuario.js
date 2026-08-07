const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

async function buildPost5() {
  const outputPath = path.join('/Users/dimitre/.gemini/antigravity/brain/a51dc691-be6d-430f-916a-de04369e7e0f', 'myclinica_post5_prontuario.png');
  const projectOutputPath = path.join(__dirname, 'public', 'myclinica_post5_prontuario.png');
  
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
        .ui-title { font-family: 'Plus Jakarta Sans', 'Inter', 'Segoe UI', sans-serif; font-weight: 700; fill: #0F172A; }
        .ui-text { font-family: 'Plus Jakarta Sans', 'Inter', 'Segoe UI', sans-serif; font-weight: 500; fill: #64748B; }
        .badge { font-family: 'Plus Jakarta Sans', 'Inter', 'Segoe UI', sans-serif; font-weight: 700; fill: #FFFFFF; }
      </style>
    </defs>

    <!-- Fundo Claro -->
    <rect width="${width}" height="${height}" fill="url(#bgGrad)" />
    
    <!-- Elementos Decorativos -->
    <circle cx="950" cy="850" r="400" fill="#2DD4BF" opacity="0.1" />
    <circle cx="150" cy="150" r="500" fill="#0D9488" opacity="0.05" />

    <!-- Header Logo -->
    <g transform="translate(420, 60)">
      <image href="data:image/png;base64,${logoBase64}" x="0" y="0" width="60" height="60" />
      <text x="75" y="42" class="title" font-size="32" letter-spacing="-1.0">MyClinica</text>
    </g>

    <!-- Main Copy -->
    <text x="540" y="220" class="title" font-size="60" letter-spacing="-1.5" text-anchor="middle">O histórico do paciente</text>
    <text x="540" y="290" class="title-teal" font-size="60" letter-spacing="-1.5" text-anchor="middle">a um clique.</text>

    <!-- UI Widget - Prontuário -->
    <g transform="translate(140, 420)">
      <g filter="url(#shadow)">
        <rect x="0" y="0" width="800" height="420" rx="30" fill="#FFFFFF" />
        
        <!-- Document Header -->
        <path d="M 0 30 A 30 30 0 0 1 30 0 L 770 0 A 30 30 0 0 1 800 30 L 800 100 L 0 100 Z" fill="#F1F5F9" />
        <circle cx="50" cy="50" r="25" fill="#CBD5E1" />
        <!-- User Icon -->
        <path d="M50 45 A 8 8 0 1 0 50 29 A 8 8 0 1 0 50 45 Z" fill="#94A3B8" />
        <path d="M35 65 Q 50 50 65 65 Z" fill="#94A3B8" />
        
        <text x="90" y="48" class="ui-title" font-size="22">Rafaela Costa Silva</text>
        <text x="90" y="74" class="ui-text" font-size="16">Paciente desde: Fev/2023</text>
        
        <!-- Document Body Lines -->
        <rect x="50" y="140" width="400" height="16" rx="8" fill="#E2E8F0" />
        <rect x="50" y="180" width="700" height="12" rx="6" fill="#F1F5F9" />
        <rect x="50" y="210" width="650" height="12" rx="6" fill="#F1F5F9" />
        <rect x="50" y="240" width="680" height="12" rx="6" fill="#F1F5F9" />
        <rect x="50" y="270" width="400" height="12" rx="6" fill="#F1F5F9" />
        
        <!-- Attached File Mockup -->
        <rect x="50" y="320" width="180" height="60" rx="10" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="2" />
        <path d="M 65 340 L 75 340 L 75 365 L 65 365 Z" fill="#EF4444" />
        <text x="90" y="348" class="ui-title" font-size="14">Exame_Sangue.pdf</text>
        <text x="90" y="368" class="ui-text" font-size="12">1.2 MB</text>
      </g>
      
      <!-- Floating Badge Assinatura -->
      <g transform="translate(480, 280)" filter="url(#floatShadow)">
        <rect x="0" y="0" width="340" height="80" rx="40" fill="#14B8A6" />
        <circle cx="40" cy="40" r="28" fill="#FFFFFF" />
        <!-- Lock/Check Icon -->
        <path d="M 32 42 L 38 48 L 50 34" fill="none" stroke="#14B8A6" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
        <text x="80" y="46" class="badge" font-size="20">Assinado Digitalmente</text>
      </g>
    </g>

    <!-- Footer Copy -->
    <text x="540" y="960" class="text" font-size="26" text-anchor="middle">Prontuário inteligente com assinatura digital e anexos na nuvem.</text>
    <text x="540" y="1000" class="title" font-size="30" text-anchor="middle">@myclinicabr</text>

  </svg>
  `;

  await sharp(Buffer.from(svgContent))
    .png({ quality: 100, compressionLevel: 0 })
    .toFile(outputPath);

  await sharp(Buffer.from(svgContent))
    .png({ quality: 100, compressionLevel: 0 })
    .toFile(projectOutputPath);

  console.log('Post 5 Generated Successfully');
}

buildPost5().catch(console.error);
