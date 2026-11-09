import { db, requireRole, escapeHtml } from './app.js';
import { collection, query, where, getDocs } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js';
import { renderLayout, icon, statusBadge, fmtDay, fmtTime, peso, todayStr, monthShort, dayNum, showFlash } from './layout.js';

const profile = await requireRole(['user']);
const page = renderLayout(profile, 'Dashboard', 'user_dashboard.html');

try {
    const [reservationSnap, venueSnap, courtSnap] = await Promise.all([
        getDocs(query(collection(db, 'reservations'), where('userId', '==', profile.id))),
        getDocs(query(collection(db, 'venues'), where('status', '==', 'active'))),
        getDocs(query(collection(db, 'courts'), where('status', '==', 'available')))
    ]);

    const today = todayStr();
    const reservations = reservationSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const isUpcoming = (r) => ['pending', 'confirmed'].includes(r.status) && r.date >= today;

    const stats = {
        upcoming: reservations.filter(isUpcoming).length,
        pending: reservations.filter((r) => r.status === 'pending' && r.date >= today).length,
        completed: reservations.filter((r) => r.status === 'completed').length,
        total: reservations.length
    };

    const upcoming = reservations
        .filter(isUpcoming)
        .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime))
        .slice(0, 5);

    const courtStats = {};
    courtSnap.docs.forEach((d) => {
        const court = d.data();
        const entry = courtStats[court.venueId] || { count: 0, min: null };
        entry.count += 1;
        entry.min = entry.min === null ? court.hourlyRate : Math.min(entry.min, court.hourlyRate);
        courtStats[court.venueId] = entry;
    });

    const venues = venueSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, 4);

    const upcomingHtml = upcoming.length
        ? '<ul class="list">' + upcoming.map((b) => `
            <li class="list-item">
                <div class="date-box">
                    <span>${monthShort(b.date)}</span>
                    <strong>${dayNum(b.date)}</strong>
                </div>
                <div class="list-main">
                    <strong>${escapeHtml(b.venueName)} &middot; ${escapeHtml(b.courtName)}</strong>
                    <div class="list-meta">
                        <span>${icon('clock')}${fmtDay(b.date)}, ${fmtTime(b.startTime)} &ndash; ${fmtTime(b.endTime)}</span>
                        <span>${escapeHtml(b.referenceCode)}</span>
                    </div>
                </div>
                <div class="list-end">
                    ${statusBadge(b.status)}
                    <span class="list-amount">${peso(b.totalAmount)}</span>
                </div>
            </li>`).join('') + '</ul>'
        : `<div class="empty">
                <strong>No upcoming bookings</strong>
                Your next game will show up here.
                <div><a href="book_court.html" class="btn btn-primary btn-sm">Book a court</a></div>
            </div>`;

    const venuesHtml = venues.length
        ? '<ul class="list">' + venues.map((v) => {
            const info = courtStats[v.id] || { count: 0, min: null };
            return `
            <li class="list-item">
                <span class="icon-box">${icon('pin')}</span>
                <div class="list-main">
                    <strong>${escapeHtml(v.name)}</strong>
                    <div class="list-meta">
                        <span>${info.count} court${info.count === 1 ? '' : 's'}</span>
                        ${info.min !== null ? `<span>from ${peso(info.min)}/hr</span>` : ''}
                    </div>
                </div>
                <a href="book_court.html?venue=${encodeURIComponent(v.id)}" class="btn btn-soft btn-sm">Book</a>
            </li>`;
        }).join('') + '</ul>'
        : `<div class="empty">
                <strong>No venues yet</strong>
                Courts will appear here once they are added.
            </div>`;

    page.innerHTML = `
        <section class="welcome">
            <div>
                <h2>Hi, ${escapeHtml(profile.firstName)}!</h2>
                <p>Ready for your next game? Find an open court and book in seconds.</p>
            </div>
            <div class="welcome-actions">
                <a href="book_court.html" class="btn btn-lime">${icon('search')}Book a court</a>
                <a href="my_bookings.html" class="btn btn-outline-light">My bookings</a>
            </div>
        </section>

        <section class="stats">
            <div class="stat">
                <span class="stat-icon">${icon('calendar')}</span>
                <div><strong>${stats.upcoming}</strong><span>Upcoming</span></div>
            </div>
            <div class="stat">
                <span class="stat-icon amber">${icon('clock')}</span>
                <div><strong>${stats.pending}</strong><span>Awaiting approval</span></div>
            </div>
            <div class="stat">
                <span class="stat-icon lime">${icon('check')}</span>
                <div><strong>${stats.completed}</strong><span>Games played</span></div>
            </div>
            <div class="stat">
                <span class="stat-icon blue">${icon('activity')}</span>
                <div><strong>${stats.total}</strong><span>Total bookings</span></div>
            </div>
        </section>

        <div class="grid-2">
            <section class="panel">
                <div class="panel-head">
                    <h3>Upcoming bookings</h3>
                    <a href="my_bookings.html" class="panel-link">View all</a>
                </div>
                ${upcomingHtml}
            </section>

            <section class="panel">
                <div class="panel-head">
                    <h3>Courts you can book</h3>
                    <a href="book_court.html" class="panel-link">See all</a>
                </div>
                ${venuesHtml}
            </section>
        </div>`;
} catch (error) {
    console.error(error);
    page.innerHTML = '';
    showFlash('error', 'Could not load your dashboard. Please refresh the page.');
}