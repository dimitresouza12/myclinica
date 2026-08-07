const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

async function buildWppBanner() {
  const logoPath = path.join(__dirname, 'public', 'myclinica-logo.png');
  const dashboardPath = path.join(__dirname, 'public', 'dashboard-screenshot.png');
  const macbookGreenScreenPath = '/Users/dimitre/.gemini/antigravity/brain/a51dc691-be6d-430f-916a-de04369e7e0f/macbook_pro_mockup_frame_1784678993502.png';
  
  const outputPath = path.join('/Users/dimitre/.gemini/antigravity/brain/a51dc691-be6d-430f-916a-de04369e7e0f', 'myclinica_wpp_banner.png');
  const projectOutputPath = path.join(__dirname, 'public', 'myclinica_wpp_banner.png');

  const logoBase64 = fs.readFileSync(logoPath).toString('base64');
  const dashboardBase64 = fs.readFileSync(dashboardPath).toString('base64');
  const macbookBase64 = fs.readFileSync(macbookGreenScreenPath).toString('base64');

  const width = 1920;
  const height = 1080; 

  const svgContent = `
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
    <defs>
      <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#FFFFFF" />
        <stop offset="60%" stop-color="#F4FBF9" />
        <stop offset="100%" stop-color="#E2FAF5" />
      </linearGradient>
      <linearGradient id="checkGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#48E5C8" />
        <stop offset="100%" stop-color="#0D9488" />
      </linearGradient>
      <linearGradient id="screenGloss" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.15" />
        <stop offset="40%" stop-color="#FFFFFF" stop-opacity="0.05" />
        <stop offset="41%" stop-color="#FFFFFF" stop-opacity="0" />
        <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0" />
      </linearGradient>
      
      <clipPath id="screenClip">
        <rect x="146" y="206" width="732" height="458" rx="4" ry="4" />
      </clipPath>
      
      <style>
        .title { font-family: 'Plus Jakarta Sans', 'Inter', 'Segoe UI', sans-serif; font-weight: 800; fill: #0F172A; }
        .subtitle { font-family: 'Plus Jakarta Sans', 'Inter', 'Segoe UI', sans-serif; font-weight: 500; fill: #475569; }
        .benefit { font-family: 'Plus Jakarta Sans', 'Inter', 'Segoe UI', sans-serif; font-weight: 600; fill: #1E293B; }
        .multiply-blend { mix-blend-mode: multiply; }
      </style>
    </defs>

    <rect width="${width}" height="${height}" fill="url(#bgGrad)" />
    
    <circle cx="1700" cy="0" r="700" fill="#48E5C8" opacity="0.12" />
    <circle cx="200" cy="1100" r="600" fill="#0D9488" opacity="0.08" />

    <g transform="translate(120, 160)">
      <image href="data:image/png;base64,${logoBase64}" x="0" y="0" width="140" height="140" />
      <text x="170" y="95" class="title" font-size="76" letter-spacing="-1.0">MyClinica</text>
    </g>

    <g transform="translate(120, 420)">
      <text x="0" y="0" class="title" font-size="85" letter-spacing="-1.5">Gestão simples,</text>
      <text x="0" y="90" class="title" font-size="85" letter-spacing="-1.5">prática e eficiente</text>
      <text x="0" y="170" class="subtitle" font-size="38">Agenda, histórico &amp; finanças</text>
    </g>

    <g transform="translate(120, 680)">
      <g transform="translate(0, 0)">
        <circle cx="36" cy="36" r="36" fill="url(#checkGrad)" />
        <path d="M22 36 L30 45 L50 24" stroke="#FFFFFF" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" fill="none" />
        <text x="100" y="50" class="benefit" font-size="42">100% na nuvem e seguro</text>
      </g>
      <g transform="translate(0, 100)">
        <circle cx="36" cy="36" r="36" fill="url(#checkGrad)" />
        <path d="M22 36 L30 45 L50 24" stroke="#FFFFFF" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" fill="none" />
        <text x="100" y="50" class="benefit" font-size="42">Lembretes via WhatsApp</text>
      </g>
      <g transform="translate(0, 200)">
        <circle cx="36" cy="36" r="36" fill="url(#checkGrad)" />
        <path d="M22 36 L30 45 L50 24" stroke="#FFFFFF" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" fill="none" />
        <text x="100" y="50" class="benefit" font-size="42">Prontuário eletrônico</text>
      </g>
    </g>

    <g transform="translate(800, 200) scale(1.05)" class="multiply-blend">
      <image href="data:image/jpeg;base64,${macbookBase64}" x="0" y="0" width="1024" height="1024" />
      
      <g clip-path="url(#screenClip)">
        <image href="data:image/png;base64,${dashboardBase64}" x="146" y="206" width="732" height="458" preserveAspectRatio="xMinYMin slice" />
        <rect x="146" y="206" width="732" height="458" fill="url(#screenGloss)" />
      </g>
    </g>
  </svg>
  `;

  await sharp(Buffer.from(svgContent))
    .png({ quality: 100, compressionLevel: 0 })
    .toFile(outputPath);

  await sharp(Buffer.from(svgContent))
    .png({ quality: 100, compressionLevel: 0 })
    .toFile(projectOutputPath);

  console.log('WhatsApp Banner Generated Successfully at:', outputPath);
}

buildWppBanner().catch(console.error);
