/* ==========================================================
   notifications.js — In-app notification bell
   Колокольчик уведомлений — для студентов и компаний
   ========================================================== */

'use strict';

/**
 * Insert a notification row for another user.
 * @param {number} recipientUserId
 * @param {string} type  — 'application_submitted' | 'application_withdrawn' | 'status_changed'
 * @param {object} metadata — snapshot of key data for rendering (e.g. { position_title, new_status })
 * @param {number|null} applicationId
 */
async function createNotification(recipientUserId, type, metadata = {}, applicationId = null) {
  try {
    const row = { user_id: recipientUserId, type, metadata };
    if (applicationId) row.application_id = applicationId;
    const { error } = await supabaseClient.from('notifications').insert(row);
    if (error) console.warn('[Notif] insert error:', error.message);
  } catch (e) {
    console.warn('[Notif] createNotification failed:', e);
  }
}

async function _getStudentUserIdByApp(applicationId) {
  try {
    const { data } = await supabaseClient
      .from('applications')
      .select('student_profiles(user_id)')
      .eq('application_id', applicationId)
      .single();
    return data?.student_profiles?.user_id || null;
  } catch (_) { return null; }
}

function _renderMessage(type, meta) {
  const m = meta || {};
  const pos = m.position_title ? `"${_escHtml(m.position_title)}"` : 'a position';
  switch (type) {
    case 'application_submitted':
      return `New application received for ${pos}`;
    case 'application_withdrawn':
      return `Application for ${pos} was withdrawn`;
    case 'status_changed': {
      const labels = {
        accepted:             'accepted 🎉',
        rejected:             'declined',
        viewed:               'viewed by company',
        pending:              'moved back to pending',
        interview_scheduled:  'invited for an interview 📅',
        interview_cancelled:  'interview cancelled',
      };
      const label = labels[m.new_status] || m.new_status || 'updated';
      return `Your application for ${pos} was ${label}`;
    }
    default:
      return 'New notification';
  }
}

/**
 * Build and append the bell <li> element to the nav menu.
 * Called by initUserMenu() in script.js after a session is found.
 */
function buildNotifBell(navMenu, userId) {
  const li = document.createElement('li');
  li.className = 'nav-item notif-bell-item';
  li.id = 'notifBellLi';
  li.innerHTML = `
    <button class="notif-bell" id="notifBellBtn"
            onclick="toggleNotifPanel(event)"
            aria-label="Notifications"
            title="Notifications">
      <svg xmlns="http://www.w3.org/2000/svg" width="21" height="21"
           viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
        <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
      </svg>
      <span class="notif-badge" id="notifBadge" style="display:none">0</span>
    </button>
    <div class="notif-panel" id="notifPanel">
      <div class="notif-panel-header">
        <span>Notifications</span>
        <button onclick="markAllNotificationsRead()">Mark all read</button>
      </div>
      <div class="notif-list" id="notifList">
        <p class="notif-empty">Loading…</p>
      </div>
    </div>
  `;
  navMenu.appendChild(li);
  _loadNotifCount(userId);
  _subscribeRealtime(userId);
}

function _subscribeRealtime(userId) {
  try {
    supabaseClient
      .channel('notif-user-' + userId)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`
      }, (payload) => {
        const badge = document.getElementById('notifBadge');
        const current = (badge && badge.style.display !== 'none') ? (parseInt(badge.textContent) || 0) : 0;
        _updateBadge(current + 1);
        const panel = document.getElementById('notifPanel');
        if (panel && panel.classList.contains('show')) {
          _renderNotifications();
        }
      })
      .subscribe();
  } catch (e) {
    console.warn('[Notif] realtime subscribe failed:', e);
  }
}

async function _loadNotifCount(userId) {
  try {
    const { count } = await supabaseClient
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false);
    _updateBadge(count || 0);
  } catch (e) {
    console.warn('[Notif] count failed:', e);
  }
}

function _updateBadge(count) {
  const badge = document.getElementById('notifBadge');
  if (!badge) return;
  if (count > 0) {
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}

async function toggleNotifPanel(event) {
  event.stopPropagation();
  const panel = document.getElementById('notifPanel');
  if (!panel) return;

  // Close user-avatar dropdown if open
  document.querySelectorAll('.user-dropdown.show').forEach(d => d.classList.remove('show'));

  if (panel.classList.contains('show')) {
    panel.classList.remove('show');
  } else {
    panel.classList.add('show');
    await _renderNotifications();
  }
}

async function _renderNotifications() {
  const list = document.getElementById('notifList');
  if (!list) return;

  const session = (typeof getCurrentSession === 'function') ? getCurrentSession() : null;
  if (!session) { list.innerHTML = '<p class="notif-empty">Not logged in.</p>'; return; }

  list.innerHTML = '<p class="notif-empty">Loading…</p>';

  try {
    const { data: notifs, error } = await supabaseClient
      .from('notifications')
      .select('id, type, metadata, is_read, created_at')
      .eq('user_id', session.userId)
      .order('created_at', { ascending: false })
      .limit(30);

    if (error) throw error;

    if (!notifs || notifs.length === 0) {
      list.innerHTML = '<p class="notif-empty">No notifications yet.</p>';
      return;
    }

    list.innerHTML = notifs.map(n => `
      <div class="notif-item${n.is_read ? '' : ' unread'}">
        <div class="notif-item-msg">${_renderMessage(n.type, n.metadata)}</div>
        <div class="notif-item-time">${_timeAgo(n.created_at)}</div>
      </div>
    `).join('');

    // Auto-mark unread as read
    const unreadIds = notifs.filter(n => !n.is_read).map(n => n.id);
    if (unreadIds.length > 0) {
      await supabaseClient
        .from('notifications')
        .update({ is_read: true })
        .in('id', unreadIds);
      _updateBadge(0);
    }
  } catch (e) {
    console.warn('[Notif] render failed:', e);
    list.innerHTML = '<p class="notif-empty">Could not load notifications.</p>';
  }
}

async function markAllNotificationsRead() {
  const session = (typeof getCurrentSession === 'function') ? getCurrentSession() : null;
  if (!session) return;
  try {
    await supabaseClient
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', session.userId)
      .eq('is_read', false);
    _updateBadge(0);
    await _renderNotifications();
  } catch (e) {
    console.warn('[Notif] mark all read failed:', e);
  }
}

function _timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60)    return 'Just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function _escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Close panel on outside click
document.addEventListener('click', function (e) {
  const panel = document.getElementById('notifPanel');
  const bell  = document.getElementById('notifBellLi');
  if (panel && panel.classList.contains('show') && bell && !bell.contains(e.target)) {
    panel.classList.remove('show');
  }
});
