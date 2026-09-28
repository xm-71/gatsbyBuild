// Full-screen loading overlay with a progress bar, shared by start-up and seed changes.
let root = null
let label = null
let fill = null

function ensure() {
  if (root) return
  root = document.getElementById("loading")
  if (!root) {
    root = document.createElement("div")
    root.id = "loading"
    document.body.appendChild(root)
  }
  root.innerHTML = `<div class="load-box"><div class="load-title">ASHFALL</div><div class="load-label"></div><div class="load-bar"><div class="load-fill"></div></div></div>`
  label = root.querySelector(".load-label")
  fill = root.querySelector(".load-fill")
}

export function showLoading(text, frac = 0) {
  ensure()
  root.hidden = false
  label.textContent = text
  fill.style.width = `${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%`
}

export function hideLoading() {
  if (root) root.hidden = true
}
