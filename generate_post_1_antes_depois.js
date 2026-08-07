const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

async function buildPost1() {
  const outputPath = path.join('/Users/dimitre/.gemini/antigravity/brain/a51dc691-be6d-430f-916a-de04369e7e0f', 'myclinica_post1_antes_depois.png');
  const projectOutputPath = path.join(__dirname, 'public', 'myclinica_post1_antes_depois.png');
  
  const logoPath = path.join(__dirname, 'public', 'myclinica-logo.png');
  const logoBase64 = fs.readFileSync(logoPath).toString('base64');

  const width = 1080;
  const height = 1080; 

  const svgContent = `
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
    <defs>
      <linearGradient id="rightBg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#0D9488" />
        <stop offset="100%" stop-color="#0F766E" />
      </linearGradient>
      <style>
        .title { font-family: 'Plus Jakarta Sans', 'Inter', 'Segoe UI', sans-serif; font-weight: 800; }
        .subtitle { font-family: 'Plus Jakarta Sans', 'Inter', 'Segoe UI', sans-serif; font-weight: 600; }
        .text { font-family: 'Plus Jakarta Sans', 'Inter', 'Segoe UI', sans-serif; font-weight: 500; }
        .footer { font-family: 'Plus Jakarta Sans', 'Inter', 'Segoe UI', sans-serif; font-weight: 700; }
      </style>
    </defs>

    <!-- Fundo Esquerdo -->
    <rect x="0" y="0" width="540" height="1080" fill="#FFFFFF" />
    
    <!-- Fundo Direito -->
    <rect x="540" y="0" width="540" height="1080" fill="url(#rightBg)" />
    
    <!-- Header Logo -->
    <g transform="translate(60, 60)">
      <image href="data:image/png;base64,${logoBase64}" x="0" y="0" width="60" height="60" />
      <text x="75" y="42" class="title" font-size="32" fill="#0D9488" letter-spacing="-1.0">MyClinica</text>
    </g>
    
    <text x="1020" y="100" class="subtitle" font-size="24" fill="#E2FAF5" letter-spacing="2.0" text-anchor="end">3 FERRAMENTAS • 1 ASSINATURA</text>

    <!-- Lado Esquerdo: ANTES -->
    <g transform="translate(80, 340)">
      <text x="0" y="0" class="subtitle" font-size="30" fill="#94A3B8" letter-spacing="2.0">ANTES</text>
      <text x="0" y="70" class="title" font-size="52" fill="#1E293B" letter-spacing="-1.0">3 ferramentas.</text>
      
      <!-- Lista -->
      <circle cx="10" cy="150" r="5" fill="#94A3B8" />
      <text x="35" y="158" class="text" font-size="26" fill="#475569">Agenda online • R$ 45+/mês</text>
      
      <circle cx="10" cy="220" r="5" fill="#94A3B8" />
      <text x="35" y="228" class="text" font-size="26" fill="#475569">WhatsApp API • R$ 90+/mês</text>
      
      <circle cx="10" cy="290" r="5" fill="#94A3B8" />
      <text x="35" y="298" class="text" font-size="26" fill="#475569">Assinatura digital • R$ 35+/mês</text>

      <text x="0" y="400" class="subtitle" font-size="26" fill="#1E293B">Total: R$ 170+/mês em 3 boletos</text>
    </g>

    <!-- Lado Direito: DEPOIS -->
    <g transform="translate(620, 340)">
      <text x="0" y="0" class="subtitle" font-size="30" fill="#99F6E4" letter-spacing="2.0">DEPOIS</text>
      <text x="0" y="70" class="title" font-size="52" fill="#FFFFFF" letter-spacing="-1.0">1 sistema.</text>
      
      <!-- Lista -->
      <circle cx="10" cy="150" r="5" fill="#FFFFFF" />
      <text x="35" y="158" class="subtitle" font-size="28" fill="#F0FDFA">Agenda + WhatsApp +</text>
      <text x="35" y="193" class="subtitle" font-size="28" fill="#F0FDFA">Assinatura</text>
      
      <circle cx="10" cy="270" r="5" fill="#FFFFFF" />
      <text x="35" y="278" class="subtitle" font-size="28" fill="#F0FDFA">Prontuário com IA</text>
      
      <circle cx="10" cy="350" r="5" fill="#FFFFFF" />
      <text x="35" y="358" class="subtitle" font-size="28" fill="#F0FDFA">CRM + Financeiro</text>

      <circle cx="10" cy="430" r="5" fill="#FFFFFF" />
      <text x="35" y="438" class="subtitle" font-size="28" fill="#F0FDFA">Valor único, tudo junto.</text>
    </g>

    <!-- Footer -->
    <rect x="0" y="940" width="1080" height="140" fill="#FFFFFF" />
    <text x="80" y="1020" class="footer" font-size="36" fill="#1E293B">Economia média de R$ 110/mês.</text>
    
    <text x="1000" y="1020" class="text" font-size="28" fill="#475569" text-anchor="end">@myclinicabr</text>
  </svg>
  `;

  await sharp(Buffer.from(svgContent))
    .png({ quality: 100, compressionLevel: 0 })
    .toFile(outputPath);

  await sharp(Buffer.from(svgContent))
    .png({ quality: 100, compressionLevel: 0 })
    .toFile(projectOutputPath);

  console.log('Post 1 Generated Successfully at:', outputPath);
}

buildPost1().catch(console.error);
