const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

async function buildPost4() {
  const outputPath = path.join('/Users/dimitre/.gemini/antigravity/brain/a51dc691-be6d-430f-916a-de04369e7e0f', 'myclinica_post4_agenda.png');
  const projectOutputPath = path.join(__dirname, 'public', 'myclinica_post4_agenda.png');
  
  const logoPath = path.join(__dirname, 'public', 'myclinica-logo.png');
  const logoBase64 = fs.readFileSync(logoPath).toString('base64');

  const width = 1080;
  const height = 1080; 

  const svgContent = `
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
    <defs>
      <filter id="shadow" x="-10%" y="-10%" width="130%" height="130%">
        <feDropShadow dx="0" dy="25" stdDeviation="35" flood-color="#042F2E" flood-opacity="0.2" />
      </filter>
      <filter id="floatShadow" x="-10%" y="-10%" width="130%" height="130%">
        <feDropShadow dx="0" dy="15" stdDeviation="20" flood-color="#042F2E" flood-opacity="0.3" />
      </filter>

      <style>
        .title { font-family: 'Plus Jakarta Sans', 'Inter', 'Segoe UI', sans-serif; font-weight: 800; fill: #042F2E; }
        .title-highlight { font-family: 'Plus Jakarta Sans', 'Inter', 'Segoe UI', sans-serif; font-weight: 800; fill: #FFFFFF; }
        .text { font-family: 'Plus Jakarta Sans', 'Inter', 'Segoe UI', sans-serif; font-weight: 500; fill: #0F766E; }
        .text-bold { font-family: 'Plus Jakarta Sans', 'Inter', 'Segoe UI', sans-serif; font-weight: 700; fill: #042F2E; }
        .footer-text { font-family: 'Plus Jakarta Sans', 'Inter', 'Segoe UI', sans-serif; font-weight: 700; fill: #042F2E; opacity: 0.8; }
        .ui-text { font-family: 'Plus Jakarta Sans', 'Inter', 'Segoe UI', sans-serif; font-weight: 500; fill: #64748B; }
        .ui-title { font-family: 'Plus Jakarta Sans', 'Inter', 'Segoe UI', sans-serif; font-weight: 700; fill: #0F172A; }
      </style>
    </defs>

    <!-- Fundo Solid Color Teal -->
    <rect width="${width}" height="${height}" fill="#52E0C4" />

    <!-- Elementos Decorativos -->
    <circle cx="850" cy="150" r="300" fill="#FFFFFF" opacity="0.1" />
    <circle cx="150" cy="950" r="400" fill="#042F2E" opacity="0.05" />

    <!-- Header Logo -->
    <g transform="translate(80, 80)">
      <image href="data:image/png;base64,${logoBase64}" x="0" y="0" width="60" height="60" />
      <text x="75" y="42" class="title" font-size="32" letter-spacing="-1.0">MyClinica</text>
    </g>

    <!-- Main Copy -->
    <text x="80" y="240" class="title" font-size="70" letter-spacing="-2.0">Chega de <tspan class="title-highlight">buracos</tspan></text>
    <text x="80" y="320" class="title" font-size="70" letter-spacing="-2.0">na sua agenda.</text>
    <text x="80" y="380" class="text" font-size="28">Seu paciente agenda sozinho online. Você</text>
    <text x="80" y="420" class="text" font-size="28">foca no atendimento, não no telefone.</text>

    <!-- SVG Calendar Widget -->
    <g transform="translate(80, 520)">
      <!-- Base Card -->
      <g filter="url(#shadow)">
        <rect x="0" y="0" width="920" height="400" rx="24" fill="#FFFFFF" />
        
        <!-- Header -->
        <path d="M 0 24 A 24 24 0 0 1 24 0 L 896 0 A 24 24 0 0 1 920 24 L 920 80 L 0 80 Z" fill="#F8FAFC" />
        <text x="40" y="50" class="ui-title" font-size="24">Agenda Semanal</text>

        <!-- Time Column -->
        <text x="40" y="140" class="ui-text" font-size="16">08:00</text>
        <line x1="100" y1="135" x2="880" y2="135" stroke="#E2E8F0" stroke-width="2" />
        
        <text x="40" y="220" class="ui-text" font-size="16">09:00</text>
        <line x1="100" y1="215" x2="880" y2="215" stroke="#E2E8F0" stroke-width="2" />

        <text x="40" y="300" class="ui-text" font-size="16">10:00</text>
        <line x1="100" y1="295" x2="880" y2="295" stroke="#E2E8F0" stroke-width="2" />

        <!-- Appointments -->
        <!-- Slot 1 -->
        <rect x="120" y="100" width="220" height="70" rx="10" fill="#E0F2FE" stroke="#38BDF8" stroke-width="2" />
        <text x="140" y="130" class="ui-title" font-size="18" fill="#0369A1">Juliana Martins</text>
        <text x="140" y="155" class="ui-text" font-size="14" fill="#0284C7">Consulta Inicial</text>

        <!-- Slot 2 -->
        <rect x="380" y="140" width="220" height="110" rx="10" fill="#ECFDF5" stroke="#34D399" stroke-width="2" />
        <text x="400" y="170" class="ui-title" font-size="18" fill="#047857">Rafael Costa</text>
        <text x="400" y="195" class="ui-text" font-size="14" fill="#059669">Retorno (Plano)</text>
        
        <!-- Slot 3 -->
        <rect x="640" y="260" width="220" height="70" rx="10" fill="#FEF3C7" stroke="#FBBF24" stroke-width="2" />
        <text x="660" y="290" class="ui-title" font-size="18" fill="#B45309">Carlos Almeida</text>
        <text x="660" y="315" class="ui-text" font-size="14" fill="#D97706">Procedimento</text>
      </g>

      <!-- Floating Badge Novo Agendamento -->
      <g transform="translate(680, -40)" filter="url(#floatShadow)">
        <rect x="0" y="0" width="280" height="80" rx="40" fill="#10B981" />
        <circle cx="40" cy="40" r="30" fill="#FFFFFF" />
        <!-- Check Icon -->
        <path d="M 28 40 L 36 48 L 52 32" fill="none" stroke="#10B981" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
        <text x="85" y="46" class="ui-title" font-size="18" fill="#FFFFFF">Novo Agendamento</text>
      </g>
    </g>

    <!-- Footer Copy -->
    <text x="80" y="1000" class="footer-text" font-size="24" letter-spacing="1.0">@myclinicabr</text>

  </svg>
  `;

  await sharp(Buffer.from(svgContent))
    .png({ quality: 100, compressionLevel: 0 })
    .toFile(outputPath);

  await sharp(Buffer.from(svgContent))
    .png({ quality: 100, compressionLevel: 0 })
    .toFile(projectOutputPath);

  console.log('Post 4 Generated Successfully');
}

buildPost4().catch(console.error);
