const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

async function buildPost2() {
  const outputPath = path.join('/Users/dimitre/.gemini/antigravity/brain/a51dc691-be6d-430f-916a-de04369e7e0f', 'myclinica_post2_whatsapp.png');
  const projectOutputPath = path.join(__dirname, 'public', 'myclinica_post2_whatsapp.png');
  
  const logoPath = path.join(__dirname, 'public', 'myclinica-logo.png');
  const logoBase64 = fs.readFileSync(logoPath).toString('base64');

  const width = 1080;
  const height = 1080; 

  const svgContent = `
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
    <defs>
      <linearGradient id="msgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#2DD4BF" />
        <stop offset="100%" stop-color="#0D9488" />
      </linearGradient>

      <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
        <feDropShadow dx="0" dy="20" stdDeviation="25" flood-color="#000000" flood-opacity="0.2" />
      </filter>
      
      <clipPath id="profileClip">
        <circle cx="50" cy="42.5" r="24" />
      </clipPath>

      <style>
        .title { font-family: 'Plus Jakarta Sans', 'Inter', 'Segoe UI', sans-serif; font-weight: 800; fill: #FFFFFF; }
        .text { font-family: 'Plus Jakarta Sans', 'Inter', 'Segoe UI', sans-serif; font-weight: 500; fill: #FFFFFF; }
        .subtitle { font-family: 'Plus Jakarta Sans', 'Inter', 'Segoe UI', sans-serif; font-weight: 700; fill: #042F2E; }
        .msg-text { font-family: 'Plus Jakarta Sans', 'Inter', 'Segoe UI', sans-serif; font-weight: 500; fill: #F8FAFC; }
        .msg-dark { font-family: 'Plus Jakarta Sans', 'Inter', 'Segoe UI', sans-serif; font-weight: 500; fill: #1E293B; }
      </style>
    </defs>

    <!-- Fundo Solid Color -->
    <rect width="${width}" height="${height}" fill="#52E0C4" />
    
    <!-- Header Text -->
    <text x="80" y="100" class="subtitle" font-size="24" letter-spacing="2.0" opacity="0.8">RECURSO • WHATSAPP AUTOMÁTICO</text>
    
    <!-- 70% Menos Faltas -->
    <text x="70" y="380" class="title" font-size="320" fill="#042F2E" letter-spacing="-10.0">70<tspan font-size="160">%</tspan></text>
    
    <text x="80" y="470" class="title" font-size="52" fill="#0F766E" letter-spacing="-1.0">menos faltas</text>
    <text x="395" y="470" class="title" font-size="52" fill="#042F2E" letter-spacing="-1.0"> com confirmação</text>
    <text x="80" y="530" class="title" font-size="52" fill="#042F2E" letter-spacing="-1.0">e lembrete pelo WhatsApp.</text>
    
    <!-- WhatsApp Mockup -->
    <g transform="translate(80, 620)" filter="url(#shadow)">
      <rect x="0" y="0" width="700" height="280" rx="20" fill="#F1F5F9" />
      
      <!-- App Header -->
      <path d="M 0 20 A 20 20 0 0 1 20 0 L 680 0 A 20 20 0 0 1 700 20 L 700 85 L 0 85 Z" fill="#075E54" />

      <!-- Profile Photo -->
      <circle cx="50" cy="42.5" r="24" fill="#FFFFFF" />
      <g clip-path="url(#profileClip)">
        <rect x="26" y="18.5" width="48" height="48" fill="#FFFFFF" />
        <image href="data:image/png;base64,${logoBase64}" x="22" y="14.5" width="56" height="56" />
      </g>
      
      <text x="90" y="38" class="title" font-size="22" fill="#FFFFFF">MyClinica</text>
      <text x="90" y="60" class="text" font-size="16" fill="#D1FAE5">online</text>

      <!-- Message 1 (Clinica) - Esquerda -->
      <!-- Cauda do balão esquerdo -->
      <path d="M40 130 L40 145 L25 130 Z" fill="#FFFFFF" />
      <rect x="40" y="120" width="560" height="60" rx="10" fill="#FFFFFF" />
      <text x="60" y="156" class="msg-dark" font-size="22">Olá Maria! Lembrando da sua sessão amanhã às 10h.</text>
      
      <!-- Message 2 (Paciente) - Direita -->
      <!-- Cauda do balão direito -->
      <path d="M660 205 L660 220 L675 205 Z" fill="#DCF8C6" />
      <rect x="460" y="195" width="200" height="60" rx="10" fill="#DCF8C6" />
      <text x="480" y="232" class="msg-dark" font-size="22">Confirmado! 👍</text>
    </g>

    <!-- Footer -->
    <text x="80" y="1000" class="subtitle" font-size="24" fill="#042F2E" letter-spacing="1.0" opacity="0.8">@myclinicabr</text>
  </svg>
  `;

  await sharp(Buffer.from(svgContent))
    .png({ quality: 100, compressionLevel: 0 })
    .toFile(outputPath);

  await sharp(Buffer.from(svgContent))
    .png({ quality: 100, compressionLevel: 0 })
    .toFile(projectOutputPath);

  console.log('Post 2 Generated Successfully at:', outputPath);
}

buildPost2().catch(console.error);
