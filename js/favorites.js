/* ==========================================================
   favorites.js — Supabase favorites sync & profile panel rendering
   ========================================================== */

// Loads favorites from Supabase and renders them in #favoritesContainer.
// Only shows internships the student has liked but NOT yet applied to.
// All display data (title, company, city, dates) is fetched from positions/Companies tables.
async function loadFavorites() {
  const container = document.getElementById('favoritesContainer');
  if (!container) return;

  // Check role - only students can see favorites
  const userRole = localStorage.getItem('userRole');
  if (userRole !== '1') {
    container.innerHTML = '<p style="font-size:0.85rem;color:var(--text-light);">Only students can save favorites.</p>';
    return;
  }

  const userId = parseInt(localStorage.getItem('userId'));
  if (!userId) {
    container.innerHTML = '<p style="font-size:0.85rem;color:var(--text-light);">Log in to see saved internships.</p>';
    return;
  }

  // 1. Get favorite internship IDs for this user
  const { data: favs, error: favError } = await supabaseClient
    .from('favorites')
    .select('id, internship_id, saved_at')
    .eq('user_id', userId)
    .order('saved_at', { ascending: false });

  if (favError) {
    console.error('[loadFavorites] error:', favError.message);
    container.innerHTML = '<p style="color:var(--text-light); font-size:0.9rem;">No saved internships yet.</p>';
    return;
  }
  if (!favs || favs.length === 0) {
    container.innerHTML = '<p style="color:var(--text-light); font-size:0.9rem;">No saved internships yet.</p>';
    return;
  }

  // Sync IDs to localStorage so heart icons on the same page are correct
  const allIds = favs.map(f => f.internship_id.toString());
  localStorage.setItem('favorites', JSON.stringify(allIds));

  // 2. Get position IDs the student already applied to (to exclude them)
  let appliedIds = new Set();
  const { data: profile } = await supabaseClient
    .from('student_profiles')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  if (profile?.id) {
    const { data: apps } = await supabaseClient
      .from('applications')
      .select('position_id')
      .eq('student_id', profile.id);
    appliedIds = new Set((apps || []).map(a => a.position_id?.toString()));
  }

  // 3. Keep only liked-but-not-applied
  const unapplied = favs.filter(f => !appliedIds.has(f.internship_id?.toString()));

  if (unapplied.length === 0) {
    container.innerHTML = '<p style="color:var(--text-light); font-size:0.9rem;">No saved internships yet.</p>';
    return;
  }

  // 4. Fetch position details
  const positionIds = unapplied.map(f => Number(f.internship_id)).filter(Boolean);
  const { data: positions, error: posError } = await supabaseClient
    .from('positions')
    .select('position_id, title, company_id, period_start, period_end, is_open_ended, status')
    .in('position_id', positionIds);

  if (posError) {
    console.error('[loadFavorites] positions error:', posError.message);
    container.innerHTML = '<p style="color:var(--text-light); font-size:0.9rem;">No saved internships yet.</p>';
    return;
  }

  // 5. Fetch company names and cities
  const companyIds = [...new Set((positions || []).map(p => p.company_id).filter(Boolean))];
  const companyMap = {};
  if (companyIds.length > 0) {
    const { data: companies } = await supabaseClient
      .from('Companies')
      .select('company_id, company_name, city')
      .in('company_id', companyIds);
    (companies || []).forEach(c => { companyMap[c.company_id] = c; });
  }

  (function() {
  const userRole = localStorage.getItem('userRole');
  const favContainer = document.getElementById('favBtnContainer');
  if (favContainer && userRole !== '1') {
    favContainer.style.display = 'none';
  }
})();

  const positionMap = {};
  (positions || []).forEach(p => { positionMap[p.position_id] = p; });

  const formatDate = typeof window.formatDateEuropean === 'function'
    ? window.formatDateEuropean
    : dateString => {
        if (!dateString) return '';
        const d = new Date(dateString);
        return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
      };

  // 6. Render
  const html = unapplied.map(fav => {
    const pos = positionMap[Number(fav.internship_id)];
    if (!pos) return '';

    const company = companyMap[pos.company_id];
    const companyName = company?.company_name || 'Unknown';
    const city = company?.city || '';

    let periodText = '';
    if (pos.is_open_ended) {
      periodText = 'Open-ended';
    } else if (pos.period_start || pos.period_end) {
      const start = pos.period_start ? formatDate(pos.period_start) : 'TBD';
      const end   = pos.period_end   ? formatDate(pos.period_end)   : 'Open';
      periodText = `${start} – ${end}`;
    }

    const isClosed = pos.status && pos.status !== 'active';
    return `
      <div class="fav-item" id="fav-${fav.id}" ${isClosed ? 'style="opacity:0.75;"' : ''}>
        <div class="fav-item-info">
          <a href="internship-detail.html?id=${fav.internship_id}" ${isClosed ? 'style="color:#9ca3af;"' : ''}>${pos.title}${isClosed ? ' <span style="font-size:0.7rem;background:#fee2e2;color:#991b1b;padding:1px 5px;border-radius:4px;vertical-align:middle;font-weight:600;">Closed</span>' : ''}</a>
          <span>${companyName}${city ? ' · ' + city : ''}${periodText ? ' · ' + periodText : ''}</span>
        </div>
        <button class="fav-remove-btn" onclick="removeFavorite('${fav.id}', '${fav.internship_id}')" title="Remove">✕</button>
      </div>
    `;
  }).filter(Boolean).join('');

  container.innerHTML = html || '<p style="color:var(--text-light); font-size:0.9rem;">No saved internships yet.</p>';
}

