/* ==========================================================
   beta-notice.js — One-time "student project / test data" notice
   ========================================================== */

(function () {
  if (localStorage.getItem('betaNoticeSeen')) return;

  const overlay = document.createElement('div');
  overlay.id = 'betaNoticeOverlay';
  overlay.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:999999',
    'background:rgba(15,15,35,0.72)', 'backdrop-filter:blur(4px)',
    'display:flex', 'align-items:center', 'justify-content:center',
    'padding:1rem'
  ].join(';');

  overlay.innerHTML = `
    <div style="
      background:#fff;
      border-radius:16px;
      max-width:480px;
      width:100%;
      padding:2rem 2rem 1.5rem;
      box-shadow:0 20px 60px rgba(0,0,0,0.25);
      position:relative;
      font-family:inherit;
    ">
      <button id="betaNoticeClose" aria-label="Close" style="
        position:absolute; top:1rem; right:1rem;
        background:none; border:none; font-size:1.4rem;
        cursor:pointer; color:#6b7280; line-height:1;
      ">&#x2715;</button>

      <div style="display:flex; align-items:center; gap:0.6rem; margin-bottom:1rem;">
        <span style="font-size:1.5rem;">&#x1F9EA;</span>
        <span style="
          background:#ede9fe; color:#6d28d9;
          font-size:0.75rem; font-weight:700;
          letter-spacing:0.05em; text-transform:uppercase;
          padding:3px 10px; border-radius:999px;
        ">Student Project</span>
      </div>

      <h2 style="margin:0 0 0.75rem; font-size:1.25rem; color:#111827;">
        Welcome to InternHub!
      </h2>
      <p style="margin:0 0 1rem; color:#4b5563; line-height:1.6; font-size:0.95rem;">
        This platform was built as a student project. All listings and profiles
        you see here are <strong>test data</strong> — no real applications are
        processed at this time.
      </p>
      <p style="margin:0 0 1.5rem; color:#4b5563; line-height:1.6; font-size:0.95rem;">
        We&rsquo;ve built a fully working platform and are <strong>open to
        partnerships</strong> with schools and companies who want to bring it
        to life. Interested?
        <a href="footer_info/contact.html" style="color:#6d28d9; text-decoration:underline;">Get in touch</a>.
      </p>

      <button id="betaNoticeGot" style="
        background:#6366f1; color:#fff;
        border:none; border-radius:8px;
        padding:10px 24px; font-size:0.95rem;
        cursor:pointer; font-weight:600; width:100%;
      ">Got it, let me explore!</button>
    </div>
  `;

  document.body.appendChild(overlay);

  function dismiss() {
    localStorage.setItem('betaNoticeSeen', '1');
    overlay.remove();
  }

  document.getElementById('betaNoticeClose').addEventListener('click', dismiss);
  document.getElementById('betaNoticeGot').addEventListener('click', dismiss);
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) dismiss();
  });
})();
