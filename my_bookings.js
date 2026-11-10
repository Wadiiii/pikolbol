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
import { renderLayout, icon, statusBadge, fmtDay, fmtTime, peso, monthShort, dayNum, toDate, showFlash } from './layout.js';

const profile = await requireRole(['user']);
const page = renderLayout(profile, 'My bookings', 'my_bookings.html');

const tabs = { upcoming: 'Upcoming', past: 'Past', cancelled: 'Cancelled' };
let tab = new URLSearchParams(location.search).get('tab');
if (!tabs[tab]) {
    tab = 'upcoming';
}
let bookings = [];

function startOf(b) {
    return new Date(b.date + 'T' + b.startTime + ':00');
}

function endOf(b) {
    return new Date(b.date + 'T' + b.endTime + ':00');
}

function groupOf(b) {
    if (b.status === 'cancelled') {
        return 'cancelled';
    }
    if (['completed', 'no_show'].includes(b.status) || endOf(b) < new Date()) {
        return 'past';
    }
    return 'upcoming';
}

async function load() {
    const snap = await getDocs(query(collection(db, 'reservations'), where('userId', '==', profile.id)));
    bookings = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

function render() {
    const counts = { upcoming: 0, past: 0, cancelled: 0 };
    bookings.forEach((b) => counts[groupOf(b)]++);

    const list = bookings.filter((b) => groupOf(b) === tab);
    if (tab === 'upcoming') {
        list.sort((a, b) => startOf(a) - startOf(b));
    } else if (tab === 'past') {
        list.sort((a, b) => startOf(b) - startOf(a));
    } else {
        list.sort((a, b) => (toDate(b.updatedAt) || 0) - (toDate(a.updatedAt) || 0));
    }

    const empty = {
        upcoming: `<strong>No upcoming bookings</strong>Find an open court and book your next game.
                   <div><a href="book_court.html" class="btn btn-primary btn-sm">Book a court</a></div>`,
        past: '<strong>No past bookings yet</strong>Games you\'ve played will show up here.',
        cancelled: '<strong>No cancelled bookings</strong>Nice! You haven\'t cancelled anything.'
    };

    const items = list.map((b) => {
        const canCancel = tab === 'upcoming' && ['pending', 'confirmed'].includes(b.status) && startOf(b) > new Date();
        return `
        <li class="list-item booking-item">
            <div class="date-box">
                <span>${monthShort(b.date)}</span>
                <strong>${dayNum(b.date)}</strong>
            </div>
            <div class="list-main">
                <strong>${escapeHtml(b.venueName)} &middot; ${escapeHtml(b.courtName)}</strong>
                <div class="list-meta">
                    <span>${icon('clock')}${fmtDay(b.date)}, ${fmtTime(b.startTime)} &ndash; ${fmtTime(b.endTime)}</span>
                    ${b.venueAddress ? `<span>${icon('pin')}${escapeHtml(b.venueAddress)}</span>` : ''}
                </div>
                <div class="list-meta">
                    <span>Ref: <b>${escapeHtml(b.referenceCode)}</b></span>
                    <span>${peso(b.totalAmount, 2)}</span>
                    ${b.venueContact ? `<span>Venue: ${escapeHtml(b.venueContact)}</span>` : ''}
                </div>
                ${b.status === 'cancelled' && b.cancelledReason ? `<p class="list-note">${escapeHtml(b.cancelledReason)}</p>` : ''}
            </div>
            <div class="list-end">
                ${statusBadge(b.status)}
                ${canCancel ? `<button type="button" class="btn btn-soft btn-sm btn-danger-text" data-cancel="${b.id}">Cancel</button>` : ''}
            </div>
        </li>`;
    }).join('');

    page.innerHTML = `
        <div class="toolbar">
            <nav class="tabs">
                ${Object.entries(tabs).map(([key, label]) => `
                    <a href="my_bookings.html?tab=${key}" class="tab${tab === key ? ' is-active' : ''}" data-tab="${key}">
                        ${label}
                        <span class="count">${counts[key]}</span>
                    </a>`).join('')}
            </nav>
            <a href="book_court.html" class="btn btn-primary">${icon('plus')}New booking</a>
        </div>

        <section class="panel">
            ${list.length ? '<ul class="list">' + items + '</ul>' : '<div class="empty">' + empty[tab] + '</div>'}
        </section>`;
}

page.addEventListener('click', async (event) => {
    const tabLink = event.target.closest('[data-tab]');
    if (tabLink) {
        event.preventDefault();
        tab = tabLink.dataset.tab;
        history.replaceState(null, '', 'my_bookings.html?tab=' + tab);
        render();
        return;
    }

    const cancelBtn = event.target.closest('[data-cancel]');
    if (!cancelBtn) {
        return;
    }

    const booking = bookings.find((b) => b.id === cancelBtn.dataset.cancel);
    if (!booking || !window.confirm('Cancel this booking?')) {
        return;
    }

    cancelBtn.disabled = true;

    try {
        const batch = writeBatch(db);
        batch.update(doc(db, 'reservations', booking.id), {
            status: 'cancelled',
            cancelledReason: 'Cancelled by player.',
            updatedAt: serverTimestamp()
        });
        (booking.slotIds || []).forEach((slotId) => batch.delete(doc(db, 'slots', slotId)));
        await batch.commit();

        await logActivity('CANCEL_RESERVATION', booking.referenceCode, profile.firstName + ' ' + profile.lastName);
        await load();
        render();
        showFlash('success', 'Your booking has been cancelled.');
    } catch (error) {
        console.error(error);
        cancelBtn.disabled = false;
        showFlash('error', friendlyError(error));
    }
});

try {
    await load();
    render();
} catch (error) {
    console.error(error);
    page.innerHTML = '';
    showFlash('error', 'Could not load your bookings. Please refresh the page.');
}