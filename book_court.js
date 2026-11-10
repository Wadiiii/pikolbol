import { db, requireRole, escapeHtml, logActivity, friendlyError } from './app.js';
import {
    collection,
    query,
    where,
    getDocs,
    doc,
    runTransaction,
    serverTimestamp
} from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js';
import { renderLayout, icon, fmtTime, fmtDate, peso, pad, dateStr, todayStr, flash, showFlash } from './layout.js';
import { createMap, hasCoords, venuePin, fitToVenues, distanceKm, fmtDistance, getUserLocation } from './map.js';

const MAX_HOURS = 4;
const profile = await requireRole(['user']);
const page = renderLayout(profile, 'Book a court', 'book_court.html');

const maxDate = new Date();
maxDate.setDate(maxDate.getDate() + 30);

const state = {
    venues: [],
    courts: [],
    venueId: new URLSearchParams(location.search).get('venue'),
    courtId: null,
    date: todayStr(),
    slots: [],
    picked: null,
    hours: 1,
    userLocation: null
};

let map = null;
const markers = {};

function toMinutes(value) {
    const [h, m] = value.split(':').map(Number);
    return h * 60 + m;
}

function minutesToTime(minutes) {
    return pad(Math.floor(minutes / 60)) + ':' + pad(minutes % 60);
}

function selectedVenue() {
    return state.venues.find((v) => v.id === state.venueId) || null;
}