// Removes a favorite row by its table ID. Updates localStorage and fires favoritesUpdated.
async function removeFavorite(favId, internshipId) {
  const { error } = await supabaseClient.from('favorites').delete().eq('id', favId);
  if (error) { console.error('[removeFavorite] error:', error.message); return; }

  document.getElementById('fav-' + favId)?.remove();

  const stored = JSON.parse(localStorage.getItem('favorites') || '[]');
  localStorage.setItem('favorites', JSON.stringify(stored.filter(id => id !== internshipId?.toString())));

  const container = document.getElementById('favoritesContainer');
  if (container && !container.querySelector('.fav-item')) {
    container.innerHTML = '<p style="color:var(--text-light); font-size:0.9rem;">No saved internships yet.</p>';
  }

  window.dispatchEvent(new CustomEvent('favoritesUpdated', { detail: { internshipId, isFavorite: false } }));
}

// Removes a favorite by internship position ID (used when student submits an application).
async function removeFavoriteByInternshipId(internshipId) {
  if (!internshipId) return false;

  const userId = parseInt(localStorage.getItem('userId'));
  if (!userId) return false;

  const { error } = await supabaseClient
    .from('favorites')
    .delete()
    .eq('user_id', userId)
    .eq('internship_id', internshipId);

  if (error) return false;

  const stored = JSON.parse(localStorage.getItem('favorites') || '[]');
  localStorage.setItem('favorites', JSON.stringify(stored.filter(id => id !== internshipId?.toString())));

  window.dispatchEvent(new CustomEvent('favoritesUpdated', { detail: { internshipId, isFavorite: false } }));
  return true;
}

// Saves or removes a favorite in Supabase when a heart button is clicked.
// Only stores user_id + internship_id — all other data fetched at display time.
async function syncFavoriteToSupabase(internshipId, isAdding) {
  // Check role - only students can sync to Supabase
  const userRole = localStorage.getItem('userRole');
  if (userRole !== '1') {
    console.warn('[favorites] Companies cannot save favorites');
    if (typeof showToast === 'function') showToast('Only students can save favorites.', 'warning');
    return;
  }

  const userId = parseInt(localStorage.getItem('userId'));
  if (!userId) {
    console.warn('[favorites] no userId in localStorage — heart saved locally only');
    return;
  }

  if (isAdding) {
    const { error } = await supabaseClient.from('favorites').upsert(
      { user_id: userId, internship_id: internshipId },
      { onConflict: 'user_id,internship_id' }
    );
    if (error) console.error('[favorites] upsert error:', error.message, error.hint);
    else console.log('[favorites] saved OK');
  } else {
    const { error } = await supabaseClient.from('favorites').delete()
      .eq('user_id', userId)
      .eq('internship_id', internshipId);
    if (error) console.error('[favorites] delete error:', error.message);
  }
}

// Highlights heart buttons on the internships page based on Supabase data.
async function highlightSavedFavorites() {
  // Check role - only highlight for students
  const userRole = localStorage.getItem('userRole');
  if (userRole !== '1') return;

  const userId = parseInt(localStorage.getItem('userId'));
  if (!userId) return;

  const { data } = await supabaseClient
    .from('favorites')
    .select('internship_id')
    .eq('user_id', userId);

  if (!data) return;

  const savedIds = new Set(data.map(f => f.internship_id.toString()));
  localStorage.setItem('favorites', JSON.stringify([...savedIds]));

  document.querySelectorAll('[data-job-id]').forEach(card => {
    const jobId = card.getAttribute('data-job-id');
    const btn = card.querySelector('.favorite-btn');
    if (btn && savedIds.has(jobId)) btn.innerHTML = '❤️';
  });
}

document.addEventListener('DOMContentLoaded', () => {
  if (typeof supabase === 'undefined') {
    console.error('Supabase not loaded — check script order in HTML');
    return;
  }
  loadFavorites();
  highlightSavedFavorites();

  window.addEventListener('favoritesUpdated', () => { loadFavorites(); });
  window.addEventListener('storage', (e) => { if (e.key === 'favorites') loadFavorites(); });
});
