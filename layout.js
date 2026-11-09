import { auth, logActivity, escapeHtml } from './app.js';
import { signOut } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js';

const paths = {
    home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    calendar: '<rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/>',
    user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    building: '<rect width="16" height="20" x="4" y="2" rx="2" ry="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M12 6h.01"/><path d="M12 10h.01"/><path d="M12 14h.01"/><path d="M16 10h.01"/><path d="M16 14h.01"/><path d="M8 10h.01"/><path d="M8 14h.01"/>',
    grid: '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
    activity: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>',
    menu: '<line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    check: '<polyline points="20 6 9 17 4 12"/>',
    wallet: '<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    alert: '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
    success: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    locate: '<polygon points="3 11 22 2 13 21 11 13 3 11"/>',
    left: '<path d="m15 18-6-6 6-6"/>',
    right: '<path d="m9 18 6-6-6-6"/>',
    map: '<polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" x2="9" y1="3" y2="18"/><line x1="15" x2="15" y1="6" y2="21"/>'
};

export function icon(name) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
        + (paths[name] || '') + '</svg>';
}

const navs = {
    super_admin: [
        ['superadmin_dashboard.html', 'Dashboard', 'home'],
        ['manage_users.html', 'Users', 'users'],
        ['manage_admins.html', 'Admins', 'shield'],
        ['manage_venues.html', 'Venues', 'building'],
        ['activity_logs.html', 'Activity logs', 'activity'],
        ['profile.html', 'Profile', 'user']
    ],
    admin: [
        ['admin_dashboard.html', 'Dashboard', 'home'],
        ['admin_reservations.html', 'Reservations', 'calendar'],
        ['admin_courts.html', 'Courts', 'grid'],
        ['admin_venue.html', 'My venue', 'building'],
        ['profile.html', 'Profile', 'user']
    ],
    user: [
        ['user_dashboard.html', 'Dashboard', 'home'],
        ['book_court.html', 'Book a court', 'search'],
        ['my_bookings.html', 'My bookings', 'calendar'],
        ['profile.html', 'Profile', 'user']
    ]
};

export function roleLabel(role) {
    return { super_admin: 'Super Admin', admin: 'Admin', user: 'Player' }[role] || 'User';
}

export function initials(name) {
    const parts = String(name || '').trim().split(/\s+/);
    const first = parts[0] || '';
    const last = parts.length > 1 ? parts[parts.length - 1] : '';
    return (first.charAt(0) + last.charAt(0)).toUpperCase();
}

export function statusBadge(status) {
    const labels = {
        pending: 'Pending',
        confirmed: 'Confirmed',
        cancelled: 'Cancelled',
        completed: 'Completed',
        no_show: 'No-show',
        available: 'Available',
        maintenance: 'Maintenance',
        inactive: 'Inactive',
        active: 'Active',
        banned: 'Banned'
    };
    return '<span class="badge badge-' + escapeHtml(status) + '">' + escapeHtml(labels[status] || status) + '</span>';
}

export function roleBadge(role) {
    return '<span class="badge badge-role-' + escapeHtml(role) + '">' + escapeHtml(roleLabel(role)) + '</span>';
}

export function pad(number) {
    return String(number).padStart(2, '0');
}

export function dateStr(date) {
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
}

export function todayStr() {
    return dateStr(new Date());
}

export function parseDate(value) {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d);
}

export function fmtTime(value) {
    const [h, m] = value.split(':').map(Number);
    const suffix = h >= 12 ? 'PM' : 'AM';
    return (h % 12 || 12) + ':' + pad(m) + ' ' + suffix;
}

