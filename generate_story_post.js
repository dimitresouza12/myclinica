const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

async function buildStoryPost() {
  const logoPath = path.join(__dirname, 'public', 'myclinica-logo.png');
  const dashboardPath = path.join(__dirname, 'public', 'dashboard-screenshot.png');
  const macbookGreenScreenPath = '/Users/dimitre/.gemini/antigravity/brain/a51dc691-be6d-430f-916a-de04369e7e0f/macbook_pro_mockup_frame_1784678993502.png';
  
  const outputPath = path.join('/Users/dimitre/.gemini/antigravity/brain/a51dc691-be6d-430f-916a-de04369e7e0f', 'myclinica_story_photo_post.png');
  const projectOutputPath = path.join(__dirname, 'public', 'myclinica_story_photo_post.png');

  const logoBase64 = fs.readFileSync(logoPath).toString('base64');
  const dashboardBase64 = fs.readFileSync(dashboardPath).toString('base64');
  const macbookBase64 = fs.readFileSync(macbookGreenScreenPath).toString('base64');

  const width = 1080;
  const height = 1920; 

  const svgContent = `
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
    <defs>
      <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#FFFFFF" />
        <stop offset="60%" stop-color="#F4FBF9" />
        <stop offset="100%" stop-color="#E2FAF5" />
      </linearGradient>
      <linearGradient id="btnGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#52E0C4" />
        <stop offset="100%" stop-color="#0D9488" />
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
      
      <filter id="btnShadow" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="20" stdDeviation="25" flood-color="#0D9488" flood-opacity="0.35" />
      </filter>
      
      <clipPath id="screenClip">
        <rect x="146" y="206" width="732" height="458" rx="4" ry="4" />
      </clipPath>
      
      <style>
        .title { font-family: 'Plus Jakarta Sans', 'Inter', 'Segoe UI', sans-serif; font-weight: 800; fill: #0F172A; }
        .subtitle { font-family: 'Plus Jakarta Sans', 'Inter', 'Segoe UI', sans-serif; font-weight: 500; fill: #475569; }
        .benefit { font-family: 'Plus Jakarta Sans', 'Inter', 'Segoe UI', sans-serif; font-weight: 600; fill: #1E293B; }
        .btn-text { font-family: 'Plus Jakarta Sans', 'Inter', 'Segoe UI', sans-serif; font-weight: 800; fill: #FFFFFF; }
        .multiply-blend { mix-blend-mode: multiply; }
      </style>
    </defs>

    <rect width="${width}" height="${height}" fill="url(#bgGrad)" />
    
    <circle cx="950" cy="-100" r="500" fill="#48E5C8" opacity="0.12" />
    <circle cx="100" cy="2000" r="700" fill="#0D9488" opacity="0.08" />

    <g transform="translate(320, 100)">
      <image href="data:image/png;base64,${logoBase64}" x="0" y="0" width="120" height="120" />
      <text x="145" y="85" class="title" font-size="64" letter-spacing="-1.0">MyClinica</text>
    </g>

            <g transform="translate(0, 220)">
      <text x="540" y="70" class="title" font-size="70" letter-spacing="-1.5" text-anchor="middle">Gestão simples,</text>
      <text x="540" y="150" class="title" font-size="70" letter-spacing="-1.5" text-anchor="middle">prática e eficiente</text>
      <text x="540" y="210" class="subtitle" font-size="32" text-anchor="middle">Agenda, histórico &amp; finanças</text>
      <text x="540" y="255" class="subtitle" font-size="32" text-anchor="middle">Tudo em um só lugar</text>
    </g>

    <g transform="translate(120, 500) scale(0.82)" class="multiply-blend">
      <image href="data:image/jpeg;base64,${macbookBase64}" x="0" y="0" width="1024" height="1024" />
      
      <g clip-path="url(#screenClip)">
        <image href="data:image/png;base64,${dashboardBase64}" x="146" y="206" width="732" height="458" preserveAspectRatio="xMinYMin slice" />
        <rect x="146" y="206" width="732" height="458" fill="url(#screenGloss)" />
      </g>
    </g>

    <g transform="translate(200, 1340)">
      <g transform="translate(0, 0)">
        <circle cx="32" cy="32" r="32" fill="url(#checkGrad)" />
        <path d="M19 32 L27 40 L44 21" stroke="#FFFFFF" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" fill="none" />
        <text x="90" y="44" class="benefit" font-size="38">100% na nuvem e seguro</text>
      </g>
      <g transform="translate(0, 100)">
        <circle cx="32" cy="32" r="32" fill="url(#checkGrad)" />
        <path d="M19 32 L27 40 L44 21" stroke="#FFFFFF" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" fill="none" />
        <text x="90" y="44" class="benefit" font-size="38">Dashboard em tempo real</text>
      </g>
      <g transform="translate(0, 200)">
        <circle cx="32" cy="32" r="32" fill="url(#checkGrad)" />
        <path d="M19 32 L27 40 L44 21" stroke="#FFFFFF" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" fill="none" />
        <text x="90" y="44" class="benefit" font-size="38">Lembretes via WhatsApp</text>
      </g>
      <g transform="translate(0, 300)">
        <circle cx="32" cy="32" r="32" fill="url(#checkGrad)" />
        <path d="M19 32 L27 40 L44 21" stroke="#FFFFFF" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" fill="none" />
        <text x="90" y="44" class="benefit" font-size="38">Prontuário eletrônico</text>
      </g>
    </g>

    <g transform="translate(160, 1730)">
      <rect x="0" y="0" width="760" height="100" rx="25" fill="url(#btnGrad)" filter="url(#btnShadow)" />
      <text x="380" y="62" class="btn-text" font-size="36" text-anchor="middle">Ver como funciona  →</text>
    </g>

  </svg>
  `;

  await sharp(Buffer.from(svgContent))
    .png({ quality: 100, compressionLevel: 0 })
    .toFile(outputPath);

  await sharp(Buffer.from(svgContent))
    .png({ quality: 100, compressionLevel: 0 })
    .toFile(projectOutputPath);

  console.log('Story Format HD Post Generated Successfully at:', outputPath);
}

buildStoryPost().catch(console.error);
