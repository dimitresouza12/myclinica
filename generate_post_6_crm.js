const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

async function buildPost6() {
  const outputPath = path.join('/Users/dimitre/.gemini/antigravity/brain/a51dc691-be6d-430f-916a-de04369e7e0f', 'myclinica_post6_crm.png');
  const projectOutputPath = path.join(__dirname, 'public', 'myclinica_post6_crm.png');
  
  const logoPath = path.join(__dirname, 'public', 'myclinica-logo.png');
  const logoBase64 = fs.readFileSync(logoPath).toString('base64');

  const width = 1080;
  const height = 1080; 

  const svgContent = `
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
    <defs>
      <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#0F172A" />
        <stop offset="100%" stop-color="#020617" />
      </linearGradient>

      <filter id="shadow" x="-10%" y="-10%" width="130%" height="130%">
        <feDropShadow dx="0" dy="25" stdDeviation="35" flood-color="#000000" flood-opacity="0.4" />
      </filter>

      <style>
        .title { font-family: 'Plus Jakarta Sans', 'Inter', 'Segoe UI', sans-serif; font-weight: 800; fill: #FFFFFF; }
        .title-teal { font-family: 'Plus Jakarta Sans', 'Inter', 'Segoe UI', sans-serif; font-weight: 800; fill: #2DD4BF; }
        .text { font-family: 'Plus Jakarta Sans', 'Inter', 'Segoe UI', sans-serif; font-weight: 500; fill: #94A3B8; }
        .ui-title { font-family: 'Plus Jakarta Sans', 'Inter', 'Segoe UI', sans-serif; font-weight: 700; fill: #F8FAFC; }
        .ui-text { font-family: 'Plus Jakarta Sans', 'Inter', 'Segoe UI', sans-serif; font-weight: 500; fill: #94A3B8; }
        .badge-green { font-family: 'Plus Jakarta Sans', 'Inter', 'Segoe UI', sans-serif; font-weight: 700; fill: #10B981; }
        .badge-red { font-family: 'Plus Jakarta Sans', 'Inter', 'Segoe UI', sans-serif; font-weight: 700; fill: #EF4444; }
      </style>
    </defs>

    <!-- Fundo Escuro -->
    <rect width="${width}" height="${height}" fill="url(#bgGrad)" />
    
    <!-- Elementos Decorativos -->
    <circle cx="850" cy="850" r="400" fill="#2DD4BF" opacity="0.05" />

    <!-- Header Logo -->
    <g transform="translate(80, 80)">
      <circle cx="30" cy="30" r="30" fill="#1E293B" />
      <image href="data:image/png;base64,${logoBase64}" x="10" y="10" width="40" height="40" />
      <text x="75" y="42" class="title" font-size="32" letter-spacing="-1.0">MyClinica</text>
    </g>

    <!-- Main Copy -->
    <text x="80" y="240" class="title" font-size="64" letter-spacing="-2.0">Você sabe quais pacientes</text>
    <text x="80" y="310" class="title-teal" font-size="64" letter-spacing="-2.0">sumiram da sua clínica?</text>
    <text x="80" y="380" class="text" font-size="28">Identifique inativos e envie uma campanha de</text>
    <text x="80" y="420" class="text" font-size="28">retorno pelo WhatsApp em segundos.</text>

    <!-- UI Widget - CRM List -->
    <g transform="translate(80, 500)">
      <g filter="url(#shadow)">
        <rect x="0" y="0" width="920" height="380" rx="30" fill="#1E293B" />
        
        <!-- Header List -->
        <rect x="0" y="0" width="920" height="60" rx="30" fill="#334155" />
        <rect x="0" y="30" width="920" height="30" fill="#334155" /> <!-- Hide bottom radius -->
        <text x="40" y="38" class="ui-title" font-size="18" fill="#CBD5E1">Pacientes (Últimos 90 dias)</text>
        
        <!-- Row 1 (Active) -->
        <g transform="translate(0, 90)">
          <circle cx="60" cy="30" r="20" fill="#0F766E" />
          <text x="50" y="36" class="ui-title" font-size="16">F</text>
          <text x="100" y="26" class="ui-title" font-size="22">Fernanda Lima</text>
          <text x="100" y="48" class="ui-text" font-size="14">Última visita: Ontem</text>
          
          <!-- Badge -->
          <rect x="720" y="15" width="140" height="30" rx="15" fill="#10B981" fill-opacity="0.2" />
          <text x="790" y="36" class="badge-green" font-size="14" text-anchor="middle">Frequente</text>
        </g>
        
        <line x1="40" y1="160" x2="880" y2="160" stroke="#334155" stroke-width="2" />
        
        <!-- Row 2 (Inactive - Highlighted) -->
        <g transform="translate(0, 180)">
          <rect x="20" y="-10" width="880" height="80" rx="15" fill="#0F766E" fill-opacity="0.1" stroke="#2DD4BF" stroke-width="2" />
          
          <circle cx="60" cy="30" r="20" fill="#475569" />
          <text x="50" y="36" class="ui-title" font-size="16">M</text>
          <text x="100" y="26" class="ui-title" font-size="22">Marcos Vinícius</text>
          <text x="100" y="48" class="ui-text" font-size="14">Última visita: há 94 dias</text>
          
          <!-- Badge -->
          <rect x="720" y="15" width="140" height="30" rx="15" fill="#EF4444" fill-opacity="0.2" />
          <text x="790" y="36" class="badge-red" font-size="14" text-anchor="middle">Inativo (Risco)</text>
          
          <!-- WhatsApp Button -->
          <g transform="translate(540, 10)">
            <rect x="0" y="0" width="160" height="40" rx="20" fill="#2DD4BF" />
            <!-- Send Icon -->
            <path d="M 20 20 L 40 12 L 20 28 Z" fill="none" stroke="#042F2E" stroke-width="2" />
            <text x="85" y="26" class="ui-title" font-size="14" fill="#042F2E" text-anchor="middle">Enviar Mensagem</text>
          </g>
        </g>

        <line x1="40" y1="270" x2="880" y2="270" stroke="#334155" stroke-width="2" />

        <!-- Row 3 (Active) -->
        <g transform="translate(0, 290)">
          <circle cx="60" cy="30" r="20" fill="#0F766E" />
          <text x="50" y="36" class="ui-title" font-size="16">C</text>
          <text x="100" y="26" class="ui-title" font-size="22">Camila Rocha</text>
          <text x="100" y="48" class="ui-text" font-size="14">Última visita: há 12 dias</text>
          
          <!-- Badge -->
          <rect x="720" y="15" width="140" height="30" rx="15" fill="#10B981" fill-opacity="0.2" />
          <text x="790" y="36" class="badge-green" font-size="14" text-anchor="middle">Ativa</text>
        </g>
      </g>
    </g>

    <!-- Footer Copy -->
    <text x="80" y="1000" class="text" font-size="24" letter-spacing="1.0">@myclinicabr</text>

  </svg>
  `;

  await sharp(Buffer.from(svgContent))
    .png({ quality: 100, compressionLevel: 0 })
    .toFile(outputPath);

  await sharp(Buffer.from(svgContent))
    .png({ quality: 100, compressionLevel: 0 })
    .toFile(projectOutputPath);

  console.log('Post 6 Generated Successfully');
}

buildPost6().catch(console.error);
