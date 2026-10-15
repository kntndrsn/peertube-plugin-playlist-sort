const ROUTE_RE = /^\/my-library\/video-playlists\/([^/?#]+)\/?$/
const BUTTON_CLASS = 'playlist-sort-btn'
const PAGE_SIZE = 100
const WAIT_TIMEOUT_MS = 10000

let observer = null
let observerTimeout = null

function register ({ registerHook, peertubeHelpers, doAction }) {
  const onNavigation = () => {
    stopObserving()

    if (!getPlaylistId() || !peertubeHelpers.isLoggedIn()) return

    waitForButtons(peertubeHelpers, doAction)
  }

  registerHook({
    target: 'action:router.navigation-end',
    handler: onNavigation
  })

  onNavigation()
}

function translate (helpers, text) {
  return helpers.translate(text).catch(() => text)
}

function getPlaylistId () {
  const match = window.location.pathname.match(ROUTE_RE)
  return match ? decodeURIComponent(match[1]) : null
}

function stopObserving () {
  if (observer) observer.disconnect()
  if (observerTimeout) clearTimeout(observerTimeout)

  observer = null
  observerTimeout = null
}

function waitForButtons (helpers, doAction) {
  const tryInject = () => {
    const container = document.querySelector('.playlist-buttons')
    if (!container) return false

    if (!container.querySelector('.' + BUTTON_CLASS)) injectButton(container, helpers, doAction)
    return true
  }

  if (tryInject()) return

  observer = new MutationObserver(() => {
    if (tryInject()) stopObserving()
  })
  observer.observe(document.body, { childList: true, subtree: true })
  observerTimeout = setTimeout(stopObserving, WAIT_TIMEOUT_MS)
}

function injectButton (container, helpers, doAction) {
  // Copy the existing button style since class names differ between PeerTube 6 and 7+
  const reference = container.querySelector('.peertube-button')

  const button = document.createElement('button')
  button.type = 'button'
  button.className = (reference ? reference.className : 'peertube-button secondary-button') + ' ' + BUTTON_CLASS
  button.textContent = 'Sort by date (newest first)'

  translate(helpers, button.textContent).then(label => { button.textContent = label })

  button.addEventListener('click', () => onClick(button, helpers, doAction))

  container.appendChild(button)
}

async function onClick (button, helpers, doAction) {
  const playlistId = getPlaylistId()
  if (!playlistId || button.disabled) return

  const [ title, content, cancel, confirm ] = await Promise.all([
    'Sort playlist',
    'This will permanently reorder the videos of this playlist from newest to oldest, using the original publication date when available. Continue?',
    'Cancel',
    'Sort'
  ].map(s => translate(helpers, s)))

  helpers.showModal({
    title,
    content: `<p>${content}</p>`,
    close: true,
    cancel: { value: cancel },
    confirm: { value: confirm, action: () => sortPlaylist(playlistId, button, helpers, doAction) }
  })
}

async function sortPlaylist (playlistId, button, helpers, doAction) {
  const originalText = button.textContent
  let moves = 0
  let reloading = false

  button.disabled = true
  if (doAction) doAction('application:increment-loader')

  try {
    const current = (await fetchAllElements(playlistId, helpers))
      .sort((a, b) => a.position - b.position)

    const target = sortByPublishDate(current)
    const order = current.map(e => e.id)

    for (let i = 0; i < target.length; i++) {
      const from = order.indexOf(target[i].id)
      if (from === i) continue

      await reorder(playlistId, from + 1, i, helpers)
      order.splice(i, 0, order.splice(from, 1)[0])
      moves++

      button.textContent = `${originalText} (${i + 1}/${target.length})`
    }

    if (moves === 0) {
      helpers.notifier.info(await translate(helpers, 'Playlist is already sorted.'))
      return
    }

    helpers.notifier.success(await translate(helpers, 'Playlist sorted.'))
    reloading = true
    window.location.reload()
  } catch (err) {
    console.error('[playlist-sort] Sorting failed', err)
    helpers.notifier.error(`Sorting failed after ${moves} move(s): ${err.message}`)
  } finally {
    if (doAction) doAction('application:decrement-loader')

    if (!reloading) {
      button.disabled = false
      button.textContent = originalText
    }
  }
}

function getPublishTime (element) {
  const video = element.video
  if (!video) return null

  const time = Date.parse(video.originallyPublishedAt || video.publishedAt)
  return Number.isNaN(time) ? null : time
}

// Newest first; elements without a usable date (e.g. deleted videos) go last, keeping their order
function sortByPublishDate (elements) {
  return elements
    .map((element, index) => ({ element, index, time: getPublishTime(element) }))
    .sort((a, b) => {
      if (a.time === null && b.time === null) return a.index - b.index
      if (a.time === null) return 1
      if (b.time === null) return -1

      return (b.time - a.time) || (a.index - b.index)
    })
    .map(item => item.element)
}

async function fetchAllElements (playlistId, helpers) {
  const elements = []
  let total = Infinity

  while (elements.length < total) {
    const query = new URLSearchParams({ start: String(elements.length), count: String(PAGE_SIZE) })
    const body = await apiRequest(helpers, `/api/v1/video-playlists/${encodeURIComponent(playlistId)}/videos?${query}`)

    total = body.total
    if (!body.data || body.data.length === 0) break

    elements.push(...body.data)
  }

  return elements
}

function reorder (playlistId, startPosition, insertAfterPosition, helpers) {
  return apiRequest(helpers, `/api/v1/video-playlists/${encodeURIComponent(playlistId)}/videos/reorder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ startPosition, insertAfterPosition, reorderLength: 1 })
  })
}

async function apiRequest (helpers, url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { ...helpers.getAuthHeader(), ...(options.headers || {}) }
  })

  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)

  return res.status === 204 ? null : res.json()
}

export {
  register
}
