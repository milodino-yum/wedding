// Small progressive enhancements. Everything works without this file.
document.addEventListener("submit", (e) => {
  const form = e.target;
  const msg = form instanceof HTMLFormElement && form.dataset.confirm;
  if (msg && !window.confirm(msg)) e.preventDefault();
});

document.addEventListener("click", (e) => {
  const el = e.target;
  if (el instanceof HTMLInputElement && el.hasAttribute("data-copy")) {
    el.select();
    navigator.clipboard?.writeText(el.value).then(() => {
      el.classList.add("copied");
      setTimeout(() => el.classList.remove("copied"), 1200);
    });
  }
});
