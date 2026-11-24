/* Get the next trip. The address is checked in the page, the stamp is cancelled, and a postcard comes back
   that says this is a sample. Nothing leaves the page: the form has no action, the field has no name, and
   there is no network call anywhere in this file. */

const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function initPost({ still }) {
  const form = document.getElementById('next-trip'), envelope = document.getElementById('envelope');
  if (!form || !envelope) return;
  const input = document.getElementById('email'), msg = document.getElementById('email-msg'), stamp = document.getElementById('postage');
  const card = document.getElementById('postcard'), to = document.getElementById('pc-email'), again = document.getElementById('again');
  let timer = 0;

  function complain(text) {
    input.setAttribute('aria-invalid', 'true');
    msg.textContent = text;
    input.focus();
  }
  function clear() { input.removeAttribute('aria-invalid'); msg.textContent = ''; }

  form.addEventListener('submit', e => {
    e.preventDefault();
    if (envelope.classList.contains('is-sent')) return;
    const value = input.value.trim();
    if (!value) return complain('Write an email address on the line first.');
    if (!LOOKS_LIKE_EMAIL.test(value)) return complain('That does not look like an email address. Try one like you@example.com.');
    clear();
    to.textContent = value;
    envelope.classList.add('is-sent');                 // the postmark lands on the stamp
    stamp.disabled = true; form.inert = true;
    clearTimeout(timer);
    timer = setTimeout(() => {
      card.hidden = false;
      card.classList.add('is-in');
      card.focus({ preventScroll: true });
      const r = card.getBoundingClientRect();
      if (r.top < 12 || r.bottom > window.innerHeight - 12) card.scrollIntoView({ block: 'center', behavior: still ? 'auto' : 'smooth' });
    }, still ? 0 : 520);
  });
  input.addEventListener('input', () => { if (input.hasAttribute('aria-invalid')) clear(); });

  again.addEventListener('click', () => {
    clearTimeout(timer);
    card.hidden = true; card.classList.remove('is-in');
    envelope.classList.remove('is-sent');
    stamp.disabled = false; form.inert = false;
    input.value = ''; to.textContent = ''; clear();
    input.focus();
  });
}
