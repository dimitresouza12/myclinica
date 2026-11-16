/* Service worker do MyClinica. Escopo deliberadamente pequeno: dados de saúde nunca ficam em cache.
 *
 * O que entra em cache (só mesma origem, só GET, só resposta 200):
 *   - /_next/static/*, /icons/*, fontes e imagens estáticas (svg, png, webp...) -> stale-while-revalidate
 *   - a página /offline (e os arquivos de /_next/static que ela usa), guardados na instalação
 *
 * O que NUNCA entra em cache: HTML de navegação, /api/*, /p/* (portal do paciente), /verificar/*,
 * /agendar/*, qualquer outra origem (Supabase, Storage...), requisições com Authorization e
 * respostas com Cache-Control no-store/private.
 *
 * Navegação: rede primeiro; só se a rede falhar mostra /offline.
 */

// Mude esta constante para invalidar todo o cache antigo.
const CACHE_VERSION = 'v1'
const CACHE_PREFIX = 'myclinica-'
const STATIC_CACHE = CACHE_PREFIX + 'static-' + CACHE_VERSION
const OFFLINE_URL = '/offline'

const STATIC_EXT = /\.(?:svg|png|webp|jpg|jpeg|gif|ico|woff2?|ttf|otf)$/i
const NEVER_CACHE_PREFIXES = ['/api/', '/p/', '/verificar/', '/agendar/']

self.addEventListener('install', (event) => {
  event.waitUntil(precacheOffline().then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== STATIC_CACHE)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (request.headers.has('Authorization')) return
  if (NEVER_CACHE_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) {
    // /p/* etc: nem intercepta a busca de dados; só a navegação ganha a tela offline
    if (request.mode === 'navigate') event.respondWith(networkFirstNavigation(request))
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request))
    return
  }

  if (isStaticAsset(url)) {
    event.respondWith(staleWhileRevalidate(event, request))
  }
})

function isStaticAsset(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    STATIC_EXT.test(url.pathname)
  )
}

function isCacheable(response) {
  if (!response || response.status !== 200 || response.type !== 'basic' || response.redirected) return false
  const cacheControl = (response.headers.get('Cache-Control') || '').toLowerCase()
  return !cacheControl.includes('no-store') && !cacheControl.includes('private')
}

async function staleWhileRevalidate(event, request) {
  const cache = await caches.open(STATIC_CACHE)
  const cached = await cache.match(request)

  const refresh = fetch(request)
    .then((response) => {
      if (isCacheable(response)) cache.put(request, response.clone())
      return response
    })
    .catch(() => undefined)

  if (cached) {
    event.waitUntil(refresh)
    return cached
  }
  const response = await refresh
  return response || Response.error()
}

async function networkFirstNavigation(request) {
  try {
    return await fetch(request)
  } catch (err) {
    const cache = await caches.open(STATIC_CACHE)
    const offline = await cache.match(OFFLINE_URL)
    return offline || Response.error()
  }
}

// Guarda a página /offline e os arquivos estáticos que ela referencia (css/js/fontes de /_next/static),
// para ela aparecer formatada sem rede. A página não tem dados de usuário.
async function precacheOffline() {
  try {
    const cache = await caches.open(STATIC_CACHE)
    const response = await fetch(OFFLINE_URL, { credentials: 'omit', cache: 'reload' })
    if (!isCacheable(response)) return
    const html = await response.clone().text()
    await cache.put(OFFLINE_URL, response)

    const assets = new Set()
    const pattern = /\/_next\/static\/[^"'\\\s)]+/g
    let match
    while ((match = pattern.exec(html)) !== null) assets.add(match[0])
    await Promise.all(Array.from(assets).map(async (asset) => {
      try {
        const res = await fetch(asset, { credentials: 'omit' })
        if (isCacheable(res)) await cache.put(asset, res)
      } catch (err) { /* o arquivo é recuperado na próxima visita online */ }
    }))
  } catch (err) {
    /* instalação segue sem a página offline; ela é tentada de novo na próxima versão do worker */
  }
}
