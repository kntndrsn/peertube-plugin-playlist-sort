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
  button.addEventListener('click', () => onClick(button, helpers, doAction))

  container.appendChild(button)
}

function onClick (button, helpers, doAction) {
  const playlistId = getPlaylistId()
  if (!playlistId || button.disabled) return

  helpers.showModal({
    title: 'Sort playlist',
    content: '<p>This will permanently reorder the videos of this playlist from newest to oldest, using the original publication date when available. Continue?</p>',
    close: true,
    cancel: { value: 'Cancel' },
    confirm: { value: 'Sort', action: () => sortPlaylist(playlistId, button, helpers, doAction) }
  })
}

async function sortPlaylist (playlistId, button, helpers, doAction) {
  const originalText = button.textContent
  let moves = 0

  button.disabled = true
  if (doAction) doAction('application:increment-loader')

  try {
    const current = await fetchAllElements(playlistId, helpers)
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
      helpers.notifier.info('Playlist is already sorted.')
      button.disabled = false
      return
    }

    helpers.notifier.success('Playlist sorted.')
    window.location.reload()
  } catch (err) {
    console.error('[playlist-sort] Sorting failed', err)
    helpers.notifier.error(`Sorting failed after ${moves} move(s): ${err.message}`)
    button.disabled = false
    button.textContent = originalText
  } finally {
    if (doAction) doAction('application:decrement-loader')
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
  return [ ...elements ].sort((a, b) => {
    const timeA = getPublishTime(a)
    const timeB = getPublishTime(b)

    if (timeA === timeB) return 0
    if (timeA === null) return 1
    if (timeB === null) return -1

    return timeB - timeA
  })
}

async function fetchAllElements (playlistId, helpers) {
  const elements = []
  let total = Infinity

  while (elements.length < total) {
    const body = await apiRequest(
      helpers,
      `/api/v1/video-playlists/${encodeURIComponent(playlistId)}/videos?start=${elements.length}&count=${PAGE_SIZE}`
    )

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
