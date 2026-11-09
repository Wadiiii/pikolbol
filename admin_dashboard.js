import { db, requireRole, escapeHtml, logActivity, friendlyError } from './app.js';
import {
    collection,
    query,
    where,
    getDocs,
    doc,
    writeBatch,
    serverTimestamp
} from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js';
import { renderLayout, icon, statusBadge, fmtTime, peso, todayStr, monthShort, dayNum, showFlash } from './layout.js';

const profile = await requireRole(['admin']);
const page = renderLayout(profile, 'Dashboard', 'admin_dashboard.html');
let reservations = [];

async function load() {
    const [venueSnap, courtSnap, reservationSnap] = await Promise.all([
        getDocs(query(collection(db, 'venues'), where('adminId', '==', profile.id))),
        getDocs(query(collection(db, 'courts'), where('adminId', '==', profile.id))),
        getDocs(query(collection(db, 'reservations'), where('adminId', '==', profile.id)))
    ]);

    const venues = venueSnap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name));
    reservations = reservationSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const today = todayStr();
    const month = today.slice(0, 7);

    const stats = {
        today: reservations.filter((r) => r.date === today && ['pending', 'confirmed', 'completed'].includes(r.status)).length,
        pending: reservations.filter((r) => r.status === 'pending' && r.date >= today).length,
        courts: courtSnap.size,
        revenue: reservations
            .filter((r) => ['confirmed', 'completed'].includes(r.status) && r.date.slice(0, 7) === month)
            .reduce((sum, r) => sum + Number(r.totalAmount || 0), 0)
    };

    const pending = reservations
        .filter((r) => r.status === 'pending' && r.date >= today)
        .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime))
        .slice(0, 6);

    const schedule = reservations
        .filter((r) => r.date === today && ['pending', 'confirmed', 'completed'].includes(r.status))
        .sort((a, b) => (a.startTime + a.courtName).localeCompare(b.startTime + b.courtName));

    const venueLabel = venues.length ? venues.map((v) => v.name).join(', ') : 'No venue assigned yet';

    const pendingHtml = pending.length
        ? '<ul class="list">' + pending.map((p) => `
            <li class="list-item">
                <div class="date-box">
                    <span>${monthShort(p.date)}</span>
                    <strong>${dayNum(p.date)}</strong>
                </div>
                <div class="list-main">
                    <strong>${escapeHtml(p.userName)}</strong>
                    <div class="list-meta">
                        <span>${escapeHtml(p.courtName)}</span>
                        <span>${icon('clock')}${fmtTime(p.startTime)} &ndash; ${fmtTime(p.endTime)}</span>
                        <span>${peso(p.totalAmount)}</span>
                    </div>
                </div>
                <div class="list-actions">
                    <button type="button" class="btn btn-soft btn-sm" data-action="decline" data-id="${p.id}">Decline</button>
                    <button type="button" class="btn btn-primary btn-sm" data-action="confirm" data-id="${p.id}">${icon('check')}Confirm</button>
                </div>
            </li>`).join('') + '</ul>'
        : `<div class="empty">
                <strong>All caught up</strong>
                New booking requests will appear here.
            </div>`;

    const scheduleHtml = schedule.length
        ? '<ul class="list">' + schedule.map((t) => `
            <li class="list-item">
                <div class="time-box">
                    <strong>${fmtTime(t.startTime)}</strong>
                    <span>${fmtTime(t.endTime)}</span>
                </div>
                <div class="list-main">
                    <strong>${escapeHtml(t.courtName)}</strong>
                    <div class="list-meta"><span>${escapeHtml(t.userName)}</span></div>
                </div>
                ${statusBadge(t.status)}
            </li>`).join('') + '</ul>'
        : `<div class="empty">
                <strong>No bookings today</strong>
                Your courts are free all day.
            </div>`;

    page.innerHTML = `
        <section class="welcome">
            <div>
                <h2>Hi, ${escapeHtml(profile.firstName)}!</h2>
                <p>${escapeHtml(venueLabel)}</p>
            </div>
            <div class="welcome-actions">
                <a href="admin_reservations.html" class="btn btn-lime">${icon('calendar')}Reservations</a>
                <a href="admin_courts.html" class="btn btn-outline-light">Manage courts</a>
            </div>
        </section>

        ${venues.length ? '' : `
        <div class="alert alert-error">
            ${icon('alert')}
            <span>You don't have a venue yet. Ask the super admin to assign one to your account.</span>
        </div>`}

        <section class="stats">
            <div class="stat">
                <span class="stat-icon">${icon('calendar')}</span>
                <div><strong>${stats.today}</strong><span>Bookings today</span></div>
            </div>
            <div class="stat">
                <span class="stat-icon amber">${icon('clock')}</span>
                <div><strong>${stats.pending}</strong><span>Pending requests</span></div>
            </div>
            <div class="stat">
                <span class="stat-icon blue">${icon('grid')}</span>
                <div><strong>${stats.courts}</strong><span>Courts</span></div>
            </div>
            <div class="stat">
                <span class="stat-icon lime">${icon('wallet')}</span>
                <div><strong>${peso(stats.revenue)}</strong><span>Revenue this month</span></div>
            </div>
        </section>

        <div class="grid-2">
            <section class="panel">
                <div class="panel-head">
                    <h3>Pending requests</h3>
                    <a href="admin_reservations.html?status=pending" class="panel-link">View all</a>
                </div>
                ${pendingHtml}
            </section>

            <section class="panel">
                <div class="panel-head">
                    <h3>Today's schedule</h3>
                    <span class="panel-note">${schedule.length} booking${schedule.length === 1 ? '' : 's'}</span>
                </div>
                ${scheduleHtml}
            </section>
        </div>`;
}

page.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) {
        return;
    }

    const reservation = reservations.find((r) => r.id === button.dataset.id);
    const action = button.dataset.action;
    if (!reservation) {
        return;
    }
    if (action === 'decline' && !window.confirm('Decline this reservation?')) {
        return;
    }

    button.disabled = true;

    try {
        const batch = writeBatch(db);
        const changes = {
            status: action === 'confirm' ? 'confirmed' : 'cancelled',
            handledBy: profile.id,
            updatedAt: serverTimestamp()
        };

        if (action === 'decline') {
            changes.cancelledReason = 'Declined by venue admin.';
            (reservation.slotIds || []).forEach((slotId) => batch.delete(doc(db, 'slots', slotId)));
        }

        batch.update(doc(db, 'reservations', reservation.id), changes);
        await batch.commit();

        await logActivity(
            action === 'confirm' ? 'CONFIRM_RESERVATION' : 'DECLINE_RESERVATION',
            reservation.referenceCode,
            profile.firstName + ' ' + profile.lastName
        );

        await load();
        showFlash('success', action === 'confirm' ? 'Reservation confirmed.' : 'Reservation declined.');
    } catch (error) {
        console.error(error);
        button.disabled = false;
        showFlash('error', friendlyError(error));
    }
});

try {
    await load();
} catch (error) {
    console.error(error);
    page.innerHTML = '';
    showFlash('error', 'Could not load your dashboard. Please refresh the page.');
}