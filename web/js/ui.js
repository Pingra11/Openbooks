export function byId(id) { return document.getElementById(id); }
export function setChip(el, { displayName, photoURL, username }) {
  el.innerHTML = "";
  if (photoURL) {
    const img = document.createElement("img");
    img.src = photoURL;
    img.width = 32;
    img.height = 32;
    img.style.borderRadius = "50%";
    el.appendChild(img);
  }
  const span = document.createElement("span");
  span.textContent = displayName || username || "User";
  el.appendChild(span);
}