export function fmtDate(value) {
    return parseDate(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function fmtDay(value) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (value === todayStr()) {
        return 'Today';
    }
    if (value === dateStr(tomorrow)) {
        return 'Tomorrow';
    }
    return parseDate(value).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function monthShort(value) {
    return parseDate(value).toLocaleDateString('en-US', { month: 'short' });
}

export function dayNum(value) {
    return parseDate(value).getDate();
}

export function peso(amount, decimals = 0) {
    return '&#8369;' + Number(amount || 0).toLocaleString('en-PH', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
}

export function toDate(value) {
    if (!value) {
        return null;
    }
    if (typeof value.toDate === 'function') {
        return value.toDate();
    }
    return new Date(value);
}

export function timeAgo(value) {
    const date = toDate(value);
    if (!date) {
        return 'Just now';
    }
    const diff = (Date.now() - date.getTime()) / 1000;
    if (diff < 60) {
        return 'Just now';
    }
    if (diff < 3600) {
        return Math.floor(diff / 60) + 'm ago';
    }
    if (diff < 86400) {
        return Math.floor(diff / 3600) + 'h ago';
    }
    if (diff < 604800) {
        return Math.floor(diff / 86400) + 'd ago';
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function flash(type, message) {
    sessionStorage.setItem('flash', JSON.stringify({ type, message }));
}

export function showFlash(type, message) {
    const box = document.getElementById('flash');
    if (!box) {
        return;
    }
    box.innerHTML = message
        ? '<div class="alert alert-' + type + '" role="status">' + icon(type === 'success' ? 'success' : 'alert')
            + '<span>' + escapeHtml(message) + '</span></div>'
        : '';
    if (message) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

export function renderLayout(profile, title, active) {
    const name = profile.firstName + ' ' + profile.lastName;
    const links = (navs[profile.role] || navs.user).map(([href, label, iconName]) =>
        '<a href="' + href + '" class="nav-link' + (href === active ? ' is-active' : '') + '">'
        + icon(iconName) + '<span>' + label + '</span></a>'
    ).join('');

    document.title = title + ' | Pikolbol';
    document.body.innerHTML = `
        <div class="app">
            <aside class="sidebar" id="sidebar">
                <div class="sidebar-head">
                    <a href="index.html" class="brand"><span class="brand-ball"></span>Pikolbol</a>
                    <button type="button" class="icon-btn sidebar-close" data-sidebar-close aria-label="Close menu">${icon('x')}</button>
                </div>
                <span class="nav-label">Menu</span>
                <nav class="nav">${links}</nav>
                <div class="sidebar-foot">
                    <div class="user-chip">
                        <span class="avatar">${escapeHtml(initials(name))}</span>
                        <div>
                            <strong>${escapeHtml(name)}</strong>
                            <span>${roleLabel(profile.role)}</span>
                        </div>
                    </div>
                    <a href="#" class="nav-link logout" id="logout-link">${icon('logout')}<span>Log out</span></a>
                </div>
            </aside>
            <div class="overlay" data-sidebar-close></div>
            <div class="main">
                <header class="topbar">
                    <button type="button" class="icon-btn menu-btn" data-sidebar-open aria-label="Open menu">${icon('menu')}</button>
                    <div class="topbar-title">
                        <h1>${escapeHtml(title)}</h1>
                        <p>${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
                    </div>
                    <a href="profile.html" class="avatar topbar-avatar" aria-label="Profile">${escapeHtml(initials(name))}</a>
                </header>
                <main class="content">
                    <div id="flash" style="display: contents"></div>
                    <div id="page" style="display: contents">
                        <div class="empty">Loading...</div>
                    </div>
                </main>
            </div>
        </div>`;

    document.querySelectorAll('[data-sidebar-open]').forEach((el) =>
        el.addEventListener('click', () => document.body.classList.add('sidebar-open')));
    document.querySelectorAll('[data-sidebar-close]').forEach((el) =>
        el.addEventListener('click', () => document.body.classList.remove('sidebar-open')));
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            document.body.classList.remove('sidebar-open');
        }
    });
    document.getElementById('logout-link').addEventListener('click', async (event) => {
        event.preventDefault();
        await logActivity('LOGOUT', 'User logged out.', name);
        await signOut(auth);
        location.replace('login.html?logged_out=1');
    });

    const saved = sessionStorage.getItem('flash');
    if (saved) {
        sessionStorage.removeItem('flash');
        const { type, message } = JSON.parse(saved);
        showFlash(type, message);
    }

    return document.getElementById('page');
}