function venueCourts() {
    return state.courts
        .filter((c) => c.venueId === state.venueId)
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

function selectedCourt() {
    return venueCourts().find((c) => c.id === state.courtId) || null;
}

function courtInfo(venueId) {
    const list = state.courts.filter((c) => c.venueId === venueId);
    return {
        count: list.length,
        min: list.length ? Math.min(...list.map((c) => c.hourlyRate)) : null
    };
}

function sortedVenues() {
    const list = state.venues.map((v) => ({
        ...v,
        distance: state.userLocation && hasCoords(v)
            ? distanceKm(state.userLocation.lat, state.userLocation.lng, v.lat, v.lng)
            : null
    }));
    return list.sort((a, b) => {
        if (a.distance !== null && b.distance !== null) {
            return a.distance - b.distance;
        }
        if (a.distance !== null) {
            return -1;
        }
        if (b.distance !== null) {
            return 1;
        }
        return a.name.localeCompare(b.name);
    });
}

page.innerHTML = `
    <div class="book-layout">
        <div class="stack">
            <section class="panel">
                <div class="panel-head">
                    <h3><span class="step-dot">1</span>Choose a venue</h3>
                    <button type="button" class="btn btn-soft btn-sm" id="near-me">${icon('locate')}Near me</button>
                </div>
                <div class="map-box"><div id="venue-map"></div></div>
                <div class="venue-pick" id="venue-list"><div class="empty">Loading venues...</div></div>
            </section>

            <section class="panel" id="pick-panel" hidden></section>
            <section class="panel" id="time-panel" hidden></section>
        </div>

        <aside class="panel summary" id="summary"></aside>
    </div>`;

const pickPanel = document.getElementById('pick-panel');
const timePanel = document.getElementById('time-panel');
const summary = document.getElementById('summary');

function renderVenueList() {
    const box = document.getElementById('venue-list');
    const list = sortedVenues();

    if (!list.length) {
        box.innerHTML = '<div class="empty"><strong>No venues available yet</strong>Please check back later.</div>';
        return;
    }

    box.innerHTML = list.map((v) => {
        const info = courtInfo(v.id);
        return `
            <button type="button" class="venue-option${v.id === state.venueId ? ' is-active' : ''}" data-venue="${v.id}">
                <span class="venue-option-top">
                    <strong>${escapeHtml(v.name)}</strong>
                    ${v.distance !== null ? `<span class="distance-tag">${fmtDistance(v.distance)}</span>` : ''}
                </span>
                <span>${escapeHtml(v.address)}</span>
                <span>${info.count} court${info.count === 1 ? '' : 's'}${info.min !== null ? ' &middot; from ' + peso(info.min) + '/hr' : ''}</span>
            </button>`;
    }).join('');
}

function renderMap() {
    map = createMap('venue-map', { zoom: 12 });

    state.venues.filter(hasCoords).forEach((v) => {
        const pin = venuePin();
        pin.setAttribute('aria-label', v.name);
        const popup = new maplibregl.Popup({ offset: 18, closeButton: false })
            .setHTML('<div class="map-popup"><strong>' + escapeHtml(v.name) + '</strong><span>' + escapeHtml(v.address) + '</span></div>');

        markers[v.id] = new maplibregl.Marker({ element: pin })
            .setLngLat([v.lng, v.lat])
            .setPopup(popup)
            .addTo(map);

        pin.addEventListener('click', () => selectVenue(v.id, false));
    });

    fitToVenues(map, state.venues);
}

function highlightPins() {
    Object.entries(markers).forEach(([id, marker]) => {
        marker.getElement().classList.toggle('is-selected', id === state.venueId);
    });
}

function selectVenue(id, flyTo = true) {
    if (state.venueId !== id) {
        state.courtId = null;
        state.picked = null;
    }
    state.venueId = id;
    const venue = selectedVenue();
    const courts = venueCourts();
    if (!state.courtId && courts.length) {
        state.courtId = courts[0].id;
    }
    renderVenueList();
    highlightPins();
    if (flyTo && map && venue && hasCoords(venue)) {
        map.flyTo({ center: [venue.lng, venue.lat], zoom: 15 });
    }
    renderPick();
    loadSlots();
}

function renderPick() {
    const venue = selectedVenue();
    if (!venue) {
        pickPanel.hidden = true;
        timePanel.hidden = true;
        renderSummary();
        return;
    }

    const courts = venueCourts();
    pickPanel.hidden = false;
    pickPanel.innerHTML = `
        <div class="panel-head">
            <h3><span class="step-dot">2</span>Pick a date and court</h3>
            <span class="panel-note">${fmtTime(venue.openingTime)} &ndash; ${fmtTime(venue.closingTime)}</span>
        </div>
        <div class="panel-body pick-body">
            <div class="field date-field">
                <label for="date">Date</label>
                <input type="date" id="date" value="${state.date}" min="${todayStr()}" max="${dateStr(maxDate)}">
            </div>
            ${courts.length ? `
            <div class="field">
                <label>Court</label>
                <div class="chips">
                    ${courts.map((c) => `
                        <button type="button" class="chip${c.id === state.courtId ? ' is-active' : ''}" data-court="${c.id}">
                            ${escapeHtml(c.name)}
                            <span>${c.type === 'indoor' ? 'Indoor' : 'Outdoor'} &middot; ${peso(c.hourlyRate)}/hr</span>
                        </button>`).join('')}
                </div>
            </div>` : ''}
        </div>`;
}

async function loadSlots() {
    const venue = selectedVenue();
    const court = selectedCourt();
    state.slots = [];
    state.picked = null;

    if (!venue) {
        return;
    }

    timePanel.hidden = false;

    if (!court) {
        timePanel.innerHTML = `
            <div class="panel-head"><h3><span class="step-dot">3</span>Choose a time</h3></div>
            <div class="empty"><strong>No courts available</strong>This venue has no courts open for booking right now.</div>`;
        renderSummary();
        return;
    }

    timePanel.innerHTML = `
        <div class="panel-head"><h3><span class="step-dot">3</span>Choose a time</h3></div>
        <div class="empty">Checking open slots...</div>`;
    renderSummary();

    const requestKey = court.id + state.date;
    let snap;
    try {
        snap = await getDocs(query(
            collection(db, 'slots'),
            where('courtId', '==', court.id),
            where('date', '==', state.date)
        ));
    } catch (error) {
        console.error(error);
        timePanel.innerHTML = `
            <div class="panel-head"><h3><span class="step-dot">3</span>Choose a time</h3></div>
            <div class="empty"><strong>Could not load time slots</strong>Check your connection and try again.</div>`;
        return;
    }

    if (requestKey !== (selectedCourt() ? selectedCourt().id + state.date : '')) {
        return;
    }

    const booked = new Set(snap.docs.map((d) => d.data().hour));
    const open = toMinutes(venue.openingTime);
    const close = toMinutes(venue.closingTime);
    const now = new Date();

    for (let t = open; t + 60 <= close; t += 60) {
        const start = new Date(state.date + 'T' + minutesToTime(t) + ':00');
        state.slots.push({
            minutes: t,
            hour: pad(Math.floor(t / 60)),
            free: !booked.has(pad(Math.floor(t / 60))) && start > now
        });
    }

    for (let i = state.slots.length - 1; i >= 0; i--) {
        const next = state.slots[i + 1] ? state.slots[i + 1].max : 0;
        state.slots[i].max = state.slots[i].free ? Math.min(MAX_HOURS, 1 + next) : 0;
    }

    renderTimes();
}

function renderTimes() {
    const freeCount = state.slots.filter((s) => s.free).length;

    timePanel.innerHTML = `
        <div class="panel-head">
            <h3><span class="step-dot">3</span>Choose a time</h3>
            <div class="legend">
                <span class="legend-open">Open</span>
                <span class="legend-taken">Unavailable</span>
            </div>
        </div>
        ${freeCount === 0 ? `
        <div class="empty">
            <strong>No open slots</strong>
            Every time on ${fmtDate(state.date)} is booked or has already passed. Try another date or court.
        </div>` : ''}
        <div class="slot-grid">
            ${state.slots.map((s, i) => `
                <label class="slot-option">
                    <input type="radio" name="start" value="${i}" ${s.free ? '' : 'disabled'}${state.picked === i ? ' checked' : ''}>
                    <span>${fmtTime(minutesToTime(s.minutes))}</span>
                </label>`).join('')}
        </div>
        <div class="duration-row">
            <label for="hours">Duration</label>
            <select id="hours" class="input">
                ${Array.from({ length: MAX_HOURS }, (_, i) => i + 1).map((h) =>
                    `<option value="${h}"${h === state.hours ? ' selected' : ''}>${h} hour${h === 1 ? '' : 's'}</option>`).join('')}
            </select>
        </div>`;

    syncDuration();
    renderSummary();
}

function syncDuration() {
    const select = document.getElementById('hours');
    if (!select) {
        return;
    }
    const max = state.picked !== null ? state.slots[state.picked].max : MAX_HOURS;
    Array.from(select.options).forEach((option) => {
        option.disabled = Number(option.value) > max;
    });
    if (state.hours > max) {
        state.hours = max;
        select.value = String(max);
    }
}

function renderSummary() {
    const venue = selectedVenue();
    const court = selectedCourt();

    if (!venue || !court) {
        summary.innerHTML = `
            <div class="panel-head"><h3>Booking summary</h3></div>
            <div class="empty">
                <strong>Nothing selected yet</strong>
                Choose a venue on the map or from the list to see open time slots.
            </div>`;
        return;
    }

    const slot = state.picked !== null ? state.slots[state.picked] : null;
    const time = slot
        ? fmtTime(minutesToTime(slot.minutes)) + ' &ndash; ' + fmtTime(minutesToTime(slot.minutes + state.hours * 60))
        : 'Select a slot';
    const total = slot ? peso(court.hourlyRate * state.hours, 2) : '&mdash;';

    summary.innerHTML = `
        <div class="panel-head"><h3>Booking summary</h3></div>
        <div class="summary-list">
            <div class="summary-row"><span>Venue</span><strong>${escapeHtml(venue.name)}</strong></div>
            <div class="summary-row"><span>Court</span><strong>${escapeHtml(court.name)}</strong></div>
            <div class="summary-row"><span>Date</span><strong>${fmtDate(state.date)}</strong></div>
            <div class="summary-row"><span>Time</span><strong>${time}</strong></div>
            <div class="summary-row"><span>Rate</span><strong>${peso(court.hourlyRate, 2)}/hr</strong></div>
            <div class="summary-row summary-total"><span>Total</span><strong>${total}</strong></div>
        </div>
        <div class="summary-foot">
            <button type="button" class="btn btn-primary" id="book-btn"${slot ? '' : ' disabled'}>Request booking</button>
            <p class="note">Your booking stays pending until the venue confirms it.</p>
        </div>`;
}

function referenceCode() {
    const now = new Date();
    const stamp = String(now.getFullYear()).slice(2) + pad(now.getMonth() + 1) + pad(now.getDate());
    const random = Math.random().toString(36).slice(2, 7).toUpperCase().padEnd(5, '0');
    return 'PKB-' + stamp + '-' + random;
}

async function book(button) {
    const venue = selectedVenue();
    const court = selectedCourt();
    const slot = state.slots[state.picked];
    const hours = state.hours;

    if (!venue || !court || !slot) {
        return;
    }

    const startTime = minutesToTime(slot.minutes);
    const endTime = minutesToTime(slot.minutes + hours * 60);
    const hourKeys = Array.from({ length: hours }, (_, i) => pad(Math.floor((slot.minutes + i * 60) / 60)));
    const slotIds = hourKeys.map((h) => court.id + '_' + state.date + '_' + h);
    const reservationRef = doc(collection(db, 'reservations'));
    const code = referenceCode();

    if (new Date(state.date + 'T' + startTime + ':00') <= new Date()) {
        showFlash('error', 'That time has already passed. Please choose a later slot.');
        return;
    }

    button.disabled = true;
    button.textContent = 'Booking...';

    try {
        await runTransaction(db, async (tx) => {
            const courtSnap = await tx.get(doc(db, 'courts', court.id));
            if (!courtSnap.exists() || courtSnap.data().status !== 'available') {
                throw { code: 'custom', message: 'This court is no longer available for booking.' };
            }

            for (const slotId of slotIds) {
                const slotSnap = await tx.get(doc(db, 'slots', slotId));
                if (slotSnap.exists()) {
                    throw { code: 'custom', message: 'Sorry, part of that time was just booked. Please choose another slot.' };
                }
            }

            const rate = courtSnap.data().hourlyRate;

            tx.set(reservationRef, {
                referenceCode: code,
                userId: profile.id,
                userName: profile.firstName + ' ' + profile.lastName,
                userPhone: profile.phone || null,
                userEmail: profile.email,
                courtId: court.id,
                courtName: court.name,
                venueId: venue.id,
                venueName: venue.name,
                venueAddress: venue.address,
                venueContact: venue.contact || null,
                adminId: courtSnap.data().adminId,
                date: state.date,
                startTime: startTime,
                endTime: endTime,
                hours: hours,
                totalAmount: rate * hours,
                status: 'pending',
                slotIds: slotIds,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });

            slotIds.forEach((slotId, i) => {
                tx.set(doc(db, 'slots', slotId), {
                    courtId: court.id,
                    date: state.date,
                    hour: hourKeys[i],
                    reservationId: reservationRef.id,
                    userId: profile.id,
                    adminId: courtSnap.data().adminId
                });
            });
        });

        await logActivity('CREATE_RESERVATION', code + ' - ' + venue.name + ', ' + court.name, profile.firstName + ' ' + profile.lastName);
        flash('success', 'Booking request sent! Reference: ' + code + '. The venue will confirm it soon.');
        location.href = 'my_bookings.html';
    } catch (error) {
        console.error(error);
        showFlash('error', error.code === 'custom' ? error.message : friendlyError(error));
        await loadSlots();
    }
}

page.addEventListener('click', async (event) => {
    const venueBtn = event.target.closest('[data-venue]');
    if (venueBtn) {
        selectVenue(venueBtn.dataset.venue);
        return;
    }

    const courtBtn = event.target.closest('[data-court]');
    if (courtBtn) {
        state.courtId = courtBtn.dataset.court;
        renderPick();
        loadSlots();
        return;
    }

    if (event.target.closest('#book-btn')) {
        book(event.target.closest('#book-btn'));
        return;
    }

    const nearBtn = event.target.closest('#near-me');
    if (nearBtn) {
        nearBtn.disabled = true;
        try {
            state.userLocation = await getUserLocation();
            renderVenueList();
            if (map) {
                map.flyTo({ center: [state.userLocation.lng, state.userLocation.lat], zoom: 13 });
            }
            const nearest = sortedVenues()[0];
            showFlash('success', nearest && nearest.distance !== null
                ? 'Venues sorted by distance. Nearest: ' + nearest.name + ' (' + fmtDistance(nearest.distance) + ').'
                : 'Venues sorted by distance.');
        } catch (error) {
            showFlash('error', error.message);
        }
        nearBtn.disabled = false;
    }
});

page.addEventListener('change', (event) => {
    if (event.target.id === 'date') {
        const value = event.target.value;
        if (value && value >= todayStr() && value <= dateStr(maxDate)) {
            state.date = value;
            loadSlots();
        } else {
            event.target.value = state.date;
        }
        return;
    }

    if (event.target.name === 'start') {
        state.picked = Number(event.target.value);
        syncDuration();
        renderSummary();
        return;
    }

    if (event.target.id === 'hours') {
        state.hours = Number(event.target.value);
        syncDuration();
        renderSummary();
    }
});

try {
    const [venueSnap, courtSnap] = await Promise.all([
        getDocs(query(collection(db, 'venues'), where('status', '==', 'active'))),
        getDocs(query(collection(db, 'courts'), where('status', '==', 'available')))
    ]);

    state.venues = venueSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    state.courts = courtSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    renderVenueList();
    renderSummary();
    renderMap();

    if (state.venueId && selectedVenue()) {
        selectVenue(state.venueId);
    } else if (state.venues.length === 1) {
        selectVenue(state.venues[0].id);
    } else {
        state.venueId = null;
    }
} catch (error) {
    console.error(error);
    showFlash('error', 'Could not load venues. Please refresh the page.');
}