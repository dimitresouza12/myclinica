const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

async function buildHdPost() {
  const logoPath = path.join(__dirname, 'public', 'myclinica-logo.png');
  const dashboardPath = path.join(__dirname, 'public', 'dashboard-screenshot.png');
  const outputPath = path.join('/Users/dimitre/.gemini/antigravity/brain/a51dc691-be6d-430f-916a-de04369e7e0f', 'myclinica_hd_exact_post.png');
  const projectOutputPath = path.join(__dirname, 'public', 'myclinica_hd_exact_post.png');

  const logoBase64 = fs.readFileSync(logoPath).toString('base64');
  const dashboardBase64 = fs.readFileSync(dashboardPath).toString('base64');

  const width = 1080;
  const height = 1080;

  const svgContent = `
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <!-- Background Gradients -->
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

      <!-- MacBook Metallic Gradients -->
      <linearGradient id="macSilver" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#DFE1E5" />
        <stop offset="50%" stop-color="#C5C9D1" />
        <stop offset="100%" stop-color="#9CA3AF" />
      </linearGradient>
      
      <linearGradient id="macEdge" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#E5E7EB" />
        <stop offset="10%" stop-color="#FFFFFF" />
        <stop offset="50%" stop-color="#D1D5DB" />
        <stop offset="90%" stop-color="#FFFFFF" />
        <stop offset="100%" stop-color="#9CA3AF" />
      </linearGradient>

      <!-- Screen Bezel Gradient -->
      <linearGradient id="bezelGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#111827" />
        <stop offset="100%" stop-color="#030712" />
      </linearGradient>

      <linearGradient id="screenGloss" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.1" />
        <stop offset="40%" stop-color="#FFFFFF" stop-opacity="0.02" />
        <stop offset="41%" stop-color="#FFFFFF" stop-opacity="0" />
        <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0" />
      </linearGradient>

      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="35" stdDeviation="25" flood-color="#020617" flood-opacity="0.35" />
      </filter>

      <!-- Clip Path -->
      <clipPath id="screenClip">
        <rect x="560" y="270" width="495" height="320" rx="4" ry="4" />
      </clipPath>

      <style>
        .title { font-family: 'Plus Jakarta Sans', 'Inter', 'Segoe UI', sans-serif; font-weight: 800; fill: #0F172A; }
        .subtitle { font-family: 'Plus Jakarta Sans', 'Inter', 'Segoe UI', sans-serif; font-weight: 500; fill: #475569; }
        .benefit { font-family: 'Plus Jakarta Sans', 'Inter', 'Segoe UI', sans-serif; font-weight: 600; fill: #1E293B; }
        .btn-text { font-family: 'Plus Jakarta Sans', 'Inter', 'Segoe UI', sans-serif; font-weight: 700; fill: #FFFFFF; }
      </style>
    </defs>

    <rect width="${width}" height="${height}" fill="url(#bgGrad)" />
    <circle cx="1020" cy="80" r="320" fill="#48E5C8" opacity="0.08" />
    <circle cx="980" cy="980" r="420" fill="#0D9488" opacity="0.06" />

    <!-- LEFT SIDE CONTENT -->
    <g transform="translate(70, 75)">
      <image href="data:image/png;base64,${logoBase64}" x="0" y="0" width="70" height="70" />
      <text x="88" y="48" class="title" font-size="38" letter-spacing="-0.5">MyClinica</text>
    </g>

    <g transform="translate(70, 220)">
      <text x="0" y="40" class="title" font-size="42" letter-spacing="-0.8">Gestão clínica simples,</text>
      <text x="0" y="92" class="title" font-size="42" letter-spacing="-0.8">prática e eficiente</text>
      <text x="0" y="152" class="subtitle" font-size="19">Evoluções, histórico, agenda e financeiro</text>
      <text x="0" y="180" class="subtitle" font-size="19">em um só lugar.</text>
    </g>

    <g transform="translate(70, 470)">
      <!-- Items -->
      <g transform="translate(0, 0)">
        <circle cx="18" cy="18" r="18" fill="url(#checkGrad)" />
        <path d="M11 18 L16 23 L25 12" stroke="#FFFFFF" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" fill="none" />
        <text x="48" y="24" class="benefit" font-size="20">Seguro e em conformidade</text>
      </g>
      <g transform="translate(0, 65)">
        <circle cx="18" cy="18" r="18" fill="url(#checkGrad)" />
        <path d="M11 18 L16 23 L25 12" stroke="#FFFFFF" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" fill="none" />
        <text x="48" y="24" class="benefit" font-size="20">Dashboard financeiro em tempo real</text>
      </g>
      <g transform="translate(0, 130)">
        <circle cx="18" cy="18" r="18" fill="url(#checkGrad)" />
        <path d="M11 18 L16 23 L25 12" stroke="#FFFFFF" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" fill="none" />
        <text x="48" y="24" class="benefit" font-size="20">Ações e lembretes via WhatsApp</text>
      </g>
      <g transform="translate(0, 195)">
        <circle cx="18" cy="18" r="18" fill="url(#checkGrad)" />
        <path d="M11 18 L16 23 L25 12" stroke="#FFFFFF" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" fill="none" />
        <text x="48" y="24" class="benefit" font-size="20">Prontuário eletrônico completo</text>
      </g>
    </g>

    <g transform="translate(70, 780)">
      <rect x="0" y="0" width="320" height="66" rx="14" fill="url(#btnGrad)" filter="url(#shadow)" />
      <text x="160" y="41" class="btn-text" font-size="20" text-anchor="middle">Ver como funciona  →</text>
    </g>

    <!-- ULTRA REALISTIC MACBOOK PRO MOCKUP -->
    <g filter="url(#shadow)">
      
      <!-- Back Lid / Edge -->
      <rect x="546" y="253" width="522" height="354" rx="16" ry="16" fill="url(#macSilver)" />
      <rect x="548" y="255" width="518" height="350" rx="14" ry="14" fill="url(#bezelGrad)" />
      
      <!-- Black Screen Bezel -->
      <rect x="556" y="265" width="502" height="330" rx="6" ry="6" fill="#050505" />

      <!-- Camera Notch (MacBook Pro M-Series) -->
      <path d="M 770 265 L 844 265 C 844 265 844 278 834 278 L 780 278 C 770 278 770 265 770 265 Z" fill="#050505" />
      <circle cx="807" cy="272" r="2.5" fill="#112959" />
      <circle cx="807" cy="272" r="1" fill="#4B8BF5" />
      
      <!-- EXACT DASHBOARD SCREENSHOT (100% CRISP UNBLURRED) -->
      <g clip-path="url(#screenClip)">
        <image href="data:image/png;base64,${dashboardBase64}" x="560" y="270" width="495" height="320" preserveAspectRatio="none" />
        
        <!-- Screen Gloss Reflection -->
        <rect x="560" y="270" width="495" height="320" fill="url(#screenGloss)" />
      </g>

      <!-- Laptop Hinge Base -->
      <path d="M 480 605 L 1150 605 C 1150 605 1145 618 1130 618 L 500 618 C 485 618 480 605 480 605 Z" fill="#6B7280" />
      
      <!-- Metallic Front Lip -->
      <path d="M 480 605 L 1150 605 L 1150 609 C 1150 609 1140 613 1130 613 L 500 613 C 490 613 480 609 480 609 Z" fill="url(#macEdge)" />
      
      <!-- Trackpad Groove Indent -->
      <rect x="760" y="605" width="94" height="4" rx="2" fill="#9CA3AF" />
      <rect x="762" y="606" width="90" height="2" rx="1" fill="#4B5563" opacity="0.7" />
    </g>
  </svg>
  `;

  await sharp(Buffer.from(svgContent))
    .png({ quality: 100, compressionLevel: 0 })
    .toFile(outputPath);

  await sharp(Buffer.from(svgContent))
    .png({ quality: 100, compressionLevel: 0 })
    .toFile(projectOutputPath);

  console.log('HD Post Generated Successfully at:', outputPath);
}

buildHdPost().catch(console.error);
