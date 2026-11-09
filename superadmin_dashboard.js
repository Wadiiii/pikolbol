import { db, requireRole, escapeHtml } from './app.js';
import {
    collection,
    query,
    orderBy,
    limit,
    getDocs
} from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js';
import { renderLayout, icon, roleBadge, initials, timeAgo, toDate, showFlash } from './layout.js';

const profile = await requireRole(['super_admin']);
const page = renderLayout(profile, 'Dashboard', 'superadmin_dashboard.html');

function actionLabel(action) {
    const text = String(action || '').replace(/_/g, ' ').toLowerCase();
    return text.charAt(0).toUpperCase() + text.slice(1);
}

try {
    const [userSnap, venueSnap, reservationSnap, logSnap] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'venues')),
        getDocs(collection(db, 'reservations')),
        getDocs(query(collection(db, 'activity_logs'), orderBy('createdAt', 'desc'), limit(8)))
    ]);

    const users = userSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const now = new Date();

    const stats = {
        players: users.filter((u) => u.role === 'user').length,
        admins: users.filter((u) => u.role === 'admin').length,
        venues: venueSnap.docs.filter((d) => d.data().status === 'active').length,
        bookings: reservationSnap.docs.filter((d) => {
            const created = toDate(d.data().createdAt);
            return created && created.getFullYear() === now.getFullYear() && created.getMonth() === now.getMonth();
        }).length
    };

    const logs = logSnap.docs.map((d) => d.data());

    const newest = users
        .sort((a, b) => (toDate(b.createdAt) || 0) - (toDate(a.createdAt) || 0))
        .slice(0, 6);

    const logsHtml = logs.length
        ? '<ul class="list">' + logs.map((log) => {
            const who = log.userName || 'Unknown user';
            return `
            <li class="list-item">
                <span class="avatar avatar-sm">${escapeHtml(initials(who) || '?')}</span>
                <div class="list-main">
                    <strong>${escapeHtml(actionLabel(log.action))}</strong>
                    <div class="list-meta">
                        <span>${escapeHtml(who)}</span>
                        ${log.details ? `<span class="truncate">${escapeHtml(log.details)}</span>` : ''}
                    </div>
                </div>
                <span class="list-time">${timeAgo(log.createdAt)}</span>
            </li>`;
        }).join('') + '</ul>'
        : `<div class="empty">
                <strong>No activity yet</strong>
                Logins, bookings and changes will appear here.
            </div>`;

    const usersHtml = '<ul class="list">' + newest.map((u) => `
        <li class="list-item">
            <span class="avatar avatar-sm">${escapeHtml(initials(u.firstName + ' ' + u.lastName))}</span>
            <div class="list-main">
                <strong>${escapeHtml(u.firstName + ' ' + u.lastName)}</strong>
                <div class="list-meta"><span class="truncate">${escapeHtml(u.email)}</span></div>
            </div>
            <div class="list-end">
                ${roleBadge(u.role)}
                ${u.status !== 'active' ? `<span class="list-amount">${escapeHtml(u.status)}</span>` : ''}
            </div>
        </li>`).join('') + '</ul>';

    page.innerHTML = `
        <section class="welcome">
            <div>
                <h2>Hi, ${escapeHtml(profile.firstName)}!</h2>
                <p>Here's what's happening across Pikolbol.</p>
            </div>
            <div class="welcome-actions">
                <a href="manage_admins.html" class="btn btn-lime">${icon('plus')}Add admin</a>
                <a href="manage_venues.html" class="btn btn-outline-light">Manage venues</a>
            </div>
        </section>

        <section class="stats">
            <div class="stat">
                <span class="stat-icon">${icon('users')}</span>
                <div><strong>${stats.players}</strong><span>Players</span></div>
            </div>
            <div class="stat">
                <span class="stat-icon blue">${icon('shield')}</span>
                <div><strong>${stats.admins}</strong><span>Venue admins</span></div>
            </div>
            <div class="stat">
                <span class="stat-icon lime">${icon('building')}</span>
                <div><strong>${stats.venues}</strong><span>Active venues</span></div>
            </div>
            <div class="stat">
                <span class="stat-icon amber">${icon('calendar')}</span>
                <div><strong>${stats.bookings}</strong><span>Bookings this month</span></div>
            </div>
        </section>

        <div class="grid-2">
            <section class="panel">
                <div class="panel-head">
                    <h3>Recent activity</h3>
                    <a href="activity_logs.html" class="panel-link">View all</a>
                </div>
                ${logsHtml}
            </section>

            <section class="panel">
                <div class="panel-head">
                    <h3>Newest accounts</h3>
                    <a href="manage_users.html" class="panel-link">View all</a>
                </div>
                ${usersHtml}
            </section>
        </div>`;
} catch (error) {
    console.error(error);
    page.innerHTML = '';
    showFlash('error', 'Could not load the dashboard. Please refresh the page.');
}